# Security notes

This is a small-club reconstruction, not a supported production distribution.
Do not reuse real credentials or sensitive accounts while experimenting with it.

Reconstructed packages default the official updater, Sentry, and upstream
telemetry off at the Electron-main packaging boundary. The bootstrap download
and hydrated `app.asar` are checksum-pinned.

`npm audit` still reports compatibility-bound advisories in the pinned Electron
42.1 runtime, Undici 5 / Connect 1 stack, AI SDK 4, and OpenTelemetry stack.
Patch-level fixes are applied where they do not change reconstructed runtime
contracts. The remaining major upgrades are intentionally tracked as follow-up
work rather than silently changing application behavior during publication
cleanup.

Please use GitHub's private vulnerability reporting feature when it is enabled,
or contact the repository owner privately. Do not open a public issue containing
credentials, provider sessions, private transcripts, personal paths, or an
unredacted exploit. Include the affected reconstructed version, platform, and a
minimal sanitized reproduction.

## Codex privacy boundary

The repository may include reviewed source code that lets Codex drive Grok Bot
tools inside the local Docker sandbox. It must never include a user's Codex or
ChatGPT credentials, account identifiers, OAuth tokens, `auth.json`, `.codex`
profile, transcripts, prompts, or local usage records. Authentication is read
from the user's machine only at runtime and is not a publication artifact.
