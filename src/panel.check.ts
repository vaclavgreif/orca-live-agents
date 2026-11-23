import { defineCheck, hostError } from 'orca/testing'
const workspaces = [{ id: 'w1', kind: 'folder', name: 'redesign', project: 'Example', path: '/tmp/example', branch: null, hostId: 'local' }]
export default defineCheck({
  empty: { results: { 'workspace.list': { workspaces: [], truncated: false } } },
  busy: { results: {
    'workspace.list': { workspaces, truncated: false },
    'agents.list': { agents: [
      { terminalId: 't1', title: 'Refactor redesign into project conventions', agent: 'codex', state: 'working', stateStartedAt: 0 },
      { terminalId: 't2', title: 'Approve production deployment', agent: 'claude', state: 'waiting', stateStartedAt: 0 },
      { terminalId: 't3', title: 'Check product feed', agent: 'codex', state: 'done', stateStartedAt: 0 }
    ] }
  } },
  unavailable: { results: { 'workspace.list': () => { throw hostError('action_failed', 'Host disconnected') } } }
})
