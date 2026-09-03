// Per-key RGB (the "paint a key" feature on v3+ boards with individually
// addressable LEDs) and the v2 custom color palette -- both distinct from
// the board-wide lighting in lighting.ts.

import {store} from 'src/store';
import {register} from '../registry';
import {getSelectedKeyDefinitions} from 'src/store/definitionsSlice';
import {
  getSelectedConnectedDevice,
  getSelectedKeyboardAPI,
} from 'src/store/devicesSlice';
import {
  getSelectedCustomMenuData,
  updateSelectedCustomMenuData,
} from 'src/store/menusSlice';
import {
  getSelectedLightingData,
  updateCustomColor,
} from 'src/store/lightingSlice';

export function registerRgbMatrixTools() {
  register({
    name: 'get_per_key_rgb',
    title: 'Get Per-Key RGB',
    description:
      'Read the individual RGB color (hue, saturation, each 0-255) of every key that has its own addressable LED. Only meaningful on v3+ keyboards with per-key lighting; returns an empty list otherwise.',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: true},
    execute: async () => {
      const state = store.getState();
      const keyDefs = getSelectedKeyDefinitions(state);
      const menuData = getSelectedCustomMenuData(state) as
        | {__perKeyRGB?: number[][]}
        | undefined;
      const perKeyRGB = menuData?.__perKeyRGB ?? [];
      const keys = keyDefs.flatMap((key, keyIndex) =>
        key.li !== undefined
          ? [
              {
                keyIndex,
                hue: perKeyRGB[key.li]?.[0],
                sat: perKeyRGB[key.li]?.[1],
              },
            ]
          : [],
      );
      return {ok: true, keys};
    },
  });

  register({
    name: 'set_per_key_rgb',
    title: 'Set Per-Key RGB',
    description:
      'Set the RGB color of one key with its own addressable LED, by keyIndex from get_keymap. hue and sat are each 0-255. Only works on v3+ keyboards with per-key lighting.',
    inputSchema: {
      type: 'object',
      properties: {
        keyIndex: {type: 'number'},
        hue: {type: 'number'},
        sat: {type: 'number'},
      },
      required: ['keyIndex', 'hue', 'sat'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, idempotentHint: true},
    execute: async ({
      keyIndex,
      hue,
      sat,
    }: {
      keyIndex: number;
      hue: number;
      sat: number;
    }) => {
      const state = store.getState();
      const api = getSelectedKeyboardAPI(state);
      const connectedDevice = getSelectedConnectedDevice(state);
      const keyDefs = getSelectedKeyDefinitions(state);
      if (!api || !connectedDevice) {
        return {ok: false, error: 'No keyboard connected.'};
      }
      const key = keyDefs[keyIndex];
      if (!key || key.li === undefined) {
        return {ok: false, error: `Key ${keyIndex} has no addressable LED.`};
      }
      await api.setPerKeyRGBMatrix(key.li, hue, sat);
      await api.commitCustomMenu(0);

      const menuData =
        (getSelectedCustomMenuData(state) as
          | {__perKeyRGB?: number[][]}
          | undefined) || {};
      const perKeyRGB = [...(menuData.__perKeyRGB ?? [])];
      perKeyRGB[key.li] = [hue, sat];
      store.dispatch(
        updateSelectedCustomMenuData({
          menuData: {...menuData, __perKeyRGB: perKeyRGB},
          devicePath: connectedDevice.path,
        }),
      );
      return {ok: true, keyIndex, hue, sat};
    },
  });

  register({
    name: 'get_custom_colors',
    title: 'Get Custom Colors',
    description:
      'Read the v2-protocol custom color palette (the small set of saved colors some boards offer, indexed 0..N) as a list of {index, hue, sat}.',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: true},
    execute: async () => {
      const state = store.getState();
      const lightingData = getSelectedLightingData(state);
      const customColors = (lightingData && lightingData.customColors) || [];
      return {
        ok: true,
        colors: customColors.map((c, index) => ({
          index,
          hue: c.hue,
          sat: c.sat,
        })),
      };
    },
  });

  register({
    name: 'set_custom_color',
    title: 'Set Custom Color',
    description:
      'Set one entry in the v2-protocol custom color palette, by index. hue and sat are each 0-255.',
    inputSchema: {
      type: 'object',
      properties: {
        index: {type: 'number'},
        hue: {type: 'number'},
        sat: {type: 'number'},
      },
      required: ['index', 'hue', 'sat'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, idempotentHint: true},
    execute: async ({
      index,
      hue,
      sat,
    }: {
      index: number;
      hue: number;
      sat: number;
    }) => {
      await store.dispatch(updateCustomColor(index, hue, sat) as any);
      return {ok: true, index, hue, sat};
    },
  });
}
