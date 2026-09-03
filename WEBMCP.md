# remap: a WebMCP-native VIA keyboard configurator

Built for the [OpenAI WebMCP Challenge](https://openai.com/webmcp-challenge/).

**Live:** [remap-xi.vercel.app](https://remap-xi.vercel.app) — needs a QMK/VIA keyboard connected over WebHID, and either Chrome with `chrome://flags/#enable-webmcp-testing`, or the ChatGPT desktop app's built-in browser.

## What existed before this challenge

This app is a fork of [the-via/app](https://github.com/the-via/app), the official
open-source web configurator for QMK's VIA protocol. Everything about talking
to a physical keyboard over WebHID, and the whole configurator UI, is prior
work we did not touch:

- `src/utils/keyboard-api.ts` -- the `KeyboardAPI` class that speaks the raw
  VIA/QMK HID protocol (key remap, layers, macros, RGB, layout options,
  encoders, EEPROM reset, bootloader jump).
- `src/store/*Slice.ts` -- Redux Toolkit slices and thunks that keep the UI,
  the app state, and the physical device in sync (`updateKey`, `setLayer`,
  `saveMacros`, `updateBacklightValue`, `updateCustomMenuRangeValue`,
  `updateLayoutOption`, ...).
- `src/components/panes/configure-panes/*` -- the Keymap / Lighting / Macros
  / Layouts / Save+Load UI a human uses today, unchanged.

## What's new for the challenge

A [WebMCP](https://webmachinelearning.github.io/webmcp/) layer (`src/mcp/`)
registers tools on `document.modelContext` that drive the exact same Redux
thunks and `KeyboardAPI` calls the UI already uses, plus a small, visually
distinct agent-facing surface (`src/components/mcp/`) so a human watching can
see, review, and gate what an agent does.

### Two ways an agent changes the keymap

Remapping one key is trivial and does not need review: `remap_key` writes it
immediately, the same way clicking a keycap in the UI does. What is
genuinely hard is redesigning several keys at once while holding tradeoffs
in your head -- not colliding with anything already bound, keeping a reason
for every move a person can actually evaluate. That case gets a staged
workflow instead of a direct write:

1. **`propose_remap`** validates every change (unknown keycodes, out-of-range
   layers/positions, missing reasons) and checks for collisions against what
   is already bound. It writes nothing -- it stores a `Proposal` in
   `mcpProposalSlice` and returns a `proposal_id` plus the full diff.
2. A human reviews it in **`ProposalReview.tsx`**, a persistent panel (not a
   modal) showing every change as `layer / position / before / after / why`,
   with any collision warnings. They click **Approve** or **Decline**.
   `proposalApproved`/`proposalRejected` are dispatched only from this
   component -- no file under `src/mcp/tools/*` imports them, which is what
   makes "approved" a state an agent has no code path to produce on its own.
3. **`write_remap_proposal`** commits an approved proposal: it refuses
   anything not approved, and doesn't exist as a callable tool at all until
   something is. **`revert_remap_proposal`** undoes a written one from a
   snapshot taken immediately before the write. Both are registered and
   unregistered dynamically as proposals move through their lifecycle (see
   "Dynamic tool surface" below), and both are also the exact functions the
   panel's own "Write to keyboard" / "Undo this change" buttons call, so a
   human and an agent are provably going through the same code.

### The registry (`src/mcp/registry.ts`)

Every tool registers through `register()`/`setRegistered()` rather than
calling `document.modelContext.registerTool` directly. That gets three
things every tool needs, in one place:

- **A dynamic tool surface.** Tools can be added or removed at runtime via
  `AbortSignal`, the spec's only unregistration mechanism -- this is what
  lets `write_remap_proposal` and `revert_remap_proposal` only exist once
  applicable, so an agent listing tools sees a surface that reflects the
  real state of the page rather than a fixed list.
- **A `{ok: false, error}` failure contract instead of a thrown exception.**
  Real WebMCP implementations have been observed stripping a thrown error's
  message down to a generic one before an agent ever sees it, so a tool that
  throws is a tool whose failure reason the agent doesn't get. Every tool
  here returns failure as data instead, and `registry.ts`'s wrapper converts
  any thrown error to the same shape as a last resort.
- **One logging and confirmation path.** Every call -- from an agent or from
  the Tool Console below -- lands in the Agent Dock's activity log, and any
  tool with `annotations.destructiveHint` (currently `reset_eeprom`,
  `jump_to_bootloader`) is held behind `ConfirmDialog.tsx` until a human
  approves it. That's a different gate from proposal review: this one is for
  an action that can't be reviewed as a diff at all, only allowed or refused.

### The Agent Dock (`src/components/mcp/`)

A deliberately distinct visual surface from the rest of the app -- a light
"instrument panel" (its own CSS custom properties, scoped under `.mcpdock` in
`agent-dock.css`) dropped onto VIA's chrome, so it reads as a separate agent
layer rather than another VIA settings pane. It stays mounted and visible
regardless of whether the current browser exposes `document.modelContext` at
all:

- **Status** -- states plainly whether this browser is exposing WebMCP, and
  if not, links the Chrome flag with a one-click copy.
- **Activity** -- every tool call (human or agent), with input, result, and
  timing.
- **Console** -- runs any registered tool by hand, through the identical
  wrapper an agent's call goes through. This is what makes the whole tool
  surface exercisable in any browser, flag or no flag: a human can drive
  `get_keyboard_state`, `propose_remap`, or anything else directly, watch it
  log, and see `ProposalReview` open for a staged remap exactly as it would
  for an agent.

## Tool catalog

45 tools. All inputs/outputs use human-readable QMK keycode strings
(`"KC_A"`, `"MO(1)"`), never raw protocol bytes.

**Keymap & layers** -- `get_keyboard_state`, `get_keymap`, `remap_key`,
`set_active_layer`, `list_available_keycodes`, `save_keymap_snapshot`,
`load_keymap_snapshot` (destructive, confirmed)

**Multi-key remap (staged)** -- `propose_remap`, `get_proposal`,
`write_remap_proposal` and `revert_remap_proposal` (both registered only
once applicable -- see above)

**Lighting/RGB** -- `get_lighting_state`, `set_lighting_value` (v2
protocol), `get_per_key_rgb`/`set_per_key_rgb` (v3+ per-key addressable
LEDs), `get_custom_colors`/`set_custom_color` (the v2 saved-color palette)

**Custom controls (generic)** -- `list_custom_controls`,
`set_custom_control`. Every VIA definition (v2's `customMenus`, v3's
`menus`) can define arbitrary toggle/dropdown/button/color/range/keycode
settings beyond lighting -- audio, display, tap-hold tuning, whatever a
keyboard maker exposed. These two tools cover all of it generically (see
`src/mcp/customMenuControls.ts`), mirroring the exact write logic
`custom-control.tsx` uses per control type so a tool call and a click
produce the same command bytes. `set_custom_menu_option` in `lighting.ts`
stays as a narrower, lighting-focused alias for range controls specifically.

**Macros** -- `get_macro_capabilities`, `list_macros`, `set_macro`,
`clear_macro`

**Layout & encoder** -- `get_layout_options`, `set_layout_option`,
`remap_encoder`

**Devices** -- `list_connected_devices`, `select_device` -- discover and
switch between every keyboard this browser already has WebHID access to.
Pairing a new one is still the human's job (see below).

**Navigation** -- `navigate_to_pane`, `switch_configure_tab`

**App** -- `get_app_settings`, `set_theme_mode`, `set_render_mode`,
`get_app_errors`, `clear_app_errors`, `get_activity_log`,
`get_host_keyboard_layout`, `set_host_keyboard_layout`,
`set_test_keyboard_sound` -- the configurator app's own display
preferences, internal error log, and its own agent activity feed
(`get_activity_log` lets an agent check what it already did instead of
relying on conversation memory), not the keyboard.

**Diagnostics** -- `get_definition` (physical layout: position/size/rotation
plus matrix row/col and bound keycode per key, for spatial requests like
"the key left of spacebar" that `get_keymap`'s flat keyIndex list can't
answer), `diagnose_matrix` (live switch-matrix read -- which row/col
positions are physically closed right now, for stuck-key/wiring diagnosis,
unrelated to what's bound to them), `get_device_info` (firmware version,
keycodes protocol version, live uptime)

**Device maintenance** (destructive, confirmed) -- `reset_eeprom`,
`jump_to_bootloader`

Device pairing itself is intentionally not a tool: `navigator.hid.requestDevice`
requires a genuine user gesture and can't be initiated from a tool's
`execute` callback. The existing "Authorize device" UI stays the human's
job; every tool above assumes a device is already connected.

Deliberately left out: the raw HID console (sending arbitrary byte
sequences straight to the device has no way to be validated or explained
to the person reviewing it, so it stays a manual-only debugging tool), and
the Key Tester (it reports physical keypresses, which nothing but a human's
fingers can produce).

## Visual identity

The app-wide palette is its own now, not upstream VIA's default navy/dusty-
pink: a warm graphite base with a copper accent (`src/utils/themes.ts`'s
`REMAP` theme, set as the default in `src/utils/device-store.ts`, plus the
matching base colors in `src/app.global.css`). Every existing component
reads these through the same CSS custom properties it always did --
`--color_accent`, `--color_dark-grey`, `--bg_control`, and so on -- so the
whole app reskins from two small files rather than hundreds of component
edits, and every other built-in keycap theme in Settings still works
unchanged. The Agent Dock's own copper accent (`agent-dock.css`) matches
this exactly, so the pre-existing UI and the new agent layer read as one
product rather than two designs stapled together.

## Why WebMCP fits a hardware configurator

A keyboard configurator is a genuinely collaborative surface: the agent can
see and change firmware state, but only the human sitting at the physical
keyboard can tell whether a remap "feels right," and only the human can
authorize the initial WebHID pairing. That split is exactly what WebMCP is
for: the agent and the human share one page, one Redux store, and one
on-screen keyboard, so a single-key change is visible immediately, a
multi-key one waits in a first-class review panel, and a destructive one
waits behind an explicit confirmation.

## Testing

1. `npm install` (or `bun install`), `npm run dev`.
2. Open the dev URL in Chrome 149+ with `chrome://flags/#enable-webmcp-testing`
   enabled, or in the ChatGPT desktop browser. Neither is required just to
   look at the Agent Dock -- it's visible either way, and its Console tab
   works with no WebMCP support at all.
3. Without a live agent: open the Agent Dock (bottom-right) → Console, pick
   `get_keyboard_state`, and click Run. Or, from DevTools, run
   `await document.modelContext.getTools()` to see every registered tool and
   its schema.
4. Connect a real QMK/VIA keyboard via "Authorize device", then from the
   Console (or an agent) call `propose_remap` with a couple of changes.
   `ProposalReview` should open with the diff; click Approve, then "Write to
   keyboard", and confirm both the on-screen keyboard and the physical one
   update. Try "Undo this change" afterward.
5. Call `reset_eeprom` or `jump_to_bootloader` and confirm `ConfirmDialog`
   blocks execution until approved.
6. No physical keyboard handy? The read-only tools (`get_keyboard_state`,
   `list_available_keycodes`) and `propose_remap`'s validation still verify
   the tools are registered and schema-correct; writing needs real hardware
   to see round-trip effects.
