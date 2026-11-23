import { assert, test } from 'orca/testing'
import { revealChatWithConnections, type RuntimeConnection } from './navigation'

const location = { environment: 'paired server', worktreeId: 'server-repo::/remote/shop', sessionId: 'chat-2' }
function connections(navigated = true, tabs = [
  { id: 'actual-tab-1', type: 'agent-session', sessionId: 'chat-1', isActive: true },
  { id: 'actual-tab-2', type: 'agent-session', sessionId: 'chat-2', isActive: false }
]) {
  const calls: { target: string; method: string; params: unknown }[] = []
  const remote: RuntimeConnection = { call: async (method, params) => {
    calls.push({ target: 'remote', method, params })
    // This reproduces the failed public-plugin route: remote workspaces are absent locally.
    if (method !== 'session.tabs.list') throw new Error('no workspace has this id')
    return { result: { worktree: location.worktreeId, tabs } }
  } }
  const desktop: RuntimeConnection = { call: async (method, params) => {
    calls.push({ target: 'desktop', method, params })
    if (method !== 'terminal.reveal') throw new Error('no workspace has this id')
    return { result: { reveal: { navigated } } }
  } }
  return { remote, desktop, calls }
}

test('reveals the remote chat workspace using its observed tab ID and host', async () => {
  const c = connections()
  await revealChatWithConnections(c.remote, c.desktop, location)
  assert.deepEqual(c.calls, [
    { target: 'remote', method: 'session.tabs.list', params: { worktree: 'id:server-repo::/remote/shop' } },
    { target: 'desktop', method: 'terminal.reveal', params: { worktreeId: location.worktreeId, tabId: 'actual-tab-2', executionHostId: 'runtime:paired%20server' } }
  ])
})

test('does not claim success when the desktop refuses navigation', async () => {
  const c = connections(false)
  await assert.rejects(() => revealChatWithConnections(c.remote, c.desktop, location), /did not confirm/)
})

test('does not open another chat when the selected chat tab has closed', async () => {
  const c = connections(true, [{ id: 'actual-tab-1', type: 'agent-session', sessionId: 'chat-1', isActive: true }])
  await assert.rejects(() => revealChatWithConnections(c.remote, c.desktop, location), /no longer open/)
  assert.equal(c.calls.length, 1)
})
