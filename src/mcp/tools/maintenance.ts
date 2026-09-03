// Guarded, destructive device-maintenance tools. Both go through the
// registry's confirmation gate (annotations.destructiveHint) so a human must
// approve them in the ConfirmDialog before anything is sent to the keyboard.

import {store} from 'src/store';
import {register} from '../registry';
import {getSelectedKeyboardAPI} from 'src/store/devicesSlice';

export function registerMaintenanceTools() {
  register({
    name: 'reset_eeprom',
    title: 'Reset EEPROM',
    description:
      "Erase the keyboard's saved settings (keymap, macros, lighting) back to firmware defaults. Irreversible -- requires user confirmation.",
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    },
    execute: async () => {
      const api = getSelectedKeyboardAPI(store.getState());
      if (!api) {
        return {ok: false, error: 'No keyboard connected.'};
      }
      await api.resetEEPROM();
      return {ok: true, reset: true};
    },
  });

  register({
    name: 'jump_to_bootloader',
    title: 'Jump To Bootloader',
    description:
      'Reboot the keyboard into its firmware bootloader for reflashing. The keyboard will disconnect. Requires user confirmation.',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    },
    execute: async () => {
      const api = getSelectedKeyboardAPI(store.getState());
      if (!api) {
        return {ok: false, error: 'No keyboard connected.'};
      }
      await api.jumpToBootloader();
      return {ok: true, jumped: true};
    },
  });
}
