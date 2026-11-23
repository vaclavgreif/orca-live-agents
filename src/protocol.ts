export type AgentRow = {
  key: string
  workspaceId: string
  workspace: string
  project?: string
  branch?: string
  unread?: boolean
  title: string
  agent: string
  state: 'working' | 'blocked' | 'waiting' | 'done'
  since: number
  terminalId: string | null
}
export type Snapshot = { agents: AgentRow[]; warnings: string[]; diagnostics?: string[] }
declare module 'orca' {
  interface PluginRequests {
    'agents.snapshot': { output: Snapshot }
    'agents.open': { input: { key: string }; output: { opened: boolean } }
  }
}
