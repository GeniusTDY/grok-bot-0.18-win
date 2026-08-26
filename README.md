# Grok Bot 0.18 — reconstructed and extended

![Grok Bot Router settings with Codex selected and local usage totals](docs/assets/router-settings.png)

This repository is an unofficial, source-oriented reconstruction of the
publicly shipped Grok Bot 0.18.0 Windows x64 app.

## Project lineage

This project continues the reconstruction published by
[`b-nnett/grok-bot-0.18-reconstructed`](https://github.com/b-nnett/grok-bot-0.18-reconstructed).
The Windows x64 port in this repository was developed on top of that existing
reconstruction; it is not a claim to the original Grok Bot source code. This
fork adds the Windows bootstrap, portable packaging and verification flow,
stable desktop installation, Docker-aware launcher, and Windows-specific
runtime and interaction fixes.

The earlier reconstruction itself was derived from publicly distributed Grok
Bot 0.18.0 binaries. The exact Windows artifact URL and SHA-256 hash are
recorded in [PROVENANCE.md](PROVENANCE.md), and retained upstream material
is described in [NOTICE.md](NOTICE.md).

The project began as an attempt to understand how the desktop app was put
together. It now contains readable TypeScript implementations of its Electron,
host, coordinator, local-execution, protocol, and renderer boundaries, plus a
deterministic toolchain for turning those sources back into a working Windows
application.

It also adds a few practical experiments:

- an inference router for Cursor, Claude Code, Codex, and OpenRouter;
- Grok Bot plugin/MCP tools across the routed providers;
- local usage tracking for routed inference;
- an optional local Docker sandbox in place of the remote box; and
- a reconstructed settings surface integrated into the polished shipped UI.

This is a hacking and research project, not Anysphere's original monorepo and
not an official Grok Bot release. Names and module boundaries inferred from a
compiled application may differ from the original source.

## What is in the repository?

The checked-in tree contains the reviewed reconstruction, tests, manifests,
build scripts, and the Git LFS preservation copy of the original Windows x64
installer. It deliberately does **not** commit the extracted
upstream application, build output, local credentials, or the large forensic
recovery workspace.

The public Grok Bot 0.18.0 application is instead treated as a pinned build
input. During bootstrap, the toolchain downloads it, verifies its SHA-256
identity, and extracts the pieces required to assemble the reconstruction.

The resulting app is a hybrid by design:

- application runtimes are compiled from the readable sources under `source/`;
- the polished shipped renderer remains the UI baseline;
- a narrow deterministic transform adds the reconstructed Router settings UI;
- original and patched renderer chunk hashes are recorded and verified; and
- the finished portable app is left unsigned rather than claiming the upstream signature.

The upstream app installed on the machine is never overwritten.

### Why retain the shipped renderer?

The distributed application did not include the original frontend source or
source maps. It contained optimized, minified production JavaScript and CSS
chunks: enough to inspect behavior and recover contracts, but not the authored
React components, names, comments, file structure, or design-system source.

Recreating the complete frontend with the same polish and behavior would have
been a separate, much larger reverse-engineering project. It was not a realistic
goal for a weekend build. The practical choice was therefore to reconstruct the
runtime and control-plane code, retain the checksum-pinned shipped renderer,
and make the smallest auditable UI patch needed for the new Router settings.

`frontend/` is a readable partial reconstruction and design workspace. It is
useful for understanding UI contracts and experimenting with clean components,
but it should not be mistaken for Anysphere's missing original frontend source
or a pixel-perfect replacement for the packaged renderer.

## Preserved original installers

Research copies of the exact 0.18.0 installers live under
`research-archives/original/0.18.0/` and are stored with Git LFS:

| Platform | File | SHA-256 |
| --- | --- | --- |
| Windows x64 | `windows-x64/Grok_Bot_0.18.0_Setup.exe` | `464079a15ef5fa8b61ccea8fffcc78f63cfcf6df65fb0ad5e725d8b95f7e437e` |

See [research-archives/README.md](research-archives/README.md) for source URLs,
sizes, verification commands, and the machine-readable artifact manifest.

## Current features

### Inference Router

Open **Settings → Router** to choose the backend used for new turns:

| Provider | Authentication | Tool support |
| --- | --- | --- |
| Cursor | Existing Grok Bot/Cursor session | Native Grok Bot tools and plugins |
| Claude Code | Existing Claude Code login | Routed Grok Bot MCP tools |
| Codex | Existing local ChatGPT/Codex login | Direct Responses transport with Grok Bot tools |
| OpenRouter | API key saved through the desktop secrets bridge | Grok Bot tool-execution loop |

Cursor is the default. Claude Code and Codex do not require separate API keys
when their local clients are already authenticated. The application preserves
streaming responses, thinking state, reactions, rich plugin mentions, and MCP
tool execution across routed conversations.

For Codex-driven VM control, each user signs in with their own Codex client;
credentials are read locally at runtime and are never part of this repository.
See [docs/CODEX_SETUP.md](docs/CODEX_SETUP.md) for the complete first-run flow.

**Usage & Billing** shows the locally recorded request and token totals for
providers that return usage data. These figures are activity records, not an
authoritative provider invoice.

### Local Docker sandbox

The Router page also has a **Use local Docker VM** toggle. When enabled, Grok
Bot runs its box host and execution daemon in an owned local container instead
of connecting to the remote sandbox.

The container:

- is bound only to loopback ports;
- mounts content-addressed host and daemon artifacts read-only;
- reuses the user's existing provider authentication where needed;
- is validated before the coordinator connects; and
- is stopped or replaced through the same settings lifecycle.

Docker Desktop, or another compatible local Docker daemon, must be running.
Remote mode remains the default.

## Requirements

For the Windows x64 packaging flow:

- Windows x64
- Node.js 26.5.x
- Git LFS
- Docker Desktop (optional, only for the local sandbox)
- local Claude Code or Codex authentication for those router choices

## Quick start

```powershell
git clone <your-repository-url>
cd grok-bot-0.18-reconstructed-win
git lfs install
git lfs pull
npm ci
npm run bootstrap:windows
npm run check
npm run package:windows
npm run install:windows
npm run smoke:windows
```

`npm run bootstrap:windows` first uses the Git LFS preservation copy of the
pinned 0.18.0 Windows installer. If that archive is absent, it falls back to
the original public URL; `GROK_BOT_018_WINDOWS_RUNTIME` can also point to an
existing runtime copy. Bootstrap verifies the installer and `app.asar`, caches
the matching Electron runtime, and hydrates the ignored `src/app/dist` build
input.

`npm run package:windows` compiles the reconstructed runtimes, applies the
narrow renderer/settings transform, assembles the portable directory, and
verifies the result. Output is written to:

```text
dist/Grok Bot 0.18 Reconstructed-win32-x64/
```

Keep the complete directory together when moving it. This local reconstruction
is not Authenticode-signed as a reconstructed Windows release; Windows may show
a reputation or signature warning. The original installer is never executed or
overwritten by the portable build flow. `npm run install:windows` copies the
verified directory to a stable per-user application location and creates a
desktop shortcut that starts Docker Desktop when the local sandbox needs it.
See [docs/WINDOWS.md](docs/WINDOWS.md) for installation and restart behavior.

Reconstructed packages disable the upstream updater at the packaging boundary
and default upstream Sentry and telemetry emission off. Explicitly supplied
environment configuration is still respected.

## Architecture

```text
polished shipped renderer
          │
          │ desktop preload / RPC
          ▼
     Electron main
          │
          ├── settings, secrets, auth and plugin lifecycle
          ├── remote box connector
          └── owned local Docker connector
                       │
                       ▼
              coordinator + host
                       │
              inference router
           ┌───────────┼───────────┐
        Cursor      Claude       Codex / OpenRouter
                       │
                 Grok Bot MCP tools
```

The main source areas are:

- `source/electron-main/` — desktop lifecycle, settings, auth, box connectors,
  coordinator ownership, and RPC handlers;
- `source/electron-preload/` — the narrow trusted bridge exposed to the UI;
- `source/host/` — inference, tools, MCP, settings, and turn execution;
- `source/node-agent-coordinator/` — transcript routing, streaming activity,
  reactions, and the routed MCP bridge;
- `source/shared/` — shared contracts, settings, protocol, and provider helpers;
- `frontend/` — readable React/TypeScript renderer reconstruction and design
  workspace;
- `scripts/` — bootstrap, compilation, renderer patching, packaging, and
  verification; and
- `tests/` — publication and router regressions.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for more detail.

## Development commands

```sh
npm test                  # focused regression tests
npm run typecheck         # renderer TypeScript
npm run source:typecheck  # runtime TypeScript
npm run frontend:build    # build the readable renderer reconstruction
npm run package:windows   # build and verify the Windows x64 portable app
npm run install:windows   # install the Windows build and desktop shortcut
npm run verify:windows    # verify the Windows x64 portable app
npm run smoke:windows     # launch and observe a Windows renderer page
npm run publication:ready # scan, typecheck, test, and build before publishing
npm run publication:check # prove a fresh-history export is lossless
```

Generated directories including `.cache`, `.build`, `dist`, `src/app/dist`,
`recovered`, `recovery`, and local probe roots are ignored.

## Project status

The app launches and the core reconstructed flows are usable, including routed
inference, connected plugins, and the local Docker sandbox. This is still an
experimental reconstruction: the portable build flow targets the pinned Windows
x64 release. It depends on external provider sessions and does not promise
compatibility with future Grok Bot versions.

For changes, read [CONTRIBUTING.md](CONTRIBUTING.md). For the clean-history
export procedure, see [docs/PUBLISHING.md](docs/PUBLISHING.md). Technical
provenance and retained upstream boundaries are described in
[PROVENANCE.md](PROVENANCE.md) and [NOTICE.md](NOTICE.md).

## Licensing and upstream boundaries

Original contributions in this repository are available under the
[MIT License](LICENSE) to the extent their copyright holders have authority to
license them. The MIT License does not relicense the retained upstream
installers, shipped renderer, product names, or trademarks. Those materials
remain subject to their own terms. See [NOTICE.md](NOTICE.md) for the boundary
statement and obtain an independent rights review before redistribution.
