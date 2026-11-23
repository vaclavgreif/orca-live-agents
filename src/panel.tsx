import {
  atom, Badge, Box, Button, Callout, Collapsible, EmptyState, IconButton, Image, Input, List, ListItem,
  on, plugin, read, Row, set, Spinner, Stack, Text,
  type PanelContext
} from 'orca'
import type { AgentRow, Snapshot } from './protocol'

const snapshot = atom<Snapshot | null>(null)
const error = atom('')
const errorTitle = atom('Refresh failed')
const loading = atom(false)
const showDone = atom('show-done', false, { persist: 'plugin' })
const search = atom('')
let refreshPanel = async (): Promise<void> => {}

export function setup(ctx: PanelContext): () => void {
  let pending: Promise<void> | undefined
  let again = false
  const refresh = (): Promise<void> => {
    if (ctx.signal.aborted || !read(ctx.visible)) return Promise.resolve()
    if (pending) { again = true; return pending }
    set(loading, true)
    pending = (async () => {
      do {
        again = false
        try {
          const data = await plugin.request('agents.snapshot', undefined, { signal: ctx.signal })
          if (!ctx.signal.aborted) { set(snapshot, data); set(error, '') }
        } catch (cause) {
          if (!ctx.signal.aborted) { set(errorTitle, 'Refresh failed'); set(error, `Could not refresh agents. ${cause instanceof Error ? cause.message : 'Try again.'}`) }
        }
      } while (again && !ctx.signal.aborted && read(ctx.visible))
    })().finally(() => { pending = undefined; if (!ctx.signal.aborted) set(loading, false) })
    return pending
  }
  refreshPanel = refresh
  for (const event of ['agent.status.changed', 'workspace.created', 'workspace.removed', 'workspace.changed'] as const) {
    ctx.subscriptions.push(on(event, () => { void refresh() }))
  }
  // Events keep status live; reconciliation also removes sessions closed without an event.
  const timer = setInterval(() => { void refresh() }, 15000)
  void refresh()
  return () => { clearInterval(timer); refreshPanel = async () => {} }
}

async function openAgent(key: string): Promise<void> {
  try { await plugin.request('agents.open', { key }); set(error, ''); await refreshPanel() }
  catch (cause) { set(errorTitle, 'Could not open agent'); set(error, cause instanceof Error ? cause.message : 'Could not open the agent workspace.') }
}

function group(title: string, rows: AgentRow[], tone: 'warning' | 'accent' | 'neutral') {
  if (!rows.length) return null
  return <Stack gap="xs">
    <Row justify="between"><Text weight="semibold" size="xs">{title}</Text><Badge tone={tone}>{rows.length}</Badge></Row>
    <List label={title}>
      {rows.map((row) => <ListItem key={row.key} onPress={() => openAgent(row.key)}>
        <Stack gap="xs">
          <Row justify="between" gap="xs" align="center">
            <Row gap="xs" align="center">
              <Box width={6} height={6} shrink={false}><Image src={`assets/dot-${row.state}.png`} alt={row.state === 'blocked' ? 'Blocked' : row.state === 'waiting' ? 'Waiting' : row.state === 'working' ? 'Working' : 'Done'} size="full" /></Box>
              <Text size="xs" weight="semibold" truncate>{row.project || row.workspace}</Text>
            </Row>
            {row.unread ? <Box width={6} height={6} shrink={false}><Image src="assets/dot-unread.png" alt="Unread updates" size="full" /></Box> : null}
          </Row>
          <Text size="xs" muted truncate>{row.title}</Text>
        </Stack>
      </ListItem>)}
    </List>
  </Stack>
}

export default function Panel() {
  const data = read(snapshot)
  const failure = read(error)
  const failureTitle = read(errorTitle)
  const busy = read(loading)
  const doneVisible = read(showDone)
  const query = read(search).trim().toLocaleLowerCase()
  const allAgents = data?.agents ?? []
  const agents = query ? allAgents.filter((agent) =>
    [agent.project, agent.workspace, agent.title, agent.branch, agent.agent]
      .some((value) => value?.toLocaleLowerCase().includes(query))
  ) : allAgents
  const needsYou = agents.filter((a) => a.state === 'waiting' || a.state === 'blocked')
  const working = agents.filter((a) => a.state === 'working')
  const done = agents.filter((a) => a.state === 'done')
  const visibleDone = doneVisible ? done : done.filter((a) => a.unread === true)
  return <Stack gap="sm">
    <Row justify="between">
      <Text size="sm" weight="semibold">Live Agents</Text>
      <Row gap="xs" align="center">
        <Button size="xs" variant="ghost" tone={doneVisible ? 'accent' : 'neutral'} icon={doneVisible ? 'check' : 'filter'} tooltip={doneVisible ? 'Hide completed agents' : 'Show completed agents'} onPress={() => set(showDone, !doneVisible)}>{`Show done (${done.length})`}</Button>
        <IconButton icon="refresh" label="Refresh agents" tooltip="Refresh agents" variant="ghost" size="sm" disabled={busy} onPress={() => refreshPanel()} />
      </Row>
    </Row>
    <Input label="Search agents" labelHidden type="search" placeholder="Search agents…" value={read(search)} onChange={(value) => set(search, value)} />
    {failure ? <Callout tone="danger" title={failureTitle}><Text>{failure}</Text>{data && failureTitle === 'Refresh failed' ? <Text>Showing the last successful refresh.</Text> : null}</Callout> : null}
    {data?.warnings.length ? <Callout tone="warning" title="Some agents may be missing"><Text>{data.warnings.join(' ')}</Text></Callout> : null}
    {!data && busy ? <Spinner label="Loading agents" /> : null}
    {group('Needs you', needsYou, 'warning')}
    {group('Working', working, 'accent')}
    {group('Done', visibleDone, 'neutral')}
    {data && !needsYou.length && !working.length && !visibleDone.length ? <EmptyState icon={query ? 'search' : 'activity'} title={query ? 'No matching agents' : 'No active agents'} description={done.length ? 'Enable Show done to see completed agents.' : query ? 'Try another search or clear the field.' : 'Agents appear here when they report a status in Orca.'} /> : null}
    {data?.diagnostics ? <Collapsible title="Connection details"><Stack gap="xs">{data.diagnostics.map((line, index) => <Text key={String(index)} size="xs" muted>{line}</Text>)}</Stack></Collapsible> : null}
  </Stack>
}
