# Use your own Codex login

This project does not ship a Codex account, token, transcript, or configuration.
Each user authenticates locally with their own ChatGPT/Codex account.

## First-time setup

1. Install a current Codex client using the official OpenAI documentation.
2. Run `codex login` and complete the browser sign-in flow with your own
   ChatGPT account. Codex creates its private local authentication state.
3. Install and start Docker Desktop if you want Grok Bot to control the local
   virtual machine.
4. Build and install Grok Bot by following [WINDOWS.md](WINDOWS.md), then open
   **Settings → Router**.
5. Select **Codex** and enable **Use local Docker VM**.
6. Start a fresh conversation and request an action such as: “在虚拟机中打开
   YouTube，并确认页面已打开。”

The default profile is `%USERPROFILE%\.codex` on Windows. If you maintain a
separate profile, set `CODEX_HOME` before launching Grok Bot. The selected
profile is mounted read-only inside the local VM. The application reads the
configured model and reasoning effort from that profile when available.

Official authentication guidance:
<https://learn.chatgpt.com/docs/auth#codex-cli>

## Privacy and publication boundary

- Never copy `auth.json`, the `.codex` directory, account IDs, tokens,
  transcripts, prompts, or usage records into the repository or a bug report.
- The repository contains only the provider transport and VM tool integration.
- The VM receives the selected Codex profile through a read-only bind mount;
  it is not embedded in the application package or Docker image.
- The publication scanner rejects common credential exports and `.codex`
  profile files before release.

## Troubleshooting

- **“Codex is not signed in with ChatGPT”**: run `codex login`, complete the
  browser flow, close Grok Bot, and reopen it.
- **Codex does not appear logged in**: confirm `auth.json` is under the default
  `.codex` directory, or launch Grok Bot with the matching `CODEX_HOME`.
- **The VM cannot open a page**: start Docker Desktop, select **Use local Docker
  VM**, and begin a new conversation after the VM reports ready.
- **A login expired**: run `codex login` again. Refreshed credentials remain
  local and are not written into the repository.
