import { afterEach, assert, hostError, mockHost, mount, test, type TestPanel } from 'orca/testing'
import * as panelModule from './panel'
import type { Snapshot } from './protocol'

let panel: TestPanel | undefined
afterEach(() => panel?.unmount())
const data: Snapshot = { warnings: [], agents: [
  { key: 'working', workspaceId: 'w1', workspace: 'Example / redesign', title: 'Build theme', agent: 'codex', state: 'working', since: 0, terminalId: 't1' },
  { key: 'blocked', workspaceId: 'w2', workspace: 'Shop', title: 'Approve release', agent: 'claude', state: 'blocked', since: 0, terminalId: 't2' },
  { key: 'done', workspaceId: 'w3', workspace: 'Store', title: 'Completed export', agent: 'codex', state: 'done', since: 0, terminalId: 't3' }
] }

test('shows active agents across workspaces, filters done, opens a selected agent', async () => {
  let opened = ''
  const host = mockHost({ requests: {
    'agents.snapshot': () => data,
    'agents.open': ({ key }) => { opened = key; return { opened: true } }
  } })
  panel = await mount(panelModule, { host })
  assert.ok(panel.find({ testId: 'working' }))
  assert.ok(panel.find({ testId: 'blocked' }))
  assert.equal(panel.find({ testId: 'done' }), null)
  await panel.toggle({ label: 'Show done (1)' })
  assert.ok(panel.find({ testId: 'done' }))
  await panel.press({ testId: 'working' })
  assert.equal(opened, 'working')
  assert.deepEqual(panel.errors, [])
  assert.deepEqual(panel.warnings, [])
  assert.deepEqual(panel.refusals, [])
})

test('agent event refreshes status and closed agents disappear', async () => {
  let current = data
  const host = mockHost({ requests: { 'agents.snapshot': () => current } })
  panel = await mount(panelModule, { host })
  current = { agents: [], warnings: [] }
  await panel.emit('agent.status.changed', { workspaceId: 'w1', paneKey: 'pane', state: 'done', receivedAt: 1 })
  assert.equal(panel.find({ testId: 'working' }), null)
  assert.ok(panel.find({ type: 'EmptyState' }))
  assert.deepEqual(panel.refusals, [])
})

test('refresh failure keeps the last result visible and reports it', async () => {
  let fails = false
  const host = mockHost({ requests: { 'agents.snapshot': () => {
    if (fails) throw hostError('action_failed', 'Host disconnected')
    return data
  } } })
  panel = await mount(panelModule, { host })
  fails = true
  await panel.press({ label: 'Refresh agents' })
  assert.ok(panel.find({ testId: 'working' }))
  assert.ok(panel.find({ text: 'Showing the last successful refresh.' }))
})

test('unread completed work stays visible and clears after opening and refresh', async () => {
  let current: Snapshot = { warnings: [], agents: [{ ...data.agents[2], project: 'Store', branch: 'master', unread: true }] }
  const host = mockHost({ requests: {
    'agents.snapshot': () => current,
    'agents.open': () => {
      current = { warnings: [], agents: [{ ...current.agents[0], unread: false }] }
      return { opened: true }
    }
  } })
  panel = await mount(panelModule, { host })
  assert.ok(panel.find({ testId: 'done' }))
  assert.ok(panel.find({ text: 'Unread' }))
  assert.equal(panel.find({ type: 'EmptyState' }), null)
  await panel.press({ testId: 'done' })
  assert.equal(panel.find({ testId: 'done' }), null)
  assert.ok(panel.find({ type: 'EmptyState' }))
  assert.deepEqual(panel.errors, [])
  assert.deepEqual(panel.refusals, [])
})

test('navigation errors are labelled separately from refresh failures', async () => {
  const host = mockHost({ requests: {
    'agents.snapshot': () => data,
    'agents.open': () => { throw hostError('action_failed', 'Workspace unavailable') }
  } })
  panel = await mount(panelModule, { host })
  await panel.press({ testId: 'working' })
  const callout = panel.find({ type: 'Callout' })
  assert.equal(callout?.props?.title, 'Could not open agent')
  assert.equal(panel.find({ text: 'Showing the last successful refresh.' }), null)
  assert.ok(panel.find({ testId: 'working' }))
})
