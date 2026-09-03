// WebMCP tool registry. Tools register here rather than calling
// document.modelContext.registerTool directly, which gets three things every
// tool in src/mcp/tools/* needs and would otherwise have to reimplement:
//
//  - a tool surface that can change shape at runtime (write_remap_proposal
//    and revert_remap_proposal only exist once they're applicable -- see
//    src/mcp/tools/commit.ts), unregistered via AbortSignal, the spec's only
//    mechanism for it;
//  - every call landing in the Agent Activity log (src/store/mcpActivitySlice)
//    and going through the destructive-tool confirmation gate
//    (src/mcp/confirm.ts), in one place instead of copy-pasted per tool;
//  - a failure contract of `{ok: false, error}` instead of a thrown
//    exception. Real WebMCP implementations have been observed stripping a
//    thrown error down to a generic message before the agent sees it, so a
//    tool that throws is a tool whose failure reason the agent never gets.
//    Returning it as data survives that.
//
// listTools()/invoke() also back the Tool Console (src/components/mcp/), so
// every tool is exercisable by a human clicking a button, in any browser,
// whether or not it exposes document.modelContext at all.

import {store} from 'src/store';
import {
  logToolStart,
  logToolResult,
  logToolError,
  logToolDenied,
} from 'src/store/mcpActivitySlice';
import {confirmDestructiveAction} from './confirm';

export interface ToolDef<TInput = any, TOutput = any> {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: WebMCPToolAnnotations;
  execute: (input: TInput) => Promise<TOutput> | TOutput;
}

interface LiveTool {
  def: ToolDef;
  controller: AbortController;
}

function getModelContext(): ModelContext | null {
  if (typeof document === 'undefined') {
    return null;
  }
  return document.modelContext ?? null;
}

export function webmcpAvailable(): boolean {
  return typeof getModelContext()?.registerTool === 'function';
}

const live = new Map<string, LiveTool>();

// A tool that unregisters itself (directly, or via a state change its own
// execute triggered) while still mid-call aborts its own signal before
// returning, which some WebMCP implementations report as the call having
// failed even though it succeeded. So registration changes wait until
// nothing is running.
let inFlight = 0;
let queuedSyncs: Array<() => void> = [];

function drainQueue() {
  if (inFlight > 0 || queuedSyncs.length === 0) {
    return;
  }
  const run = queuedSyncs;
  queuedSyncs = [];
  run.forEach((fn) => fn());
}

export function whenIdle(fn: () => void): void {
  queuedSyncs.push(fn);
  setTimeout(drainQueue, 0);
}

function coerceInput(input: unknown): Record<string, unknown> {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input);
    } catch {
      return {};
    }
  }
  if (input && typeof input === 'object') {
    return input as Record<string, unknown>;
  }
  return {};
}

function summarize(result: unknown): unknown {
  if (result && typeof result === 'object' && 'ok' in result) {
    const r = result as {ok: boolean; error?: string};
    return r.ok === false ? r.error : result;
  }
  return result;
}

let callCounter = 0;
const nextCallId = () => `mcp-call-${Date.now()}-${callCounter++}`;

/** Wraps a tool with logging, the confirmation gate, and the error contract. */
function wrap(def: ToolDef) {
  return async (rawInput: unknown): Promise<unknown> => {
    const input = coerceInput(rawInput);
    const callId = nextCallId();
    store.dispatch(logToolStart({id: callId, toolName: def.name, input}));
    inFlight++;
    try {
      if (def.annotations?.destructiveHint) {
        const approved = await confirmDestructiveAction({
          toolName: def.name,
          title: def.title ?? def.name,
          description: def.description,
        });
        if (!approved) {
          store.dispatch(logToolDenied({id: callId}));
          return {
            ok: false,
            error: `The user declined to confirm "${def.name}". No changes were made.`,
          };
        }
      }
      const result = await def.execute(input);
      store.dispatch(logToolResult({id: callId, output: summarize(result)}));
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      store.dispatch(logToolError({id: callId, error: message}));
      return {ok: false, error: message};
    } finally {
      inFlight--;
      setTimeout(drainQueue, 0);
    }
  };
}

export function register(def: ToolDef): void {
  if (live.has(def.name)) {
    return;
  }
  const controller = new AbortController();
  const modelContext = getModelContext();
  if (modelContext) {
    try {
      modelContext.registerTool(
        {
          name: def.name,
          title: def.title,
          description: def.description,
          inputSchema: def.inputSchema,
          annotations: def.annotations,
          execute: wrap(def),
        },
        {signal: controller.signal},
      );
    } catch (e) {
      // A failed registration is a bug worth seeing, not silently dropping a tool.
      const message = e instanceof Error ? e.message : String(e);
      const callId = nextCallId();
      store.dispatch(
        logToolStart({id: callId, toolName: def.name, input: null}),
      );
      store.dispatch(
        logToolError({id: callId, error: `registration failed: ${message}`}),
      );
      console.error(`WebMCP: failed to register tool "${def.name}"`, message);
      return;
    }
  }
  live.set(def.name, {def, controller});
}

export function unregister(name: string): void {
  const entry = live.get(name);
  if (!entry) {
    return;
  }
  entry.controller.abort();
  live.delete(name);
}

/** Registers `def` when `active` is true, unregisters it otherwise. Idempotent. */
export function setRegistered(def: ToolDef, active: boolean): void {
  if (active) {
    register(def);
  } else {
    unregister(def.name);
  }
}

export function listTools(): ToolDef[] {
  return [...live.values()].map((entry) => entry.def);
}

/**
 * Runs a tool through the exact wrapper an agent's call would go through.
 * This is what the Tool Console uses, so every tool is exercisable by hand
 * in a browser with no WebMCP support at all.
 */
export async function invoke(name: string, input: unknown): Promise<unknown> {
  const entry = live.get(name);
  if (!entry) {
    return {
      ok: false,
      error: `No tool named "${name}" is currently registered.`,
    };
  }
  return wrap(entry.def)(input);
}
