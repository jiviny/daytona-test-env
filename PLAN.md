# Plan: Full-Stack Daytona PR Preview Demo

## Purpose

This repo currently proves the mechanical PR preview loop:

```text
GitHub PR opens
  -> GitHub Action creates a Daytona sandbox
  -> PR branch is cloned into Daytona
  -> Next.js starts
  -> signed preview URL is posted as a PR comment
  -> PR close deletes the sandbox
```

That is useful infrastructure, but the current app is mostly a UI dashboard. A small UI
change does not strongly justify Daytona because a developer can run:

```bash
npm run dev
```

and see the change locally.

The demo needs to show a case where localhost is not enough, Docker Compose is annoying,
and a shared staging environment is too slow or fragile. The goal is to demonstrate the
moment where Daytona has immediate value:

```text
Use npm run dev for simple UI work.
Use Daytona when a pull request needs real services, public callbacks, seeded data,
background jobs, and a shareable review URL.
```

## Current Repo Context

Repo folder:

```text
daytona-sandbox-deployment-hack
```

GitHub repo currently used for the live demo:

```text
https://github.com/jiviny/daytona-test-env
```

Current working PR used for the proof:

```text
https://github.com/jiviny/daytona-test-env/pull/1
```

Current successful workflow run:

```text
https://github.com/jiviny/daytona-test-env/actions/runs/26917457458
```

Current Daytona preview URL from the PR comment:

```text
https://3000-nughzldlgvryhzgm.daytonaproxy01.net
```

Important existing files:

```text
.github/workflows/daytona-pr-preview.yml
scripts/daytona-pr-preview.py
src/daytona/pr_preview.py
app/
components/
docs/full-demo-walkthrough.md
docs/try-it-and-article-plan.md
article.md
README.md
workflow.md
```

The existing Daytona helper already supports:

- deterministic sandbox names per PR
- sandbox create/update/delete
- labels for finding matching PR sandboxes
- auto-stop and auto-delete settings
- signed preview URL for one port
- branch clone inside the sandbox
- setup, start, and readiness commands
- PR comment rendering
- safe env forwarding
- local `.env` loading

The existing GitHub workflow currently needs:

```text
Repository secret:
DAYTONA_API_KEY

Repository variables:
DAYTONA_TARGET=us
DAYTONA_PREVIEW_SNAPSHOT=daytona-medium

GitHub setting:
Settings -> Actions -> General -> Workflow permissions -> Read and write permissions
```

The current workflow was proven to create a real Daytona sandbox, run the branch, post a
PR comment, and expose a working signed preview URL.

## Problem To Solve

The demo should answer this objection:

```text
"Why would I use Daytona instead of npm run dev?"
```

The answer should be:

```text
"You would not use Daytona for a tiny local UI change. You use Daytona when the thing
being reviewed only makes sense as a complete, online, disposable integration
environment."
```

The stronger demo should show one PR that needs:

- a web frontend
- an API path
- a real database
- a background worker
- a queue
- seeded review data
- a public webhook/callback URL
- a preview-safe email inbox
- one shareable URL for non-developer reviewers
- automatic cleanup on PR close

This is the point where:

- `npm run dev` is too local
- manual Docker Compose is too much reviewer friction
- shared staging causes branch collisions and stale test data
- building preview infrastructure directly on AWS/GCP/Azure is overkill for v1

## Recommended Demo Concept

Build a full-stack "Billing Operations Preview" app.

The PR being reviewed changes this workflow:

```text
A customer upgrades from Starter to Pro.
The app records the upgrade in Postgres.
The API enqueues a provisioning job in Redis.
A worker processes the job.
The customer status changes to provisioned.
A preview email is captured in a local inbox.
A webhook endpoint records a simulated external billing event.
The reviewer sees the entire integration timeline update online.
```

This has immediate inherent value because it is not just UI. A reviewer can validate:

- persisted state
- async job processing
- webhook handling
- email generation
- end-to-end branch behavior
- service health
- cleanup

## Target Audience

The demo is for technical marketing, sales engineering, developer relations, and
technical buyers who already understand that local dev is easy for simple changes but
painful for integrated review flows.

