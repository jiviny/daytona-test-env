# Full-Stack Extension Plan

This plan extends a Daytona-backed PR preview from an app-only sandbox into a
full-stack preview environment with secrets, databases, workers, queues, and teardown.

Do this in phases. Each phase should be useful on its own and should not require
production secrets or production data.

## Current Demo Baseline

This repository implements the app-only preview foundation:

- A Next.js preview console at `/`.
- Readiness endpoint at `GET /api/health`.
- API smoke route at `POST /api/waitlist`.
- Local verification with `npm run verify`.
- Local production smoke test with `npm run preview:dry-run`.
- Daytona helper dry-run with `python scripts/daytona-pr-preview.py upsert ... --dry-run`.
- GitHub workflow that creates or updates one Daytona sandbox per PR and deletes it on
  PR close.
- Sandbox env allowlist, secret-looking-name filtering, signed preview URL generation,
  auto-stop, and auto-delete settings.

The baseline does not include databases, non-production secret profiles, worker
processes, queue namespacing, webhook replay, scheduled stale-preview sweeps, or live
Daytona validation in this local repo.

## Phase 1: App-Only Preview

Goal: prove the branch can build, start, and expose a reviewable URL.

Include:

- Build command.
- Start command.
- Preview URL.
- Preview-safe environment variables.
- Seeded or mocked dependencies.
- PR comment or status check.
- TTL cleanup.

The demo's phase-1 command contract is:

```text
setup: npm ci
start: npm run dev -- --hostname 0.0.0.0 --port 3000
ready: curl -fsS http://127.0.0.1:3000/api/health
```

Local validation:

```bash
npm run verify
python scripts/daytona-pr-preview.py upsert \
  --repository acme/app \
  --pr-number 42 \
  --sha abc123 \
  --head-ref feature/preview \
  --dry-run
```

Do not include:

- Production secrets.
- Production database access.
- Real payment, email, SMS, or webhook side effects.
- Long-running worker processes unless needed for the reviewed flow.

## Phase 2: Environment Contract

Goal: make preview behavior explicit and repeatable.

The current helper already injects this minimum contract into the sandbox:

```text
GITHUB_REPOSITORY=<owner/repo>
GITHUB_PR_NUMBER=<number>
GITHUB_SHA=<pr-head-sha>
GITHUB_HEAD_REF=<branch>
PORT=<preview-port>
DAYTONA_PREVIEW=true
```

Recommended variables:

```text
APP_ENV=preview
PREVIEW_ID=pr-<number>
PREVIEW_BRANCH=<branch>
PREVIEW_COMMIT=<sha>
PREVIEW_BASE_URL=<runtime-url>
PREVIEW_CREATED_AT=<timestamp>
PREVIEW_TTL_HOURS=<hours>
DATABASE_URL=<preview database>
REDIS_URL=<preview redis or disabled>
QUEUE_NAMESPACE=<preview id>
WEBHOOK_BASE_URL=<preview-safe endpoint or disabled>
SECRET_PROFILE=preview
```

Rules:

- App code should branch on `APP_ENV=preview` only where behavior truly differs.
- External side effects should include `PREVIEW_ID` in names, metadata, or prefixes.
- Missing optional dependencies should fail closed or use an explicit mock.
- Required variables should be validated before the app starts.
- Preview automation should inject variables from an allowlist instead of copying the
  full CI environment.

Implementation note for this repo: use `DAYTONA_PREVIEW_ENV_JSON` for explicit values
such as `APP_ENV`, `PREVIEW_TTL_HOURS`, or mock service URLs. Use
`DAYTONA_PREVIEW_ENV_ALLOWLIST` only for non-secret values that already exist in CI.

## Phase 3: Secret Injection

Goal: support realistic non-production integrations without exposing production
credentials.

Use a preview secret profile with least-privilege values:

```text
SECRET_PROFILE=preview
STRIPE_SECRET_KEY=<test-mode key>
EMAIL_PROVIDER_API_KEY=<sandbox key>
OAUTH_CLIENT_ID=<preview client>
OAUTH_CLIENT_SECRET=<preview secret>
S3_BUCKET=<preview bucket>
```

Secret rules:

- Never inject production secrets into PR previews by default.
- Do not provide secrets to untrusted fork branches.
- Require maintainer approval before starting a secret-backed preview for untrusted
  code.
- Prefer short-lived credentials where possible.
- Redact secrets from logs.
- Rotate preview credentials separately from production credentials.
- Keep a list of which secrets are safe for previews and who owns each one.

Implementation note for this repo: the helper skips env names containing `SECRET`,
`TOKEN`, `KEY`, `PASSWORD`, `PASS`, `CREDENTIAL`, `PRIVATE`, or `AUTH` unless
`DAYTONA_PREVIEW_ALLOW_SECRET_NAMES=true`. Treat that flag as a controlled rollout
switch, not a default.

## Phase 4: Database Strategy

Goal: give each preview isolated data while keeping provisioning time and cost under
control.

| Strategy | Use when | Benefits | Risks |
| --- | --- | --- | --- |
| Local database inside sandbox | UI and API review need predictable data. | Fast, cheap, easy teardown. | Lower production parity. |
| Schema per PR | The app uses a relational database and can set `search_path` or schema names. | Cheap and reasonably isolated. | Migrations and cleanup must be precise. |
| Database per PR | Isolation matters more than provisioning speed. | Strong isolation and simple teardown boundary. | Higher cost and slower creation. |
| Database branch or clone | Review needs realistic data shape. | High fidelity and good migration testing. | Data privacy and provider-specific workflow. |

