// Generalizes the v2 "customMenus" / v3 "menus" trees -- the same
// keyboard-defined settings the Lighting pane's non-lighting tabs and any
// custom-feature pane render via VIACustomItem
// (src/components/panes/configure-panes/custom/custom-control.tsx) -- into a
// flat, typed list any tool can read or write, covering every control type
// the format defines: toggle, dropdown, button, color, range, keycode.
//
// This mirrors that component's switch-on-type write logic so a tool call
// produces the exact same command bytes a click would.

import {evalExpr} from '@the-via/pelpi';
import {isVIADefinitionV2} from '@the-via/reader';
import type {RootState} from 'src/store';
import {getSelectedDefinition} from 'src/store/definitionsSlice';
import {getSelectedCustomMenuData, getV3Menus} from 'src/store/menusSlice';
import {isCustomMenuCommandContent} from 'src/utils/custom-menu';
import {shiftFrom16Bit} from 'src/utils/keyboard-api';
import {keycodeStringToByte} from './keycodes';

export type CustomControlType =
  | 'toggle'
  | 'dropdown'
  | 'button'
  | 'color'
  | 'range'
  | 'keycode';

export type CustomControl = {
  id: string;
  label: string;
  type: CustomControlType;
  /** [channelId, commandId] -- the rest of the CommandDef after its id. */
  command: number[];
  options?: unknown;
  /** Current raw value bytes for this control, if known. */
  value?: number[];
};

function walk(elem: any, data: Record<string, unknown>, out: CustomControl[]) {
  if (!elem || typeof elem !== 'object') {
    return;
  }
  if (typeof elem.showIf === 'string') {
    try {
      if (!evalExpr(elem.showIf, data)) {
        return;
      }
    } catch {
      // An unparseable showIf hides nothing rather than crashing discovery.
    }
  }
  if (typeof elem.type === 'string') {
    if (elem.type !== 'label' && isCustomMenuCommandContent(elem.content)) {
      const [id, ...command] = elem.content;
      out.push({
        id,
        label: elem.label,
        type: elem.type,
        command,
        options: elem.options,
        value: data[id] as number[] | undefined,
      });
    }
    return;
  }
  if (Array.isArray(elem.content)) {
    elem.content.forEach((child: unknown) => walk(child, data, out));
  }
}

/** Every control this keyboard's definition exposes, with its current value. */
export function listCustomControls(state: RootState): CustomControl[] {
  const definition = getSelectedDefinition(state);
  if (!definition) {
    return [];
  }
  const data = getSelectedCustomMenuData(state) || {};
  const menus = isVIADefinitionV2(definition)
    ? definition.customMenus || []
    : getV3Menus(state);
  const out: CustomControl[] = [];
  (menus as unknown[]).forEach((menu) => walk(menu, data, out));
  return out;
}

const boxOrArr = (elem: unknown): unknown[] =>
  Array.isArray(elem) ? elem : [elem];

/**
 * Builds the value bytes for a write, matching custom-control.tsx's per-type
 * switch exactly so a tool call and a click produce the same command.
 */
export function buildControlWriteBytes(
  control: CustomControl,
  input: unknown,
): number[] {
  switch (control.type) {
    case 'toggle': {
      const opts = (control.options as [unknown, unknown]) || [0, 1];
      return boxOrArr(opts[input ? 1 : 0]) as number[];
    }
    case 'dropdown': {
      const opts = (control.options as Array<string | [string, number]>) || [];
      if (typeof input === 'number') {
        return [input];
      }
      const idx = opts.findIndex(
        (o) => (typeof o === 'string' ? o : o[0]) === input,
      );
      if (idx === -1) {
        const known = opts.map((o) => (typeof o === 'string' ? o : o[0]));
        throw new Error(
          `Unknown option ${JSON.stringify(input)} for "${control.id}". Known options: ${known.join(', ')}`,
        );
      }
      const opt = opts[idx];
      return [typeof opt === 'string' ? idx : (opt[1] ?? idx)];
    }
    case 'button': {
      const opts = control.options as number[] | undefined;
      return [opts?.[0] ?? 1];
    }
    case 'color': {
      const {hue, sat} = input as {hue: number; sat: number};
      return [hue, sat];
    }
    case 'keycode': {
      const byte = keycodeStringToByte(input as string);
      return [...shiftFrom16Bit(byte)];
    }
    case 'range':
      // The caller (tools/customMenu.ts) routes range controls to
      // updateCustomMenuRangeValue before reaching here; this is a safety net.
      throw new Error(
        `"${control.id}" is a range control; this path should be unreachable.`,
      );
  }
}
