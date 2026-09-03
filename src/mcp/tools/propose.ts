// The flagship WebMCP workflow. Remapping one key is trivial and stays a
// direct tool (remap_key in keymap.ts): a person editing their own board by
// hand acts immediately, so an agent making the same single, trivially-seen
// change does too. What is genuinely hard is redesigning several keys at
// once while holding constraints in your head -- not colliding with
// anything already bound, not stranding a layer, keeping a reason for every
// move a person can actually evaluate. propose_remap stages exactly that:
// it writes nothing, and only a human clicking Approve in ProposalReview.tsx
// can move it to a state write_remap_proposal (commit.ts) will act on.

import {store} from 'src/store';
import {register} from '../registry';
import {validateRemap, type RawRemapChange} from '../validateRemap';
import {
  getProposalById,
  nextProposalId,
  proposalCreated,
  type Issue,
  type Proposal,
} from 'src/store/mcpProposalSlice';
import {getSelectedConnectedDevice} from 'src/store/devicesSlice';
import {refreshCommitTools} from './commit';

function bad(error: string, issues: Issue[] = []) {
  return {
    ok: false as const,
    error,
    ...(issues.length ? {problems: issues} : {}),
  };
}

function proposalPayload(p: Proposal) {
  return {
    proposal_id: p.id,
    status: p.status,
    rationale: p.rationale,
    changes: p.changes,
    warnings: p.issues.filter((i) => i.level === 'warning'),
  };
}

export function registerProposeTools() {
  register({
    name: 'propose_remap',
    title: 'Propose Remap',
    description:
      'Propose a set of key changes for a person to review, across one or more keys. This writes nothing to the keyboard. It returns a proposal_id, the exact before and after for every key, and any collisions found against what is already bound. Every change needs its own reason in plain language, because that reason is what the person reviewing it is actually evaluating. Use this for anything touching more than one key; for a single key, use remap_key directly instead.',
    inputSchema: {
      type: 'object',
      properties: {
        rationale: {
          type: 'string',
          description:
            'One or two sentences on what this set of changes is for, as a whole.',
        },
        changes: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              layer: {type: 'integer'},
              keyIndex: {type: 'integer', description: 'From get_keymap.'},
              keycode: {type: 'string', description: 'e.g. "KC_ESC", "MO(1)".'},
              reason: {
                type: 'string',
                description: 'Why this specific key moves.',
              },
            },
            required: ['layer', 'keyIndex', 'keycode', 'reason'],
          },
        },
      },
      required: ['rationale', 'changes'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, idempotentHint: false},
    execute: (input: {rationale?: string; changes?: RawRemapChange[]}) => {
      const state = store.getState();
      if (!getSelectedConnectedDevice(state)) {
        return bad('No keyboard is connected.');
      }
      const rationale =
        typeof input.rationale === 'string' ? input.rationale.trim() : '';
      if (!rationale) {
        return bad(
          'rationale is required: say what this set of changes is for, as a whole.',
        );
      }
      if (!Array.isArray(input.changes) || input.changes.length === 0) {
        return bad('changes must be a non-empty array.');
      }

      const {changes, issues} = validateRemap(input.changes, state);
      const errors = issues.filter((i) => i.level === 'error');
      if (errors.length) {
        return bad(`${errors.length} change(s) could not be accepted.`, issues);
      }

      const proposal: Proposal = {
        id: nextProposalId(),
        rationale,
        createdAt: Date.now(),
        status: 'proposed',
        changes,
        issues,
      };
      store.dispatch(proposalCreated(proposal));
      refreshCommitTools();

      return {
        ok: true,
        ...proposalPayload(proposal),
        next: 'Nothing has been written. The person at the keyboard has to approve this in the app. Call get_proposal with this proposal_id to see what they decided.',
        summary: `proposed ${changes.length} key change${changes.length === 1 ? '' : 's'}`,
      };
    },
  });

  register({
    name: 'get_proposal',
    title: 'Get Proposal',
    description:
      'Check what happened to a proposal from propose_remap: still waiting, approved, rejected, written, or reverted.',
    inputSchema: {
      type: 'object',
      properties: {proposal_id: {type: 'string'}},
      required: ['proposal_id'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: true},
    execute: ({proposal_id}: {proposal_id?: string}) => {
      const id = typeof proposal_id === 'string' ? proposal_id.trim() : '';
      if (!id) {
        return bad('proposal_id is required.');
      }
      const p = getProposalById(store.getState(), id);
      if (!p) {
        return bad(`No proposal "${id}".`);
      }
      const meaning: Record<Proposal['status'], string> = {
        proposed: 'still waiting on the person at the keyboard',
        approved: 'approved but not written yet, call write_remap_proposal',
        rejected: 'the person declined it',
        written: 'written to the device',
        reverted: 'was written, then undone',
      };
      return {
        ok: true,
        ...proposalPayload(p),
        meaning: meaning[p.status],
        summary: `${p.id} is ${p.status}`,
      };
    },
  });
}
