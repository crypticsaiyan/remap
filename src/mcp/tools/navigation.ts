// WebMCP tools for driving the app's own navigation, so a human watching
// can see the pane/tab the agent is working in. Uses the plain browser
// History API + a popstate event rather than importing wouter's internals
// directly, since wouter's <Route> components already derive their state
// from popstate/location changes the same way a back/forward navigation would.

import {store} from 'src/store';
import {register} from '../registry';
import {setActiveConfigureTabTitle} from 'src/store/settingsSlice';
import PANES from 'src/utils/pane-config';

const CONFIGURE_TAB_TITLES = [
  'Keymap',
  'Lighting',
  'Macros',
  'Layouts',
  'Save + Load',
] as const;

function navigateTo(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function registerNavigationTools() {
  register({
    name: 'navigate_to_pane',
    title: 'Navigate To Pane',
    description: `Switch the app's top-level view. Available panes: ${PANES.map((p) => p.key).join(', ')}.`,
    inputSchema: {
      type: 'object',
      properties: {
        pane: {
          type: 'string',
          enum: PANES.map((p) => p.key),
        },
      },
      required: ['pane'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, idempotentHint: true},
    execute: async ({pane}: {pane: string}) => {
      const match = PANES.find((p) => p.key === pane);
      if (!match) {
        return {ok: false, error: `Unknown pane "${pane}".`};
      }
      navigateTo(match.path);
      return {ok: true, pane};
    },
  });

  register({
    name: 'switch_configure_tab',
    title: 'Switch Configure Tab',
    description:
      'Switch the sub-tab within the Configure pane (Keymap/Lighting/Macros/Layouts/Save + Load). Navigates to the Configure pane first if needed. Not every tab is available on every keyboard.',
    inputSchema: {
      type: 'object',
      properties: {
        tab: {type: 'string', enum: [...CONFIGURE_TAB_TITLES]},
      },
      required: ['tab'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, idempotentHint: true},
    execute: async ({tab}: {tab: string}) => {
      if (window.location.pathname !== '/') {
        navigateTo('/');
      }
      store.dispatch(setActiveConfigureTabTitle(tab));
      return {ok: true, tab};
    },
  });
}
