import {useTranslation} from 'react-i18next';
import {useAppSelector} from 'src/store/hooks';
import {getPendingMCPConfirmation} from 'src/store/mcpConfirmSlice';
import {resolvePendingConfirmation} from 'src/mcp/confirm';
import './agent-dock.css';

/**
 * Blocks any tool whose annotations.destructiveHint is true (EEPROM reset,
 * bootloader jump) until a human clicks Approve here. Not the same gate as
 * ProposalReview -- that one is for a multi-key remap an agent is asking
 * judgment on; this one is for an action that can't be reviewed as a diff at
 * all, only allowed or refused.
 */
export const ConfirmDialog = () => {
  const {t} = useTranslation();
  const pending = useAppSelector(getPendingMCPConfirmation);

  if (!pending) {
    return null;
  }

  return (
    <div className="mcpdock">
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          background: 'rgba(20, 18, 14, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 380,
            maxWidth: 'calc(100vw - 32px)',
            background: 'var(--mcpdock-ground)',
            border: '1px solid var(--mcpdock-edge)',
            borderRadius: 10,
            padding: 20,
            boxShadow: '0 20px 60px -16px rgba(20, 18, 14, 0.55)',
          }}
        >
          <h3 style={{margin: '0 0 6px', fontSize: 15}}>
            {t('Agent wants to: {{title}}', {title: pending.title})}
          </h3>
          <div
            className="mcpdock-mono"
            style={{fontSize: 11, opacity: 0.7, marginBottom: 10}}
          >
            {pending.toolName}
          </div>
          <p style={{fontSize: 13, lineHeight: 1.5, margin: '0 0 18px'}}>
            {pending.description}
          </p>
          <div style={{display: 'flex', justifyContent: 'flex-end', gap: 10}}>
            <button
              className="mcpdock-btn"
              onClick={() => resolvePendingConfirmation(false)}
            >
              {t('Deny')}
            </button>
            <button
              className="mcpdock-btn mcpdock-btn-primary"
              onClick={() => resolvePendingConfirmation(true)}
            >
              {t('Approve')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
