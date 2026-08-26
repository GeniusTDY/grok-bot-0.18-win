# Original release archive

This directory preserves the publicly distributed Grok Bot 0.18.0 installer
used by the reconstruction. The large binary is tracked with Git LFS.

## Artifacts

| Platform | Architecture | Bytes | SHA-256 | Original URL |
| --- | --- | ---: | --- | --- |
| Windows | x64 | 125,825,552 | `464079a15ef5fa8b61ccea8fffcc78f63cfcf6df65fb0ad5e725d8b95f7e437e` | `https://downloads.cursor.com/grokbot/stable/win32-x64/0.18.0/Grok_Bot_0.18.0_Setup.exe` |

The browser download metadata on the archived local copy identified the URL
above. The Windows checksum matches the independent pin used by the build
toolchain.

## Fetching and verification

```sh
git lfs install
git lfs pull
(cd research-archives/original/0.18.0 && shasum -a 256 -c SHA256SUMS)
```

`artifacts.json` is the machine-readable source, size, and digest inventory.
These files are preservation inputs, not reconstructed build outputs.
