import {useEffect, type PropsWithChildren} from 'react';
import {initWebMCP} from 'src/mcp/init';
import {AgentDock} from './AgentDock';
import {ProposalReview} from './ProposalReview';
import {ConfirmDialog} from './ConfirmDialog';

// Mounted once at the app root (see src/containers/Root.tsx). Registers all
// WebMCP tools on mount and renders the surfaces a human uses to observe,
// review, and gate what an AI agent does through them. These stay mounted
// regardless of whether this browser exposes document.modelContext -- the
// dock's own Console tab and status line are how a human exercises and
// understands the tool surface either way.
export const WebMCPProvider = ({children}: PropsWithChildren<{}>) => {
  useEffect(() => {
    initWebMCP();
  }, []);

  return (
    <>
      {children}
      <AgentDock />
      <ProposalReview />
      <ConfirmDialog />
    </>
  );
};
