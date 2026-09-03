// WebMCP tools for reading/writing the keymap: layers, individual key
// remaps, and whole-keymap snapshots. All state changes go through the
// existing keymapSlice thunks so Redux and the physical device never
// diverge from what the on-screen UI would produce.
//
// remap_key is the direct, single-key path: a person clicking one keycap
// acts immediately, so an agent making the same single, trivially-seen
// change does too. Anything touching more than one key belongs in
// propose_remap instead (see propose.ts), which stages a reviewable diff.

import {store} from 'src/store';
import {register} from '../registry';
import {
  byteToKeycodeString,
  keycodeStringToByte,
  listKeycodesForSelectedKeyboard,
} from '../keycodes';
import {
  getNumberOfLayers,
  getSelectedKeymaps,
  getSelectedLayerIndex,
  getSelectedRawLayers,
  saveRawKeymapToDevice,
  setLayer,
  updateKey,
} from 'src/store/keymapSlice';
import {getSelectedConnectedDevice} from 'src/store/devicesSlice';
import {
  getSelectedDefinition,
  getSelectedLayoutOptions,
} from 'src/store/definitionsSlice';
import {getExpressions, saveMacros} from 'src/store/macrosSlice';
import {getSelectedDefinitionName} from 'src/store/definitionNameSlice';

