// Ambient types for the WebMCP W3C Community Group Draft API
// (https://webmachinelearning.github.io/webmcp/). Not yet in lib.dom.d.ts.

interface WebMCPToolExecuteOptions {
  signal?: AbortSignal;
}

interface WebMCPToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  untrustedContentHint?: boolean;
}

interface WebMCPToolDefinition<TInput = any, TOutput = any> {
  name: string;
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: WebMCPToolAnnotations;
  execute: (
    input: TInput,
    options: WebMCPToolExecuteOptions,
  ) => Promise<TOutput> | TOutput;
}

interface WebMCPRegisterToolOptions {
  exposedTo?: string[];
  signal?: AbortSignal;
}

interface ModelContext {
  registerTool(
    tool: WebMCPToolDefinition,
    options?: WebMCPRegisterToolOptions,
  ): Promise<void>;
  getTools(options?: Record<string, unknown>): Promise<WebMCPToolDefinition[]>;
  executeTool(
    tool: WebMCPToolDefinition | string,
    input: unknown,
    options?: WebMCPToolExecuteOptions,
  ): Promise<unknown>;
  addEventListener(type: 'toolchange', listener: (event: Event) => void): void;
  removeEventListener(
    type: 'toolchange',
    listener: (event: Event) => void,
  ): void;
}

interface Document {
  readonly modelContext?: ModelContext;
}
