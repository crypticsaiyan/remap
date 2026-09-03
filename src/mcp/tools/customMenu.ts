// Generic tools for every keyboard-defined "custom menu" control -- covers
// whatever a keyboard's own definition puts in its non-keymap settings tabs:
// toggles, dropdowns, buttons, colors, ranges, and per-control keycodes. Most
// v3+ keyboards implement their lighting controls this way (see
// lighting.ts's set_custom_menu_option, kept for range controls
// specifically), but this also reaches anything else a keyboard maker
// defined -- audio, display, tap-hold tuning, whatever the firmware exposes.

import {store} from 'src/store';
import {register} from '../registry';
import {
  buildControlWriteBytes,
  listCustomControls,
} from '../customMenuControls';
import {
  updateCustomMenuRangeValue,
  updateCustomMenuValue,
} from 'src/store/menusSlice';
import {decodeRangeValue} from 'src/utils/range-constraints';

function describeValue(control: ReturnType<typeof listCustomControls>[number]) {
  if (!control.value) {
    return undefined;
  }
  if (control.type === 'range') {
    const opts = control.options as [number, number] | undefined;
    return opts ? decodeRangeValue(control.value, opts[1]) : control.value;
  }
  if (control.type === 'toggle') {
    const opts = (control.options as [unknown, unknown]) || [0, 1];
    const on = Array.isArray(opts[1]) ? opts[1] : [opts[1]];
    return (on as number[]).every((o, i) => o === control.value?.[i]);
  }
  if (control.type === 'dropdown') {
    const opts = (control.options as Array<string | [string, number]>) || [];
    const match = opts.find((o, i) =>
      typeof o === 'string'
        ? i === control.value?.[0]
        : o[1] === control.value?.[0],
    );
    return match
      ? typeof match === 'string'
        ? match
        : match[0]
      : control.value;
  }
  return control.value;
}

export function registerCustomMenuTools() {
  register({
    name: 'list_custom_controls',
    title: 'List Custom Controls',
    description:
      'List every keyboard-defined custom setting (toggle, dropdown, button, color, range, or keycode) with its type, label, options, and current value. Covers whatever the keyboard\'s own firmware definition exposes beyond the keymap -- often lighting, but also anything else the maker defined. Use "id" from here with set_custom_control.',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: true},
    execute: async () => {
      const controls = listCustomControls(store.getState());
      return {
        ok: true,
        controls: controls.map((c) => ({
          id: c.id,
          label: c.label,
          type: c.type,
          options: c.options,
          value: describeValue(c),
        })),
      };
    },
  });

  register({
    name: 'set_custom_control',
    title: 'Set Custom Control',
    description:
      'Set one keyboard-defined custom control, by "id" from list_custom_controls. The shape of "value" depends on the control\'s type: toggle wants a boolean, dropdown wants the option\'s label (string) or explicit value (number), button wants no value at all, color wants {hue, sat} (each 0-255), range and keycode want a single number or keycode string respectively -- list_custom_controls tells you which.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {type: 'string'},
        value: {},
      },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, idempotentHint: true},
    execute: async ({id, value}: {id: string; value?: unknown}) => {
      const controls = listCustomControls(store.getState());
      const control = controls.find((c) => c.id === id);
      if (!control) {
        return {
          ok: false,
          error: `No control "${id}". Call list_custom_controls to see what's available.`,
        };
      }
      try {
        if (control.type === 'range') {
          await store.dispatch(
            updateCustomMenuRangeValue(id, value as number) as any,
          );
        } else {
          const bytes = buildControlWriteBytes(control, value);
          await store.dispatch(
            updateCustomMenuValue(id, ...control.command, ...bytes) as any,
          );
        }
      } catch (e) {
        return {ok: false, error: e instanceof Error ? e.message : String(e)};
      }
      return {ok: true, id, value};
    },
  });
}
