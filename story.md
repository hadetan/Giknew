# Giknew Product Story & Build Contract

> Living specification for the Giknew Telegram bot. This file is optimized so an AI or engineer can ingest it and know exactly what to build, in what order, and how to verify completion. All promises must be implementable with listed technologies.

---
## 1. Vision
Giknew is a privacy‑first Telegram assistant that:
- Notifies users about meaningful GitHub repository activity (stale PRs, new PR comments, failing checks, important status changes) without noise.
- Answers natural language questions about their GitHub work with **fresh, accurate** data—never relying on stale caches.
- Supports multi-user, multi-installation (personal + org) securely; no user can access another’s data.
- Uses LongCat models for fast and deep (“thinking mode”) answers, returning structured, Telegram-friendly formatted responses.

Success = A user links GitHub once, then reliably stays on top of reviews + can query “what matters now?” in seconds.

---
## 2. Scope (Phase 1 / MVP)
IN:
- GitHub App auth (personal & org repos user has installation access to)
- Telegram bot (webhook) with commands & inline queries
- Live GitHub API fetch per query (no long-term caching)
- LongCat AI integration (fast vs thinking mode)
- Stale PR heuristic notifications
- PR comment, status/check failure notifications
- Structured AI answers with minimal, recent conversation context
- Encrypted storage of installation tokens & user mode preferences
- Storable architecture summary for maintainability
- Open source (MIT)
- Prisma ORM data access layer over Postgres (Supabase-hosted or other)

OUT (Defer):
- Vector search / embeddings
- Multi-provider (GitLab, Jira)
- User notification preference toggles UI (schema prepared)
- Rate limiting persistence beyond simple in-memory guard
- Release note automation beyond basic summary
- Rich analytics dashboards

---
## 3. Personas
1. **Individual Developer**: Wants fast daily overview & quick Q/A.
2. **Team Reviewer**: Needs alerts on neglected PRs and failing checks.
3. **Occasional Maintainer**: Needs simple onboarding and minimal friction.

---
## 4. User Journeys (Condensed)
1. **Onboard & Link**: `/start` → `/linkgithub` → OAuth/GitHub App approve → confirmation.
2. **Ask a Question**: `/ask Summarize my open PRs needing review` → bot fetches PR data → answer.
3. **Deep Reasoning**: `/mode thinking` → next question uses slower model.
4. **Inline Quick Lookup**: Types `@Giknew my failing checks today` → inline result list.
5. **Notification**: New review comment arrives → direct Telegram alert with link.
6. **Stale PR**: Daily stale job detects PR stagnation → send alert once per day until activity.
7. **Contextual Follow-up**: Replies “Summarize them in bullet form” to prior answer → context chain used.

---
## 5. Functional Acceptance Criteria (Checklists)
> Each checkbox MUST be checked only when feature is implemented & validated. Sub‑items optional for clarity.

### 5.1 Onboarding & Auth
- [x] `/start` sends concise capability introduction.
- [x] `/linkgithub` returns unique one-time state/nonce link to GitHub App auth.
- [x] Successful GitHub App install triggers callback → user record marked linked.
- [x] Multi-user isolation: user A cannot retrieve data pertaining to user B (manual inspection attempt blocked by queries).
- [x] `/unlink` revokes (or flags) installation locally and confirms.
- [x] Revocation (webhook) updates user to unlinked and notifies them.

### 5.2 Commands & Interaction
- [x] `/help` lists commands & inline usage.
- [x] `/ask <text>` triggers AI pipeline.
- [x] `/mode fast` and `/mode thinking` persist per-user mode.
- [x] Inline query returns relevant summarized items (≥1, ≤5).
- [x] Unknown commands produce helpful fallback.

