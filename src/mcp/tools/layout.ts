// WebMCP tools for physical layout options (e.g. ANSI/ISO, split spacebar)
// and rotary encoder remapping.

import {store} from 'src/store';
import {register} from '../registry';
import {keycodeStringToByte} from '../keycodes';
import {
  getSelectedDefinition,
  getSelectedLayoutOptions,
  updateLayoutOption,
} from 'src/store/definitionsSlice';
import {getSelectedKeyboardAPI} from 'src/store/devicesSlice';

export function registerLayoutTools() {
  register({
    name: 'get_layout_options',
    title: 'Get Layout Options',
    description:
      'Get the physical layout option labels and their currently selected values (e.g. index 0 of a "Bottom Row" option meaning ANSI vs ISO).',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: true},
    execute: async () => {
      const state = store.getState();
      const definition = getSelectedDefinition(state);
      if (!definition || !definition.layouts.labels) {
        return {ok: true, options: []};
      }
      const values = getSelectedLayoutOptions(state);
      return {
        ok: true,
        options: definition.layouts.labels.map((label, idx) => ({
          index: idx,
          label,
          value: values[idx],
        })),
      };
    },
  });

  register({
    name: 'set_layout_option',
    title: 'Set Layout Option',
    description:
      'Set one physical layout option to a new value, from the list returned by get_layout_options.',
    inputSchema: {
      type: 'object',
      properties: {
        optionIndex: {type: 'number'},
        value: {type: 'number'},
      },
      required: ['optionIndex', 'value'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, idempotentHint: true},
    execute: async ({
      optionIndex,
      value,
    }: {
      optionIndex: number;
      value: number;
    }) => {
      await store.dispatch(updateLayoutOption(optionIndex, value) as any);
      return {ok: true, optionIndex, value};
    },
  });

  register({
    name: 'remap_encoder',
    title: 'Remap Encoder',
    description:
      "Assign a QMK keycode to a rotary encoder's clockwise or counter-clockwise rotation on a given layer.",
    inputSchema: {
      type: 'object',
      properties: {
        layer: {type: 'number'},
        encoderIndex: {type: 'number'},
        direction: {type: 'string', enum: ['cw', 'ccw']},
        keycode: {type: 'string'},
      },
      required: ['layer', 'encoderIndex', 'direction', 'keycode'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, idempotentHint: true},
    execute: async ({
      layer,
      encoderIndex,
      direction,
      keycode,
    }: {
      layer: number;
      encoderIndex: number;
      direction: 'cw' | 'ccw';
      keycode: string;
    }) => {
      const api = getSelectedKeyboardAPI(store.getState());
      if (!api) {
        return {ok: false, error: 'No keyboard connected.'};
      }
      const byte = keycodeStringToByte(keycode);
      await api.setEncoderValue(layer, encoderIndex, direction === 'cw', byte);
      return {ok: true, layer, encoderIndex, direction, keycode};
    },
  });
}
