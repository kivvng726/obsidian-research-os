# Security policy

## API keys and private data

Research OS stores the DeepSeek API key, AI conversation history, theme selection, and local preferences in:

```text
.obsidian/plugins/research-os/data.json
```

This file is intentionally excluded from version control. Never attach it to an issue, release, screenshot archive, or diagnostic bundle.

If a key is accidentally published:

1. Revoke it immediately in the DeepSeek console.
2. Create a replacement key.
3. Remove the leaked value from Git history; deleting it only from the latest commit is not sufficient.

Imported PDFs, presentations, reading notes, and custom theme backgrounds may also contain private or copyrighted material. They are excluded by the repository's default ignore rules.

## Reporting a vulnerability

Please open a private security advisory in the repository rather than a public issue. Include the affected version, reproduction steps, and expected impact. Do not include real API keys or private documents.

