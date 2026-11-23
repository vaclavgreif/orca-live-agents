import type { OrcaWorkerApi } from 'orca/worker'
import type { AgentRow, Snapshot } from './protocol'

export default function activate(orca: OrcaWorkerApi): void {
  let known = new Map<string, AgentRow>()
  orca.panels.handle('agents.snapshot', async (): Promise<Snapshot> => {
    const { workspaces, truncated } = await orca.host.call('workspace.list')
    const agents: AgentRow[] = []
    const warnings: string[] = truncated ? ['Orca returned a partial workspace list.'] : []
    // Bound concurrency so a large workspace collection cannot flood the host.
    for (let offset = 0; offset < workspaces.length; offset += 6) {
      await Promise.all(workspaces.slice(offset, offset + 6).map(async (workspace) => {
        try {
          const result = await orca.host.call('agents.list', { workspaceId: workspace.id })
          result.agents.forEach((agent, index) => {
            agents.push({
              key: JSON.stringify([workspace.id, agent.sessionId ?? agent.terminalId ?? index]),
              workspaceId: workspace.id,
              workspace: [workspace.project, workspace.name].filter((v, i, a) => v && a.indexOf(v) === i).join(' / '),
              title: agent.task?.title || agent.title || `${agent.agent === 'codex' ? 'Codex' : agent.agent || 'Agent'} · ${workspace.name}`,
              agent: agent.agent || 'Agent',
              state: agent.state,
              since: agent.stateStartedAt,
              terminalId: agent.terminalId
            })
          })
        } catch {
          warnings.push(`Could not read agents in ${workspace.name}.`)
        }
      }))
    }
    agents.sort((a, b) => a.workspace.localeCompare(b.workspace) || a.title.localeCompare(b.title))
    known = new Map(agents.map((agent) => [agent.key, agent]))
    return { agents, warnings }
  })
  orca.panels.handle('agents.open', async ({ key }) => {
    const row = known.get(key)
    if (!row) throw new Error('This agent is no longer listed. Refresh and try again.')
    if (row.terminalId) {
      try {
        const result = await orca.host.call('terminal.focus', { terminalId: row.terminalId })
        if (result.focused) return { opened: true }
      } catch {
        // A closed terminal or a native chat can still be reached via its workspace.
      }
    }
    await orca.host.call('workspace.open', { workspaceId: row.workspaceId })
    return { opened: true }
  })
}