export function registerKeymapTools() {
  register({
    name: 'get_keyboard_state',
    title: 'Get Keyboard State',
    description:
      'Get the currently connected keyboard: its name, protocol version, layer count, active layer, and layout options. Call this first to see what keyboard (if any) is connected before using other keymap tools.',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: true},
    execute: async () => {
      const state = store.getState();
      const connectedDevice = getSelectedConnectedDevice(state);
      const definition = getSelectedDefinition(state);
      const name = getSelectedDefinitionName(state);
      if (!connectedDevice || !definition) {
        return {
          connected: false,
          message:
            'No keyboard is connected. A human needs to click "Authorize device" in the app first (WebHID pairing requires a real user gesture).',
        };
      }
      return {
        connected: true,
        name,
        vendorProductId: connectedDevice.vendorProductId,
        protocol: connectedDevice.protocol,
        definitionVersion: connectedDevice.requiredDefinitionVersion,
        numberOfLayers: getNumberOfLayers(state),
        activeLayer: getSelectedLayerIndex(state),
        layoutOptions: getSelectedLayoutOptions(state),
      };
    },
  });

  register({
    name: 'get_keymap',
    title: 'Get Keymap',
    description:
      'Get the keycodes assigned to every key position (as human-readable QMK keycode strings like "KC_A") for one layer, or all layers if none is given. Each entry\'s array index is the "keyIndex" used by remap_key and propose_remap.',
    inputSchema: {
      type: 'object',
      properties: {
        layer: {
          type: 'number',
          description: 'Layer index to read; omit to read every layer.',
        },
      },
      additionalProperties: false,
    },
    annotations: {readOnlyHint: true},
    execute: async ({layer}: {layer?: number}) => {
      const state = store.getState();
      const keymaps = getSelectedKeymaps(state);
      if (!keymaps) {
        return {connected: false, layers: []};
      }
      const toStrings = (raw: number[]) => raw.map(byteToKeycodeString);
      if (layer !== undefined) {
        return {layer, keycodes: toStrings(keymaps[layer] ?? [])};
      }
      return {layers: keymaps.map((raw) => toStrings(raw))};
    },
  });

  register({
    name: 'remap_key',
    title: 'Remap Key',
    description:
      'Assign a QMK keycode (e.g. "KC_A", "KC_LSFT", "MO(1)") to one key position on a layer. keyIndex is the position in the array returned by get_keymap. Switches the active layer first if it differs from the requested one, so the change is visible on screen. For changing several keys together as one reviewable set, use propose_remap instead.',
    inputSchema: {
      type: 'object',
      properties: {
        layer: {type: 'number', description: 'Target layer index.'},
        keyIndex: {
          type: 'number',
          description: 'Key position index, from get_keymap.',
        },
        keycode: {
          type: 'string',
          description: 'QMK keycode string, e.g. "KC_A".',
        },
      },
      required: ['layer', 'keyIndex', 'keycode'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, idempotentHint: true},
    execute: async ({
      layer,
      keyIndex,
      keycode,
    }: {
      layer: number;
      keyIndex: number;
      keycode: string;
    }) => {
      const byte = keycodeStringToByte(keycode);
      if (getSelectedLayerIndex(store.getState()) !== layer) {
        store.dispatch(setLayer(layer));
      }
      await store.dispatch(updateKey(keyIndex, byte) as any);
      return {ok: true, layer, keyIndex, keycode};
    },
  });

  register({
    name: 'set_active_layer',
    title: 'Set Active Layer',
    description:
      'Switch the keyboard configurator UI to show a different layer.',
    inputSchema: {
      type: 'object',
      properties: {layer: {type: 'number'}},
      required: ['layer'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, idempotentHint: true},
    execute: async ({layer}: {layer: number}) => {
      store.dispatch(setLayer(layer));
      return {ok: true, activeLayer: layer};
    },
  });

  register({
    name: 'list_available_keycodes',
    title: 'List Available Keycodes',
    description:
      'List QMK keycodes supported by the connected keyboard, for use with remap_key and propose_remap. Use "search" to filter (e.g. "shift", "KC_F") since the full list can be large.',
    inputSchema: {
      type: 'object',
      properties: {
        search: {type: 'string', description: 'Substring filter, optional.'},
        limit: {
          type: 'number',
          description: 'Max results to return, default 60.',
        },
      },
      additionalProperties: false,
    },
    annotations: {readOnlyHint: true},
    execute: async ({search, limit}: {search?: string; limit?: number}) => {
      return {
        ok: true,
        keycodes: listKeycodesForSelectedKeyboard(search, limit),
      };
    },
  });

  register({
    name: 'save_keymap_snapshot',
    title: 'Save Keymap Snapshot',
    description:
      'Export the full keymap (every layer) and macros as a JSON snapshot the agent can hand back to the user or restore later with load_keymap_snapshot.',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: true},
    execute: async () => {
      const state = store.getState();
      const definition = getSelectedDefinition(state);
      const rawLayers = getSelectedRawLayers(state);
      if (!definition) {
        return {ok: false, error: 'No keyboard connected.'};
      }
      return {
        ok: true,
        name: getSelectedDefinitionName(state),
        vendorProductId: definition.vendorProductId,
        layers: rawLayers.map((layer) =>
          layer.keymap.map((byte: number) => byteToKeycodeString(byte)),
        ),
        macros: [...getExpressions(state)],
      };
    },
  });

  register({
    name: 'load_keymap_snapshot',
    title: 'Load Keymap Snapshot',
    description:
      'Overwrite the entire keymap (all layers) and macros from a JSON snapshot produced by save_keymap_snapshot. This replaces every key on the keyboard, so it requires user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        vendorProductId: {type: 'number'},
        layers: {
          type: 'array',
          items: {type: 'array', items: {type: 'string'}},
        },
        macros: {type: 'array', items: {type: 'string'}},
      },
      required: ['vendorProductId', 'layers'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, destructiveHint: true},
    execute: async ({
      vendorProductId,
      layers,
      macros,
    }: {
      vendorProductId: number;
      layers: string[][];
      macros?: string[];
    }) => {
      const state = store.getState();
      const definition = getSelectedDefinition(state);
      const connectedDevice = getSelectedConnectedDevice(state);
      if (!definition || !connectedDevice) {
        return {ok: false, error: 'No keyboard connected.'};
      }
      if (definition.vendorProductId !== vendorProductId) {
        return {
          ok: false,
          error:
            'Snapshot was created for a different keyboard (vendorProductId mismatch).',
        };
      }
      const keymap = layers.map((layer) =>
        layer.map((code) => keycodeStringToByte(code)),
      );
      await store.dispatch(
        saveRawKeymapToDevice(keymap, connectedDevice) as any,
      );
      if (macros) {
        await store.dispatch(saveMacros(connectedDevice, macros) as any);
      }
      return {ok: true, layersWritten: keymap.length};
    },
  });
}
