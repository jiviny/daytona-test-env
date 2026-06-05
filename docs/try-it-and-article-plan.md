# Try It And Article Plan

This repo has graduated from a thin UI PR preview into the full-stack **Billing Operations
Preview** demo: a Next.js app on `0.0.0.0:3000` backed by **real** PostgreSQL 17, **real**
Redis (BullMQ), a standalone Node worker, in-database email capture, and a webhook receiver
that validates a fake HMAC-SHA256 `x-demo-signature` header.

## Current Status

- Base verification still passes with `npm run verify`
  (`lint + typecheck + build + preview:dry-run + demo:customer`). The app degrades
  gracefully when Postgres/Redis are absent, so the cheap inner loop stays cheap.
- Full-stack verification runs with `npm run verify:fullstack`
  (`node scripts/verify-fullstack.mjs`): it brings up real Postgres + Redis, drives the
  end-to-end upgrade + webhook flow, and asserts the outcomes. `npm run verify:all` runs
  both (`verify + verify:fullstack`).
- Real services run **two ways with identical app code**:
  - **Daytona** (live path): `daytona-medium` (Debian 13, Node 25) has no Docker but has
    passwordless sudo + apt, so the start script installs **native Postgres + Redis via
    apt** (verified: ~11s, runs as the non-root user).
  - **Local high-fidelity**: `npm run preview:local`
    (`docker compose -f docker-compose.preview.yml up --build`) brings up real Postgres +
    Redis via Docker.
  - Either way the app speaks the same `DATABASE_URL` / `REDIS_URL` contract.
- The GitHub Action and Python helper are **unchanged**; the switch to full-stack is driven
  entirely by repo variables (below). Live target repo:
  `github.com/jiviny/daytona-test-env`.

## How To View The Demo

Run the real full stack locally (real Postgres + Redis via Docker):

```bash
npm run preview:local
```

Open:

```text
http://127.0.0.1:3000
```

Check health and readiness:

```bash
curl -fsS http://127.0.0.1:3000/api/health   # always 200; per-service ok/down for all six services
curl -fsS http://127.0.0.1:3000/api/ready    # 200 only when all six services ready, else 503
```

Then drive the reviewed workflow (Acme Logistics upgrades Starter -> Pro):

```text
1. Trigger the upgrade: click "Upgrade to Pro".
   POST /api/billing/upgrade records the change in Postgres and enqueues the job in Redis.
2. Watch the worker: the dashboard polls /api/state; the timeline (/api/events) advances as
   the Node worker pulls the job (Pro -> priority provisioning), writes audit events, and
   flips the subscription to "provisioned".
3. View the email: a confirmation email to reviewer@example.com is captured in Postgres and
   rendered in the UI. No real email is sent.
4. Replay the webhook: click "Replay billing webhook".
   POST /api/webhooks/billing/replay signs a sample payload and calls the receiver;
   POST /api/webhooks/billing validates x-demo-signature (401 on invalid) and stores it.
5. Reset: "Reset seeded data" -> POST /api/demo/reset returns to the deterministic start.
```

Seeded data is deterministic: Organization **Acme Logistics**, user
**reviewer@example.com**, starting plan **Starter**, requested plan **Pro**.

The GitHub workflow file is unchanged:

```text
.github/workflows/daytona-pr-preview.yml
```

## The Behavior Change Under Review

The reviewed PR is **not** a copy tweak. It changes real behavior:

```text
Pro plans get priority provisioning.
```

On this branch, a Pro upgrade enqueues its provisioning job at higher BullMQ priority so it
jumps the worker queue. You confirm this by watching the worker actually process the job and
advance the timeline — which is why it needs a running DB, queue, and worker, not a
screenshot.

## How To Try The Full GitHub PR Preview (live)

The full-stack switch is driven by repo variables on `github.com/jiviny/daytona-test-env`
(the Action and helper are not rewritten):

```text
DAYTONA_PREVIEW_SETUP_COMMAND = bash scripts/daytona-setup.sh   # apt installs postgres+redis, then npm ci
DAYTONA_PREVIEW_START_COMMAND = npm run preview:daytona          # node scripts/start-fullstack-preview.mjs
DAYTONA_PREVIEW_READY_COMMAND = curl -fsS http://127.0.0.1:3000/api/ready
DAYTONA_PREVIEW_PORT          = 3000
DAYTONA_PREVIEW_FULLSTACK     = true   # enables the enriched PR comment

# existing, unchanged
DAYTONA_TARGET             = us
DAYTONA_PREVIEW_SNAPSHOT   = daytona-medium
# secret DAYTONA_API_KEY already set
```

Steps:

1. Ensure the repo variables above are set and `Read and write permissions` is enabled.
2. Push a branch whose change is a real behavior change (Pro -> priority provisioning), not
   copy.