### 5.3 AI Answer Generation
- [x] Default model: `LongCat-Flash-Chat`.
- [x] Thinking model: `LongCat-Flash-Thinking` used only when mode=thinking.
- [x] Prompt always includes **fresh** GitHub slice (no persistent cached summary beyond transient in-process data).
- [x] Enhance fresh GitHub slice
    - Add failing checks summary, multiple installations aggregation, better repo selection & error messaging.
- [x] Max output tokens limited (≤1000) and enforced.
- [x] If processing >5s, bot sends placeholder “Summarizing…” (or typing state) before final answer.
- [x] Structured Telegram-friendly Markdown output (no unsupported formatting).
- [x] Streaming partial output if feasible flag enabled; else final single response.

### 5.4 Conversation Context
- [x] Replies to a bot message reuse last ≤6 Q/A turns for that thread only.
- [x] New non-reply user message starts new context thread.
- [x] Context persisted encrypted; oldest pruned beyond window.

### 5.5 Notifications (Realtime)
 - [x] PR comment webhook → notify relevant user(s) with excerpt + link. *(link omitted for now, excerpt sent)*
 - [x] Status/check run failure event → sends concise failure summary once per failing conclusion.
 - [x] Duplicate events (same comment id or check id + conclusion) not re-sent within 1h.

### 5.6 Stale PR Heuristic
- [x] Endpoint `/jobs/stale-prs` secured by header secret.
- [x] Heuristic flags PR if: age > X days (default 3), idle commits > Y hours (24), newer PRs merged in last Z hours (24).
- [x] Sends “stale” notice at most once per 24h per PR until activity.
- [x] State persisted to prevent duplicate daily notifications.

### 5.7 Security & Privacy
- [x] GitHub webhook HMAC (X-Hub-Signature-256) verified.
- [x] Encrypted storage of installation tokens (AES-256-GCM or equivalent) with separate IV per record.
- [x] No secrets or tokens logged (pino redaction).
- [x] User can run `/exportmeta` to see non-sensitive metadata.
- [x] `/purge` deletes user data (soft or hard) + prevents further notifications.
- [x] Telegram webhook only accepts expected update schemas; rejects others gracefully.

### 5.8 Data Model & Persistence
- [x] Prisma schema defines all required models & initial migration applied.
- [x] `users` table stores telegram id, hashed GitHub user id, mode, linked flag.
- [x] `installations` map user ↔ installation ids.
- [x] `context_messages` store limited encrypted dialog turns.
- [x] `notification_log` dedupes events.
- [x] `stale_pr_state` tracks last stale notifications.
- [x] Repository layer uses Prisma client (no raw SQL in application layer).

### 5.9 Config & Observability
- [x] Central config module validates required env vars at startup.
- [x] `/health` endpoint returns JSON: version, uptime seconds, mode counts.
- [x] Structured JSON logging with severity & request correlation id.

### 5.10 Failure Handling
- [x] Uncaught errors produce sanitized user message & logged stack.
- [x] LongCat timeout (>30s) aborts and sends fallback error answer.
- [x] GitHub API rate limit detection → user informed to retry (not silent fail).

### 5.11 Open Source Compliance
- [x] LICENSE (MIT) present.
- [x] README documents setup, env vars, GitHub App creation steps, limitations.
- [x] No proprietary secrets in repo.

### 5.12 Performance / Rate Protections
- [x] Hard guard: max 5 concurrent AI requests per user (in-memory tracking).
- [x] Each AI request < 25s wall clock.

### 5.13 Streaming Feature Flag
- [x] `STREAMING_ENABLED` env toggles streaming vs final answer only.
- [x] If streaming enabled but edit rate hits safe threshold, system auto-falls back to batch.
- [x] Throttle & placeholders documented (900ms min interval, 8 edits early fallback, 5s 'Summarizing...' escalation, typing action every 4s).

### 5.14 Quality & Definition of Done
- [ ] `npm run dev` launches bot locally.
- [ ] ESLint passes with zero errors (warnings allowed ≤5).
- [ ] Basic smoke script can send simulated webhook & command without crash.
- [ ] Documentation up-to-date with implemented behaviors.

