# Open-source release checklist

## Before the first push

- [ ] Revoke the DeepSeek key currently stored in the local plugin `data.json` and create a replacement.
- [x] Repository name: `obsidian-research-os`.
- [x] Public author name: `kivvng`; GitHub owner: `kivvng726`; repository and issue URLs have been added.
- [x] The replacement `forest.jpg` was identified by the project author as an original work.
- [x] Record the original forest image as an author-owned asset distributed under the repository's MIT License.
- [x] Review the example Dashboard, Templates, and Bases for personal information.
- [ ] Add screenshots that contain no private filenames, API keys, private notes, or copyrighted paper pages.

## Security check

- [x] Verify `.obsidian/plugins/research-os/data.json` is ignored.
- [x] Verify imported PDF, PPT, private note, and custom-theme folders are ignored.
- [x] Search the public candidate files for API keys, tokens, email addresses, and local absolute paths.
- [ ] Build and test from a fresh clone before publishing a release.

## Release

- [x] Update the version in `package.json`, `manifest.json`, `versions.json`, and `CHANGELOG.md` to `0.3.0`.
- [ ] Commit the release.
- [ ] Push the `v0.3.0` tag to trigger the GitHub release workflow.
- [ ] Download the generated `research-os.zip` and test installation in a clean Vault.
- [ ] Publish installation and privacy notes with the release announcement.
