import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useAppDispatch, useAppSelector} from 'src/store/hooks';
import {
  getHighlightedProposal,
  proposalApproved,
  proposalRejected,
  setHighlightProposal,
  type Proposal,
} from 'src/store/mcpProposalSlice';
import {invoke} from 'src/mcp/registry';
import {refreshCommitTools} from 'src/mcp/tools/commit';
import './agent-dock.css';

const STATUS_TEXT: Record<Proposal['status'], string> = {
  proposed: 'waiting on you',
  approved: 'approved, not written yet',
  rejected: 'declined',
  written: 'written to the device',
  reverted: 'written, then undone',
};

/**
 * The second most important screen after the keyboard itself: what an agent
 * wants to change, laid out as a plain diff with a reason per key, before
 * anything reaches the device. approve/reject dispatch straight to Redux --
 * no tool anywhere calls them, which is what keeps this decision a human's
 * alone. Write and revert reuse the exact tool an agent would call
 * (src/mcp/registry.ts's invoke), so this panel and an agent hit the same
 * code path and the same activity log.
 */
export const ProposalReview = () => {
  const {t} = useTranslation();
  const dispatch = useAppDispatch();
  const proposal = useAppSelector(getHighlightedProposal);
  const [busy, setBusy] = useState(false);

  if (!proposal) {
    return null;
  }

  const warnings = proposal.issues.filter((i) => i.level === 'warning');

  const runCommitTool = async (name: string) => {
    setBusy(true);
    try {
      await invoke(name, {proposal_id: proposal.id});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mcpdock">
      <section className="mcpdock-sheet" aria-label="Proposed remap">
        <div className="mcpdock-sheet-head">
          <div>
            <h2 className="mcpdock-sheet-title">
              {t('{{count}} key change(s) proposed', {
                count: proposal.changes.length,
              })}
            </h2>
            <p className="mcpdock-sheet-rationale">{proposal.rationale}</p>
            <span
              className="mcpdock-status-badge"
              data-status={proposal.status}
            >
              {STATUS_TEXT[proposal.status]}
            </span>
          </div>
          <div className="mcpdock-sheet-actions">
            {proposal.status === 'proposed' && (
              <>
                <button
                  className="mcpdock-btn"
                  disabled={busy}
                  onClick={() => {
                    dispatch(proposalRejected({id: proposal.id}));
                    refreshCommitTools();
                  }}
                >
                  {t('Decline')}
                </button>
                <button
                  className="mcpdock-btn mcpdock-btn-primary"
                  disabled={busy}
                  onClick={() => {
                    dispatch(proposalApproved({id: proposal.id}));
                    refreshCommitTools();
                  }}
                >
                  {t('Approve')}
                </button>
              </>
            )}
            {proposal.status === 'approved' && (
              <button
                className="mcpdock-btn mcpdock-btn-primary"
                disabled={busy}
                onClick={() => runCommitTool('write_remap_proposal')}
              >
                {t('Write to keyboard')}
              </button>
            )}
            {proposal.status === 'written' && (
              <button
                className="mcpdock-btn"
                disabled={busy}
                onClick={() => runCommitTool('revert_remap_proposal')}
              >
                {t('Undo this change')}
              </button>
            )}
            <button
              className="mcpdock-btn"
              onClick={() => dispatch(setHighlightProposal(null))}
            >
              {t('Close')}
            </button>
          </div>
        </div>

        {warnings.map((w, i) => (
          <div className="mcpdock-warning" key={i}>
            <span className="mcpdock-mono">{w.code}</span>
            <span>{w.message}</span>
          </div>
        ))}

        <div className="mcpdock-difftable-wrap">
          <table className="mcpdock-difftable">
            <thead>
              <tr>
                <th>{t('Key')}</th>
                <th>{t('Now')}</th>
                <th>{t('After')}</th>
                <th>{t('Why')}</th>
              </tr>
            </thead>
            <tbody>
              {proposal.changes.map((c, i) => (
                <tr key={i}>
                  <td className="mcpdock-mono">
                    L{c.layer} {c.position}
                  </td>
                  <td className="mcpdock-mono mcpdock-from">{c.from}</td>
                  <td className="mcpdock-mono mcpdock-to">{c.to}</td>
                  <td>{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
