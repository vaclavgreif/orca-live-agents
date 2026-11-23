import type { OrcaWorkerApi } from 'orca/worker'
import type { AgentRow, Snapshot } from './protocol'
import { listRemoteAgents, focusRemoteAgent } from './remote'

type NavigableAgent = AgentRow & { remoteEnvironment?: string; remoteSessionId?: string | null }

export default function activate(orca: OrcaWorkerApi): void {
  let known = new Map<string, NavigableAgent>()
  orca.panels.handle('agents.snapshot', async (): Promise<Snapshot> => {
    const { workspaces, truncated } = await orca.host.call('workspace.list')
    const agents: NavigableAgent[] = []
    const warnings: string[] = truncated ? ['Orca returned a partial workspace list.'] : []
    // Bound concurrency so a large workspace collection cannot flood the host.
    const localWorkspaces = workspaces.filter((workspace) => !workspace.hostId?.startsWith('runtime:'))
    for (let offset = 0; offset < localWorkspaces.length; offset += 6) {
      await Promise.all(localWorkspaces.slice(offset, offset + 6).map(async (workspace) => {
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
    // The desktop status API is host-scoped. Query each paired runtime once through
    // Orca's supported CLI, using its existing pairing (never copying credentials).
    const hosts = [...new Set(workspaces.map((workspace) => workspace.hostId).filter((host): host is string => !!host?.startsWith('runtime:')))]
    for (let offset = 0; offset < hosts.length; offset += 3) {
      await Promise.all(hosts.slice(offset, offset + 3).map(async (host) => {
        try {
          const environment = decodeURIComponent(host.slice('runtime:'.length))
          if (!environment) throw new Error('Empty remote environment.')
          const result = await listRemoteAgents(environment)
          if (result.truncated) warnings.push(`Orca returned a partial agent list for ${environment}.`)
          for (const [index, agent] of result.agents.entries()) {
            const matches = workspaces.filter((workspace) => workspace.hostId === host && (
              workspace.id === agent.worktreeId || agent.worktreeId.endsWith(`::${workspace.path}`)
            ))
            const workspace = matches.length === 1 ? matches[0] : undefined
            agents.push({
              key: JSON.stringify([host, agent.orcaSessionId ?? `${agent.worktreeId}:${index}`]),
              workspaceId: workspace?.id ?? '',
              workspace: [agent.repo, agent.workspace].filter((v, i, a) => v && a.indexOf(v) === i).join(' / '),
              title: agent.title || `${agent.agent || 'Agent'} · ${agent.workspace}`,
              agent: `${agent.agent || 'Agent'} · remote`,
              state: agent.state,
              since: 0,
              terminalId: null,
              remoteEnvironment: environment,
              remoteSessionId: agent.orcaSessionId
            })
          }
        } catch {
          warnings.push(`Could not read agents on ${host}. Check that this host is connected and the Orca CLI is installed on your desktop.`)
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
    if (row.remoteEnvironment && row.remoteSessionId) {
      await focusRemoteAgent(row.remoteEnvironment, row.remoteSessionId)
      return { opened: true }
    }
    if (row.terminalId) {
      try {
        const result = await orca.host.call('terminal.focus', { terminalId: row.terminalId })
        if (result.focused) return { opened: true }
      } catch {
        // A closed terminal or a native chat can still be reached via its workspace.
      }
    }
    if (!row.workspaceId) throw new Error('This remote workspace is not available in the desktop sidebar.')
    await orca.host.call('workspace.open', { workspaceId: row.workspaceId })
    return { opened: true }
  })
}
