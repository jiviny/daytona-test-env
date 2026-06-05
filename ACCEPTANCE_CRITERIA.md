# Acceptance Criteria: Billing Operations Preview

This is the single checklist that defines "done" for the full-stack
**Billing Operations Preview** demo. It consolidates the 13 top-level acceptance
criteria from the project requirements with the per-phase criteria for phases 1-10.

Each item states how it is validated. The three validation surfaces are:

- `npm run verify` — lint + typecheck + build + preview:dry-run + demo:customer.
  Runs with **no** Postgres/Redis present and must still pass (the app degrades
  gracefully).
- `npm run verify:fullstack` — `node scripts/verify-fullstack.mjs` brings up real
  Postgres + Redis, drives the end-to-end upgrade + webhook flow, and asserts.
- The **live PR** on `github.com/jiviny/daytona-test-env` — opening a PR creates a
  Daytona sandbox, posts the enriched preview comment, and exposes the signed URL
  gated by `/api/ready`.

`npm run verify:all` runs `verify` then `verify:fullstack` and is the local
"everything" gate.

---

## Top-Level Acceptance Criteria (13)

The task is complete only when all of these are true.

- [ ] **`npm run verify` passes.**
  Validated by running `npm run verify`. It must pass with no DB/Redis running,
  proving the app still builds, typechecks, lints, dry-runs the preview, and runs
  `demo:customer` while degrading gracefully.
- [ ] **A new full-stack verification command passes.**
  Validated by `npm run verify:fullstack` (`scripts/verify-fullstack.mjs`), which
  brings up real Postgres + Redis and asserts the full flow end to end.
- [ ] **The app has meaningful data-backed behavior.**
  Validated by `npm run verify:fullstack` asserting that `POST /api/billing/upgrade`
  persists to Postgres and `GET /api/state` reflects the change; confirmed live via
  the PR preview URL.
- [ ] **The app uses a real or realistic database layer.**
  Validated by real Postgres 17 (native apt in Daytona, Docker Compose locally) via
  `lib/db.mjs`, `lib/schema.sql`, `npm run db:migrate`, `npm run db:seed`.
  `/api/health` reports `services.database`.
- [ ] **The app uses a queue/worker path.**
  Validated by Redis + BullMQ (`lib/queue.mjs`) plus the standalone worker
  (`npm run worker` -> `node worker/index.mjs`). `verify:fullstack` asserts a job is
  enqueued on upgrade and processed by the worker.
- [ ] **The app has a preview-safe email path.**
  Validated by in-database email capture (`lib/email.mjs`); the worker writes a
  confirmation email row, surfaced in `/api/state`. No real email is ever sent.
- [ ] **The app has a webhook receiver.**
  Validated by `POST /api/webhooks/billing` validating the `x-demo-signature`
  HMAC-SHA256 header (401 on invalid signature). `verify:fullstack` posts both a
  valid and an invalid signature and asserts the responses.
- [ ] **The PR comment tells reviewers exactly what to test.**
  Validated on the live PR: the enriched comment (gated by
  `DAYTONA_PREVIEW_FULLSTACK=true`) lists App URL / Sandbox / Commit / Auto-stop /
  Auto-delete, seeded demo data, the health summary, the 6-step "Try it" list, and a
  copy-paste `x-demo-signature` webhook curl example.
- [ ] **A GitHub PR creates a Daytona sandbox.**
  Validated on the live PR: the existing GitHub Action + Python helper create the
  sandbox driven by the repo variables (no helper rewrite).
- [ ] **The Daytona preview URL shows the branch behavior.**
  Validated by opening the signed App URL from the PR comment and exercising the
  Acme Logistics Starter -> Pro upgrade through the live UI.
- [ ] **The health endpoint confirms all services are ready.**
  Validated by `GET /api/ready` returning 200 only when web, database, queue, worker,
  email, and webhook are all up (503 otherwise). This is the
  `DAYTONA_PREVIEW_READY_COMMAND` gate: `curl -fsS http://127.0.0.1:3000/api/ready`.
- [ ] **Closing the PR deletes the sandbox.**
  Validated on the live PR: closing it triggers the existing cleanup path; the
  sandbox is destroyed (also auto-deletes on PR close or after 24h; auto-stops at
  30m).
- [ ] **Docs explain why this is better than localhost, Docker Compose, and shared
  staging for this use case.**
  Validated by review of the docs, which state verbatim: "Localhost is good for
  coding. Shared staging is good for final confidence. Daytona is good for disposable
  branch-level integration review." and "This is NOT for tiny UI changes. This is for
  full-stack branch review when localhost and shared staging are the wrong tools."

---

## Per-Phase Acceptance Criteria (Phases 1-10)

### Phase 1: Preserve the Working Daytona Baseline

- [ ] The existing PR preview helper still works in dry-run mode.
  Validated by `npm run verify` (includes `preview:dry-run`) and
  `python -m py_compile scripts/daytona-pr-preview.py src/daytona/pr_preview.py`.
- [ ] The existing GitHub Action contract is not broken.
  Validated by confirming the switch is driven only by repo variables; the Action and
  `src/daytona/pr_preview.py` are not rewritten.