---
## 6. Non-Functional Requirements
| Aspect | Requirement |
|--------|-------------|
| Latency | Fast mode answers < 4s typical; Thinking mode may exceed but sends placeholder < 2s. |
| Privacy | Encrypted tokens & context; minimal persisted text. |
| Reliability | Graceful degradation if AI or GitHub down. |
| Portability | Pure JavaScript (no heavy native deps) for Vercel compatibility. |
| Observability | Structured logs + health endpoint. |

---
## 7. Architecture Overview
**Layers**:
- Interface: Telegram webhook (Telegraf) + GitHub webhook (Express router) + Jobs endpoint.
- Orchestration: Command dispatcher, AI orchestrator, notification processor.
- Integration: GitHub API client (installation token based), LongCat API client.
- Data: Postgres (Supabase-hosted or other) accessed via Prisma ORM (migrations + generated client).
- Security: HMAC verification, crypto module for encryption, environment config validation.
- Utility: Logging, error normalization, heuristic module (stale PR).

**Flow (Ask)**: Telegram update → command parse → data fetch (GitHub) → prompt build → LongCat call (stream or batch) → formatted answer → store context.

**Flow (Webhook)**: GitHub POST → signature verify → classify event → filter relevant users → dedupe → send Telegram message.

**Flow (Stale Job)**: Cron call → iterate users → fetch open PRs → compute heuristic → send notifications & update state.

---
## 8. Data Model (Logical)
Prisma `schema.prisma` will define the following models (names may use CamelCase while tables map via `@@map` if needed):
```
users(id PK, telegram_id bigint unique, github_user_hash text unique, mode text, linked boolean, created_at timestamptz)
installations(id PK, user_id FK, installation_id bigint, created_at)
context_messages(id PK, user_id FK, thread_root_id bigint, role text, content_encrypted text, created_at)
notification_log(id PK, user_id FK, event_type text, external_id text, sent_at)
stale_pr_state(id PK, user_id FK, repo_id bigint, pr_number int, last_notified_at timestamptz)
secrets(id PK, installation_id FK, token_cipher text, iv text, tag text, created_at)
```

---
## 9. Security Model
- **Encryption**: AES-256-GCM with master key from env `MASTER_KEY` (length validated). Each secret row has unique random 96-bit IV.
- **Hashing GitHub User ID**: SHA-256(salt + id) where salt is env constant; only hash stored.
- **Webhook Verification**: Compute HMAC SHA-256 over raw body; constant-time compare vs `X-Hub-Signature-256`.
- **Redaction**: Logger redacts keys containing TOKEN|KEY|SECRET|PRIVATE.
- **Purging**: On `/purge`, delete or anonymize user rows and secret tokens.

---
## 10. Prompt Strategy (AI)
System preamble (example skeleton):
```
You are Giknew, a GitHub assistant. Only answer using provided factual sections. Do not hallucinate.
Sections:
[USER_QUESTION]
[CONTEXT: PR_SUMMARY]
[CONTEXT: ISSUES]
Rules: If data missing, say so. Return structured markdown.
```
User text appended. Context built on demand right before call.

---
## 11. Stale PR Heuristic Details
Formula conditions (all true):
- `now - created_at_days > X (3)`
- `now - last_commit_hours > Y (24)`
- `merged_PRs_since(last_commit_time, window=24h) >= 1`
Notification message format: `PR #<n> <title> appears stale (no commits in 24h while <k> newer PRs merged). Consider updating or requesting review.`