Recommended startup default:

1. Start with a local or shared non-production database seeded per preview.
2. Move to schema-per-PR when multiple previews need to run concurrently against the
   same database engine.
3. Use database-per-PR or branch/clone only for flows that need stronger isolation or
   migration fidelity.

For this demo, the next practical database step is a local or hosted non-production
database seeded by the setup command. Add the database URL through explicit preview env,
then make the readiness command fail if migrations or seed loading fail.

## Phase 5: Migrations And Seed Data

Goal: make preview data reproducible.

Creation flow:

```text
create preview id
create database/schema
run migrations
load seed data
run smoke check
start app
publish URL
```

Seed data should be:

- Deterministic.
- Small enough to load quickly.
- Free of production personal data unless explicitly sanitized.
- Versioned with the app.
- Labeled clearly in the UI when useful.

Migration rules:

- Run migrations during preview creation.
- Fail the preview if migrations fail.
- Do not let previews mutate shared staging schemas.
- Treat destructive migrations as high risk even in preview.

Implementation note for this repo: put migration and seed work before the start command,
for example by changing `DAYTONA_PREVIEW_SETUP_COMMAND` to a shell command that runs
install, migration, and seed steps in order.

## Phase 6: Workers, Queues, And Webhooks

Goal: enable full product flows without duplicate side effects.

Add workers only when the reviewed flow needs them.

Rules:

- Namespace queues with `PREVIEW_ID`.
- Disable scheduled jobs by default.
- Route webhooks to preview-safe endpoints.
- Use provider test modes for payments, email, SMS, and notifications.
- Prevent previews from calling production customer endpoints.
- Make worker teardown part of preview teardown.

For the first worker-backed version, prefer one combined preview start command that
launches only the worker needed for the reviewed flow. Broader worker orchestration
should wait until there is a real review need.

## Phase 7: Cleanup, Cost, And Audit

Goal: make previews disposable and operationally boring.

Every preview resource should carry:

```text
preview_id
pr_number
branch
commit
owner
created_at
ttl_hours
source=pr-preview
```

Cleanup triggers:

- PR closed.
- PR merged.
- Manual destroy command.
- Scheduled stale-preview sweep.
- Failed setup after partial provisioning.

Cleanup should be idempotent. Running it twice should not fail the system or leave
resources behind.

The current helper sets Daytona sandbox labels for repository, PR number, SHA, purpose,
and sandbox name. Extend the same labeling strategy to any database, queue, bucket, or
webhook resource added later.

## Phase 8: Failure Handling And Concurrency

Goal: make preview automation reliable when CI retries, users push quickly, or the
Daytona API returns transient failures.

Rules:

- Use one stable `PREVIEW_ID` per pull request.
- Treat repeated create requests for the same `PREVIEW_ID` as updates.
- Serialize destructive operations for a preview when possible.
- Retry transient Daytona API failures with a bounded backoff.
- Surface creation, startup, and teardown failures in the PR.
- Make partial-provision cleanup part of the failure path.
- Keep teardown safe to run after a failed create.
- Do not let a stale preview from an older commit overwrite the PR comment for a newer
  commit.

The current workflow uses a per-PR GitHub Actions concurrency group with
`cancel-in-progress: false`, so create/update/delete operations for a PR are serialized
by the workflow queue instead of racing on the same sandbox.

## Suggested Build Order

1. App-only Daytona preview.
2. Preview environment contract.
3. PR comments and failure reporting.
4. TTL cleanup.
5. Local or seeded preview database.
6. Non-production secret profile.
7. Schema-per-PR or database-per-PR support.
8. Migration and seed verification.
9. Workers and queues.
10. Failure handling and concurrent event safety.
11. Cost reporting and stale-resource audit.

## Demo-To-Production Checklist

- Confirm a same-repository PR creates a live Daytona sandbox with `DAYTONA_API_KEY`.
- Confirm the signed URL opens the branch app and `/api/health` reports `preview: true`.
- Confirm the PR comment updates on a second push instead of creating duplicates.
- Confirm closing the PR deletes the matching sandbox.
- Confirm fork PRs are skipped unless the repository intentionally enables them.
- Decide which non-production env values belong in `DAYTONA_PREVIEW_ENV_JSON`.
- Decide whether private repo clone credentials are required.
- Add a scheduled stale-preview sweep if Daytona auto-delete alone is not enough for the
  team's cost and audit requirements.

## Readiness Checklist

- Preview creation is automated.
- Preview teardown is automated.
- Production secrets are excluded by default.
- Untrusted branches cannot access secrets without approval.
- Database state is isolated per preview.
- Migrations run during preview creation.
- Seed data is deterministic.
- Workers and queues are namespaced or disabled.
- Webhooks cannot hit production customer endpoints.
- Logs redact secret values.
- Missing required preview variables fail before startup.
- Daytona API failures are retried or reported clearly.
- Duplicate preview events do not create duplicate live environments.
- Stale previews are removed on a schedule.
- The PR clearly states known preview limitations.

## Open Decisions For A Real Implementation

- Which branches are trusted enough to receive secret-backed previews?
- Should preview URLs be public, authenticated, or VPN-only?
- What is the preview TTL?
- Which dependencies are mocked in v0?
- Which database strategy is acceptable for the first full-stack version?
- Who owns broken preview cleanup?
- What is the maximum number of concurrent previews?
- Which preview failures should block merging?