### Phase 2: Full-Stack Data Layer

- [ ] A clean database starts from scratch.
  Validated by `npm run db:migrate` against fresh Postgres 17 (apt in Daytona, Docker
  Compose locally); also driven inside `verify:fullstack`.
- [ ] The seed script creates Acme Logistics demo data deterministically.
  Validated by `npm run db:seed`: Organization "Acme Logistics", user
  reviewer@example.com, starting plan "Starter", requested plan "Pro".
- [ ] The health endpoint reports database status.
  Validated by `GET /api/health` -> `services.database` is `ok`/`down`.

### Phase 3: Queue and Worker

- [ ] Clicking "Upgrade to Pro" enqueues a job.
  Validated by `POST /api/billing/upgrade` enqueuing a BullMQ provisioning job in
  Redis; asserted by `verify:fullstack`.
- [ ] The worker processes the job.
  Validated by the standalone worker (`npm run worker`) flipping the subscription to
  "provisioned" and writing audit events; asserted by `verify:fullstack`.
- [ ] The UI shows job state transitions.
  Validated by `GET /api/state` / `GET /api/events` and the live `PreviewDashboard`
  polling `/api/state`.
- [ ] The health endpoint reports worker/queue status.
  Validated by `GET /api/health` -> `services.queue` and `services.worker`.

### Phase 4: Preview Email Capture

- [ ] The worker records an email after upgrade.
  Validated by `lib/email.mjs` writing a confirmation email row; asserted by
  `verify:fullstack`.
- [ ] The UI shows email subject/body/recipient.
  Validated by `GET /api/state` (`emails`) rendered in `PreviewDashboard`.
- [ ] No real email is sent.
  Validated by design: in-database capture only; no SMTP/provider integration exists.

### Phase 5: Webhook Receiver

- [ ] Webhook events persist.
  Validated by `POST /api/webhooks/billing` storing the event in Postgres; surfaced in
  `GET /api/state` (`webhooks`).
- [ ] Invalid signatures are rejected.
  Validated by `POST /api/webhooks/billing` returning 401 on an invalid
  `x-demo-signature`; asserted by `verify:fullstack`.
- [ ] Valid events appear in the UI timeline.
  Validated by `POST /api/webhooks/billing/replay` (the "Replay billing webhook"
  button) signing a sample payload and calling the receiver; event then visible in
  `/api/state` and `/api/events`.

### Phase 6: Reviewer-Facing UI

- [ ] The app renders as a live operations console, not a marketing page.
  Validated by review of `components/PreviewDashboard.tsx`, rewritten to poll
  `/api/state` and surface customer, plan/subscription, provisioning, jobs, timeline
  events, emails, webhooks, health, and PR metadata.
- [ ] Service status and PR metadata are visible and actions are obvious.
  Validated live on the preview URL: health row, PR/commit metadata, and the
  "Upgrade to Pro" / "Replay billing webhook" / "Reset seeded data" actions.

### Phase 7: Daytona Start Command

- [ ] `npm run preview:daytona` starts everything required for the reviewer URL.
  Validated by `scripts/start-fullstack-preview.mjs`: provisions native pg+redis,
  migrate, seed, start worker, start Next on `0.0.0.0:3000`.
- [ ] `npm run preview:local` runs the same real stack via Docker.
  Validated by `docker compose -f docker-compose.preview.yml up --build` (real
  pg+redis, local high-fidelity).
- [ ] The switch needs no large Action rewrite.
  Validated by setting `DAYTONA_PREVIEW_START_COMMAND=npm run preview:daytona` as a
  repo variable.

### Phase 8: Upgrade Health Checks

- [ ] `GET /api/health` always returns HTTP 200 with per-service status.
  Validated by curling `/api/health`: body
  `{ ok, preview, pr, sha, ready, services:{ web, database, queue, worker, email, webhook } }`,
  each service `ok`/`down`.
- [ ] The readiness command passes only when the preview is actually usable.
  Validated by `GET /api/ready` (200 when all services ready, else 503) wired as
  `DAYTONA_PREVIEW_READY_COMMAND=curl -fsS http://127.0.0.1:3000/api/ready`.

### Phase 9: Docs and Article

- [ ] Docs state the "not for tiny UI changes" framing explicitly.
  Validated by review: "This is NOT for tiny UI changes. This is for full-stack branch
  review when localhost and shared staging are the wrong tools."
- [ ] Docs carry the closing framing.
  Validated by review: "For a CSS tweak, use npm run dev. For branch-level integration
  review, use Daytona."

### Phase 10: Validate in GitHub

Validated on the live PR (`github.com/jiviny/daytona-test-env`):

- [ ] The workflow creates a Daytona sandbox.
- [ ] The enriched PR comment appears.
- [ ] The preview URL loads.
- [ ] `/api/ready` reports all services ready (web, database, queue, worker, email,
  webhook).
- [ ] The reviewer can trigger the Starter -> Pro upgrade.
- [ ] The worker processes the provisioning job.
- [ ] The confirmation email appears in the UI.
- [ ] The webhook replay works.
- [ ] Closing the PR deletes the sandbox.