The demo should be legible to:

- developers
- founders
- PMs
- QA engineers
- sales engineers
- platform engineers

Avoid making the demo feel niche. Billing/onboarding is a familiar business workflow
that most software teams understand.

## Core Message

The message should be explicit:

```text
Localhost is good for coding.
Shared staging is good for final confidence.
Daytona is good for disposable branch-level integration review.
```

The article/demo headline should be:

```text
When localhost is not enough: full-stack PR previews with Daytona
```

Alternate headline:

```text
Preview environments without building a preview platform
```

Recommended final line:

```text
Use Daytona when the job is branch review. Use the hyperscaler directly when the job is
validating production infrastructure.
```

## Why This Is Better Than The Current Demo

The current demo:

- proves Daytona can run a Next.js branch
- posts a preview URL
- cleans up the sandbox
- but can be dismissed as "I could just run npm run dev"

The new demo:

- requires online access
- uses several services
- demonstrates seeded data
- proves background work
- proves webhooks/callbacks
- creates a reviewer-friendly PR comment
- gives non-dev stakeholders a URL
- avoids shared staging collisions
- makes cleanup visibly valuable

## User Pain Points To Show

### 1. Localhost Cannot Receive External Callbacks

Third-party systems such as billing providers, GitHub apps, Slack apps, OAuth providers,
and webhook senders usually need a public HTTPS URL. Localhost does not give that by
default. Developers end up using tunnels, rotating URLs, copied webhook secrets, and
manual reconfiguration.

Demo implication:

- The PR comment should include a Daytona public webhook URL.
- The app should show webhook events arriving in the preview environment.
- The reviewer should not need ngrok or local tunnel setup.

### 2. Docker Compose Is Useful But Painful For Reviewers

Docker Compose can run Postgres, Redis, mail tools, workers, and the app locally. But it
is still a reviewer burden:

- install Docker
- pull images
- resolve port conflicts
- copy env files
- run migrations
- seed data
- debug stale volumes
- restart workers
- replay webhooks

Demo implication:

- The sandbox can run the full stack.
- The reviewer only clicks a URL.
- Docker or service setup may exist in the repo, but it is not something every reviewer
  has to configure.

### 3. Shared Staging Is A Bottleneck

Shared staging works until multiple PRs need review at once. Then teams hit:

- branches overwriting each other
- unclear data state
- long deploy queues
- unrelated broken changes
- hard rollback
- no clean per-PR cleanup

Demo implication:

- Each PR gets a deterministic Daytona sandbox name.
- Each sandbox gets its own seeded database.
- Closing the PR deletes that environment.

### 4. Non-Developer Reviewers Need A URL

PMs, QA, founders, sales engineers, and customer-facing reviewers should not have to
clone a branch, configure `.env`, install dependencies, run services, and replay events.

Demo implication:

- The PR comment should be the main handoff artifact.
- It should include:
  - app URL
  - demo login or seeded org
  - health summary
  - webhook test command or URL
  - cleanup policy

### 5. Cleanup Is The Cost-Control Feature

Creating previews is only half the story. The real operational value is that preview
environments do not become permanent cloud resources.

Demo implication:

- Show the PR close event.
- Show the delete workflow run.
- Show that the Daytona sandbox is destroyed.

## Proposed Architecture

### Services

Use a full-stack app with these components:

```text
Next.js app
  -> Postgres database
  -> Redis queue
  -> Node worker
  -> preview email inbox
  -> webhook receiver
```

Recommended service choices:

- Next.js for UI and API routes
- Postgres for persistent customer/subscription/event data
- Redis for queueing provisioning work
- a Node worker process for async jobs
- Mailpit or a lightweight Node email preview server for email capture
- a webhook API route for simulated Stripe/GitHub-style callback events

Important: do not integrate real Stripe, real email delivery, or real production
services. Use fake but realistic adapters so the demo is deterministic and safe.

### App Screens

Replace or extend the current dashboard into an actual operations workflow:

```text
Billing Operations Preview
```

The UI should show:

- current customer
- plan status
- subscription state
- provisioning state
- latest webhook events
- worker job timeline
- captured emails
- service health
- PR metadata from env vars
- "Trigger upgrade" button
- "Replay billing webhook" button
- "Reset seeded data" button

### Data Model

Minimum tables:

```text
customers
subscriptions
provisioning_jobs
webhook_events
emails
audit_events
```

Example seeded data:

```text
Customer: Acme Logistics
Current plan: Starter
Requested plan: Pro
User: reviewer@example.com
```

### Main Demo Flow

Reviewer opens Daytona URL and sees:

```text
Acme Logistics is on Starter.
Provisioning status is idle.
No upgrade email has been sent.
All services are healthy.
```

Reviewer clicks:

```text
Upgrade to Pro
```

Expected behavior:

```text
1. API writes subscription change to Postgres.
2. API enqueues provisioning job in Redis.
3. Worker picks up job.
4. Worker writes audit events to Postgres.
5. Worker records/sends preview email.
6. UI shows timeline updates.
```

Reviewer then clicks:

```text
Replay billing webhook
```

Expected behavior:

```text
1. App POSTs a simulated billing webhook to its own public Daytona URL or local API.
2. Webhook receiver validates fake signature.
3. Webhook event is stored in Postgres.
4. UI shows the event.
```

Stretch behavior:

```text
From any terminal, curl the Daytona webhook URL from the PR comment.
The event appears in the preview UI.
```

## Daytona Workflow Requirements

The existing workflow should continue to work, but it should start the full stack
instead of only running `npm run dev`.

Recommended repo variables for this demo:

```text
DAYTONA_TARGET=us
DAYTONA_PREVIEW_SNAPSHOT=daytona-medium
DAYTONA_PREVIEW_SETUP_COMMAND=npm ci
DAYTONA_PREVIEW_START_COMMAND=npm run preview:daytona
DAYTONA_PREVIEW_READY_COMMAND=curl -fsS http://127.0.0.1:3000/api/health
DAYTONA_PREVIEW_PORT=3000
```

Add scripts:

```json
{
  "preview:daytona": "node scripts/start-fullstack-preview.mjs",
  "preview:local": "docker compose -f docker-compose.preview.yml up",
  "db:migrate": "...",
  "db:seed": "...",
  "worker": "node worker/index.mjs",
  "verify:fullstack": "node scripts/verify-fullstack.mjs"
}
```

The exact implementation may differ, but the command contract should be:

```text
npm run preview:daytona
```

starts everything required for the reviewer URL.

## Multi-Port Decision

Keep the first version simple by exposing the main Next.js app on port `3000`.

Preferred MVP:

- show email events inside the Next.js UI
- show webhook URL inside the Next.js UI
- avoid exposing a separate Mailpit port at first

Optional stretch:

- extend `src/daytona/pr_preview.py` to support multiple signed ports:

```text
DAYTONA_PREVIEW_EXTRA_PORTS=8025,5432
```

and render extra links in the PR comment:

```text
App URL: ...
Email inbox URL: ...
```

Do not block the MVP on multi-port support.

## PR Comment Requirements

The PR comment should be upgraded from a generic preview link into a demo handoff.

Target comment:

```text
## Daytona full-stack preview

- App URL: https://...
- Sandbox: pr-preview-jiviny-daytona-test-env-pr-1
- Commit: ...
- Auto-stop: 30 minutes
- Auto-delete: PR close / 24 hours

Seeded demo:
- Organization: Acme Logistics
- User: reviewer@example.com
- Starting plan: Starter

Health:
- Web app: OK
- Postgres: OK
- Redis: OK
- Worker: OK
- Webhook receiver: OK
- Email capture: OK

Try it:
1. Open the app URL.
2. Click "Upgrade to Pro".
3. Watch the worker timeline.
4. Confirm the preview email appears.
5. Click "Replay billing webhook".
6. Close the PR to delete this sandbox.
```

## Implementation Plan

### Phase 1: Preserve The Working Daytona Baseline

Before changing behavior:

1. Read `workflow.md`.
2. Run:

```bash
npm run verify
python -m py_compile scripts/daytona-pr-preview.py src/daytona/pr_preview.py
```

