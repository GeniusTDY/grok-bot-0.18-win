# Provenance

## Repository lineage

The work in this repository is based on the existing reconstruction published
at <https://github.com/b-nnett/grok-bot-0.18-reconstructed>. The Windows x64
port and subsequent Windows-specific build, installation, Docker, browser-tool,
and runtime fixes were developed as an extension of that project. They must not
be described as the original Grok Bot source or as an official Windows release.

The base reconstruction and this derivative work both ultimately refer to the
public Grok Bot 0.18.0 release artifacts documented below.

## Release artifacts

The reconstruction is based on the public Windows x64 release artifact:

- Product: Grok Bot
- Version: 0.18.0
- Electron framework: 42.1.0
- Installer URL: `https://downloads.cursor.com/grokbot/stable/win32-x64/0.18.0/Grok_Bot_0.18.0_Setup.exe`
- Installer SHA-256: `464079a15ef5fa8b61ccea8fffcc78f63cfcf6df65fb0ad5e725d8b95f7e437e`
- Preservation manifest: `research-archives/original/0.18.0/artifacts.json`

The repository preserves the original Windows x64 installer above through Git
LFS.

The original application was code-signed by Anysphere Incorporated. Reconstructed builds are intentionally left unsigned; they do not retain or claim the upstream signature.

The shipped renderer contained optimized production bundles, not the authored
frontend source or source maps. The readable `frontend/` tree is therefore a
partial evidence-backed reconstruction, while packaged builds retain the pinned
renderer and apply only a narrow, hash-recorded settings transform.

No upstream source-code license is implied. Do not present reconstructed
material as original source or an official build, and complete an independent
rights review before public redistribution.

## Evidence-only reconstruction rule

The immutable release is the product specification. Recovered source may express
only behavior supported by at least one inspectable artifact anchor: emitted code
or source-path markers, extracted capsules/source maps, shipped strings/assets/CSS,
renderer DOM signatures, IPC/RPC contracts, or repeatable observation of the
shipped runtime.

This rule is especially strict for the renderer. Do not invent or redesign a
screen, route, control, label, selector, state, or interaction to fill an evidence
gap. A clean abstraction or test seam is acceptable only when it preserves
artifact-derived semantics and does not add product behavior. When evidence is
incomplete, record the uncertainty and leave the feature unmapped or
evidence-only instead of guessing.

Every UI-facing recovery must identify its artifact anchor in its evidence
catalog, focused test, or coverage note. Passing typecheck/build alone is not
proof of provenance; speculative behavior is a release-blocking defect.
