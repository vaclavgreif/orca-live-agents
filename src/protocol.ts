export type AgentRow = {
  key: string
  workspaceId: string
  workspace: string
  title: string
  agent: string
  state: 'working' | 'blocked' | 'waiting' | 'done'
  since: number
  terminalId: string | null
}
export type Snapshot = { agents: AgentRow[]; warnings: string[] }
declare module 'orca' {
  interface PluginRequests {
    'agents.snapshot': { output: Snapshot }
    'agents.open': { input: { key: string }; output: { opened: boolean } }
  }
}
