// Read-only diagnostics that don't fit the keymap/lighting/macro categories:
// the physical layout geometry (so an agent can reason about key positions,
// not just indices), live switch-matrix state (which keys are physically
// pressed right now, for stuck-key/wiring diagnosis), and device identity
// (firmware/keycodes version, uptime). All read straight from the same
// KeyboardAPI/selectors the Debug pane and firmware loader already use.

import {store} from 'src/store';
import {register} from '../registry';
import {byteToKeycodeString} from '../keycodes';
import {
  getSelectedDefinition,
  getSelectedKeyDefinitions,
} from 'src/store/definitionsSlice';
import {getSelectedKeymaps} from 'src/store/keymapSlice';
import {
  getSelectedConnectedDevice,
  getSelectedKeyboardAPI,
} from 'src/store/devicesSlice';
import {
  getSelectedFirmwareVersion,
  getSelectedKeycodesVersion,
} from 'src/store/firmwareSlice';
import {KeyboardValue} from 'src/utils/keyboard-api';

export function registerDiagnosticsTools() {
  register({
    name: 'get_definition',
    title: 'Get Keyboard Definition',
    description:
      'Get the physical layout of every key: its position/size in key units (x, y, w, h, rotation), its firmware matrix position (row, col), and the keycode currently bound to it on the given layer. Use this instead of get_keymap when the request is spatial (e.g. "the key left of spacebar") rather than by keyIndex.',
    inputSchema: {
      type: 'object',
      properties: {
        layer: {
          type: 'number',
          description: 'Layer to resolve keycodes against. Default 0.',
        },
      },
      additionalProperties: false,
    },
    annotations: {readOnlyHint: true},
    execute: async ({layer}: {layer?: number}) => {
      const state = store.getState();
      const definition = getSelectedDefinition(state);
      const keyDefs = getSelectedKeyDefinitions(state);
      const keymaps = getSelectedKeymaps(state);
      if (!definition) {
        return {ok: false, error: 'No keyboard connected.'};
      }
      const layerIndex = layer ?? 0;
      const layerKeymap = keymaps?.[layerIndex];
      return {
        ok: true,
        matrix: definition.matrix,
        layer: layerIndex,
        keys: keyDefs.map((key, keyIndex) => ({
          keyIndex,
          x: key.x,
          y: key.y,
          w: key.w,
          h: key.h,
          r: key.r,
          rx: key.rx,
          ry: key.ry,
          row: key.row,
          col: key.col,
          encoderIndex: key.ei,
          ledIndex: key.li,
          keycode: layerKeymap ? byteToKeycodeString(layerKeymap[keyIndex]) : undefined,
        })),
      };
    },
  });

  register({
    name: 'diagnose_matrix',
    title: 'Diagnose Switch Matrix',
    description:
      'Read the live physical switch matrix from the device -- which row/col positions are electrically closed right now. Real-time, not related to what keycodes are assigned; use it to check for a stuck key or a wiring problem, not to read the keymap.',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: true},
    execute: async () => {
      const state = store.getState();
      const api = getSelectedKeyboardAPI(state);
      const definition = getSelectedDefinition(state);
      if (!api || !definition) {
        return {ok: false, error: 'No keyboard connected.'};
      }
      const {rows, cols} = definition.matrix;
      const bytesPerRow = Math.ceil(cols / 8);
      const raw = await api.getKeyboardValue(
        KeyboardValue.SWITCH_MATRIX_STATE,
        [],
        rows * bytesPerRow,
      );
      const pressed: {row: number; col: number}[] = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const byte = raw[row * bytesPerRow + Math.floor(col / 8)] ?? 0;
          if ((byte >> col % 8) & 1) {
            pressed.push({row, col});
          }
        }
      }
      return {ok: true, rows, cols, pressed};
    },
  });

  register({
    name: 'get_device_info',
    title: 'Get Device Info',
    description:
      'Read device identity and health: QMK firmware version, VIA keycodes protocol version (both cached from connection time), and live uptime in milliseconds (a fresh read).',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: true},
    execute: async () => {
      const state = store.getState();
      const api = getSelectedKeyboardAPI(state);
      const connectedDevice = getSelectedConnectedDevice(state);
      if (!api || !connectedDevice) {
        return {ok: false, error: 'No keyboard connected.'};
      }
      let uptimeMs: number | undefined;
      try {
        const res = await api.getKeyboardValue(KeyboardValue.UPTIME, [], 4);
        uptimeMs = (res[0] << 24) | (res[1] << 16) | (res[2] << 8) | res[3];
      } catch {
        // Not every firmware implements UPTIME; omit rather than fail the call.
      }
      return {
        ok: true,
        protocol: connectedDevice.protocol,
        firmwareVersion: getSelectedFirmwareVersion(state),
        keycodesVersion: getSelectedKeycodesVersion(state),
        uptimeMs,
      };
    },
  });
}
