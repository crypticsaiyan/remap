// Validation for propose_remap. WebMCP's inputSchema is advisory, not
// enforced by the browser, so every field here is checked by hand. Errors
// mean the proposal is never created at all; warnings ride along on it so
// the human sees them at review time instead of the agent silently working
// around them.

import type {RootState} from 'src/store';
import {getNumberOfLayers, getSelectedKeymaps} from 'src/store/keymapSlice';
import {getSelectedKeyDefinitions} from 'src/store/definitionsSlice';
import type {Issue, KeyChange} from 'src/store/mcpProposalSlice';
import {byteToKeycodeString, keycodeStringToByte} from './keycodes';

export type RawRemapChange = {
  layer?: unknown;
  keyIndex?: unknown;
  keycode?: unknown;
  reason?: unknown;
};

export const positionLabel = (keyIndex: number, row?: number, col?: number) =>
  row !== undefined && col !== undefined
    ? `key ${keyIndex} (row ${row}, col ${col})`
    : `key ${keyIndex}`;

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

export function validateRemap(
  raw: readonly RawRemapChange[],
  state: RootState,
): {changes: KeyChange[]; issues: Issue[]} {
  const issues: Issue[] = [];
  const changes: KeyChange[] = [];
  const seen = new Map<string, number>();

  const numberOfLayers = getNumberOfLayers(state);
  const keyDefs = getSelectedKeyDefinitions(state);
  const keymaps = getSelectedKeymaps(state) ?? [];

  raw.forEach((c, index) => {
    const at = (level: Issue['level'], code: Issue['code'], message: string) =>
      issues.push({level, code, message, changeIndex: index});

    if (!isInt(c.layer) || c.layer < 0 || c.layer >= numberOfLayers) {
      at(
        'error',
        'invalid-layer',
        `layer must be an integer 0..${numberOfLayers - 1}, got ${JSON.stringify(c.layer)}`,
      );
      return;
    }
    if (!isInt(c.keyIndex) || !keyDefs[c.keyIndex]) {
      at(
        'error',
        'invalid-position',
        `no key at keyIndex ${JSON.stringify(c.keyIndex)}`,
      );
      return;
    }
    if (typeof c.keycode !== 'string' || !c.keycode.trim()) {
      at(
        'error',
        'unknown-keycode',
        `keycode must be a non-empty string, got ${JSON.stringify(c.keycode)}`,
      );
      return;
    }
    if (typeof c.reason !== 'string' || !c.reason.trim()) {
      at(
        'error',
        'missing-reason',
        'every change needs a reason, so the person reviewing it can tell whether it is right',
      );
      return;
    }

    let byte: number;
    try {
      byte = keycodeStringToByte(c.keycode);
    } catch (e) {
      at(
        'error',
        'unknown-keycode',
        e instanceof Error ? e.message : `unknown keycode ${JSON.stringify(c.keycode)}`,
      );
      return;
    }
    const canonical = byteToKeycodeString(byte);

    const key = `${c.layer}/${c.keyIndex}`;
    if (seen.has(key)) {
      at(
        'error',
        'duplicate-target',
        `layer ${c.layer} ${positionLabel(c.keyIndex)} is set twice in this proposal (also change ${seen.get(key)})`,
      );
      return;
    }
    seen.set(key, index);

    const {row, col} = keyDefs[c.keyIndex];
    const from = byteToKeycodeString(keymaps[c.layer]?.[c.keyIndex] ?? 0);
    if (from === canonical) {
      at(
        'warning',
        'no-op',
        `layer ${c.layer} ${positionLabel(c.keyIndex, row, col)} is already ${canonical}`,
      );
    }

    changes.push({
      layer: c.layer,
      keyIndex: c.keyIndex,
      position: positionLabel(c.keyIndex, row, col),
      from,
      to: canonical,
      reason: c.reason.trim(),
    });
  });

  if (issues.some((i) => i.level === 'error')) {
    return {changes: [], issues};
  }

  issues.push(...collisionWarnings(changes, keymaps));
  return {changes, issues};
}

// A keycode landing somewhere while it is still bound elsewhere on the same
// layer. Not fatal -- a person does bind a key twice on purpose sometimes --
// but exactly the thing a human clicking through a grid tends to miss.
function collisionWarnings(
  changes: readonly KeyChange[],
  keymaps: readonly number[][],
): Issue[] {
  const issues: Issue[] = [];
  const movedAway = new Set(changes.map((c) => `${c.layer}/${c.keyIndex}`));
  const IGNORED = new Set(['KC_TRANSPARENT', 'KC_NO']);

  changes.forEach((c, index) => {
    if (IGNORED.has(c.to)) {
      return;
    }
    const layerKeymap = keymaps[c.layer] ?? [];
    const elsewhere: number[] = [];
    layerKeymap.forEach((byte, keyIndex) => {
      const key = `${c.layer}/${keyIndex}`;
      if (movedAway.has(key)) {
        return;
      }
      if (byteToKeycodeString(byte) === c.to) {
        elsewhere.push(keyIndex);
      }
    });
    if (elsewhere.length) {
      issues.push({
        level: 'warning',
        code: 'collision',
        changeIndex: index,
        message: `${c.to} is already bound at layer ${c.layer} ${elsewhere.map((k) => positionLabel(k)).join(', ')}`,
      });
    }
  });

  return issues;
}
