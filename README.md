# Billing Operations Preview — Full-Stack Daytona PR Previews

This repository is a runnable demo for Daytona-backed pull request preview
environments — now backed by **real services**, not just UI. It ships a Next.js
"Billing Operations Preview" app, a real PostgreSQL database, a real Redis queue
(BullMQ), a standalone Node worker, in-database email capture, and a signed webhook
receiver. A GitHub Actions workflow and a standard-library Python helper create,
update, comment on, and delete the Daytona sandbox for each PR.

The demo is built around one operational promise:

> When localhost is not enough: every trusted PR can get one shareable, full-stack
> integration URL — database, queue, worker, email, and webhooks included — with an
> automatic cleanup path.

This is **NOT for tiny UI changes**. This is for full-stack branch review when
localhost and shared staging are the wrong tools.

> Localhost is good for coding. Shared staging is good for final confidence.
> Daytona is good for disposable branch-level integration review.

## What Changed Since App-Only

The previous version was a thin UI preview console: a developer could dismiss it with
"I could just run `npm run dev`." This version makes the preview earn the sandbox.

| Area | Before (app-only) | Now (full-stack) |
| --- | --- | --- |
| App | "Launchpad Preview Console" (static dashboard) | "Billing Operations Preview" live ops console polling `/api/state` |
| Storage | none | real PostgreSQL 17 (customers, subscriptions, jobs, events, emails, webhooks) |
| Async | none | real Redis + BullMQ + a standalone Node worker |
| Email | none | in-database email capture (no real email ever sent) |
| Webhooks | none | `x-demo-signature` HMAC-SHA256 receiver + replay button |
| Review story | "renders correctly" | a real Starter→Pro upgrade flows through DB → queue → worker → email → webhook |

`npm run verify` is **unchanged** and still passes: the app degrades gracefully when
Postgres and Redis are absent, so lint + typecheck + build + dry-run + customer demo
work with no services running.

## Architecture (Daytona = native services, local = Docker Compose)

The app always speaks the same `DATABASE_URL` / `REDIS_URL` contract. App code is
identical everywhere. Only the way the services are provisioned differs:

- **In Daytona** (`daytona-medium`, Debian 13, Node 25): the snapshot has **no Docker**,
  but it has passwordless `sudo` + `apt`. So `npm run preview:daytona` provisions **real
  Postgres + Redis natively via apt** (installs in ~11s, runs as the non-root user),
  migrates, seeds, starts the worker, and serves Next.js on `0.0.0.0:3000`.
- **Locally**: developers run the *same* real Postgres + Redis through
  `docker compose -f docker-compose.preview.yml up --build` via `npm run preview:local`.

```text
Next.js app (0.0.0.0:3000)
  -> PostgreSQL  (native via apt in Daytona / Docker Compose locally)
  -> Redis + BullMQ
  -> Node worker (worker/index.mjs)
  -> in-database email capture
  -> webhook receiver (x-demo-signature HMAC-SHA256)
```

The teaching point: **Daytona gives reviewers the full stack with NO local Docker
setup.** Reviewers never install Docker; they open one URL.

## The Reviewed Workflow

Acme Logistics upgrades from **Starter** to **Pro**:

1. The app records the upgrade in Postgres and enqueues a provisioning job in Redis.
2. The worker processes the job, writes audit events, flips the subscription to
   `provisioned`, and captures a confirmation email.
3. The UI timeline updates live.
4. A billing webhook can be replayed and validated.

Seeded data is deterministic: Organization **Acme Logistics**, user
**reviewer@example.com**, starting plan **Starter**, requested plan **Pro**.

## What You Can Run

| Mode | What it proves | Command or trigger |
| --- | --- | --- |
| Billing Operations Preview (live) | The full ops console renders and polls live DB-backed state. | `npm run dev` |
| Local production smoke test | The Next.js app can build, start, and answer HTTP before deploy. | `npm run preview:dry-run` |
| Customer demo script | The app + Daytona helper produce a clean demo report and PR-comment artifacts. | `npm run demo:customer` |
| Database migrate | Apply `lib/schema.sql` to the configured Postgres. | `npm run db:migrate` |
| Database seed | Insert deterministic Acme Logistics demo data. | `npm run db:seed` |
| Worker | Run the standalone provisioning worker. | `npm run worker` |
| Full-stack preview (Daytona) | Native apt Postgres+Redis, migrate, seed, worker, Next on `0.0.0.0:3000`. | `npm run preview:daytona` |
| Full-stack preview (local) | Real Postgres+Redis via Docker Compose for high-fidelity local review. | `npm run preview:local` |
| Full-stack verify | Brings up pg+redis, drives the upgrade+webhook flow end-to-end, asserts. | `npm run verify:fullstack` |
| App-only verify | Lint + typecheck + build + dry-run + customer demo (no services needed). | `npm run verify` |
| Everything | App-only verify, then full-stack verify. | `npm run verify:all` |
| Daytona PR preview | A GitHub PR creates/updates a Daytona sandbox and gets an enriched PR comment. | Open or update a PR after configuring repo variables |

