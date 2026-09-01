# Vercelab lighter UI prototype

This prototype explores a lighter Vercelab shell before the production React refactor.

## Prototype pages

- `index.html` — Overview telemetry and the unified workloads inventory.
- `apps.html` — Compact new-app entry, application inventory, deployment review dialog, and on-demand app management drawer.

## Direction

- Adopt the Homelab Index visual system: compact chrome, neutral canvas, hairline surfaces, tabular data, quiet shadows, and restrained orange/blue/green accents.
- Replace the permanent four-column workspace with a single responsive canvas.
- Keep host telemetry visible, but combine related signals into two stable chart surfaces.
- Move logs, activity, terminal, and workload detail into contextual drawers.
- Use a single global range control and one workload search entry point.
- Preserve honest stale, unavailable, and missing-sample states.

## Production component mapping

The HTML is dependency-free so it can be reviewed directly. The production implementation should use current `@cloudflare/kumo` components rather than copying the prototype primitives:

| Prototype surface                 | Kumo target                                                |
| --------------------------------- | ---------------------------------------------------------- |
| Top navigation and range controls | `Tabs`, `Button`, `Badge`, `Toolbar`                       |
| Telemetry cards                   | `Card`, `Text`, `ChartLegend`                              |
| Live charts                       | `TimeseriesChart` with ECharts canvas renderer             |
| Workload inventory                | `Table`, `Badge`, `Button`, `Tooltip`                      |
| Search                            | `CommandPalette`                                           |
| Settings and detail panels        | `Popover`, `Dialog` or a Kumo-supported drawer composition |
| Loading states                    | `SkeletonLine` with fixed chart dimensions                 |
| Empty/error states                | `Empty`, `Badge`, `Text`                                   |

## Implementation sequence

1. Install Kumo and Phosphor, then map the shared color variables in `app/globals.css`.
2. Replace the current rail/header/sidebar frame with the compact workspace chrome.
3. Move range, refresh, search, and settings into the global header.
4. Rebuild telemetry with Kumo `TimeseriesChart`, retaining real timestamps and `null` gaps.
5. Replace the container/app sidebars with a unified workload table and contextual detail drawer.
6. Move live logs and terminal into on-demand drawers/routes so they do not reserve desktop width.
7. Add fixed-dimension skeletons and stale/degraded states before connecting polling.
8. Verify focused tests, TypeScript, production build, standalone packaging, and Playwright at desktop and narrow widths.

Open `index.html` directly or serve this directory with any static file server.
