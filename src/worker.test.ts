import { assert, hostError, mockHost, mountWorker, test } from 'orca/testing'
import * as main from './worker'

const workspaces = ['alpha', 'beta'].map((id) => ({ id, name: id, kind: 'folder', path: '/tmp/' + id, branch: null, hostId: 'local' }))
const agent = { terminalId: 't1', sessionId: 's1', title: 'Build theme', agent: 'codex', state: 'working', stateStartedAt: 1 }

test('collects separate workspaces and opens the chosen terminal', async () => {
  const host = mockHost({ results: {
    'workspace.list': { workspaces, truncated: false },
    'agents.list': { agents: [agent] },
    'terminal.focus': { focused: true }
  } })
  const worker = await mountWorker(main, { host })
  try {
    const data = await worker.request('agents.snapshot')
    assert.equal(data.agents.length, 2)
    assert.equal(new Set(data.agents.map((row) => row.key)).size, 2)
    assert.deepEqual(host.callsOf('agents.list'), [{ workspaceId: 'alpha' }, { workspaceId: 'beta' }])
    assert.deepEqual(await worker.request('agents.open', { key: data.agents[0].key }), { opened: true })
    assert.equal(host.callsOf('terminal.focus').length, 1)
    await assert.rejects(() => worker.request('agents.open', { key: 'unknown' }))
    assert.deepEqual(worker.refusals, [])
  } finally { await worker.deactivate() }
})

test('reports incomplete workspace data and falls back to workspace navigation', async () => {
  const host = mockHost({ results: {
    'workspace.list': { workspaces: [workspaces[0]], truncated: true },
    'agents.list': { agents: [agent] },
    'terminal.focus': () => { throw hostError('action_failed', 'Terminal closed') },
    'workspace.open': { opened: true }
  } })
  const worker = await mountWorker(main, { host })
  try {
    const data = await worker.request('agents.snapshot')
    assert.equal(data.warnings.length, 1)
    await worker.request('agents.open', { key: data.agents[0].key })
    assert.deepEqual(host.callsOf('workspace.open')[0], { workspaceId: 'alpha' })
  } finally { await worker.deactivate() }
})