3. Open a same-repository pull request.
4. Watch `Daytona PR Preview` run: it runs the setup command (apt + `npm ci`), runs
   `npm run preview:daytona` (native pg+redis, migrate, seed, worker, Next on
   `0.0.0.0:3000`), and waits on `/api/ready`.
5. Open the enriched PR comment and the signed app URL.
6. Confirm `/api/ready` is `200` and the health panel shows **all six services OK**:
   Web / Postgres / Redis / Worker / Webhook receiver / Email capture.
7. Trigger "Upgrade to Pro" and watch the **worker timeline** advance.
8. Confirm the **captured preview email** to reviewer@example.com.
9. Click "Replay billing webhook" and confirm the **webhook event** appears.
10. Close the PR and confirm the sandbox is deleted.

### Enriched PR comment expectation (target format)

```text
## Daytona full-stack preview
- App URL / Sandbox / Commit / Auto-stop 30m / Auto-delete PR close or 24h

Seeded demo: Organization Acme Logistics, User reviewer@example.com, Starting plan Starter

Health: Web / Postgres / Redis / Worker / Webhook receiver / Email capture  (gated by /api/ready)

Try it:
1. Open the app URL.
2. Click "Upgrade to Pro".
3. Watch the worker timeline.
4. Confirm the preview email.
5. Click "Replay billing webhook".
6. Close the PR to delete this sandbox.
```

Plus a copy-paste webhook curl example using `x-demo-signature`.

## Article Angle

Working title:

```text
When localhost is not enough: full-stack PR previews with Daytona
```

Thesis:

```text
Localhost is good for coding. Shared staging is good for final confidence. Daytona is good
for disposable branch-level integration review. This is NOT for tiny UI changes — it is for
full-stack branch review when localhost and shared staging are the wrong tools.
```

Recommended structure:

1. The objection: "Why not just `npm run dev`?" — and why it is right for small changes.
2. The change that breaks that answer: a PR where Pro plans get priority provisioning. You
   cannot review it from a screenshot; it needs a DB, a queue, and a worker actually
   running.
3. The full stack: Next.js + real Postgres 17 + real Redis (BullMQ) + a Node worker +
   in-database email capture + a webhook receiver validating a fake HMAC-SHA256
   `x-demo-signature`.
4. The teaching point: `daytona-medium` has no Docker but has passwordless sudo + apt, so
   Daytona provisions native Postgres + Redis (~11s) and reviewers get the full stack with
   **no local Docker setup**. Locally, the same real services run via Docker Compose with
   identical app code.
5. The reviewed workflow as the demo: Acme Logistics upgrades Starter -> Pro; Postgres
   records it, Redis queues it, the worker provisions it, an email is captured, the timeline
   updates live, a webhook is replayed.
6. The PR comment as the reviewer handoff: seeded demo, all-green health (gated by
   `/api/ready`), a six-step "Try it", and a copy-paste webhook curl.
7. The boundaries (non-goals): no real Stripe, no real email delivery, no production
   secrets, reviewers never run local Docker, deterministic seeded data, and do not replace
   Daytona with a hyperscaler.

Best closing line:

```text
For a CSS tweak, use npm run dev. For branch-level integration review, use Daytona.
```

## Screenshots To Capture

- **Health all-green**: `/api/health` (or the dashboard health panel) showing all six
  services — Web / Postgres / Redis / Worker / Webhook receiver / Email capture — `ok`.
- **Worker timeline**: the timeline advancing after "Upgrade to Pro" (queued -> active ->
  provisioned).
- **Captured email**: the confirmation email to reviewer@example.com rendered in the UI.
- **Enriched PR comment**: the full-stack preview comment on the GitHub PR.

## Demo Script

Short talk track:

```text
This is not a UI preview. The PR changes a billing workflow: when a customer upgrades to
Pro, the change is recorded in Postgres, a provisioning job is enqueued in Redis at priority,
a worker processes it and flips the subscription to provisioned, a confirmation email is
captured, and a billing webhook can be replayed. To review this on localhost you would need
to run Postgres, Redis, and a worker yourself. On shared staging this branch would fight
every other branch for the same database. Daytona gives this PR its own disposable
integration environment — real Postgres and Redis installed natively, the worker running,
seeded Acme Logistics data — behind one URL in the PR comment. The reviewer never installs
Docker. When the PR closes, the whole stack is deleted.

For a CSS tweak, use npm run dev. For branch-level integration review, use Daytona.
```

## Best Next Step

Open one same-repository PR on `github.com/jiviny/daytona-test-env` with the
priority-provisioning change, confirm the enriched comment shows all six services OK and the
upgrade/worker/email/webhook flow works in the preview, then capture the four screenshots
above for the article.
