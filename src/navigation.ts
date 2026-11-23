import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type ChatLocation = { environment: string; worktreeId: string; sessionId: string }
export type RuntimeConnection = { call(method: string, params: unknown): Promise<{ result: unknown }> }
export type ChatNavigation = { revealChat(location: ChatLocation): Promise<void> }
export type RemoteSender = (connection: unknown, method: string, params: unknown, timeout: number, envelope: undefined, validateStatus: undefined, signal: undefined, capabilities: readonly string[]) => Promise<{ result: unknown }>

export function nativeTabReader(connection: unknown, send: RemoteSender, capabilities: readonly string[]): RuntimeConnection {
  return { call: async (method, params) => {
    if (method !== 'session.tabs.list') throw new Error('Only tab discovery is supported by this connection.')
    return send(connection, method, params, 15000, undefined, undefined, undefined, capabilities)
  } }
}

type RuntimeClientConstructor = new (profile?: string, timeout?: number, pairing?: null, environment?: string | null) => RuntimeConnection

export function runtimeClientModule(): string {
  const contents = process.execPath.indexOf('/Contents/')
  const roots = [
    process.env.ORCA_CLI_BIN_DIR ? dirname(process.env.ORCA_CLI_BIN_DIR) : '',
    contents >= 0 ? process.execPath.slice(0, contents) + '/Contents/Resources' : '',
    join(dirname(process.execPath), 'resources'),
    '/Applications/Orca.app/Contents/Resources'
  ]
  for (const root of roots) {
    if (!root) continue
    const file = join(root, 'app.asar.unpacked', 'out', 'cli', 'runtime', 'client.js')
    if (existsSync(file)) return file
  }
  throw new Error('This Orca installation does not expose its desktop navigation client.')
}

export async function revealChatWithConnections(remote: RuntimeConnection, desktop: RuntimeConnection, location: ChatLocation): Promise<void> {
  // The agent status pane key is synthetic; only the tab snapshot gives the real tab ID.
  const reply = await remote.call('session.tabs.list', { worktree: `id:${location.worktreeId}` })
  const snapshot = reply.result as { worktree?: string; tabs?: { id?: string; type?: string; sessionId?: string; isActive?: boolean }[] }
  if (snapshot?.worktree !== location.worktreeId || !Array.isArray(snapshot.tabs)) {
    throw new Error('Orca did not return the requested chat workspace.')
  }
  const matches = snapshot.tabs.filter((tab) => tab.type === 'agent-session' && tab.sessionId === location.sessionId && typeof tab.id === 'string')
  const tab = matches.find((item) => item.isActive) ?? matches[0]
  if (!tab?.id) throw new Error("Could not locate this chat in the server tab listing.")
  // Same local-only reveal request Orca's paired terminal CLI uses. It selects the
  // execution host in the renderer instead of resolving a remote ID in the local database.
  const revealed = await desktop.call('terminal.reveal', {
    worktreeId: snapshot.worktree,
    tabId: tab.id,
    executionHostId: `runtime:${encodeURIComponent(location.environment)}`
  })
  const result = revealed.result as { reveal?: { navigated?: boolean } }
  if (result?.reveal?.navigated !== true) throw new Error('Orca did not confirm that the remote workspace was shown.')
}

export const desktopNavigation: ChatNavigation = {
  async revealChat(location) {
    const file = runtimeClientModule()
    const { RuntimeClient } = createRequire(file)(file) as { RuntimeClient: RuntimeClientConstructor }
    const runtimeDir = dirname(file)
    const out = join(runtimeDir, '..', '..')
    const require = createRequire(file)
    const { getDefaultUserDataPath } = require(join(runtimeDir, 'profile', 'metadata.js')) as { getDefaultUserDataPath(): string }
    const { resolveRemoteConnection } = require(join(runtimeDir, 'pairing', 'runtime-remote-pairing.js')) as { resolveRemoteConnection(profile: string, pairing: null, environment: string): Promise<unknown> }
    const { sendRemoteRuntimeRequestOnSocket } = require(join(out, 'shared', 'remote-runtime', 'requests', 'remote-runtime-request-socket.js')) as { sendRemoteRuntimeRequestOnSocket: RemoteSender }
    const session = require(join(out, 'shared', 'agent-session', 'capabilities', 'agent-session-runtime-capabilities.js')) as Record<string, string>
    const surface = require(join(out, 'shared', 'agent-session', 'capabilities', 'structured-agent-session-surface-capabilities.js')) as Record<string, string>
    // The generic paired CLI transport intentionally hides native chat tabs.
    // Negotiate the same four chat-reader capabilities used by Orca's agent-read CLI.
    const capabilities = [
      session.STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY,
      session.CLAUDE_STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY,
      surface.STRUCTURED_AGENT_SESSION_REGISTERED_AGENTS_RUNTIME_CAPABILITY,
      surface.PI_STRUCTURED_DIALOGS_RUNTIME_CAPABILITY
    ]
    if (capabilities.some((value) => typeof value !== 'string')) throw new Error('This Orca build does not expose native chat discovery capabilities.')
    const connection = await resolveRemoteConnection(getDefaultUserDataPath(), null, location.environment)
    const remote = nativeTabReader(connection, sendRemoteRuntimeRequestOnSocket, capabilities)
    const desktop = new RuntimeClient(undefined, 15000, null, null)
    await revealChatWithConnections(remote, desktop, location)
  }
}
