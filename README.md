# Live Agents for Orca

An always-visible right-sidebar panel listing agents across Orca workspaces. Keep the project tree on the left and Live Agents on the right.

- Shows the project name prominently, with the task title and branch beneath it.
- Groups local and paired remote agents into Needs you, Working and optional Done.
- Marks unread workspaces with a bell and Unread badge. Unread completed work remains visible even with Show done off.
- Updates on status and workspace events, reconciling every 15 seconds while visible.
- Clicking a terminal agent focuses its pane. Native chats open their workspace.
- Uses Orca's native components, keyboard controls and current theme.
- Reports failed refreshes and partial results rather than silently hiding them.
- Shows the installed version and expandable Connection details for troubleshooting remote discovery.

Requires Orca 1.4.260 or newer. Remote hosts must already be paired in the desktop app. The worker discovers servers from the desktop's saved pairings as well as its workspace list, then invokes Orca's bundled CLI once per remote host on each refresh, using the desktop's existing pairing. No credentials need to be entered into the plugin. Local native chat titles may be unavailable; those rows use the agent and workspace name.

## Install on the computer running the Orca desktop app

Run this on the computer running Orca's desktop app:

```sh
orca plugin install vaclavgreif/orca-live-agents --json
```

Repository: https://github.com/vaclavgreif/orca-live-agents

Orca prints the requested access and an approval fingerprint. Review it and run the exact command it prints with `--approve <fingerprint>`. Open **Live Agents** using the activity icon in the right sidebar, or:

```sh
orca plugin open vaclavgreif.live-agents --panel live-agents --json
```

Installing on a headless server alone cannot open the panel in a desktop window. The panel uses the workspaces exposed by the Orca host where its worker runs.

For development instead of a copied installation:

```sh
orca plugin dev load /absolute/path/to/orca-live-agents --json
```

## Access

The Node worker runs under your local user account. Its declared Orca capabilities are:

- `workspace:read`: discover workspaces and their metadata.
- `agent:read`: list agents and receive status changes.
- `workspace:write`: open a workspace or focus a terminal when you click a row. This is Orca's shared capability for UI navigation; the plugin does not rename, hide, or modify projects.

For remote hosts the worker runs fixed `orca agent list --environment ... --json` commands with argument arrays, without a shell. The CLI may include reply previews; the plugin discards them and retains agent metadata only. Clicking a remote row runs `orca terminal switch` for that paired host. The plugin does not send prompts or start or stop agents, and stores no data outside Orca's panel preferences.

## Verify

```sh
orca plugin test . --json
orca plugin check . --json
npm ci
npm run typecheck
```

Check scenarios cover empty, busy and disconnected states. Behavior tests cover grouping, filtering, status updates, opening agents and refresh errors. Source code is TypeScript/TSX with no build step or runtime dependencies. TypeScript and Node types are development dependencies only.

Unread status comes from Orca per workspace, not per conversation. All agents in the same unread workspace share its indicator. Local workspace status and remote `worktree ps` supply it; the plugin does not invent an unread state when Orca cannot supply one.
