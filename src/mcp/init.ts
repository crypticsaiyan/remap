// Entry point for WebMCP integration. Feature-detects the native
// document.modelContext API (https://webmachinelearning.github.io/webmcp/)
// and, if present, registers every tool group once. No polyfill is used --
// see WEBMCP.md for why, and for how to enable WebMCP in Chrome for testing.
//
// Tools register through src/mcp/registry.ts even when document.modelContext
// is absent, so the Tool Console (src/components/mcp/ToolConsole.tsx) can
// still run every one of them by hand in a browser with no WebMCP support.

import {registerKeymapTools} from './tools/keymap';
import {registerLightingTools} from './tools/lighting';
import {registerMacroTools} from './tools/macros';
import {registerLayoutTools} from './tools/layout';
import {registerNavigationTools} from './tools/navigation';
import {registerMaintenanceTools} from './tools/maintenance';
import {registerProposeTools} from './tools/propose';
import {registerCommitTools} from './tools/commit';
import {registerDeviceTools} from './tools/devices';
import {registerCustomMenuTools} from './tools/customMenu';
import {registerRgbMatrixTools} from './tools/rgbMatrix';
import {registerAppSettingsTools} from './tools/appSettings';
import {registerDiagnosticsTools} from './tools/diagnostics';
import {webmcpAvailable} from './registry';

let initialized = false;

export function isWebMCPSupported(): boolean {
  return webmcpAvailable();
}

export function initWebMCP(): void {
  if (initialized) {
    return;
  }
  initialized = true;
  registerKeymapTools();
  registerLightingTools();
  registerMacroTools();
  registerLayoutTools();
  registerNavigationTools();
  registerMaintenanceTools();
  registerProposeTools();
  registerCommitTools();
  registerDeviceTools();
  registerCustomMenuTools();
  registerRgbMatrixTools();
  registerAppSettingsTools();
  registerDiagnosticsTools();
}
