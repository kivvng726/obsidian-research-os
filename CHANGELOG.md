# Changelog

## 0.4.4 - 2026-09-12

- Fixed custom theme settings being reset when the plugin data file is replaced during an update by persisting theme state in the Vault.

## 0.4.3 - 2026-09-12

- Fixed Markdown drag-and-drop import failing with `ENOENT` on Windows by reading dropped file bytes directly.

## 0.4.2 - 2026-09-11

- Fixed custom backgrounds not being persisted after selecting them, so the selected theme now survives an Obsidian restart.

## 0.4.1 - 2026-09-01

- Added built-in provider settings for 智谱 AI / GLM.
- Added native Anthropic Claude API support through the Messages API.
- Fixed the global search box losing input focus after the first character.
- Updated AI provider documentation for GLM and Claude.

## 0.4.0 - 2026-09-01

- Added configurable AI providers for DeepSeek, OpenAI/GPT, Kimi/Moonshot, OpenRouter, SiliconFlow, and custom OpenAI-compatible endpoints.
- Added editable Base URL and model name settings for OpenAI-compatible chat completion APIs.
- Scoped DeepSeek-only thinking parameters to DeepSeek requests so other providers do not reject the request body.
- Updated AI copy and release documentation to explain supported providers and installation paths.

## 0.3.0 - 2026-08-25

- Added drag-and-drop PDF import with local text extraction and AI metadata repair.
- Added editable literature metadata, summaries, global semantic taxonomy, and safe deletion.
- Added per-paper material folders with multiple Markdown notes and learning-process records.
- Added ten-question paper guides based on PDF text, annotations, and reading notes.
- Added multi-paper research synthesis with source mapping, consensus, conflicts, gaps, and next steps.
- Improved research-progress organization and paper graph relationships.
- Improved dynamic-theme token coverage across controls and reading-workspace actions.
- Added public repository metadata, privacy defaults, release packaging, and open-source documentation.

## 0.2.0 - 2026-08-24

- Added literature library, reading queue, reading workspace, research progress, and paper graph views.
- Added drag-and-drop association for PDF, Markdown, and presentation files.
- Added DeepSeek paper guide, paper chat, and weekly arXiv discovery.
- Added protected `forest-original` visual preset.
- Added image-driven dynamic themes with local color extraction, glass tokens, contrast handling, preview, and safe fallback.
