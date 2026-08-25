# Contributing

Contributions are welcome for bug fixes, accessibility improvements, documentation, theme analysis, literature workflows, and AI integrations.

## Development

1. Clone the repository into an Obsidian vault.
2. Install dependencies with `npm install`.
3. Build the plugin with `npm run build`.
4. Enable **Research OS** under Obsidian's community plugins.
5. Run `npm test` before opening a pull request.

## Pull requests

- Keep the protected `forest-original` preset backward compatible.
- Dynamic themes must not write to or overwrite `forest.jpg`.
- Never commit `data.json`, API keys, personal notes, PDFs, PPT files, or user backgrounds.
- New body-text color pairs should meet WCAG AA contrast of at least 4.5:1.
- Include concise reproduction and verification steps for UI or data migration changes.

## Code of conduct

Be respectful, specific, and constructive. Harassment and discrimination are not accepted.

