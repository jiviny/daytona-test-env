# Full Demo Walkthrough

## When localhost is not enough: full-stack PR previews with Daytona

This walkthrough drives the **Billing Operations Preview** demo end to end. The app is a
Next.js app on `0.0.0.0:3000` backed by **real services**:

```text
Next.js app (UI + API routes)
  -> PostgreSQL 17        (persisted customer / subscription / job / event / email / webhook data)
  -> Redis                (BullMQ queue backend)
  -> Node worker process  (worker/index.mjs, processes provisioning jobs)
  -> in-database email    (captured, never delivered)
  -> webhook receiver      (validates a fake HMAC-SHA256 x-demo-signature header)
```

This is **not** a UI preview. It is a full-stack branch review. State the framing up front:

```text
Localhost is good for coding.
Shared staging is good for final confidence.
Daytona is good for disposable branch-level integration review.
```

And the boundary, explicitly:

```text
This is NOT for tiny UI changes. This is for full-stack branch review when localhost and
shared staging are the wrong tools.
```

## The change being reviewed

The PR does not edit copy. It changes a **real behavior**:

```text
Pro plans get priority provisioning.
```

Before the change, every provisioning job runs at normal priority. On this branch, when a
customer upgrades to **Pro**, the upgrade API enqueues the provisioning job at higher
BullMQ priority so Pro upgrades jump the worker queue. A reviewer cannot confirm this from
a screenshot. They have to watch the worker actually pull the job, write audit events, flip
the subscription, and emit a confirmation email. That is exactly the kind of change that
needs a running database, a running queue, and a running worker — not a screenshot.

## The reviewed workflow (the demo story)

Acme Logistics upgrades from **Starter** to **Pro**:

```text
1. UI POSTs /api/billing/upgrade.
2. The API records the subscription change in Postgres and enqueues a provisioning job in Redis.
3. The Node worker pulls the job (Pro -> higher priority), writes audit events, flips the
   subscription to "provisioned", and captures a confirmation email in the database.
4. The dashboard timeline updates live (it polls /api/state).
5. A billing webhook can be replayed and is recorded.
```

Seeded data is deterministic:

```text
Organization:   Acme Logistics
User:           reviewer@example.com
Starting plan:  Starter
Requested plan: Pro
```

## What "done" looks like (expected outcomes)

These are real, observable state changes — not copy:

- **Postgres**: the `subscriptions` row for Acme Logistics moves from `Starter` to a `Pro`
  subscription with status `provisioned`; a `provisioning_jobs` row transitions
  `queued -> active -> completed`; new `audit_events` rows appear.
- **Worker timeline**: `/api/events` / the dashboard timeline advances as the worker
  processes the job (enqueued, picked up, provisioning, provisioned).
- **Captured preview email**: a confirmation email to `reviewer@example.com` is stored in
  the database and rendered in the UI. No real email is ever sent.
- **Replayed webhook**: a signed billing event is accepted and stored, and shows up in the
  timeline. Invalid signatures are rejected.
- **Health**: `/api/health` reports all six services `ok`; `/api/ready` returns `200`.

## Prerequisites

- Node.js and npm.
- Python 3 (the existing GitHub Action / Daytona helper is unchanged).
- For the live path: a GitHub repo with Actions enabled and `Read and write permissions`.
- For high-fidelity local runs: Docker (only for `npm run preview:local`; reviewers on the
  live Daytona path never need Docker).

## Step 1: Prove the app still verifies locally

The base verification is **unchanged** and still passes even with no DB/Redis present —
the app degrades gracefully:

```bash
npm install
npm run verify
```

`npm run verify` runs `lint + typecheck + build + preview:dry-run + demo:customer`. It does
**not** require Postgres or Redis. This keeps the cheap inner loop cheap.

## Step 2: Run the real full stack locally (Docker, high fidelity)

To exercise the same real Postgres + Redis the reviewer will see in Daytona:

```bash
npm run preview:local
```

This runs `docker compose -f docker-compose.preview.yml up --build`, bringing up real
Postgres + Redis via Docker and starting the app and worker. The app speaks the same
`DATABASE_URL` / `REDIS_URL` contract as Daytona — **app code is identical**.

Open:

```text
http://127.0.0.1:3000
```

Check health and readiness:

```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/ready
```

`/api/health` always returns `200` with per-service status:

```json
{
  "ok": true,
  "preview": true,
  "pr": "1",
  "sha": "...",
  "ready": true,
  "services": {
    "web": "ok",
    "database": "ok",
    "queue": "ok",
    "worker": "ok",
    "email": "ok",
    "webhook": "ok"
  }
}
```

`/api/ready` returns `200` only when **all six** services are ready, otherwise `503`. This
is the gate Daytona uses to decide the preview is actually usable.

## Step 3: Drive the upgrade + webhook flow end to end

You can do this from the UI, or assert it automatically:

```bash
npm run verify:fullstack
```

