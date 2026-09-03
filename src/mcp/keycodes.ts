// Shared keycode string <-> byte helpers for MCP tools, so tool schemas can
// always speak in human-readable QMK keycode strings ("KC_A", "MO(1)", ...)
// and never require raw protocol bytes.

import {store} from 'src/store';
import {
  getBasicKeyToByte,
  getSelectedDefinition,
} from 'src/store/definitionsSlice';
import {getSelectedConnectedDevice} from 'src/store/devicesSlice';
import {
  getByteForCode,
  getCodeForByte,
  getKeycodesForKeyboard,
} from 'src/utils/key';

export function keycodeStringToByte(code: string): number {
  const {basicKeyToByte} = getBasicKeyToByte(store.getState());
  const byte = getByteForCode(code, basicKeyToByte);
  // getByteForCode's advanced-keycode parser (src/utils/advanced-keys.ts)
  // returns 0 -- KC_NO, "disabled key" -- for any macro syntax it doesn't
  // recognize, rather than failing. That's silent data loss for a tool
  // call: an agent asking for e.g. "LCTL_T(KC_ESC)" (a QMK macro alias VIA
  // doesn't parse; the accepted form is "MT(MOD_LCTL, KC_ESC)") gets back
  // {ok:true} while the key it touched quietly goes dead. Reject that here
  // instead of writing it.
  if (byte === 0 && code.trim().toUpperCase() !== 'KC_NO') {
    throw new Error(
      `"${code}" is not a keycode this app's advanced-keycode parser recognizes (it would silently write KC_NO / disabled). ` +
        `For tap-hold keys use the generic form "MT(MOD_LCTL, KC_ESC)" (mod-tap) or "LT(1, KC_ESC)" (layer-tap), not shorthand macros like LCTL_T(...). ` +
        `Call list_available_keycodes to see this keyboard's plain keycodes.`,
    );
  }
  return byte;
}

export function byteToKeycodeString(byte: number): string {
  const {basicKeyToByte, byteToKey} = getBasicKeyToByte(store.getState());
  return getCodeForByte(byte, basicKeyToByte, byteToKey) ?? String(byte);
}

// Returns a flat list of keycodes available on the currently selected
// keyboard (code + display name), optionally filtered by a substring search
// and capped to `limit` entries -- used by the list_available_keycodes tool.
export function listKeycodesForSelectedKeyboard(search?: string, limit = 60) {
  const state = store.getState();
  const definition = getSelectedDefinition(state);
  const connectedDevice = getSelectedConnectedDevice(state);
  if (!definition || !connectedDevice) {
    return [];
  }
  const all = getKeycodesForKeyboard(definition, connectedDevice.protocol);
  const needle = search?.trim().toLowerCase();
  const filtered = needle
    ? all.filter(
        (k) =>
          k.code.toLowerCase().includes(needle) ||
          k.name.toLowerCase().includes(needle),
      )
    : all;
  return filtered.slice(0, limit).map((k) => ({code: k.code, name: k.name}));
}
