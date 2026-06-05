# When localhost is not enough: full-stack PR previews with Daytona

There is a comfortable lie in most preview-environment pitches: that every pull request
needs a shareable URL. Many do not. A CSS tweak, a copy change, a single component
refactor — a reviewer can pull the branch, run `npm run dev`, and be confident in thirty
seconds. For that work, a preview platform is overhead.

This demo is about the other case. It is about the pull request that changes a workflow
spanning a database, a queue, a background worker, captured email, and an inbound
webhook — the kind of change where `npm run dev` shows you a button but not what happens
after you click it. For that change you need a real, online, disposable integration
environment. The thesis here is not "app-only previews need no platform." It is sharper:

> **Full-stack branch review needs an integration environment, but not a preview
> platform you build yourself.**

Daytona gives a reviewer the full stack behind one URL, with no local Docker and no
shared-staging queue, and deletes it when the PR closes. To borrow the framing that runs
through this whole demo:

> Localhost is good for coding. Shared staging is good for final confidence. Daytona is
> good for disposable branch-level integration review.

This is **not** for tiny UI changes. This is for full-stack branch review when localhost
and shared staging are the wrong tools.

## The stronger demo

The previous version of this repo was a UI dashboard. It proved the mechanical loop —
PR opens, sandbox spins up, signed URL is posted, PR close deletes the sandbox — but it
was easy to wave away. If all a reviewer sees is a rendered page, the honest objection
is: *I could just run `npm run dev`.* That objection is correct, and pretending
otherwise weakens the case for any preview tooling.

So the demo is now a real full-stack app: **Billing Operations Preview**, a Next.js app
on `0.0.0.0:3000` backed by services that actually run:

- **PostgreSQL** (real Postgres 17) holds customer, subscription, job, event, email, and
  webhook records.
- **Redis** (real) is the queue backend, driven by BullMQ.
- A **standalone Node worker process** (`worker/index.mjs`) consumes provisioning jobs.
- **Email is captured in the database** — no real message is ever sent.
- A **webhook receiver** validates a fake HMAC-SHA256 `x-demo-signature` header.

None of this is mocked at the seams that matter. The upgrade you click writes a row to
Postgres, enqueues a job in Redis, and the worker — a separate process, not an
in-request `setTimeout` — picks it up and flips state. That is the difference between a
demo you can dismiss and one you can review. `npm run dev` on a teammate's laptop will
happily render the dashboard; it will not, by itself, give a reviewer a running Postgres,
a running Redis, a running worker, and a publicly reachable webhook endpoint at the same
time. That is what makes this the stronger demo.

A genuinely useful detail lives in how the stack comes up. The Daytona sandbox snapshot
(`daytona-medium`, Debian 13, Node 25) has **no Docker** — but it has passwordless sudo
and apt. So inside Daytona the start script provisions real Postgres and Redis
**natively via apt** (it installs in about eleven seconds and runs as the non-root user).
Locally, a developer runs the same real Postgres and Redis through Docker Compose
(`docker-compose.preview.yml`). Either way the application speaks the identical
`DATABASE_URL` / `REDIS_URL` contract, and the app code is byte-for-byte the same. That
is itself the teaching point: **Daytona hands reviewers the full stack with no local
Docker setup at all.** The fidelity is real; the friction is gone.

## User pain points

The reason this workflow belongs in Daytona rather than on a laptop is not aesthetic. It
maps directly to five places where the usual options break down.

**Localhost cannot receive callbacks.** A billing provider, an OAuth handshake, a Slack
app, a GitHub app — they all need to reach *in* to a public HTTPS URL. Localhost does
not offer one. The usual workaround is a rotating tunnel, a copied signing secret, and a
reconfiguration dance every time the URL changes. The Daytona sandbox already has a
public signed URL, so the webhook receiver at `POST /api/webhooks/billing` is reachable
from anywhere without ngrok.

**Docker Compose is reviewer friction.** Compose can absolutely run Postgres, Redis, and
a worker locally — and we ship `docker-compose.preview.yml` precisely so developers can.
But asking a *reviewer* to install Docker, pull images, resolve port conflicts, copy env
files, run migrations, seed data, and restart a worker just to look at one PR is a tax
most reviewers will not pay. In Daytona the same stack comes up automatically and the
reviewer clicks a link.

