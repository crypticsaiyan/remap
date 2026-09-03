// Tools for the app itself rather than the connected keyboard: display
// preferences and the internal error log. Included on the theory that an
// agent helping someone set up their keyboard is also a reasonable place to
// ask "switch to dark mode" or "why did that last command fail".

import {store} from 'src/store';
import {register} from '../registry';
import {
  getAllowGlobalHotKeys,
  getHostKeyboardLayout,
  getMacroEditorSettings,
  getRenderMode,
  getTestKeyboardSoundsSettings,
  getThemeMode,
  getThemeName,
  toggleThemeMode,
  updateHostKeyboardLayout,
  updateRenderMode,
  setTestKeyboardSoundsSettings,
} from 'src/store/settingsSlice';
import {clearAppErrors, getAppErrors} from 'src/store/errorsSlice';
import {getMCPActivityEntries} from 'src/store/mcpActivitySlice';
import {TestKeyboardSoundsMode} from 'src/components/void/test-keyboard-sounds';

export function registerAppSettingsTools() {
  register({
    name: 'get_app_settings',
    title: 'Get App Settings',
    description:
      "Read the configurator app's own display preferences: theme (light/dark), theme name, keyboard render mode (2D/3D), and macro editor behavior. This is about the app, not the connected keyboard.",
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: true},
    execute: async () => {
      const state = store.getState();
      return {
        ok: true,
        themeMode: getThemeMode(state),
        themeName: getThemeName(state),
        renderMode: getRenderMode(state),
        allowGlobalHotKeys: getAllowGlobalHotKeys(state),
        macroEditor: getMacroEditorSettings(state),
      };
    },
  });

  register({
    name: 'set_theme_mode',
    title: 'Set Theme Mode',
    description: 'Switch the app between light and dark mode.',
    inputSchema: {
      type: 'object',
      properties: {mode: {type: 'string', enum: ['light', 'dark']}},
      required: ['mode'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, idempotentHint: true},
    execute: async ({mode}: {mode: 'light' | 'dark'}) => {
      if (getThemeMode(store.getState()) !== mode) {
        store.dispatch(toggleThemeMode());
      }
      return {ok: true, themeMode: mode};
    },
  });

  register({
    name: 'set_render_mode',
    title: 'Set Render Mode',
    description:
      "Switch the on-screen keyboard between a 2D and 3D render. Falls back to 2D automatically if this browser doesn't support WebGL.",
    inputSchema: {
      type: 'object',
      properties: {mode: {type: 'string', enum: ['2D', '3D']}},
      required: ['mode'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, idempotentHint: true},
    execute: async ({mode}: {mode: '2D' | '3D'}) => {
      store.dispatch(updateRenderMode(mode));
      return {ok: true, renderMode: getRenderMode(store.getState())};
    },
  });

  register({
    name: 'get_app_errors',
    title: 'Get App Errors',
    description:
      'Read the app\'s internal error log -- failed HID commands, device-loading retries, and similar. Useful for diagnosing "why didn\'t that work" without asking the person to open DevTools.',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: true},
    execute: async () => {
      return {ok: true, errors: getAppErrors(store.getState())};
    },
  });

  register({
    name: 'clear_app_errors',
    title: 'Clear App Errors',
    description: "Clear the app's internal error log.",
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: false, idempotentHint: true},
    execute: async () => {
      store.dispatch(clearAppErrors());
      return {ok: true};
    },
  });

  register({
    name: 'get_activity_log',
    title: 'Get Agent Activity Log',
    description:
      "Read this agent's own recent tool calls -- name, input, result or error, and timing -- the same feed shown in the Agent Dock's Activity tab. Lets an agent check what it already did instead of relying on conversation memory, e.g. after a page reload mid-task.",
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max entries to return, newest first. Default 20.',
        },
      },
      additionalProperties: false,
    },
    annotations: {readOnlyHint: true},
    execute: async ({limit}: {limit?: number}) => {
      const entries = getMCPActivityEntries(store.getState());
      return {
        ok: true,
        entries: entries.slice(0, limit && limit > 0 ? limit : 20).map((e) => ({
          toolName: e.toolName,
          input: e.input,
          status: e.status,
          output: e.output,
          error: e.error,
          startedAt: e.startedAt,
          finishedAt: e.finishedAt,
        })),
      };
    },
  });

  register({
    name: 'get_host_keyboard_layout',
    title: 'Get Host Keyboard Layout',
    description:
      "Read the OS keyboard layout the app assumes when showing keycodes (e.g. \"keymap_us\"). This affects display only, not what's written to the device.",
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: true},
    execute: async () => {
      return {ok: true, hostKeyboardLayout: getHostKeyboardLayout(store.getState())};
    },
  });

  register({
    name: 'set_host_keyboard_layout',
    title: 'Set Host Keyboard Layout',
    description:
      'Set the OS keyboard layout the app assumes for display purposes (e.g. "keymap_us", "keymap_uk", "keymap_dvorak"). Does not change anything on the device itself.',
    inputSchema: {
      type: 'object',
      properties: {layout: {type: 'string'}},
      required: ['layout'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, idempotentHint: true},
    execute: async ({layout}: {layout: string}) => {
      store.dispatch(updateHostKeyboardLayout(layout));
      return {ok: true, hostKeyboardLayout: layout};
    },
  });

  register({
    name: 'set_test_keyboard_sound',
    title: 'Set Test Keyboard Sound',
    description:
      "Configure the app's own audio feedback for the Key Tester (a synthesized tone per keypress, played by the browser -- not the physical keyboard). Omit any field to leave it unchanged.",
    inputSchema: {
      type: 'object',
      properties: {
        isEnabled: {type: 'boolean'},
        volume: {type: 'number', description: '0-100.'},
        waveform: {
          type: 'string',
          enum: ['sine', 'square', 'sawtooth', 'triangle'],
        },
        mode: {type: 'string', enum: ['Random', 'WickiHayden', 'Chromatic']},
        transpose: {type: 'number'},
      },
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, idempotentHint: true},
    execute: async ({
      isEnabled,
      volume,
      waveform,
      mode,
      transpose,
    }: {
      isEnabled?: boolean;
      volume?: number;
      waveform?: OscillatorType;
      mode?: keyof typeof TestKeyboardSoundsMode;
      transpose?: number;
    }) => {
      store.dispatch(
        setTestKeyboardSoundsSettings({
          ...(isEnabled !== undefined && {isEnabled}),
          ...(volume !== undefined && {volume}),
          ...(waveform !== undefined && {waveform}),
          ...(mode !== undefined && {mode: TestKeyboardSoundsMode[mode]}),
          ...(transpose !== undefined && {transpose}),
        }),
      );
      return {ok: true, settings: getTestKeyboardSoundsSettings(store.getState())};
    },
  });
}
