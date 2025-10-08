# Giknew — GitHub-aware PR assistant

Giknew is a Telegram bot that connects to your GitHub account (via a GitHub App) and gives fast, context-aware summaries and notifications about open pull requests. It's designed to help developers and teams quickly surface PR status, failing checks, and short summaries—either via commands or inline queries inside Telegram.

This repository contains the Phase 1 scaffold: Telegram command handlers, GitHub App integration, a small AI orchestration layer for `/ask`, and a Prisma-backed data store for user and installation metadata.

## Core purpose
 - Provide compact, actionable PR summaries and notifications directly inside Telegram.
 - Let users ask short natural-language questions about their repositories and PRs (via `/ask`) and receive AI-powered summaries.
 - Keep user data scoped and private: each Telegram account links to one or more GitHub App installations and stored context is isolated by user.

## Key features
- Account linking
	- `/linkgithub` generates an installation link for your GitHub App and saves installation IDs to your account.
	- `/unlink` removes the local link (you can also uninstall the app in GitHub to fully revoke access).
- Interactive commands
	- `/start` and `/help` for onboarding and a quick command list.
	- `/mode fast|thinking` to change the AI model behavior for `/ask`.
	- `/ask <question>`: ask natural-language questions about your PRs and repo status. Uses LongCat/OpenAI backend (configurable).
	- `/exportmeta` to get non-sensitive metadata about your account and linked installations.
	- `/purge` to delete/anonymize your stored data.
	- `/isolationdiag` to run a diagnostic that checks for installation or data isolation issues.
- Inline PR summaries
	- Type @Giknew in any Telegram chat to fetch a short list of PR summaries for the installations linked to your account. Results include failing-check badges and PR titles.
- Aggregated PR snapshots
	- Periodically fetches open PRs and check-run statuses for each installation to prepare quick summaries.
- Concurrency & rate guards
	- Per-user and global concurrency limits to protect the AI backend and GitHub API usage.

Permissions and privacy
- The bot stores:
	- Telegram user metadata and a hash used for linking.
	- Linked GitHub installation IDs (no raw GitHub tokens are stored).
	- Optional context messages for AI conversations (scoped by user).
- You can remove all local data with `/purge`, and you can uninstall the GitHub App on GitHub to revoke access.

How the GitHub integration works (high level)
- The bot uses a GitHub App and the App's private key to create a signed JWT.
- The JWT is exchanged for an installation access token (one per installation) by calling the GitHub REST API:
	POST https://api.github.com/app/installations/:installation_id/access_tokens
- Installation tokens are short-lived. The bot requests a fresh token when it needs to call GitHub on behalf of an installation.

Common failure mode and what to check (installation token error)
If you see inline results like:

	PR: (installation 89237730 token error)

This means the bot attempted to create or fetch an installation token for that installation and failed. Common causes:
- Private key formatting problems: if `GITHUB_APP_PRIVATE_KEY` in `.env` is pasted as a single quoted line or contains literal `\n` sequences, JWT creation can break or the key may be interpreted incorrectly. The loader now normalizes keys (strips surrounding quotes, replaces `\\n` with real newlines, and wraps single-line PEMs), but you should still verify the private key was copied correctly from GitHub.
- Wrong App ID: `GITHUB_APP_ID` must match the numeric App ID shown in your GitHub App settings. The code coerces this value to a number; verify it is correct.
- Permissions or installation scope: even with a valid token, the App may not have permissions to list repositories or PRs for an installation. Check "Permissions & events" in your GitHub App settings and ensure it has at least read access to Repository metadata and Pull Requests.
- Installation not present: make sure the user completed the installation flow and the installation ID is recorded in the database.

Quick troubleshooting steps
1. Confirm `.env` values:
	 - `GITHUB_APP_ID` matches App ID in GitHub App settings.
	 - `GITHUB_APP_PRIVATE_KEY` contains the exact PEM from GitHub (you can paste the multi-line PEM or the quoted single-line form; the loader will normalize it).
	 - `GITHUB_WEBHOOK_SECRET` matches the webhook secret configured on GitHub.
2. In the GitHub App UI:
	 - Ensure a private key is generated (download it from the App page) and that you used the same key in your `.env`.
	 - Verify the App's permissions include reading repositories and pull requests.
	 - Check webhook deliveries for errors (they show request logs and responses).
3. Locally test JWT creation:
	 - A small script `scripts/test_jwt.js` is included to validate the app JWT creation using your `.env`.
	 - Run: node -r dotenv/config scripts/test_jwt.js
4. Test installation token for a specific installation id (advanced):
	 - If needed I can add a diagnostic script that exchanges the app JWT for an installation token and prints the HTTP response details.

Developer quick start
1. Copy `.env.example` to `.env` and populate required values.
2. Install dependencies and generate Prisma client:

```bash
npm install
npm run prisma:generate
```

3. Start the app locally in dev:

```bash
npm run dev
```

4. Run smoke test (synthetic /start update):

```bash
npm run smoke
```

Notes for contributors
- Concurrency: adjust `AI_USER_CONCURRENCY` and `AI_GLOBAL_CONCURRENCY` in `.env` to tune limits.
- The project uses Prisma for database access and assumes a Postgres-compatible `DATABASE_URL`.
- The AI orchestration is behind `LONGCAT_API_KEY`/`LONGCAT_BASE_URL` and `STREAMING_ENABLED` toggles streaming behavior.
- Check .env.example for more configurations.

License & credits
- See `LICENSE` for licensing details.
