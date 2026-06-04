# Implementation Notes: Billing Operations Preview

Engineering notes, decisions, and constraints behind the full-stack
**Billing Operations Preview** demo — a Next.js app on `0.0.0.0:3000` backed by real
PostgreSQL, real Redis (BullMQ), and a standalone Node worker, with in-database email
capture and a fake-signature webhook receiver.

Headline framing for this work:

> When localhost is not enough: full-stack PR previews with Daytona

> Localhost is good for coding. Shared staging is good for final confidence. Daytona is
> good for disposable branch-level integration review.

> This is NOT for tiny UI changes. This is for full-stack branch review when localhost
> and shared staging are the wrong tools.

> For a CSS tweak, use `npm run dev`. For branch-level integration review, use Daytona.

---

## Engineering Notes (hard constraints)

- **No `.env` / API key leak.** Keep `.env` ignored. Never commit the Daytona API key
  or any secret. The GitHub Action passes secrets through an explicit env allowlist only.
- **Deterministic, seeded data.** Prefer clear seeded data over random generation. The
  seed is fixed: Organization "Acme Logistics", user reviewer@example.com, starting plan
  "Starter", requested plan "Pro". `POST /api/demo/reset` restores this state so every
  reviewer sees the same starting point.
- **Keep startup reasonable.** The full-stack start path
  (`scripts/start-fullstack-preview.mjs`) provisions services, migrates, seeds, starts
  the worker, and starts Next. Native apt provisioning of Postgres + Redis is fast
  (~11s, verified) so the readiness gate flips quickly.
- **Maintain the GitHub Action safety model.** The existing GitHub Action and Python
  helper (`src/daytona/pr_preview.py`) are **not** rewritten — the switch to full-stack
  is driven entirely by repo variables. The safety model is preserved:
  - trusted base-branch helper code
  - fork previews disabled by default
  - explicit env allowlist
  - PR close cleanup (plus auto-stop 30m, auto-delete on PR close or 24h)

---

## Non-Goals

This demo deliberately does **not**:

- integrate production Stripe (no real Stripe)
- send real email (in-database capture only)
- use production secrets
- require reviewers to run local Docker (reviewers only click the preview URL)
- build a large fake enterprise app
- turn the app into a generic marketing landing page
- make the demo about tiny UI changes
- replace Daytona with a hyperscaler deployment

Data is deterministic and seeded; the goal is branch-level integration review, not a
production environment.

---

## Architecture Decision: real Postgres + Redis everywhere, two provisioning paths

The app speaks the same contract everywhere — `DATABASE_URL` and `REDIS_URL` — and the
**app code is identical** in Daytona and locally. Only the way the services get
provisioned differs.

**Local (developer machine): Docker Compose.**
`npm run preview:local` runs `docker compose -f docker-compose.preview.yml up --build`,
bringing up real Postgres 17 + Redis as containers. This is the high-fidelity local
path.

**Daytona sandbox: native apt provisioning (no Docker).**
The `daytona-medium` snapshot has **no Docker**, but it has **passwordless sudo + apt**.
So `scripts/daytona-setup.sh` installs **real** Postgres + Redis **natively** via apt,
then runs `npm ci`. `npm run preview:daytona`
(`scripts/start-fullstack-preview.mjs`) then provisions the native services, runs
migrations, seeds, starts the worker, and starts Next on `0.0.0.0:3000`.

Verified facts about the `daytona-medium` snapshot:

- OS: **Debian 13**
- Node: **Node 25**
- **passwordless sudo + apt** available; no Docker
- **Postgres 17 + Redis 8** install in **~11s** via apt
- services run as the **non-root user**

This is itself a teaching point: **Daytona gives reviewers the full stack with no local
Docker setup.** Either way the same `DATABASE_URL` / `REDIS_URL` contract is honored, so
there is no app-code divergence between the two paths.

Config lives in `lib/config.mjs`; the data layer in `lib/db.mjs` + `lib/schema.sql`; the
queue in `lib/queue.mjs`; the worker in `worker/index.mjs` (shared logic in
`lib/worker-core.mjs`); seeds in `lib/seed.mjs` via `scripts/db-seed.mjs` /
`scripts/db-migrate.mjs`.

---

## Webhook Fake-Signature Note

The webhook receiver `POST /api/webhooks/billing` validates a **fake** HMAC-SHA256
header named `x-demo-signature` (`lib/webhook.mjs`). An invalid signature returns
**401**; a valid one stores the event.

This signature is **documented as fake** — it mimics the shape of a real Stripe/GitHub
style signature check so reviewers can see signature validation working, but it is **not
a real provider secret** and there is **no real Stripe integration**.

`POST /api/webhooks/billing/replay` (the "Replay billing webhook" button) signs a sample
payload with the demo secret and calls the receiver, so reviewers can exercise the valid
path from the UI. The enriched PR comment also includes a copy-paste curl example using
`x-demo-signature` for the same flow from any terminal.

---

## Graceful-Degradation Note

`GET /api/health` **always returns HTTP 200**, with a body of
`{ ok, preview, pr, sha, ready, services:{ web, database, queue, worker, email, webhook } }`
where each service is `"ok"` or `"down"`. The app **renders even when Postgres/Redis are
down** — the UI shows the degraded state rather than crashing.

This is what lets `npm run verify` (lint + typecheck + build + preview:dry-run +
demo:customer) **still pass with no DB/Redis present**: the build and dry-run never
require live services. The strict gate is separate:

- `GET /api/ready` returns **200 only when all services are ready**, else **503**. This
  is the Daytona readiness gate
  (`DAYTONA_PREVIEW_READY_COMMAND=curl -fsS http://127.0.0.1:3000/api/ready`).
- `npm run verify:fullstack` (`scripts/verify-fullstack.mjs`) brings up real pg+redis,
  drives the upgrade + webhook flow, and asserts.
- `npm run verify:all` runs both gates.

So `/api/health` is informational and lenient (for the UI and the enriched PR comment),
while `/api/ready` is the strict gate that controls when Daytona considers the preview
usable.
