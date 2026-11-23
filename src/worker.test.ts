import { beforeEach, afterEach, assert, hostError, mockHost, mountWorker, test } from 'orca/testing'
import * as main from './worker'

let originalCli: string | undefined
beforeEach(async () => {
  const { resolve } = await import('node:path')
  originalCli = process.env.ORCA_CLI_COMMAND
  process.env.ORCA_CLI_COMMAND = resolve('src/fixtures/fake-orca')
})
afterEach(() => {
  if (originalCli === undefined) delete process.env.ORCA_CLI_COMMAND
  else process.env.ORCA_CLI_COMMAND = originalCli
  delete process.env.LIVE_AGENTS_TEST_CLI_MODE
})

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

test('includes agents on a paired runtime when desktop agents.list is empty', async () => {
  const { resolve } = await import('node:path')
  const previous = process.env.ORCA_CLI_COMMAND
  process.env.ORCA_CLI_COMMAND = resolve('src/fixtures/fake-orca')
  const host = mockHost({ results: {
    'workspace.list': { workspaces: [{ id: 'remote-w1', kind: 'worktree', name: 'feature/cart', project: 'Example', path: '/remote/shop', branch: 'feature/cart', hostId: 'runtime:test-remote' }], truncated: false },
    'agents.list': { agents: [] }
  } })
  const worker = await mountWorker(main, { host })
  try {
    const data = await worker.request('agents.snapshot')
    assert.equal(data.agents.length, 1)
    assert.equal(data.agents[0].title, 'Implement checkout')
    assert.equal(data.agents[0].state, 'working')
    assert.equal(data.agents[0].workspaceId, 'remote-w1')
    assert.equal(data.agents[0].unread, true)
    assert.equal(data.agents[0].project, 'Example')
    assert.deepEqual(data.warnings, [])
    assert.equal(JSON.stringify(data).includes('PRIVATE_PREVIEW'), false)
    assert.deepEqual(await worker.request('agents.open', { key: data.agents[0].key }), { opened: true })
    assert.equal(host.callsOf('workspace.open').length, 0)
  } finally {
    await worker.deactivate()
    if (previous === undefined) delete process.env.ORCA_CLI_COMMAND
    else process.env.ORCA_CLI_COMMAND = previous
  }
})

test('remote connection failure preserves local agents and reports the coverage gap', async () => {
  const { resolve } = await import('node:path')
  const previous = process.env.ORCA_CLI_COMMAND
  process.env.ORCA_CLI_COMMAND = resolve('src/fixtures/fake-orca')
  process.env.LIVE_AGENTS_TEST_CLI_MODE = 'offline'
  const host = mockHost({ results: {
    'workspace.list': { workspaces: [workspaces[0], { id: 'remote-w1', kind: 'folder', name: 'remote', path: '/remote/shop', branch: null, hostId: 'runtime:test-remote' }], truncated: false },
    'agents.list': { agents: [agent] }
  } })
  const worker = await mountWorker(main, { host })
  try {
    const data = await worker.request('agents.snapshot')
    assert.equal(data.agents.length, 1)
    assert.equal(data.agents[0].workspaceId, 'alpha')
    assert.ok(data.warnings[0].includes('test-remote'))
    assert.equal(host.callsOf('agents.list').length, 1)
  } finally {
    await worker.deactivate()
    delete process.env.LIVE_AGENTS_TEST_CLI_MODE
    if (previous === undefined) delete process.env.ORCA_CLI_COMMAND
    else process.env.ORCA_CLI_COMMAND = previous
  }
})

test('discovers paired hosts even when desktop workspace.list has no remote workspaces', async () => {
  process.env.LIVE_AGENTS_TEST_CLI_MODE = 'paired'
  const host = mockHost({ results: {
    'workspace.list': { workspaces: [], truncated: false },
    'agents.list': { agents: [] }
  } })
  const worker = await mountWorker(main, { host })
  try {
    const data = await worker.request('agents.snapshot')
    assert.equal(data.agents.length, 1)
    assert.equal(data.agents[0].title, 'Implement checkout')
    assert.deepEqual(data.warnings, [])
  } finally { await worker.deactivate() }
})

test('requests native workspace unread status and attaches it to local agents', async () => {
  const host = mockHost({ results: {
    'workspace.list': { workspaces: [{ ...workspaces[0], project: 'Example', status: { state: 'done', unread: true, terminalCount: 1, lastActivityAt: 1 } }], truncated: false },
    'agents.list': { agents: [{ ...agent, state: 'done' }] }
  } })
  const worker = await mountWorker(main, { host })
  try {
    const data = await worker.request('agents.snapshot')
    assert.equal(data.agents[0].unread, true)
    assert.equal(data.agents[0].project, 'Example')
    assert.deepEqual(host.callsOf('workspace.list'), [{ includeStatus: true }])
  } finally { await worker.deactivate() }
})

test('unavailable unread status does not hide remote agents or invent a read state', async () => {
  process.env.LIVE_AGENTS_TEST_CLI_MODE = 'unread-offline'
  const host = mockHost({ results: {
    'workspace.list': { workspaces: [{ id: 'remote-w1', kind: 'folder', name: 'remote', path: '/remote/shop', branch: null, hostId: 'runtime:test-remote' }], truncated: false },
    'agents.list': { agents: [] }
  } })
  const worker = await mountWorker(main, { host })
  try {
    const data = await worker.request('agents.snapshot')
    assert.equal(data.agents.length, 1)
    assert.equal(data.agents[0].unread, undefined)
    assert.deepEqual(data, JSON.parse(JSON.stringify(data)))
    assert.ok(data.diagnostics?.some((line) => line.includes('unread status could not be read')))
  } finally { await worker.deactivate() }
})
