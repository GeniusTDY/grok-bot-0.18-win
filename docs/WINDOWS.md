# Windows x64 build and desktop installation

The Windows port is a portable reconstruction built from the checksum-pinned
Grok Bot 0.18.0 Windows installer. The original installer is treated as a build
input and is never executed by this workflow.

## Requirements

- Windows x64
- Node.js 26.5.x
- Git and Git LFS
- Docker Desktop when using the local sandbox
- an existing local Codex or Claude Code login for those router providers

## Build and install

For a published Windows release, download the `win32-x64.zip` asset, extract
the complete archive, close any running reconstructed app, and run
`Install.cmd`. The installer copies the portable app to the stable per-user
location and creates the desktop shortcut without requiring Node.js.

Before selecting Codex in Grok Bot, authenticate your own account with
`codex login`; see [CODEX_SETUP.md](CODEX_SETUP.md).

To build from source instead, run these commands from the repository root:

```powershell
git lfs pull
npm ci
npm run bootstrap:windows
npm run package:windows
npm run install:windows
```

Close a running reconstructed app before reinstalling so Windows does not lock
its executable. The final command copies the complete portable directory to
`%LOCALAPPDATA%\Programs\GrokBot018Reconstructed` and creates or refreshes
`Grok Bot 0.18 Reconstructed.lnk` on the current user's desktop.

## What happens after a restart

The shortcut points to the stable per-user installation rather than to the
repository or `dist` directory, so cleaning the build tree does not break it.
When launched, its helper checks the Docker engine. If Docker Desktop is
installed but not ready, the helper starts it in the background and waits for
up to two minutes before opening Grok Bot. The app still opens when Docker is
unavailable; only the optional local sandbox will be unavailable in that case.

Docker Desktop can also remain enabled in Windows Startup. The shortcut does
not require the repository, Node.js, or a terminal after installation.

## Verification

```powershell
npm run verify:windows
npm run smoke:windows
```

The reconstructed executable is not Authenticode-signed. Windows may show a
reputation warning even when the package verification succeeds.
