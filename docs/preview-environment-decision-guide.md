# Preview Environment Decision Guide

This guide helps a startup engineering team decide whether to implement PR previews
with Daytona-backed sandboxes or direct hyperscaler infrastructure. It also maps the
decision to the runnable demo in this repository.

## Default Position

Start with Daytona-backed previews unless the first useful preview must run inside
production-like cloud networking or managed service topology.

That default optimizes for learning speed. Once engineers, QA, product, and design
are using previews, the team can decide which parts need more production fidelity.

## Decision Matrix

| Question | Daytona-backed preview | Hyperscaler preview infra |
| --- | --- | --- |
| How fast can we ship a useful v0? | Faster if the app already runs locally. | Slower unless platform modules already exist. |
| Who owns it? | Product engineering or a small infra owner. | Platform, DevOps, or senior infra owner. |
| What is the unit of isolation? | Sandbox/workspace per PR. | Namespace, service, account, project, task, or deployment per PR. |
| What is the main advantage? | Low setup overhead and fast branch feedback. | Production-like topology and cloud-native control. |
| What is the main risk? | Lower fidelity for cloud-managed dependencies. | Building and maintaining a preview platform. |
| How should secrets be handled at first? | Avoid or inject only preview-safe secrets. | Use secret manager and strict IAM from the start. |
| How should databases start? | Local or seeded non-production database. | Schema, clone, branch, or managed database per preview. |
| What cleanup is needed? | Sandbox TTL and PR-close teardown. | Resource tagging, TTL, PR-close teardown, and cost sweeps. |

## Choose Daytona When

- The team wants a preview URL for every PR quickly.
- The app can run with local services, mocks, seeded data, or non-production
  dependencies.
- The team does not want to design DNS, ingress, IAM, and cleanup first.
- Preview consumers mainly need UI, API, or workflow review.
- Agents or automated reviewers need an isolated branch runtime.
- The team wants to discover preview requirements before committing to a platform.

## Choose Hyperscaler Infrastructure When

- Preview behavior depends on exact cloud-managed services.
- Private networking, VPC access, service mesh behavior, or cloud IAM is central to
  the feature being reviewed.
- Compliance requires cloud-account, project, or subscription boundaries.
- Preview URLs need custom routing, WAF, enterprise auth, or private access controls.
- The company already has reusable infrastructure modules and someone to own the
  platform.
- Long-running previews need quota, billing, and observability controls from day one.

## Startup-Friendly V0 Architecture

```text
GitHub pull request
  -> preview trigger
  -> create Daytona sandbox from branch
  -> install dependencies
  -> run build and start command
  -> expose web/API port
  -> post preview URL to PR
  -> clean up on PR close or TTL
```

## This Demo's V0 Flow

This repository implements the v0 architecture with a concrete Next.js app and Daytona
helper.

```text
pull_request_target event
  -> checkout trusted base-branch helper
  -> skip fork PR unless explicitly allowed
  -> python scripts/daytona-pr-preview.py upsert
  -> create or find one labeled Daytona sandbox for the PR
  -> clone the PR head repo inside the sandbox
  -> run setup command
  -> run start command in the background
  -> run readiness command
  -> request signed preview URL for the configured port
  -> upsert one PR comment
```

When the PR closes, the same workflow calls:

```bash
python scripts/daytona-pr-preview.py delete \
  --repository "$GITHUB_REPOSITORY" \
  --pr-number "$PR_NUMBER" \
  --sha "$PR_HEAD_SHA" \
  --head-ref "$PR_HEAD_REF"
```

The local demo can be run before any Daytona credentials are configured:

```bash
npm install
npm run verify
npm run dev
```

The helper dry-run mirrors the workflow without creating a sandbox:

```bash
python scripts/daytona-pr-preview.py upsert \
  --repository acme/app \
  --pr-number 42 \
  --sha abc123 \
  --head-ref feature/preview \
  --dry-run
```

The demo app exposes `GET /api/health` for readiness and `POST /api/waitlist` as a
small API smoke route. The default workflow readiness command is:

```bash
curl -fsS http://127.0.0.1:3000/api/health
```

Keep the first version intentionally narrow:

- One app command.
- One main exposed URL.
- No production secrets.
- Seeded or mocked dependencies.
- Explicit failure output in the PR or build logs.
- Automatic teardown.

## V0 Implementation Checklist

1. Define the preview command.

   This demo's default workflow commands:

   ```text
   npm ci
   npm run dev -- --hostname 0.0.0.0 --port 3000
   curl -fsS http://127.0.0.1:3000/api/health
   ```

2. Define the preview environment contract.

   This helper always injects:

   ```text
   GITHUB_REPOSITORY=<owner/repo>
   GITHUB_PR_NUMBER=<number>
   GITHUB_SHA=<pr-head-sha>
   GITHUB_HEAD_REF=<branch>
   PORT=<preview-port>
   DAYTONA_PREVIEW=true
   ```

   Add app-specific non-secret values through `DAYTONA_PREVIEW_ENV_ALLOWLIST` or
   `DAYTONA_PREVIEW_ENV_JSON`.

3. Define the sandbox template.

   Include runtime versions, package manager setup, install commands, cache strategy,
   and the app start command.