---
## 12. Environment Variables (Phase 1)
| Variable | Purpose | Required |
|----------|---------|----------|
| TELEGRAM_BOT_TOKEN | Telegram bot auth | Yes |
| GITHUB_APP_ID | GitHub App id | Yes |
| GITHUB_APP_PRIVATE_KEY | PEM (escaped) | Yes |
| GITHUB_WEBHOOK_SECRET | HMAC secret | Yes |
| LONGCAT_API_KEY | LongCat key | Yes |
| LONGCAT_BASE_URL | API base (openai-compatible) | Default `https://api.longcat.chat/openai` |
| DATABASE_URL | Postgres connection string (Supabase or other) | Yes |
| MASTER_KEY | 32-byte hex for encryption | Yes |
| STREAMING_ENABLED | `true|false` | Default false |
| CRON_JOB_SECRET | Secret header value for stale job | Yes |
| NODE_ENV | Environment mode | Default development |
| PRISMA_LOG_LEVEL | Optional verbose logging level | No |

---
## 13. Error & Timeout Policy
- LongCat soft timeout 25s; hard abort at 28s.
- GitHub API rate-limit (403 + headers) → user message: “GitHub rate limit hit; try again shortly.”
- Unhandled exception → generic “Internal error; logged reference <id>”.

---
## 14. Telemetry / Logging Fields
`timestamp, level, msg, requestId, userId(optional), eventType, latencyMs, errorCode(optional)`

---
## 15. Build & Run Commands (Planned)
```
npm install
npm run dev   # Starts express + webhook handlers
```
Later: instructions to expose tunnel (ngrok) for Telegram & GitHub webhooks locally.

---
## 16. Roadmap (Post-MVP)
1. User notification preference flags
2. Release notes generation with classification
3. Semantic similarity (pgvector) for longer memory
4. Adaptive rate budgeting & batching
5. Additional GitHub events (releases, issue assignments) toggles
6. Admin dashboard (aggregated stats) with optional passwordless auth

---

## Backlog / Next Steps

These are valuable improvements that are intentionally deferred from Phase 1, prioritized roughly by impact:

- Improve persistent rate-limiting and quotas (persist counters across restarts).
- Add user-level notification preferences and per-repo filters.
- Add CI-friendly integration tests and a GitHub Actions workflow for smoke tests.
- Implement encryption key rotation support and migration tooling.
- Add metrics export (Prometheus) and richer logging (request tracing across webhooks & bot updates).
- Expand streaming behavior to include concise progress summaries and user-configurable edit cadence.

Small low-risk next steps to consider now:
- Add unit tests for repositories and helpers.
- Replace in-memory concurrency counters with Redis for multi-instance support.

---
## 17. Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| High GitHub rate usage (no caching) | Throttling | Narrow queries; potential micro-cache per request cycle only |
| Streaming instability (Telegram edit rate) | User confusion | Auto fallback to final message if edit burst > threshold |
| Encryption key rotation | Token inaccessibility | Document rotation procedure (re-encrypt) – Phase 2 |
| LongCat latency spikes | Slow answers | Early placeholder + final edit |

---
## 18. Definition of Done (Meta)
All Phase 1 acceptance criteria checked, README + License present, lint passes, local smoke test of command + webhook + stale job flow.

---
## 19. Implementation Order (High-Level)
1. Config + logging + health route
2. Prisma schema + initial migration + crypto module
3. GitHub App token exchange & webhook verification
4. Telegram bot commands (fast skeleton)
5. LongCat client (batch) + AI orchestrator
6. `/ask` pipeline + context storage (Prisma repositories)
7. Notifications (PR comments, check failures)
8. Stale PR job endpoint + heuristic
9. Thinking mode switching + streaming flag
10. Inline query results
11. Export/purge commands & docs

---
## 20. Glossary
| Term | Definition |
|------|------------|
| Stale PR | PR meeting heuristic stagnation conditions |
| Context Thread | A chain of messages linked by reply in Telegram |
| Thinking Mode | Higher reasoning model selection (LongCat-Flash-Thinking) |
| Fresh Slice | Live GitHub snapshot acquired at question time |

---
*End of Story – This document is authoritative for Phase 1.*
