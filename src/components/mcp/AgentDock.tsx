import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useAppSelector} from 'src/store/hooks';
import {getMCPActivityEntries} from 'src/store/mcpActivitySlice';
import {isWebMCPSupported} from 'src/mcp/init';
import {ToolConsole} from './ToolConsole';
import './agent-dock.css';

const FLAG = 'chrome://flags/#enable-webmcp-testing';

type Tab = 'status' | 'activity' | 'console';

/**
 * The one persistent, always-visible surface for the agent layer: a status
 * line stating plainly whether this browser can drive the page's tools at
 * all, a live log of every call (human or agent, since the Tool Console runs
 * through the same wrapper), and a console that runs any tool by hand. It
 * stays mounted regardless of WebMCP support, because "the tools exist but
 * this browser has nothing to talk to" is itself the thing worth showing.
 *
 * Docked to the right edge as a persistent rail, not a floating popup, so
 * the agent layer reads as a fixed part of the page rather than something a
 * human has to remember to open -- collapses to a thin toggle strip rather
 * than disappearing entirely.
 */
export const AgentDock = () => {
  const {t} = useTranslation();
  const supported = useState(isWebMCPSupported)[0];
  const entries = useAppSelector(getMCPActivityEntries);
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>('status');
  const [copied, setCopied] = useState(false);

  const copyFlag = async () => {
    try {
      await navigator.clipboard.writeText(FLAG);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  if (!open) {
    return (
      <div className="mcpdock">
        <aside className="mcpdock-rail mcpdock-rail-collapsed">
          <button
            className="mcpdock-rail-toggle"
            onClick={() => setOpen(true)}
            title={t('Show the agent panel')}
          >
            <span
              className="mcpdock-dot"
              data-state={supported ? 'native' : 'absent'}
            />
            <span className="mcpdock-rail-toggle-label">{t('Agent')}</span>
            {entries.length > 0 && (
              <span className="mcpdock-count">{entries.length}</span>
            )}
          </button>
        </aside>
      </div>
    );
  }

  return (
    <div className="mcpdock">
      <aside className="mcpdock-rail">
        <div className="mcpdock-header">
          <div className="mcpdock-header-row">
            <p className="mcpdock-title">
              <span
                className="mcpdock-dot"
                data-state={supported ? 'native' : 'absent'}
              />
              {supported ? t('WebMCP is live') : t('WebMCP not exposed')}
            </p>
            <button
              className="mcpdock-rail-collapse"
              onClick={() => setOpen(false)}
              title={t('Hide the agent panel')}
            >
              &rsaquo;
            </button>
          </div>
          <p className="mcpdock-subtitle">
            {supported
              ? t(
                  'An agent can read the keymap and call these tools directly. Multi-key remaps are staged for your approval before anything is written.',
                )
              : t(
                  "The tools are built and working, they just have nothing to talk to. Run them by hand from the Console tab, or open this page in Chrome with the flag below, or ChatGPT's built-in browser.",
                )}
          </p>
          {!supported && (
            <div className="mcpdock-flagline">
              <code className="mcpdock-mono">{FLAG}</code>
              <button className="mcpdock-btn" onClick={() => void copyFlag()}>
                {copied ? t('Copied') : t('Copy')}
              </button>
            </div>
          )}
        </div>

        <div className="mcpdock-tabs">
          {(['status', 'activity', 'console'] as Tab[]).map((id) => (
            <button
              key={id}
              className="mcpdock-tab"
              data-active={tab === id}
              onClick={() => setTab(id)}
            >
              {id === 'status'
                ? t('Status')
                : id === 'activity'
                  ? `${t('Activity')}${entries.length ? ` (${entries.length})` : ''}`
                  : t('Console')}
            </button>
          ))}
        </div>

        <div className="mcpdock-body">
          {tab === 'status' && <StatusTab supported={supported} />}
          {tab === 'activity' && <ActivityTab entries={entries} />}
          {tab === 'console' && <ToolConsole />}
        </div>
      </aside>
    </div>
  );
};

const StatusTab = ({supported}: {supported: boolean}) => {
  const {t} = useTranslation();
  return (
    <div style={{padding: '14px'}}>
      <p className="mcpdock-console-desc">
        {t(
          'Tools register on document.modelContext when this browser supports it. Read-only tools (state, keymap, keycodes) never write anything. Multi-key remaps go through propose_remap, which stages a diff for you to review below before write_remap_proposal can commit it. reset_eeprom and jump_to_bootloader always ask first, regardless of browser support.',
        )}
      </p>
      <p className="mcpdock-console-desc" style={{marginTop: 8}}>
        {supported
          ? t('Native support: detected.')
          : t('Native support: not detected in this browser.')}
      </p>
    </div>
  );
};

const ActivityTab = ({
  entries,
}: {
  entries: ReturnType<typeof getMCPActivityEntries>;
}) => {
  const {t} = useTranslation();
  if (entries.length === 0) {
    return <div className="mcpdock-empty">{t('No tool calls yet.')}</div>;
  }
  return (
    <div>
      {entries.map((entry) => (
        <div className="mcpdock-entry" key={entry.id}>
          <div className="mcpdock-entry-head">
            <span className="mcpdock-entry-status" data-status={entry.status} />
            <span className="mcpdock-entry-name mcpdock-mono">
              {entry.toolName}
            </span>
            <span className="mcpdock-entry-time">
              {new Date(entry.startedAt).toLocaleTimeString()}
            </span>
          </div>
          <div className="mcpdock-entry-detail mcpdock-mono">
            {JSON.stringify(entry.input)}
          </div>
          {entry.status === 'success' && entry.output !== undefined && (
            <div className="mcpdock-entry-detail mcpdock-mono">
              {JSON.stringify(entry.output)}
            </div>
          )}
          {entry.status === 'error' && (
            <div className="mcpdock-entry-detail mcpdock-mono">
              {entry.error}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