4. Define PR automation.

   The automation should create or update the sandbox, attach logs to failure output,
   and comment with the preview URL. This demo uses one PR comment marker,
   `<!-- daytona-pr-preview -->`, so subsequent runs update the existing comment.

5. Define cleanup.

   Trigger cleanup when a PR closes and run a scheduled sweep for stale previews. This
   demo deletes matching Daytona sandboxes on PR close and sets Daytona auto-stop and
   auto-delete intervals on each sandbox.

6. Define failure handling.

   The automation should treat duplicate PR events as an update to the same preview,
   retry transient Daytona API failures, and mark the PR clearly when creation or
   teardown fails.

7. Define support boundaries.

   Document which dependencies are real, mocked, disabled, or seeded.

## Demo Configuration Reference

| Setting | Default | Notes |
| --- | --- | --- |
| `DAYTONA_API_KEY` | required for live mode | Missing key forces safe dry-run behavior. |
| `DAYTONA_API_URL` | `https://app.daytona.io/api` | Override for alternate Daytona API endpoints. |
| `DAYTONA_ORGANIZATION_ID` | empty | Set when the account requires an organization header. |
| `DAYTONA_TARGET` | empty | Optional target for sandbox placement. |
| `DAYTONA_PREVIEW_SNAPSHOT` | empty | Optional snapshot/template. |
| `DAYTONA_PREVIEW_PORT` | `3000` | Port used for the signed preview URL. |
| `DAYTONA_PREVIEW_URL_EXPIRES_SECONDS` | `86400` | Signed URL lifetime; helper validates one day max. |
| `DAYTONA_PREVIEW_AUTO_STOP_MINUTES` | `30` | Idle stop interval. |
| `DAYTONA_PREVIEW_AUTO_DELETE_MINUTES` | `1440` | Auto-delete interval. |
| `DAYTONA_PREVIEW_SETUP_COMMAND` | `npm ci` | Install/setup command inside the sandbox. |
| `DAYTONA_PREVIEW_START_COMMAND` | `npm run dev -- --hostname 0.0.0.0 --port 3000` | Background preview process. |
| `DAYTONA_PREVIEW_READY_COMMAND` | `curl -fsS http://127.0.0.1:3000/api/health` | Gate before publishing the URL. |
| `DAYTONA_PREVIEW_ENV_ALLOWLIST` | empty | Names of extra non-secret env vars to forward. |
| `DAYTONA_PREVIEW_ENV_JSON` | empty | JSON object of explicit env values. |
| `DAYTONA_PREVIEW_ALLOW_SECRET_NAMES` | `false` | Allows secret-looking names only when intentional. |
| `DAYTONA_PREVIEW_ALLOW_FORKS` | `false` | Fork PR previews are skipped by default. |
| `DAYTONA_PREVIEW_GIT_USERNAME` | empty | Optional private repo clone credential. |
| `DAYTONA_PREVIEW_GIT_PASSWORD` | empty | Optional private repo clone credential. |

## Guardrails

- Never inject production secrets into previews by default.
- Do not run secret-backed previews for untrusted branches without approval.
- Pass environment variables through an explicit allowlist, not a broad copy of CI or
  developer machine state.
- Validate required preview variables before starting the app.
- Namespace every external side effect with `PREVIEW_ID`.
- Disable outbound webhooks unless they point to preview-safe endpoints.
- Use deterministic seed data.
- Make teardown idempotent.
- Record owner, PR number, branch, creation time, and TTL for each preview.
- Sanitize branch names before using them in resource names, URLs, schema names, or
  queue names.

## Failure Modes To Test

- Missing required environment variables.
- Invalid or unsafe branch names.
- Duplicate PR events creating the same preview twice.
- Concurrent preview update and teardown requests.
- Daytona sandbox creation, start, stop, and deletion failures.
- Partial provisioning where the app fails after a database or external resource was
  created.
- Cleanup retries after a failed teardown.
- Secret-backed previews requested from untrusted branches.

## When To Graduate Pieces To Hyperscaler Infra

Move only the pieces that need higher fidelity.

Good reasons:

- The preview must validate cloud IAM behavior.
- The preview must access a private managed service.
- The preview must run the same queue, object storage, or event bus shape as staging.
- The sandbox approximation is causing false confidence.
- Preview cost or concurrency needs centralized quota management.

Weak reasons:

- The team assumes previews must look exactly like production before anyone can use
  them.
- The first version is blocked on database cloning when seeded data would validate
  the changed UI.
- The platform is being built before the review workflow has users.

## Acceptance Criteria For A Useful Preview System

- Opening or updating a PR can create a preview.
- The PR shows the active preview URL.
- The URL opens the branch version of the app.
- Preview setup failures are visible to the author.
- Preview config uses no production secrets by default.
- Preview data is deterministic enough for review.
- Closing the PR destroys the preview or marks it for teardown.
- A scheduled cleanup removes stale previews.
- The README or PR comment states which dependencies are not production-like.

## PR Comment Template

```md
Preview ready for this PR:

- App: <preview-url>
- Commit: <sha>
- Environment: preview
- Data: seeded non-production data
- Expires: <timestamp>

Known preview limits:
- <dependency or behavior that is mocked, disabled, or not production-like>
```
