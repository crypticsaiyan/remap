import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {listTools, invoke} from 'src/mcp/registry';
import {useAppSelector} from 'src/store/hooks';
import {getProposals} from 'src/store/mcpProposalSlice';

/**
 * Runs any registered tool by hand, through the exact same wrapper an
 * agent's call goes through (activity log, confirmation gate, error
 * contract included). This is what makes the whole tool surface exercisable
 * in a browser with no WebMCP support: a person can drive it directly.
 */
export const ToolConsole = () => {
  const {t} = useTranslation();
  // Re-renders whenever a proposal changes, which is also when the dynamic
  // commit tools (write_remap_proposal / revert_remap_proposal) come and go.
  useAppSelector(getProposals);
  const tools = listTools();
  const [selected, setSelected] = useState<string>(() => tools[0]?.name ?? '');
  const [input, setInput] = useState('{}');
  const [result, setResult] = useState<unknown>(undefined);
  const [running, setRunning] = useState(false);

  const activeTool = tools.find((tl) => tl.name === selected) ?? tools[0];

  const run = async () => {
    if (!activeTool) {
      return;
    }
    setRunning(true);
    setResult(undefined);
    try {
      const parsed = input.trim() ? JSON.parse(input) : {};
      const res = await invoke(activeTool.name, parsed);
      setResult(res);
    } catch (e) {
      setResult({ok: false, error: e instanceof Error ? e.message : String(e)});
    } finally {
      setRunning(false);
    }
  };

  if (tools.length === 0) {
    return <div className="mcpdock-empty">{t('No tools registered yet.')}</div>;
  }

  const isOk = !(
    result &&
    typeof result === 'object' &&
    (result as any).ok === false
  );

  return (
    <div className="mcpdock-console">
      <select
        className="mcpdock-select"
        value={activeTool?.name}
        onChange={(e) => {
          setSelected(e.target.value);
          setResult(undefined);
        }}
      >
        {tools.map((tl) => (
          <option key={tl.name} value={tl.name}>
            {tl.name}
          </option>
        ))}
      </select>
      {activeTool && (
        <p className="mcpdock-console-desc">{activeTool.description}</p>
      )}
      <textarea
        className="mcpdock-textarea mcpdock-mono"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
      />
      <button
        className="mcpdock-btn mcpdock-btn-primary"
        onClick={run}
        disabled={running}
      >
        {running ? t('Running…') : t('Run')}
      </button>
      {result !== undefined && (
        <pre className="mcpdock-result mcpdock-mono" data-ok={String(isOk)}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
};