The app exposes these API routes:

- `GET  /api/health` — always HTTP 200; body `{ ok, preview, pr, sha, ready, services:{ web, database, queue, worker, email, webhook } }` (each service `"ok"`/`"down"`).
- `GET  /api/ready` — HTTP 200 when all services are ready, else 503 (the Daytona readiness gate).
- `GET  /api/state` — full UI state (customer, subscription/plan, provisioning, jobs, timeline events, emails, webhooks, health, PR metadata).
- `GET  /api/events` — timeline events.
- `POST /api/billing/upgrade` — records the upgrade in Postgres + enqueues the provisioning job.
- `POST /api/webhooks/billing` — validates `x-demo-signature` HMAC-SHA256, stores the event (401 on invalid signature).
- `POST /api/webhooks/billing/replay` — signs a sample payload and calls the receiver (the "Replay billing webhook" button).
- `POST /api/demo/reset` — resets seeded demo data.
- `POST /api/waitlist` — unchanged JSON smoke endpoint (kept for backward compat).

## Repository Map

- [.github/workflows/daytona-pr-preview.yml](.github/workflows/daytona-pr-preview.yml):
  PR workflow that creates, refreshes, comments, skips unsafe forks by default, and
  deletes previews on PR close. **Not rewritten** — the full-stack switch is driven by
  repo variables.
- [scripts/daytona-pr-preview.py](scripts/daytona-pr-preview.py): CLI wrapper for the
  Daytona preview helper.
- [src/daytona/pr_preview.py](src/daytona/pr_preview.py): Daytona REST helper for
  sandbox upsert/delete, clone, setup/start/readiness commands, signed preview URLs,
  env allowlists, and dry-run output.
- [scripts/start-fullstack-preview.mjs](scripts/start-fullstack-preview.mjs): the
  Daytona start path — provisions native pg+redis, migrate, seed, start worker, start
  Next on `0.0.0.0:3000`.
- [scripts/verify-fullstack.mjs](scripts/verify-fullstack.mjs): brings up pg+redis and
  drives the end-to-end upgrade+webhook flow with assertions.
- [scripts/db-migrate.mjs](scripts/db-migrate.mjs) and
  [scripts/db-seed.mjs](scripts/db-seed.mjs): migrate `lib/schema.sql` and seed the
  deterministic Acme Logistics data.
- [scripts/daytona-setup.sh](scripts/daytona-setup.sh): apt-installs Postgres + Redis,
  then runs `npm ci` (the Daytona setup command).
- [scripts/preview-dry-run.mjs](scripts/preview-dry-run.mjs): local production preview
  smoke test.
- [docker-compose.preview.yml](docker-compose.preview.yml): real Postgres + Redis for
  the local high-fidelity preview (`npm run preview:local`).
- [worker/index.mjs](worker/index.mjs): standalone Node worker that processes
  provisioning jobs.
- [lib/](lib/): the service layer — `config.mjs`, `db.mjs`, `seed.mjs`, `queue.mjs`,
  `email.mjs`, `webhook.mjs`, `health.mjs`, `worker-core.mjs`, and `schema.sql`.
- [app/](app/) and [components/](components/): the Next.js app, the API routes above,
  and `components/PreviewDashboard.tsx` (rewritten as a live ops console that polls
  `/api/state`).
- [article.md](article.md): publishable article and demo walkthrough.
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md): the checklist this demo must satisfy.
- [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md): how the full-stack pieces fit
  together and the Daytona-native vs Docker-local provisioning details.
- [docs/full-demo-walkthrough.md](docs/full-demo-walkthrough.md): exact end-to-end
  script for local app, GitHub PR, Daytona preview URL, and cleanup.

## Local Quickstart

Prerequisites:

- Node.js `20.11` or newer.
- npm.
- Python 3 for the Daytona helper.
- Docker (only for `npm run preview:local` / `npm run verify:fullstack`).

Install dependencies and run the full app-only verification:

```bash
npm install
npm run verify
```

`npm run verify` runs lint, typecheck, production build, the local preview dry-run, and
the customer demo script. It passes with **no Postgres or Redis running** — the app
degrades gracefully. The preview dry-run starts the built app on
`http://127.0.0.1:3137` by default and waits for an HTTP response.

To exercise the full stack locally (real Postgres + Redis via Docker Compose):

```bash
npm run preview:local      # docker compose -f docker-compose.preview.yml up --build
npm run verify:fullstack   # brings up pg+redis, drives upgrade+webhook, asserts
npm run verify:all         # verify + verify:fullstack
```

Generate the customer demo artifacts:

```bash
npm run demo:customer
```

That script starts the production app, checks `/api/health`, posts to
`/api/waitlist`, renders the Daytona PR comment in dry-run mode, exercises the
delete path, and writes `demo-artifacts/customer-demo-report.md`.

Run the interactive console:

```bash
npm run dev
```

Open the printed local URL, usually `http://localhost:3000`. Use these smoke checks:

