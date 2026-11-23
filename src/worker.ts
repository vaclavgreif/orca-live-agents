import type { OrcaWorkerApi } from 'orca/worker'
import type { AgentRow, Snapshot } from './protocol'
import { listRemoteAgents, focusRemoteAgent, listPairedEnvironments } from './remote'

type NavigableAgent = AgentRow & { remoteEnvironment?: string; remoteSessionId?: string | null; remoteKind?: 'chat' | 'terminal' }

export default function activate(orca: OrcaWorkerApi): void {
  let known = new Map<string, NavigableAgent>()
  orca.panels.handle('agents.snapshot', async (): Promise<Snapshot> => {
    const { workspaces, truncated } = await orca.host.call('workspace.list', { includeStatus: true })
    const agents: NavigableAgent[] = []
    const diagnostics = [`Live Agents 0.1.4`, `Desktop workspace API: ${workspaces.length} workspaces.`]
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
              project: workspace.project || workspace.name,
              branch: workspace.name,
              ...(typeof workspace.status?.unread === 'boolean' ? { unread: workspace.status.unread } : {}),
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
    const discovered = new Map<string, string>()
    for (const workspace of workspaces) {
      if (workspace.hostId?.startsWith('runtime:')) {
        try {
          const id = decodeURIComponent(workspace.hostId.slice('runtime:'.length))
          if (id) discovered.set(id, id)
        } catch { warnings.push('A workspace has an invalid remote host identifier.') }
      }
    }
    // Workspace enumeration may omit remote hosts entirely, even while their chats
    // are open in the desktop. Pairing discovery must not depend on that enumeration.
    try {
      const paired = await listPairedEnvironments()
      diagnostics.push(`Desktop pairing store: ${paired.length} saved hosts.`)
      for (const environment of paired) discovered.set(environment.id, environment.name)
    } catch (error) {
      warnings.push(`Could not discover paired servers. ${error instanceof Error ? error.message : 'Check the desktop Orca CLI.'}`)
      diagnostics.push('Desktop pairing discovery failed.')
    }
    const hosts = [...discovered.keys()]
    for (let offset = 0; offset < hosts.length; offset += 3) {
      await Promise.all(hosts.slice(offset, offset + 3).map(async (host) => {
        try {
          const environment = host
          const result = await listRemoteAgents(environment)
          diagnostics.push(`${discovered.get(host)}: ${result.agents.length} agents returned.`)
          if (result.unreadWarning) diagnostics.push(`${discovered.get(host)}: ${result.unreadWarning}`)
          if (result.truncated) warnings.push(`Orca returned a partial agent list for ${environment}.`)
          for (const [index, agent] of result.agents.entries()) {
            const matches = workspaces.filter((workspace) => workspace.hostId === `runtime:${encodeURIComponent(host)}` && (
              workspace.id === agent.worktreeId || agent.worktreeId.endsWith(`::${workspace.path}`)
            ))
            const workspace = matches.length === 1 ? matches[0] : undefined
            agents.push({
              key: JSON.stringify([host, agent.orcaSessionId ?? `${agent.worktreeId}:${index}`]),
              workspaceId: workspace?.id ?? agent.navigationWorkspaceId ?? '',
              workspace: [agent.repo, agent.workspace].filter((v, i, a) => v && a.indexOf(v) === i).join(' / '),
              project: agent.repo || agent.workspace,
              branch: agent.workspace,
              ...(typeof agent.unread === 'boolean' ? { unread: agent.unread } : {}),
              title: agent.title || `${agent.agent || 'Agent'} · ${agent.workspace}`,
              agent: `${agent.agent || 'Agent'} · remote`,
              state: agent.state,
              since: 0,
              terminalId: null,
              remoteEnvironment: environment,
              remoteSessionId: agent.orcaSessionId,
              remoteKind: agent.kind
            })
          }
        } catch (error) {
          const label = discovered.get(host) || host
          warnings.push(`Could not read agents on ${label}. ${error instanceof Error ? error.message : 'Check the host connection.'}`)
          diagnostics.push(`${label}: query failed.`)
        }
      }))
    }
    agents.sort((a, b) => Number(b.unread === true) - Number(a.unread === true) || a.workspace.localeCompare(b.workspace) || a.title.localeCompare(b.title))
    known = new Map(agents.map((agent) => [agent.key, agent]))
    diagnostics.push(`Total: ${agents.length} agents; ${hosts.length} remote hosts queried.`)
    return { agents, warnings, diagnostics }
  })
  orca.panels.handle('agents.open', async ({ key }) => {
    const row = known.get(key)
    if (!row) throw new Error('This agent is no longer listed. Refresh and try again.')
    if (row.remoteKind === 'terminal' && row.remoteEnvironment && row.remoteSessionId) {
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
