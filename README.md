# Live Agents for Orca

An always-visible right-sidebar panel listing agents across Orca workspaces. Keep the project tree on the left and Live Agents on the right.

- Defaults to newest activity within each status group. The order selector also offers oldest activity, project name and unread first; your choice is saved. Unknown activity times sort last.
- Search by project, task title, workspace, branch or agent name; filtering is instant and case-insensitive. Show done also applies to search results.
- Compact two-line rows show a bold project name and task title, using small text close to Orca’s project sidebar.
- Groups local and paired remote agents into Needs you, Working and optional Done.
- Uses small colored dots: amber for working/waiting, red for blocked, green for done, and a separate blue dot for unread updates. Unread completed work remains visible even with Show done off.
- Updates on status and workspace events, reconciling every 15 seconds while visible.
- Clicking a terminal agent focuses its pane. Native chats reveal their remote workspace through Orca’s local desktop reveal request; terminal commands cannot address native chat IDs.
- Uses Orca's native components, keyboard controls and current theme.
- Reports failed refreshes and partial results rather than silently hiding them.
- Keeps version and remote diagnostics inside expandable Connection details, with a small Show done button in the header.

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

For remote hosts the worker runs fixed `orca agent list --environment ... --json` commands with argument arrays, without a shell. The CLI may include reply previews; the plugin discards them and retains agent metadata only. Clicking a remote terminal row runs `orca terminal switch` for that paired host and verifies navigation. Clicking a native chat advertises native-chat support when reading its actual tab from the remote server and reveals its workspace in the desktop, naming the paired host separately from the raw workspace ID. This uses Orca’s bundled runtime client because its public plugin API cannot resolve these remote workspace IDs. The desktop retains its selected native chat tab when a workspace has multiple chats; exact native-chat tab selection is not guaranteed by the reveal endpoint. The plugin does not send prompts or start or stop agents, and stores no data outside Orca's panel preferences.

## Verify

```sh
orca plugin test . --json
orca plugin check . --json
npm ci
npm run typecheck
```

Check scenarios cover empty, busy and disconnected states. Behavior tests cover grouping, filtering, status updates, opening agents and refresh errors. Source code is TypeScript/TSX with no build step or runtime dependencies. TypeScript and Node types are development dependencies only.

Unread status comes from Orca per workspace, not per conversation. All agents in the same unread workspace share its indicator. Local workspace status and remote `worktree ps` supply it; the plugin does not invent an unread state when Orca cannot supply one.

Activity uses the remote agent’s updated timestamp. Local agents use the latest workspace activity or agent state change exposed by Orca; agents sharing a local workspace may therefore share an activity time.
