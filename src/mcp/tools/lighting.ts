// WebMCP tools for RGB/backlight control. Branches on protocol version the
// same way devicesThunks.ts does: v2 keyboards use the fixed BACKLIGHT_*
// command set (lightingSlice); v3+ keyboards expose an arbitrary,
// keyboard-defined set of "custom menu" controls (menusSlice), of which
// lighting is one category among several.

import {isVIADefinitionV2, LightingValue} from '@the-via/reader';
import {store} from 'src/store';
import {register} from '../registry';
import {getSelectedDefinition} from 'src/store/definitionsSlice';
import {
  getSelectedLightingData,
  updateBacklightValue,
} from 'src/store/lightingSlice';
import {
  getCustomRangeControls,
  getSelectedCustomMenuData,
  updateCustomMenuRangeValue,
} from 'src/store/menusSlice';
import {decodeRangeValue} from 'src/utils/range-constraints';

export function registerLightingTools() {
  register({
    name: 'get_lighting_state',
    title: 'Get Lighting State',
    description:
      'Read the current RGB/backlight state of the connected keyboard: raw values for v2 keyboards, or the list of controllable lighting/custom options (with current values) for v3+ keyboards.',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: true},
    execute: async () => {
      const state = store.getState();
      const definition = getSelectedDefinition(state);
      if (!definition) {
        return {ok: false, error: 'No keyboard connected.'};
      }
      if (isVIADefinitionV2(definition)) {
        return {
          ok: true,
          protocolVersion: 'v2',
          lighting: getSelectedLightingData(state) || {},
        };
      }
      const controls = getCustomRangeControls(state);
      const menuData = getSelectedCustomMenuData(state) || {};
      const options = Object.entries(controls).map(([id, control]) => {
        const raw = menuData[id];
        const value =
          Array.isArray(raw) && typeof raw[0] === 'number'
            ? decodeRangeValue(raw as number[], control.options[1])
            : undefined;
        return {
          id,
          label: (control as any).label ?? id,
          min: control.options[0],
          max: control.options[1],
          value,
        };
      });
      return {ok: true, protocolVersion: 'v3', options};
    },
  });

  register({
    name: 'set_lighting_value',
    title: 'Set Lighting Value (v2)',
    description:
      'Set a raw backlight/RGB value on a v2-protocol keyboard. "command" is a LightingValue name such as "BACKLIGHT_BRIGHTNESS", "BACKLIGHT_EFFECT", "QMK_RGBLIGHT_COLOR", or "BACKLIGHT_COLOR_1". "values" is the raw byte payload (e.g. [hue, saturation] for a color, [level] for brightness/effect). Use get_lighting_state first to see supported commands. Only works on v2 keyboards -- use set_custom_menu_option for v3.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {type: 'string'},
        values: {type: 'array', items: {type: 'number'}},
      },
      required: ['command', 'values'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, idempotentHint: true},
    execute: async ({command, values}: {command: string; values: number[]}) => {
      const lightingValue = (LightingValue as any)[command];
      if (lightingValue === undefined) {
        return {ok: false, error: `Unknown lighting command "${command}".`};
      }
      await store.dispatch(
        updateBacklightValue(lightingValue, ...values) as any,
      );
      return {ok: true, command, values};
    },
  });

  register({
    name: 'set_custom_menu_option',
    title: 'Set Custom Menu Option (v3)',
    description:
      'Set a keyboard-defined "custom menu" option on a v3+ keyboard, identified by the "id" returned from get_lighting_state (covers RGB and other firmware-defined settings). "value" is the logical value within the option\'s [min, max] range.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {type: 'string'},
        value: {type: 'number'},
      },
      required: ['id', 'value'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, idempotentHint: true},
    execute: async ({id, value}: {id: string; value: number}) => {
      await store.dispatch(updateCustomMenuRangeValue(id, value) as any);
      return {ok: true, id, value};
    },
  });
}