3. Confirm current PR preview helper still works locally in dry-run mode.
4. Do not break the existing GitHub Action contract.

### Phase 2: Add Full-Stack Data Layer

Add a database layer with migrations and seed data.

Implementation options:

1. Preferred: Postgres in `docker-compose.preview.yml`.
2. Acceptable fallback only if Docker is unavailable in Daytona: a file-backed SQLite
   preview mode that preserves the same app behavior.

The stronger customer story is Postgres. Use SQLite only if Daytona sandbox Docker
support blocks progress.

Add:

```text
docker-compose.preview.yml
src/db/
scripts/db-migrate.mjs
scripts/db-seed.mjs
```

Keep the schema small and readable.

Acceptance criteria:

- clean database starts from scratch
- seed script creates Acme Logistics demo data
- health endpoint reports database status

### Phase 3: Add Queue And Worker

Add Redis and a worker process.

Preferred:

```text
Redis + BullMQ
```

Acceptable:

```text
Redis + simple polling worker
```

Add:

```text
worker/
src/queue/
```

Acceptance criteria:

- clicking "Upgrade to Pro" enqueues a job
- worker processes the job
- UI shows job state transitions
- health endpoint reports worker/queue status

### Phase 4: Add Preview Email Capture

Add a preview-safe email capture path.

MVP:

- store outbound emails in Postgres
- render them in the Next.js UI

Stretch:

- run Mailpit and link to it from the app or PR comment

Acceptance criteria:

- worker records an email after upgrade
- UI shows email subject/body/recipient
- no real email is sent

### Phase 5: Add Webhook Receiver

Add a webhook receiver route:

```text
POST /api/webhooks/billing
```

Use a fake but realistic signature:

```text
X-Demo-Signature
```

Add UI action:

```text
Replay billing webhook
```

Add displayed command:

```bash
curl -X POST "$DAYTONA_URL/api/webhooks/billing" \
  -H "content-type: application/json" \
  -H "x-demo-signature: ..." \
  -d '{"type":"invoice.paid","customer":"acme-logistics"}'
```

Acceptance criteria:

- webhook events persist
- invalid signatures are rejected
- valid events appear in the UI timeline

### Phase 6: Build Reviewer-Facing UI

The app should look like an operational preview console, not a marketing landing page.

Design goals:

- dense but readable
- service status visible
- PR metadata visible
- actions obvious
- timeline tells the story
- no giant decorative hero

Suggested layout:

```text
Left rail:
  Daytona preview
  PR number
  commit SHA
  sandbox lifecycle

Main:
  Customer card
  Plan status
  "Upgrade to Pro" action
  "Replay webhook" action

Right:
  service health
  preview email
  webhook URL

Bottom:
  event timeline
```

### Phase 7: Update Daytona Start Command

Create:

```text
scripts/start-fullstack-preview.mjs
```

It should:

1. start Postgres/Redis/email services if using Docker Compose
2. wait for services
3. run migrations
4. seed data
5. start worker
6. start Next.js on `0.0.0.0:3000`

The GitHub workflow should not need a large rewrite. Prefer changing repo variables or
defaults:

```text
DAYTONA_PREVIEW_START_COMMAND=npm run preview:daytona
```

### Phase 8: Upgrade Health Checks

`GET /api/health` should return:

```json
{
  "ok": true,
  "preview": true,
  "pr": "1",
  "sha": "...",
  "services": {
    "web": "ok",
    "database": "ok",
    "queue": "ok",
    "worker": "ok",
    "email": "ok"
  }
}
```

The Daytona readiness command should pass only when the integration preview is actually
usable.

### Phase 9: Upgrade Docs And Article

Update:

```text
README.md
article.md
docs/full-demo-walkthrough.md
docs/try-it-and-article-plan.md
```

The docs should explicitly say:

```text
This is not for tiny UI changes.
This is for full-stack branch review when localhost and shared staging are the wrong
tools.
```

### Phase 10: Validate In GitHub

Create a PR that changes real workflow behavior, not just copy.

Example:

```text
Change upgrade logic so Pro plans include priority provisioning.
```

Then prove:

