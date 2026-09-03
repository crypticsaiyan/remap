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
  return getByteForCode(code, basicKeyToByte);
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
