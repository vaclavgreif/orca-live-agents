import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type RemoteAgent = {
  orcaSessionId: string | null
  worktreeId: string
  title: string | null
  workspace: string
  repo: string | null
  agent: string | null
  state: 'working' | 'blocked' | 'waiting' | 'done'
  unread?: boolean
}
export type RemoteListing = { agents: RemoteAgent[]; truncated: boolean; unreadWarning?: string }

function cliBinary(): string {
  if (process.env.ORCA_CLI_COMMAND) return process.env.ORCA_CLI_COMMAND
  const contents = process.execPath.lastIndexOf('/Contents/')
  const candidates = [
    process.env.ORCA_CLI_BIN_DIR ? join(process.env.ORCA_CLI_BIN_DIR, 'orca') : '',
    contents >= 0 ? process.execPath.slice(0, contents) + '/Contents/Resources/bin/orca' : '',
    '/Applications/Orca.app/Contents/Resources/bin/orca',
    '/opt/homebrew/bin/orca', '/usr/local/bin/orca'
  ]
  return candidates.find((path) => path && existsSync(path)) || 'orca'
}

export async function runCli(args: string[]): Promise<unknown> {
  const env = { ...process.env }
  // The selected paired environment belongs to this desktop's Orca profile.
  for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING', 'ORCA_AGENT_SESSION_ID', 'ORCA_AGENT_SESSION_SPAWN_TOKEN', 'ORCA_CLI_CWD']) delete env[key]
  return new Promise((resolve, reject) => {
    // Argument arrays only: no shell and no commands supplied by an agent listing.
    execFile(cliBinary(), args, { env, timeout: 12000, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
      if (error) { reject(new Error(`Orca CLI failed (${error.killed ? 'timeout' : error.code || 'unknown error'}).`)); return }
      try {
        const response = JSON.parse(stdout)
        if (response?.ok !== true) throw new Error('Orca CLI request failed.')
        resolve(response.result)
      } catch { reject(new Error('Orca CLI returned an invalid response.')) }
    })
  })
}

export async function listRemoteAgents(environment: string): Promise<RemoteListing> {
  const result = await runCli(['agent', 'list', '--environment', environment, '--json']) as { agents?: unknown; truncated?: boolean }
  if (!Array.isArray(result?.agents)) throw new Error('Orca CLI returned no agent list.')
  const agents: RemoteAgent[] = []
  for (const item of result.agents) {
    if (!item || typeof item !== 'object' || !['working', 'blocked', 'waiting', 'done'].includes(item.state) || typeof item.worktreeId !== 'string' || typeof item.workspace !== 'string') {
      throw new Error('Orca CLI returned an invalid agent.')
    }
    // Retain metadata only; the CLI can also return reply previews, which are discarded.
    agents.push({
      orcaSessionId: typeof item.orcaSessionId === 'string' ? item.orcaSessionId : null,
      worktreeId: item.worktreeId,
      title: typeof item.title === 'string' ? item.title.slice(0, 512) : null,
      workspace: item.workspace.slice(0, 512),
      repo: typeof item.repo === 'string' ? item.repo.slice(0, 512) : null,
      agent: typeof item.agent === 'string' ? item.agent.slice(0, 128) : null,
      state: item.state
    })
  }
  let unreadWarning: string | undefined
  try {
    const statuses = await runCli(['worktree', 'ps', '--environment', environment, '--limit', '500', '--json']) as { worktrees?: unknown; truncated?: boolean }
    if (!Array.isArray(statuses?.worktrees)) throw new Error('Orca returned no workspace unread statuses.')
    const unreadByWorkspace = new Map<string, boolean>()
    for (const workspace of statuses.worktrees) {
      if (workspace && typeof workspace.worktreeId === 'string' && typeof workspace.unread === 'boolean') {
        unreadByWorkspace.set(workspace.worktreeId, workspace.unread)
      }
    }
    for (const agent of agents) {
      const unread = unreadByWorkspace.get(agent.worktreeId)
      if (unread !== undefined) agent.unread = unread
    }
    if (statuses.truncated) unreadWarning = 'Some workspace unread statuses were omitted by Orca.'
  } catch { unreadWarning = 'Workspace unread status could not be read; agent status is still available.' }
  return { agents, truncated: result.truncated === true, ...(unreadWarning ? { unreadWarning } : {}) }
}

export async function focusRemoteAgent(environment: string, sessionId: string): Promise<void> {
  await runCli(['terminal', 'switch', '--environment', environment, '--terminal', `orca_session_id:${sessionId}`, '--json'])
}

export async function listPairedEnvironments(): Promise<{ id: string; name: string }[]> {
  const result = await runCli(['environment', 'list', '--json']) as { environments?: unknown }
  if (!Array.isArray(result?.environments)) throw new Error('Orca CLI returned no paired-host list.')
  return result.environments.flatMap((item) => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || item.source === 'ephemeral-vm') return []
    return [{ id: item.id, name: typeof item.name === 'string' ? item.name : item.id }]
  })
}