1. workflow creates Daytona sandbox
2. PR comment appears
3. preview URL loads
4. `/api/health` reports all services OK
5. reviewer can trigger upgrade
6. worker processes job
7. email appears
8. webhook replay works
9. closing PR deletes sandbox

## Acceptance Criteria

The task is complete only when all of these are true:

- `npm run verify` passes.
- A new full-stack verification command passes.
- The app has meaningful data-backed behavior.
- The app uses a real or realistic database layer.
- The app uses a queue/worker path.
- The app has a preview-safe email path.
- The app has a webhook receiver.
- The PR comment tells reviewers exactly what to test.
- A GitHub PR creates a Daytona sandbox.
- The Daytona preview URL shows the branch behavior.
- The health endpoint confirms all services are ready.
- Closing the PR deletes the sandbox.
- Docs explain why this is better than localhost, Docker Compose, and shared staging for this use case.

## Non-Goals

Do not:

- integrate production Stripe
- send real email
- use production secrets
- require reviewers to run Docker locally
- build a large fake enterprise app
- turn this into a generic landing page
- make the demo about tiny UI changes
- replace Daytona with a hyperscaler deployment

## Suggested File Additions

Likely new files:

```text
docker-compose.preview.yml
scripts/start-fullstack-preview.mjs
scripts/verify-fullstack.mjs
scripts/db-migrate.mjs
scripts/db-seed.mjs
worker/index.mjs
src/db/client.ts
src/db/schema.sql
src/queue/client.ts
src/email/preview-email.ts
src/webhooks/signature.ts
app/api/demo/reset/route.ts
app/api/billing/upgrade/route.ts
app/api/webhooks/billing/route.ts
app/api/events/route.ts
```

Likely modified files:

```text
components/PreviewDashboard.tsx
app/api/health/route.ts
package.json
README.md
article.md
docs/full-demo-walkthrough.md
.github/workflows/daytona-pr-preview.yml
src/daytona/pr_preview.py
```

Only modify `src/daytona/pr_preview.py` if needed. The existing helper already works
for one app URL.

## Demo Script For The Finished Version

Say:

```text
This is not a UI preview. The PR changes a billing/onboarding workflow that touches a
database, a queue, a worker, email, and a webhook.
```

Show:

```text
1. Local setup would require multiple services.
2. Shared staging would make this PR fight with every other branch.
3. Daytona gives this PR its own disposable integration environment.
```

Then:

```text
1. Open the PR.
2. Open the Daytona comment.
3. Open the app URL.
4. Trigger the upgrade.
5. Watch DB-backed state and worker timeline update.
6. Show the preview email.
7. Replay the webhook.
8. Close the PR.
9. Show cleanup.
```

Close with:

```text
For a CSS tweak, use npm run dev. For branch-level integration review, use Daytona.
```

## Important Engineering Notes

- Do not leak `.env` or the Daytona API key.
- Keep `.env` ignored.
- Do not use production services.
- Keep the demo deterministic.
- Prefer clear seeded data over random generated data.
- Keep startup time reasonable.
- If Docker is used inside Daytona, verify it early before building too much around it.
- If Docker is not available in the chosen Daytona snapshot, switch to preview-safe
  embedded services but keep the story focused on full-stack integration behavior.
- Maintain the existing GitHub Action safety model:
  - trusted base-branch helper code
  - fork previews disabled by default
  - explicit env allowlist
  - PR close cleanup

## Implementation Handoff Instructions

The implementer should:

1. Read this `PLAN.md`.
2. Read `workflow.md`.
3. Read the current workflow/helper files:

```text
.github/workflows/daytona-pr-preview.yml
scripts/daytona-pr-preview.py
src/daytona/pr_preview.py
```

4. Preserve the existing successful PR preview behavior.
5. Implement the full-stack demo in focused phases.
6. Run local validation after each major phase.
7. Run a real GitHub PR preview before calling the work complete.
8. Update docs and article copy so the demo tells the correct story.

The final deliverable should be a repo where a technical reviewer can open a PR, click
one Daytona preview URL, and validate a realistic multi-service workflow without running
local Docker, touching shared staging, or deploying to a hyperscaler.
