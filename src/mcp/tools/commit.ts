// The only two tools that touch the device on behalf of a proposal, and the
// logic that keeps them off the tool list until they're actually applicable.
//
// write_remap_proposal cannot move a proposal to 'approved' -- nothing under
// src/mcp/tools/* imports proposalApproved (see mcpProposalSlice.ts), which
// is what makes that transition unreachable from tool code, not merely
// discouraged. An agent is not asked to get sign-off before writing; it has
// no path around it.

import {store} from 'src/store';
import {setRegistered, whenIdle, type ToolDef} from '../registry';
import {keycodeStringToByte} from '../keycodes';
import {
  getProposalById,
  getProposals,
  proposalReverted,
  proposalWritten,
  type KeyChange,
} from 'src/store/mcpProposalSlice';
import {
  getSelectedLayerIndex,
  setLayer,
  updateKey,
} from 'src/store/keymapSlice';

function bad(error: string, extra: Record<string, unknown> = {}) {
  return {ok: false as const, error, ...extra};
}

async function writeChanges(changes: readonly KeyChange[]): Promise<void> {
  for (const change of changes) {
    if (getSelectedLayerIndex(store.getState()) !== change.layer) {
      store.dispatch(setLayer(change.layer));
    }
    const byte = keycodeStringToByte(change.to);
    await store.dispatch(updateKey(change.keyIndex, byte) as any);
  }
}

const writeRemapProposal: ToolDef = {
  name: 'write_remap_proposal',
  title: 'Write Remap Proposal',
  description:
    "Commit a proposal from propose_remap that a person has already approved. This is the only tool that changes the keyboard's keymap on the agent's behalf. It refuses anything not approved, so if the proposal is still waiting, ask the person to look at it rather than retrying.",
  inputSchema: {
    type: 'object',
    properties: {proposal_id: {type: 'string'}},
    required: ['proposal_id'],
    additionalProperties: false,
  },
  annotations: {readOnlyHint: false, idempotentHint: false},
  execute: async ({proposal_id}: {proposal_id?: string}) => {
    const id = typeof proposal_id === 'string' ? proposal_id.trim() : '';
    if (!id) {
      return bad('proposal_id is required.');
    }
    const p = getProposalById(store.getState(), id);
    if (!p) {
      return bad(`No proposal "${id}".`);
    }
    if (p.status === 'written') {
      return bad(`${id} was already written.`);
    }
    if (p.status !== 'approved') {
      return bad(
        `${id} has not been approved yet (status: ${p.status}). The person at the keyboard has to approve it in the app first. Nothing was written.`,
        {status: p.status},
      );
    }

    // Snapshot before touching anything, so revert is exact rather than inferred.
    const undo: KeyChange[] = p.changes.map((c) => ({
      ...c,
      from: c.to,
      to: c.from,
    }));

    try {
      await writeChanges(p.changes);
    } catch (e) {
      return bad(e instanceof Error ? e.message : String(e));
    }

    store.dispatch(proposalWritten({id, undo}));
    refreshCommitTools();

    return {
      ok: true,
      proposal_id: id,
      status: 'written',
      applied: p.changes.length,
      revertWith: 'revert_remap_proposal',
      summary: `wrote ${p.changes.length} change${p.changes.length === 1 ? '' : 's'} to the device`,
    };
  },
};

const revertRemapProposal: ToolDef = {
  name: 'revert_remap_proposal',
  title: 'Revert Remap Proposal',
  description:
    'Undo a proposal that was already written, putting every key it touched back exactly as it was. Only works on a proposal with status "written".',
  inputSchema: {
    type: 'object',
    properties: {proposal_id: {type: 'string'}},
    required: ['proposal_id'],
    additionalProperties: false,
  },
  annotations: {readOnlyHint: false, idempotentHint: false},
  execute: async ({proposal_id}: {proposal_id?: string}) => {
    const id = typeof proposal_id === 'string' ? proposal_id.trim() : '';
    if (!id) {
      return bad('proposal_id is required.');
    }
    const p = getProposalById(store.getState(), id);
    if (!p || p.status !== 'written' || !p.undo) {
      return bad(
        `${id} is ${p?.status ?? 'unknown'}; only a written proposal can be reverted.`,
      );
    }
    try {
      await writeChanges(p.undo);
    } catch (e) {
      return bad(e instanceof Error ? e.message : String(e));
    }
    store.dispatch(proposalReverted({id}));
    refreshCommitTools();
    return {
      ok: true,
      proposal_id: id,
      status: 'reverted',
      summary: `reverted ${id}`,
    };
  },
};

/**
 * Registers and unregisters the commit tools as proposals come and go, using
 * AbortSignal, which is the spec's only unregistration mechanism. An agent
 * calling get_tools sees a surface that reflects the real state of the page:
 * write_remap_proposal only appears once something is approved, and
 * revert_remap_proposal only once something is written.
 */
let pending = false;

export function refreshCommitTools(): void {
  if (pending) {
    return;
  }
  pending = true;
  whenIdle(() => {
    pending = false;
    const proposals = getProposals(store.getState());
    setRegistered(
      writeRemapProposal,
      proposals.some((p) => p.status === 'approved'),
    );
    setRegistered(
      revertRemapProposal,
      proposals.some((p) => p.status === 'written'),
    );
  });
}

export function registerCommitTools() {
  // Neither tool is registered up front -- refreshCommitTools() (called by
  // propose_remap and by ProposalReview.tsx after every decision) brings
  // them in only once applicable.
  refreshCommitTools();
}
