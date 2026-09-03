import {createSlice, PayloadAction} from '@reduxjs/toolkit';
import type {RootState} from './index';

// Staged, human-reviewed multi-key remap proposals. This is the flagship
// WebMCP workflow: remapping one key is trivial and stays a direct tool
// (remap_key), but an agent redesigning several keys at once is a judgment
// call about tradeoffs a human should see and approve before anything is
// written. A proposal here never touches the device by itself -- only
// write_remap_proposal does, and only once its status is 'approved'.
//
// approveProposal/rejectProposal are dispatched ONLY from ProposalReview.tsx
// (a human clicking a button). No file under src/mcp/tools/* imports them,
// which is what makes "approved" a state an agent has no path to produce on
// its own -- not a runtime lock, but an honest structural one: the action
// creator simply isn't reachable from tool code.

export type ProposalStatus =
  | 'proposed' // agent created it, waiting on a human
  | 'approved' // a human clicked Approve; no tool can produce this
  | 'rejected' // a human declined it
  | 'written' // committed to the device
  | 'reverted'; // written, then undone

export type IssueLevel = 'error' | 'warning';

export type Issue = {
  level: IssueLevel;
  code:
    | 'unknown-keycode'
    | 'invalid-position'
    | 'duplicate-target'
    | 'no-op'
    | 'collision'
    | 'missing-reason'
    | 'invalid-layer';
  message: string;
  changeIndex?: number;
};

export type KeyChange = {
  layer: number;
  keyIndex: number;
  position: string;
  from: string;
  to: string;
  /** Why this specific key moves. Required from the agent, shown to the human. */
  reason: string;
};

export type Proposal = {
  id: string;
  rationale: string;
  createdAt: number;
  status: ProposalStatus;
  changes: KeyChange[];
  /** Warnings only -- a proposal with errors is never created. */
  issues: Issue[];
  /** Captured immediately before writing, so revert is exact. */
  undo?: KeyChange[];
  writtenAt?: number;
  decidedAt?: number;
};

type MCPProposalState = {
  proposals: Proposal[];
  highlightProposalId: string | null;
};

const initialState: MCPProposalState = {
  proposals: [],
  highlightProposalId: null,
};

let counter = 0;
export const nextProposalId = () =>
  `remap-${Date.now().toString(36)}${(counter++).toString(36)}`;

const mcpProposalSlice = createSlice({
  name: 'mcpProposal',
  initialState,
  reducers: {
    proposalCreated: (state, action: PayloadAction<Proposal>) => {
      state.proposals.unshift(action.payload);
      state.highlightProposalId = action.payload.id;
    },
    proposalApproved: (state, action: PayloadAction<{id: string}>) => {
      const p = state.proposals.find((x) => x.id === action.payload.id);
      if (p && p.status === 'proposed') {
        p.status = 'approved';
        p.decidedAt = Date.now();
      }
    },
    proposalRejected: (state, action: PayloadAction<{id: string}>) => {
      const p = state.proposals.find((x) => x.id === action.payload.id);
      if (p && p.status === 'proposed') {
        p.status = 'rejected';
        p.decidedAt = Date.now();
      }
      if (state.highlightProposalId === action.payload.id) {
        state.highlightProposalId = null;
      }
    },
    proposalWritten: (
      state,
      action: PayloadAction<{id: string; undo: KeyChange[]}>,
    ) => {
      const p = state.proposals.find((x) => x.id === action.payload.id);
      if (p) {
        p.status = 'written';
        p.writtenAt = Date.now();
        p.undo = action.payload.undo;
      }
    },
    proposalReverted: (state, action: PayloadAction<{id: string}>) => {
      const p = state.proposals.find((x) => x.id === action.payload.id);
      if (p) {
        p.status = 'reverted';
      }
    },
    setHighlightProposal: (state, action: PayloadAction<string | null>) => {
      state.highlightProposalId = action.payload;
    },
  },
});

export const {
  proposalCreated,
  proposalApproved,
  proposalRejected,
  proposalWritten,
  proposalReverted,
  setHighlightProposal,
} = mcpProposalSlice.actions;

export default mcpProposalSlice.reducer;

export const getProposals = (state: RootState) => state.mcpProposal.proposals;
export const getHighlightProposalId = (state: RootState) =>
  state.mcpProposal.highlightProposalId;
export const getProposalById = (state: RootState, id: string) =>
  state.mcpProposal.proposals.find((p) => p.id === id);
export const getHighlightedProposal = (state: RootState) => {
  const id = state.mcpProposal.highlightProposalId;
  return id ? getProposalById(state, id) : undefined;
};