`verify:fullstack` runs `node scripts/verify-fullstack.mjs`: it brings up Postgres + Redis,
drives the end-to-end upgrade + webhook flow, and asserts the outcomes (DB state changes,
worker timeline advances, email captured, webhook stored). Run everything with:

```bash
npm run verify:all
```

which is `verify + verify:fullstack`.

From the UI on `http://127.0.0.1:3000`:

```text
1. Confirm: Acme Logistics is on Starter, provisioning idle, no email, all services healthy.
2. Click "Upgrade to Pro".
   -> POST /api/billing/upgrade records the change in Postgres and enqueues the job in Redis.
3. Watch the worker timeline advance live (the dashboard polls /api/state).
   -> worker pulls the Pro job at priority, writes audit events, flips to "provisioned".
4. Confirm the captured confirmation email to reviewer@example.com appears in the UI.
5. Click "Replay billing webhook".
   -> POST /api/webhooks/billing/replay signs a sample payload and calls the receiver;
      POST /api/webhooks/billing validates x-demo-signature and stores the event.
6. Use "Reset seeded data" (POST /api/demo/reset) to return to the starting state.
```

To replay the webhook from any terminal:

```bash
curl -X POST "http://127.0.0.1:3000/api/webhooks/billing" \
  -H "content-type: application/json" \
  -H "x-demo-signature: <hmac-sha256>" \
  -d '{"type":"invoice.paid","customer":"acme-logistics"}'
```

An invalid or missing `x-demo-signature` returns `401`.

## Step 4: The live GitHub PR path

The live story is the point: a reviewer opens **one URL** and validates the whole stack —
no local Docker, no shared staging.

The switch from the thin UI preview to the full stack is driven by **repo variables** on
`github.com/jiviny/daytona-test-env`; the existing GitHub Action and Python helper are
**not** rewritten:

```text
DAYTONA_PREVIEW_SETUP_COMMAND = bash scripts/daytona-setup.sh   # apt installs postgres+redis, then npm ci
DAYTONA_PREVIEW_START_COMMAND = npm run preview:daytona
DAYTONA_PREVIEW_READY_COMMAND = curl -fsS http://127.0.0.1:3000/api/ready
DAYTONA_PREVIEW_PORT          = 3000
DAYTONA_PREVIEW_FULLSTACK     = true   # enables the enriched PR comment

# existing, unchanged
DAYTONA_TARGET             = us
DAYTONA_PREVIEW_SNAPSHOT   = daytona-medium
# secret DAYTONA_API_KEY already set
```

### Why no Docker in Daytona

The `daytona-medium` snapshot (Debian 13, Node 25) has **no Docker**, but it has
passwordless `sudo` + `apt`. So in Daytona the setup script provisions **real Postgres +
Redis natively via apt** (verified: installs in ~11s, runs as the non-root user), and
`npm run preview:daytona` (`node scripts/start-fullstack-preview.mjs`) provisions native
pg+redis, runs `db:migrate`, runs `db:seed`, starts the worker, and starts Next on
`0.0.0.0:3000`. Locally you get the same real services through Docker Compose. Either way
the app speaks the same `DATABASE_URL` / `REDIS_URL` contract — **this is the teaching
point: Daytona gives reviewers the full stack with no local Docker setup.**

### Open the PR and watch it provision

```text
Pull request -> Checks -> Daytona PR Preview
```

The workflow creates one deterministic sandbox for the PR, runs the setup command
(apt + `npm ci`), runs `npm run preview:daytona`, and waits on
`curl -fsS http://127.0.0.1:3000/api/ready` before posting the comment.

### The enriched PR comment (target format)

With `DAYTONA_PREVIEW_FULLSTACK=true`, the comment is enriched (env-gated):

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

### Validate in the preview

On the signed Daytona URL, run the same Step 3 flow: trigger the upgrade, watch the worker
timeline advance, confirm the captured email, replay the webhook. Confirm `/api/ready`
returns `200` (all six services `ok`).

## Step 5: Prove cleanup

Close the pull request. The same workflow runs the delete path, finds the sandbox by its
deterministic PR labels, and deletes it.

```text
"Cleanup is built into the PR lifecycle, so a full-stack preview — Postgres, Redis,
worker, and all — never becomes a permanent cloud resource."
```

## What to screenshot for the article

1. `/api/health` (or the dashboard health panel) showing **all six services green**.
2. The **worker timeline** advancing after "Upgrade to Pro".
3. The **captured preview email** to `reviewer@example.com` in the UI.
4. The **enriched PR comment** (full-stack preview format above).

## Non-goals (state these)

- No real Stripe.
- No real email delivery (emails are captured in the database only).
- No production secrets.
- Reviewers never run local Docker (Docker Compose is only the local high-fidelity option).
- Deterministic seeded data, not random data.
- Do not replace Daytona with a hyperscaler.

## Closing line

```text
For a CSS tweak, use npm run dev. For branch-level integration review, use Daytona.
```
