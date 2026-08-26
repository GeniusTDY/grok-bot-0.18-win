# Contributing

This repository is intended for a small technical study group. Keep changes
reviewable and do not commit generated application payloads or local evidence.

Before sharing a change, run:

```sh
npm ci
npm run check
npm run frontend:build
npm run publication:secrets
```

On Windows x64, after `npm run bootstrap:windows`, packaging changes should
also pass:

```powershell
npm run package:windows
npm run verify:windows
npm run smoke:windows
```

Do not attach provider sessions, transcript files, `.env` files, or logs that
contain credentials to issues or pull requests. Reduce a report to the smallest
sanitized reproduction before sharing it.

Use focused commits. Explain whether a change affects reviewed runtime source,
the editable frontend, the checksum-pinned packaged renderer, or packaging only.
Do not weaken checksum, composition, or clean-export checks to make a build
pass.
