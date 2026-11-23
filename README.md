# Live Agents for Orca

An always-visible right-sidebar panel listing agents across Orca workspaces. Keep the project tree on the left and Live Agents on the right.

- Groups agents into Needs you, Working and optional Done.
- Updates on status and workspace events, reconciling every 15 seconds while visible.
- Clicking a terminal agent focuses its pane. Native chats open their workspace.
- Uses Orca's native components, keyboard controls and current theme.
- Reports failed refreshes and partial results rather than silently hiding them.

Requires Orca 1.4.260 or newer. Native chat titles are not currently supplied by Orca's `agents.list` API; those rows use the agent and workspace name.

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

The plugin does not read conversation text, send prompts, start or stop agents, or request network access. It stores no data outside Orca's panel preferences.

## Verify

```sh
orca plugin test . --json
orca plugin check . --json
npx --yes --package typescript tsc -p . --noEmit
```

Check scenarios cover empty, busy and disconnected states. Behavior tests cover grouping, filtering, status updates, opening agents and refresh errors. Source code is TypeScript/TSX with no build step or runtime dependencies.
