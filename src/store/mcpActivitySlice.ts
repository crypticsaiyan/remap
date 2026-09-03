import {createSlice, PayloadAction} from '@reduxjs/toolkit';
import type {RootState} from './index';

// Log of WebMCP tool invocations, shown in the Agent Activity panel so a
// human watching the app can see what an AI agent is doing to it in real time.

export type MCPActivityStatus = 'pending' | 'success' | 'error' | 'denied';

export type MCPActivityEntry = {
  id: string;
  toolName: string;
  input: unknown;
  status: MCPActivityStatus;
  output?: unknown;
  error?: string;
  startedAt: number;
  finishedAt?: number;
};

type MCPActivityState = {
  entries: MCPActivityEntry[];
};

const MAX_ENTRIES = 100;

const initialState: MCPActivityState = {
  entries: [],
};

const mcpActivitySlice = createSlice({
  name: 'mcpActivity',
  initialState,
  reducers: {
    logToolStart: (
      state,
      action: PayloadAction<{id: string; toolName: string; input: unknown}>,
    ) => {
      const {id, toolName, input} = action.payload;
      state.entries.unshift({
        id,
        toolName,
        input,
        status: 'pending',
        startedAt: Date.now(),
      });
      if (state.entries.length > MAX_ENTRIES) {
        state.entries.length = MAX_ENTRIES;
      }
    },
    logToolResult: (
      state,
      action: PayloadAction<{id: string; output: unknown}>,
    ) => {
      const entry = state.entries.find((e) => e.id === action.payload.id);
      if (entry) {
        entry.status = 'success';
        entry.output = action.payload.output;
        entry.finishedAt = Date.now();
      }
    },
    logToolError: (
      state,
      action: PayloadAction<{id: string; error: string}>,
    ) => {
      const entry = state.entries.find((e) => e.id === action.payload.id);
      if (entry) {
        entry.status = 'error';
        entry.error = action.payload.error;
        entry.finishedAt = Date.now();
      }
    },
    logToolDenied: (state, action: PayloadAction<{id: string}>) => {
      const entry = state.entries.find((e) => e.id === action.payload.id);
      if (entry) {
        entry.status = 'denied';
        entry.finishedAt = Date.now();
      }
    },
    clearActivityLog: (state) => {
      state.entries = [];
    },
  },
});

export const {
  logToolStart,
  logToolResult,
  logToolError,
  logToolDenied,
  clearActivityLog,
} = mcpActivitySlice.actions;

export default mcpActivitySlice.reducer;

export const getMCPActivityEntries = (state: RootState) =>
  state.mcpActivity.entries;