```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/ready
curl -fsS http://127.0.0.1:3000/api/state
```

## Run The Helper Locally

The helper can be exercised without Daytona credentials. It intentionally switches to a
dry run when `DAYTONA_API_KEY` is missing, and `--dry-run` forces the same behavior.

```bash
python scripts/daytona-pr-preview.py upsert \
  --repository acme/app \
  --pr-number 42 \
  --sha abc123 \
  --head-ref feature/preview \
  --dry-run
```

Expected result: JSON showing the stable sandbox name, default port `3000`, lifecycle
settings, forwarded metadata env names, and `would_create_or_update: true`.

Render the PR comment body the workflow would post:

```bash
python scripts/daytona-pr-preview.py upsert \
  --repository acme/app \
  --pr-number 42 \
  --sha abc123 \
  --head-ref feature/preview \
  --dry-run \
  --markdown-output .preview-comment.md
```

Exercise the cleanup path:

```bash
python scripts/daytona-pr-preview.py delete \
  --repository acme/app \
  --pr-number 42 \
  --sha abc123 \
  --head-ref feature/preview \
  --dry-run
```

## Run A Live Daytona Full-Stack PR Preview

The existing GitHub Action and Python helper are **not** rewritten — the switch to
full-stack is driven entirely by repository variables on
`github.com/jiviny/daytona-test-env`:

| Variable / secret | Value |
| --- | --- |
| `DAYTONA_PREVIEW_SETUP_COMMAND` | `bash scripts/daytona-setup.sh` (apt installs postgres+redis, then `npm ci`) |
| `DAYTONA_PREVIEW_START_COMMAND` | `npm run preview:daytona` |
| `DAYTONA_PREVIEW_READY_COMMAND` | `curl -fsS http://127.0.0.1:3000/api/ready` |
| `DAYTONA_PREVIEW_PORT` | `3000` |
| `DAYTONA_PREVIEW_FULLSTACK` | `true` (enables the enriched PR comment) |
| `DAYTONA_TARGET` | `us` (existing) |
| `DAYTONA_PREVIEW_SNAPSHOT` | `daytona-medium` (existing) |
| `DAYTONA_API_KEY` | secret, already set |

Then:

1. Set `Settings -> Actions -> General -> Workflow permissions` to `Read and write
   permissions` so the workflow can post the preview URL back to the PR.
2. Open a same-repository PR or push to an existing PR.
3. The readiness gate `curl -fsS http://127.0.0.1:3000/api/ready` only passes once
   web + Postgres + Redis + worker + email + webhook are all up.
4. Watch the workflow post or update one PR comment marked `<!-- daytona-pr-preview -->`.
5. Close the PR to run the delete path.

The enriched PR comment includes the App URL / Sandbox / Commit / auto-stop 30m /
auto-delete on PR close or 24h, the seeded demo (Acme Logistics, reviewer@example.com,
Starter), a per-service health summary gated by `/api/ready`, a numbered "Try it"
checklist, and a copy-paste webhook `curl` example using `x-demo-signature`.

Reviewer "Try it" flow: open the URL, click **Upgrade to Pro**, watch the worker
timeline, confirm the preview email, click **Replay billing webhook**, close the PR to
delete the sandbox.

## Security Model

The workflow uses `pull_request_target` so it can comment on PRs, but it checks out the
trusted base branch before running the helper. PR code is cloned only inside the Daytona
sandbox. Fork previews are skipped unless `DAYTONA_PREVIEW_ALLOW_FORKS=true`.

The helper does not forward the full runner environment. It always sends metadata such
as repository, PR number, SHA, branch, `PORT`, and `DAYTONA_PREVIEW=true`. Additional
values must come from `DAYTONA_PREVIEW_ENV_ALLOWLIST` or `DAYTONA_PREVIEW_ENV_JSON`.
Names containing `SECRET`, `TOKEN`, `KEY`, `PASSWORD`, `PASS`, `CREDENTIAL`, `PRIVATE`,
or `AUTH` are skipped unless `DAYTONA_PREVIEW_ALLOW_SECRET_NAMES=true`.

Non-goals, by design: no real Stripe, no real email delivery, no production secrets,
reviewers never run local Docker, the seeded data is deterministic, and this demo does
not replace Daytona with a hyperscaler deployment.

## When To Use Daytona First

This is **not for tiny UI changes**. For a CSS tweak, `npm run dev` is the right tool.
Use Daytona-backed full-stack previews when the thing being reviewed only makes sense as
a complete, online, disposable integration environment: a real database, an async
worker, a public webhook callback, seeded review data, and one shareable URL for
non-developer reviewers.

Build directly on AWS, GCP, or Azure primitives instead when the preview must validate
production networking, cloud IAM, managed-service topology, private access controls, or
compliance boundaries from day one.

See [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) and
[IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) for the full checklist and build
details, and [docs/full-demo-walkthrough.md](docs/full-demo-walkthrough.md) for the
end-to-end script.

> For a CSS tweak, use `npm run dev`. For branch-level integration review, use Daytona.
