import {createSlice, PayloadAction} from '@reduxjs/toolkit';
import type {RootState} from './index';

// Holds the pending confirmation prompt for a destructive WebMCP tool call.
// The resolver for the prompt lives outside Redux (see src/mcp/confirm.ts) --
// this slice only carries the display payload so ConfirmDialog can render it.

export type MCPPendingConfirmation = {
  requestId: string;
  title: string;
  description: string;
  toolName: string;
} | null;

type MCPConfirmState = {
  pending: MCPPendingConfirmation;
};

const initialState: MCPConfirmState = {
  pending: null,
};

const mcpConfirmSlice = createSlice({
  name: 'mcpConfirm',
  initialState,
  reducers: {
    setPendingConfirmation: (
      state,
      action: PayloadAction<MCPPendingConfirmation>,
    ) => {
      state.pending = action.payload;
    },
    clearPendingConfirmation: (state) => {
      state.pending = null;
    },
  },
});

export const {setPendingConfirmation, clearPendingConfirmation} =
  mcpConfirmSlice.actions;

export default mcpConfirmSlice.reducer;

export const getPendingMCPConfirmation = (state: RootState) =>
  state.mcpConfirm.pending;
