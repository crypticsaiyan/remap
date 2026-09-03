// WebMCP tools for discovering and switching between connected keyboards.
// Pairing a new device still needs a human's click (WebHID's picker requires
// a genuine user gesture), but once one or more boards are paired, an agent
// can see all of them and choose which is active.

import {store} from 'src/store';
import {register} from '../registry';
import {
  getConnectedDevices,
  getInvalidProtocolDevices,
  getSelectedDevicePath,
  getUnresolvedDefinitionDevices,
} from 'src/store/devicesSlice';
import {selectConnectedDeviceByPath} from 'src/store/devicesThunks';

export function registerDeviceTools() {
  register({
    name: 'list_connected_devices',
    title: 'List Connected Devices',
    description:
      'List every keyboard this browser currently has WebHID access to: which one is active, which are connected but not selected, and which were seen but could not be used (no definition found, or an unsupported protocol). Pairing a new device is not possible from a tool -- the human has to click "Authorize device" -- but this tells an agent what is already available.',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: true},
    execute: async () => {
      const state = store.getState();
      const selectedPath = getSelectedDevicePath(state);
      const connected = Object.values(getConnectedDevices(state)).map((d) => ({
        path: d.path,
        productName: d.productName,
        vendorProductId: d.vendorProductId,
        protocol: d.protocol,
        active: d.path === selectedPath,
      }));
      const unresolved = Object.values(
        getUnresolvedDefinitionDevices(state),
      ).map((d) => ({
        path: d.path,
        productName: d.productName,
        reason: 'no keyboard definition found for this device',
      }));
      const invalidProtocol = Object.values(
        getInvalidProtocolDevices(state),
      ).map((d) => ({
        path: d.path,
        productName: d.productName,
        reason: 'unsupported or unreadable VIA protocol version',
      }));
      return {ok: true, connected, unresolved, invalidProtocol};
    },
  });

  register({
    name: 'select_device',
    title: 'Select Device',
    description:
      'Make a different already-connected keyboard the active one, by path from list_connected_devices. All other tools (keymap, lighting, macros, ...) act on whichever device is active.',
    inputSchema: {
      type: 'object',
      properties: {path: {type: 'string'}},
      required: ['path'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, idempotentHint: true},
    execute: async ({path}: {path: string}) => {
      const state = store.getState();
      if (!getConnectedDevices(state)[path]) {
        return {
          ok: false,
          error: `No connected device at path "${path}". Call list_connected_devices first.`,
        };
      }
      await store.dispatch(selectConnectedDeviceByPath(path) as any);
      return {ok: true, path};
    },
  });
}