**Shared staging collides.** A single shared staging environment works until two PRs
need review on the same afternoon. Then branches overwrite each other, the data state
becomes ambiguous, deploys queue up, and one broken change blocks every other review.
Each Daytona preview is its own sandbox with its own seeded database, so PRs never fight
over the same Postgres.

**Non-dev reviewers need a URL.** PMs, QA, founders, and sales engineers should not have
to clone a branch and configure `.env` to sign off on a billing flow. The PR comment is
the handoff artifact: app URL, seeded org, health summary, a copy-paste webhook command,
and the cleanup policy — everything a non-developer needs, and nothing they have to set
up.

**Cleanup is the cost-control feature.** Creating environments is the easy half. The
operationally valuable half is that they do not become permanent cloud spend. Closing
the PR deletes the sandbox (and an auto-stop and auto-delete window catch anything left
open). Cleanup is not a nice-to-have here; it is what makes per-PR previews affordable.

## What the demo contains

The reviewed workflow is deliberately ordinary so that any software team recognizes it:
**Acme Logistics upgrades from Starter to Pro.** The seed data is deterministic —
Organization "Acme Logistics", user `reviewer@example.com`, starting plan "Starter",
requested plan "Pro" — so every reviewer sees the same starting point.

Clicking **Upgrade to Pro** sets off a chain that crosses every service:

1. `POST /api/billing/upgrade` records the upgrade in Postgres and enqueues a
   provisioning job in Redis.
2. The worker process pulls the job off the queue.
3. The worker writes audit events, flips the subscription to `provisioned`, and captures
   a confirmation email in the database.
4. The UI timeline updates live as the worker makes progress (the dashboard polls
   `/api/state`).
5. A billing webhook can be replayed to show inbound callback handling end to end.

The app exposes a small, exact API surface:

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Always HTTP 200; body reports `ok`, `preview`, `pr`, `sha`, `ready`, and a `services` map (`web`, `database`, `queue`, `worker`, `email`, `webhook`), each `ok` or `down`. |
| `GET /api/ready` | HTTP 200 when every service is ready, else 503. This is the Daytona readiness gate. |
| `GET /api/state` | Full UI state: customer, subscription/plan, provisioning, jobs, timeline events, emails, webhooks, health, PR metadata. |
| `GET /api/events` | Timeline events. |
| `POST /api/billing/upgrade` | Records the upgrade in Postgres and enqueues the provisioning job. |
| `POST /api/webhooks/billing` | Validates the `x-demo-signature` HMAC-SHA256 header; stores the event; returns 401 on an invalid signature. |
| `POST /api/webhooks/billing/replay` | Signs a sample payload and calls the receiver — the "Replay billing webhook" button. |
| `POST /api/demo/reset` | Resets the seeded demo data. |
| `POST /api/waitlist` | Unchanged JSON smoke endpoint, kept for backward compatibility. |

The supporting code is small and readable: `lib/{config,db,seed,queue,email,webhook,health,worker-core}.mjs`
and `lib/schema.sql` for the data and service layer; `worker/index.mjs` for the worker;
`scripts/{db-migrate,db-seed,start-fullstack-preview,verify-fullstack}.mjs` and
`scripts/daytona-setup.sh` for orchestration; and a rewritten
`components/PreviewDashboard.tsx` that renders the live ops console.

Two honesty notes, stated plainly because the demo's credibility depends on them. The
`x-demo-signature` HMAC is a **fake** signature scheme — it is real HMAC-SHA256 over the
payload so the 401-on-invalid path is genuine, but it is not Stripe's signing scheme and
there is no real Stripe integration. And email is **captured in the database** and
rendered in the UI; no message ever leaves the sandbox. There are no production secrets
and no real external services. The point is a faithful *shape* of a billing workflow, not
a connection to anyone's production billing system.

## Run it

For local development, the commands you already know are unchanged: `npm run dev`,
`build`, `start`, `lint`, `typecheck`. The baseline check also still passes on its own:

```bash
npm run verify
```

`verify` runs lint, typecheck, build, the preview dry-run, and the customer demo. It
keeps passing even with no database or Redis present, because the app degrades
gracefully when those services are absent — the health endpoint simply reports them
`down`.

To run the **real** full stack locally via Docker:

```bash
npm run preview:local   # docker compose -f docker-compose.preview.yml up --build
```

To run it the way Daytona does — native Postgres and Redis, no Docker:

```bash
npm run preview:daytona # node scripts/start-fullstack-preview.mjs
```

