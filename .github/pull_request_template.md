## Summary

Describe the user-visible change and which boundary it affects: reconstructed
runtime source, editable frontend, checksum-pinned renderer transform, tests, or
packaging.

## Verification

- [ ] `npm run publication:secrets`
- [ ] `npm run check`
- [ ] `npm run frontend:build`
- [ ] Platform packaging/verification completed when relevant
- [ ] No credentials, provider sessions, private transcripts, or generated app payloads are included

## Upstream boundary

- [ ] The change does not weaken pinned hashes, artifact provenance, updater or telemetry isolation, or clean-export checks
- [ ] Any retained upstream material is identified and is not presented as newly licensed source
