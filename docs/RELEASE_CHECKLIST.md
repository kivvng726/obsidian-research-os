# Beta release checklist

- [ ] Working tree reviewed
- [ ] Version check passes
- [ ] `npm test` and `npm run build:test` pass
- [ ] `python -m pytest` passes in `backend`
- [ ] Engine packaged smoke passes
- [ ] Plugin and Engine zip structures audited
- [ ] Secret and local-path scans pass
- [ ] Fresh Vault cold-start manually passes
- [ ] Checksums reviewed
- [ ] Release notes reviewed
- [ ] Create and push `research-os-v0.6.0-beta.2`
- [ ] Create GitHub pre-release and upload both zip files plus `SHA256SUMS.txt`
- [ ] Download and re-test assets from GitHub