That script provisions native Postgres and Redis, runs migrations (`npm run db:migrate`),
seeds the Acme data (`npm run db:seed`), starts the worker (`npm run worker`, i.e.
`node worker/index.mjs`), and starts Next.js on `0.0.0.0:3000`.

To prove the whole flow end to end:

```bash
npm run verify:fullstack # node scripts/verify-fullstack.mjs
npm run verify:all       # verify + verify:fullstack
```

`verify:fullstack` brings up Postgres and Redis, drives the upgrade-and-webhook flow, and
asserts on the result. `verify:all` runs both the unchanged baseline check and the
full-stack check.

## A reviewer walkthrough

This is what the PR comment tells a reviewer to do, and it is the entire point of the
demo:

1. **Open the app URL** from the PR comment. Acme Logistics is on Starter, provisioning
   is idle, no email has been sent, and the health panel shows Web, Postgres, Redis,
   Worker, Webhook receiver, and Email capture all green (the URL only goes live once
   `/api/ready` returns 200).
2. **Click "Upgrade to Pro."** The API records the change in Postgres and enqueues a
   provisioning job in Redis.
3. **Watch the worker timeline.** The separate worker process picks up the job, writes
   audit events, and flips the subscription to `provisioned`. The timeline updates live
   as `/api/state` is polled — you are watching a real background process, not an
   animation.
4. **Confirm the preview email.** A confirmation email is captured in the database and
   rendered in the UI, recipient and subject and body. Nothing is actually sent.
5. **Click "Replay billing webhook."** The app signs a sample payload and POSTs it to its
   own receiver, which validates the `x-demo-signature` HMAC and stores the event. You can
   do the same thing from any terminal against the public sandbox URL:

   ```bash
   curl -X POST "$DAYTONA_URL/api/webhooks/billing" \
     -H "content-type: application/json" \
     -H "x-demo-signature: <hmac-sha256-of-body>" \
     -d '{"type":"invoice.paid","customer":"acme-logistics"}'
   ```

   An invalid or missing signature returns 401; a valid event appears in the timeline.
6. **Close the PR to delete the sandbox.** Cleanup is automatic — and visible.

## Going live

The switch from the old UI-only preview to this full-stack one is driven entirely by
**repo variables** on `github.com/jiviny/daytona-test-env`. The existing GitHub Action
and Python helper are **not** rewritten; they already know how to create one sandbox,
clone the branch, expose one port, post a comment, and delete on close. The full stack
rides the same machinery:

```text
DAYTONA_PREVIEW_SETUP_COMMAND = bash scripts/daytona-setup.sh   # apt installs postgres+redis, then npm ci
DAYTONA_PREVIEW_START_COMMAND = npm run preview:daytona
DAYTONA_PREVIEW_READY_COMMAND = curl -fsS http://127.0.0.1:3000/api/ready
DAYTONA_PREVIEW_PORT          = 3000
DAYTONA_PREVIEW_FULLSTACK     = true            # enables the enriched PR comment
DAYTONA_TARGET                = us              # existing
DAYTONA_PREVIEW_SNAPSHOT      = daytona-medium  # existing
# secret DAYTONA_API_KEY already set
```

With `DAYTONA_PREVIEW_FULLSTACK=true`, the PR comment becomes the reviewer handoff:

```text
## Daytona full-stack preview
- App URL / Sandbox / Commit / Auto-stop 30m / Auto-delete PR close or 24h

Seeded demo: Organization Acme Logistics, User reviewer@example.com, Starting plan Starter

Health: Web / Postgres / Redis / Worker / Webhook receiver / Email capture  (gated by /api/ready)

Try it:
1. Open the URL.
2. Click "Upgrade to Pro".
3. Watch the worker timeline.
4. Confirm the preview email.
5. Click "Replay billing webhook".
6. Close the PR to delete the sandbox.
```

The comment also includes a copy-paste webhook `curl` example using `x-demo-signature`,
so a reviewer can exercise the inbound callback from their own terminal.

## Where this stops

Be clear about the boundary, because overclaiming is how preview tools lose trust. This
demo deliberately does **not** integrate real Stripe, send real email, or use production
secrets. Reviewers never run local Docker. The seed data is deterministic. And it does
not try to replace Daytona with a hyperscaler — when the job is validating exact
production networking, IAM, or compliance topology, that is a different tool. When the job
is branch-level integration review, this is the right one.

> For a CSS tweak, use `npm run dev`. For branch-level integration review, use Daytona.
