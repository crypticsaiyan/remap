// WebMCP tools for macros. Macros are authored as the same text "expression"
// syntax the Macros pane's editor uses (e.g. "KC_H,KC_I" or "{KC_LSFT+KC_A}"),
// compiled by the existing macro-api layer -- see src/utils/macro-api.

import {store} from 'src/store';
import {register} from '../registry';
import {getSelectedConnectedDevice} from 'src/store/devicesSlice';
import {
  getExpressions,
  getIsDelaySupported,
  getIsMacroFeatureSupported,
  getMacroBufferSize,
  getMacroCount,
  saveMacros,
} from 'src/store/macrosSlice';

export function registerMacroTools() {
  register({
    name: 'get_macro_capabilities',
    title: 'Get Macro Capabilities',
    description:
      'Check whether this keyboard supports macros at all, how many slots it has, the buffer size in bytes, and whether explicit delays are supported in macro expressions. Call this before authoring a long or delay-using macro.',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: true},
    execute: async () => {
      const state = store.getState();
      return {
        ok: true,
        supported: getIsMacroFeatureSupported(state),
        macroCount: getMacroCount(state),
        macroBufferSize: getMacroBufferSize(state),
        delaySupported: getIsDelaySupported(state),
      };
    },
  });

  register({
    name: 'list_macros',
    title: 'List Macros',
    description:
      'List every macro slot and its current expression text (empty string means unassigned).',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: true},
    execute: async () => {
      const state = store.getState();
      const expressions = getExpressions(state);
      return {
        ok: true,
        macros: expressions.map((expression, index) => ({index, expression})),
      };
    },
  });

  register({
    name: 'set_macro',
    title: 'Set Macro',
    description:
      'Set the expression for one macro slot, e.g. "KC_H,KC_I,KC_LSFT(KC_1)". Use list_macros to see available slot indices and the expression syntax already in use.',
    inputSchema: {
      type: 'object',
      properties: {
        index: {type: 'number'},
        expression: {type: 'string'},
      },
      required: ['index', 'expression'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, idempotentHint: true},
    execute: async ({
      index,
      expression,
    }: {
      index: number;
      expression: string;
    }) => {
      const state = store.getState();
      const connectedDevice = getSelectedConnectedDevice(state);
      if (!connectedDevice) {
        return {ok: false, error: 'No keyboard connected.'};
      }
      const expressions = [...getExpressions(state)];
      if (index < 0 || index >= expressions.length) {
        return {
          ok: false,
          error: `Macro index ${index} out of range (0-${expressions.length - 1}).`,
        };
      }
      expressions[index] = expression;
      await store.dispatch(saveMacros(connectedDevice, expressions) as any);
      return {ok: true, index, expression};
    },
  });

  register({
    name: 'clear_macro',
    title: 'Clear Macro',
    description: 'Clear one macro slot back to empty.',
    inputSchema: {
      type: 'object',
      properties: {index: {type: 'number'}},
      required: ['index'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, idempotentHint: true},
    execute: async ({index}: {index: number}) => {
      const state = store.getState();
      const connectedDevice = getSelectedConnectedDevice(state);
      if (!connectedDevice) {
        return {ok: false, error: 'No keyboard connected.'};
      }
      const expressions = [...getExpressions(state)];
      expressions[index] = '';
      await store.dispatch(saveMacros(connectedDevice, expressions) as any);
      return {ok: true, index};
    },
  });
}
