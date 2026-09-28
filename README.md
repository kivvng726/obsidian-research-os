# Research OS for Obsidian

Local-first research workspace for Obsidian with grounded library Q&A.

## Beta status

Research OS v0.6.0-beta.2 is a public beta. Keep backups of important Vault data. The Windows x64 Research OS Engine is also beta and is not code signed.

## Features

- Paper library, PDF workflow, Paper Insight, and Synthesis.
- Ask your library with citations linked to retrieved evidence.
- Local derived AI index with BYOK embedding and chat providers.
- Automatic indexing for new papers and batch preparation for existing papers.

## Installation

### 1. Install the plugin

1. Download `ResearchOS-Plugin-v0.6.0-beta.2.zip` from the official release.
2. Extract it to obtain `research-os/`.
3. Copy `research-os/` into `<Vault>/.obsidian/plugins/`.
4. Enable **Research OS** in Obsidian Community plugins.

### 2. Install Research OS Engine

Windows x64 only in this beta.

1. Download `ResearchOS-Engine-Windows-x64-v0.6.0-beta.2.zip`.
2. Extract it to any normal folder.
3. Double-click `ResearchOS-Engine.exe`.
4. Keep its console window open while using Research AI.
5. In Obsidian, open **Settings → Research OS → Research AI / Library AI** and select **Test Engine**.

### 3. Configure AI providers

Configure your own API credentials (BYOK). Qwen `qwen3.7-text-embedding-flash` is the recommended embedding preset; DeepSeek `deepseek-chat` is the recommended chat preset. Billing belongs to your AI provider account.

### First use

1. Start the Engine and run **Test Engine**.
2. Configure and test Embedding and Chat providers.
3. Import or add papers.
4. Choose **Prepare existing library for AI**.
5. Wait for preparation to finish, then use **Ask your library**.

Newly imported PDFs enter the indexing lifecycle automatically when the Engine is available.

## Privacy and security

The Engine runs locally and Vault/source files are not uploaded wholesale. Text required for embeddings is sent to the embedding provider you configure. A RAG question and retrieved evidence are sent to the chat provider you configure.

API keys are stored in the plugin's local Obsidian settings (`data.json`). This beta does not claim OS keychain encryption. The Engine receives credentials only for the current localhost request and does not persist them.

The derived AI index is stored at `%LOCALAPPDATA%\ResearchOS\data\research-os.db`. It is rebuildable and is not the Vault source of truth; deleting it does not delete Markdown or PDFs, but requires preparing the library again.

## Windows warning

The Engine is unsigned. SmartScreen or Defender may identify it as an unknown publisher. Download only from the official project release, compare SHA-256 checksums, and review the public source and build scripts. Do not use unofficial mirrors.

## Troubleshooting

- **Test Engine fails:** ensure `ResearchOS-Engine.exe` is running and the backend URL is `http://127.0.0.1:8765`.
- **Port 8765 is occupied:** another Engine or local service may already be running.
- **Embedding or Chat test fails:** verify API key, base URL, model, provider quota, and model access.
- **Ask your library cannot find a paper:** prepare the library and confirm the paper has a PDF.
- **A new paper is not searchable:** use **Prepare existing library for AI** again after resolving any indexing error.
- **Engine restart:** the derived index remains available after restart.
- **Engine offline:** regular Research OS features continue to work; RAG and indexing remain unavailable until the Engine starts.

## Known limitations

Windows x64 Engine only; no automatic Engine download/start; no Community Plugins marketplace install; no reranker; no Agent; and no transient PDF evidence highlight. `grounded: true` validates citation markers against retrieved evidence, not full factual entailment.

## Developer documentation

Developer setup and Engine packaging instructions are in [backend/README.md](backend/README.md). These are not required for ordinary users.
