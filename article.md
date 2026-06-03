# Ship PR Preview Environments With Daytona Before You Build A Preview Platform

Every startup eventually wants the same review loop: open a pull request, get a URL,
click through the changed product, and tear the environment down when the PR closes.
That loop sounds simple until the team starts planning DNS, secrets, databases,
cleanup, branch trust, and cloud spend.

The mistake is treating the first PR preview as a full internal platform. Most teams do
not need that on day one. They need a useful preview that reviewers can open this week.

This demo shows that smaller path. It uses Daytona as the branch sandbox, GitHub Actions
as the trigger, a Python helper as the orchestration layer, and a Next.js app as the
review target. The result is a concrete preview workflow:

```text
Pull request opened or updated
  -> GitHub Actions runs trusted helper code
  -> Daytona sandbox is created or refreshed
  -> PR branch is cloned inside the sandbox
  -> setup/start/readiness commands run
  -> signed preview URL is posted back to the PR
  -> PR close deletes the matching sandbox
```

The repository also includes a local dashboard and dry-run mode, so a team can inspect
the whole flow before giving it Daytona credentials.

## What The Demo Contains

The runnable app is a "Launchpad Preview Console" built with Next.js. It is intentionally
small, but it feels like the kind of internal surface a startup would use: active PR
previews, route readiness, review notes, metrics, and an audit timeline. It exposes a
health endpoint for readiness checks and a waitlist endpoint for a simple API smoke test.

The preview automation has three parts:

- `.github/workflows/daytona-pr-preview.yml` listens for PR open, synchronize, reopen,
  and close events.
- `scripts/daytona-pr-preview.py` is the CLI entry point used by local commands and the
  workflow.
- `src/daytona/pr_preview.py` calls Daytona's REST API with the Python standard library,
  so the action does not need a Daytona SDK install step.

The helper supports both live and local-safe execution. If `DAYTONA_API_KEY` is missing,
or if `--dry-run` is passed, it prints the sandbox name, env contract, lifecycle settings,
and intended action without creating cloud resources.

## Run It Locally

Install dependencies and run the full local check:

```bash
npm install
npm run verify
```

That command runs lint, typecheck, `next build`, and a production preview smoke test. The
smoke test starts the built app on `http://127.0.0.1:3137` by default and waits until the
preview answers HTTP.

For the interactive dashboard:

```bash
npm run dev
```

Open the local URL printed by Next.js, usually `http://localhost:3000`. The two direct
smoke paths are:

```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS -X POST http://127.0.0.1:3000/api/waitlist \
  -H "content-type: application/json" \
  -d '{"email":"founder@example.com","company":"Acme"}'
```

Now run the Daytona helper without creating a sandbox:

```bash
python scripts/daytona-pr-preview.py upsert \
  --repository acme/app \
  --pr-number 42 \
  --sha abc123 \
  --head-ref feature/preview \
  --dry-run
```

The output shows the same lifecycle decision the GitHub workflow would make: one stable
sandbox name for the PR, default port `3000`, auto-stop and auto-delete intervals, and
the env names that would be forwarded.

The delete path is also testable without credentials:

```bash
python scripts/daytona-pr-preview.py delete \
  --repository acme/app \
  --pr-number 42 \
  --sha abc123 \
  --head-ref feature/preview \
  --dry-run
```

This matters because cleanup is not a bonus feature. A preview system that creates
environments but cannot reliably delete them is not ready for team use.

## Wire It To GitHub

To run a live PR preview, keep these paths in the target repository:

```text
.github/workflows/daytona-pr-preview.yml
scripts/daytona-pr-preview.py
src/daytona/pr_preview.py
```

Then add `DAYTONA_API_KEY` as a repository secret. If your Daytona organization requires
it, add `DAYTONA_ORGANIZATION_ID` as a secret or variable.

The default preview command contract is deliberately plain:

```text
setup: npm ci
start: npm run dev -- --hostname 0.0.0.0 --port 3000
ready: curl -fsS http://127.0.0.1:3000/api/health
```

Open or update a same-repository PR. The workflow creates or refreshes the Daytona
sandbox, starts the app, requests a signed preview URL for port `3000`, and upserts one
PR comment marked with `<!-- daytona-pr-preview -->`. Closing the PR runs the delete
action against the matching sandbox labels.

The important repository variables are:

| Variable | Default | When to change it |
| --- | --- | --- |
| `DAYTONA_PREVIEW_PORT` | `3000` | Your app listens on another port. |
| `DAYTONA_PREVIEW_SETUP_COMMAND` | `npm ci` | Your repo needs a different install/setup step. |
| `DAYTONA_PREVIEW_START_COMMAND` | `npm run dev -- --hostname 0.0.0.0 --port 3000` | Your preview needs a production server, API server, or custom process. |
| `DAYTONA_PREVIEW_READY_COMMAND` | `curl -fsS http://127.0.0.1:3000/api/health` | Your app has a better readiness check. |
| `DAYTONA_PREVIEW_AUTO_STOP_MINUTES` | `30` | You want shorter or longer idle windows. |
| `DAYTONA_PREVIEW_AUTO_DELETE_MINUTES` | `1440` | You want stale previews deleted sooner or later. |
| `DAYTONA_PREVIEW_ENV_ALLOWLIST` | empty | You need to forward explicit non-secret env vars. |
| `DAYTONA_PREVIEW_ENV_JSON` | empty | You want to inject explicit preview config as JSON. |
| `DAYTONA_PREVIEW_ALLOW_FORKS` | `false` | You have decided it is safe to run fork PR code in disposable sandboxes. |

For private repositories, add `DAYTONA_PREVIEW_GIT_USERNAME` and
`DAYTONA_PREVIEW_GIT_PASSWORD` as secrets so the sandbox can clone the PR head repo.

## Why Daytona First

A sandbox-first preview starts from how engineers already run the app. Create an
isolated environment, clone the branch, install dependencies, start the process, expose
the port, and clean it up. That is enough to validate many UI, API, and product-review
changes.

A hyperscaler-first preview starts lower in the stack. It may require container image
builds, namespaces or tasks, load balancers, ingress, DNS, TLS, secret injection,
database branches, queue namespacing, observability, quotas, and cost sweeps. That can
be the right choice, but it is a platform project.

The startup decision rule is straightforward:

- Start with Daytona when reviewers mainly need a branch-specific app URL and the app
  can run with preview-safe dependencies.
- Start with hyperscaler primitives when the first useful preview must validate exact
  production networking, IAM, private managed services, compliance boundaries, or cloud
  topology.

This is a sequencing decision, not a permanent bet. A team can begin with Daytona and
move specific pieces closer to cloud infrastructure only after those pieces prove they
matter to review quality.

## The Security Boundary

The demo uses `pull_request_target` because the workflow needs permission to comment on
PRs. That event is powerful, so the workflow checks out the trusted base branch before
running the helper. It does not execute PR code on the GitHub runner. The PR branch is
cloned inside the Daytona sandbox only when previews are allowed.

Fork PR previews are skipped by default. Enabling `DAYTONA_PREVIEW_ALLOW_FORKS=true`
should be an explicit repository decision, not a convenience toggle.

Environment variables are also intentionally narrow. The helper forwards PR metadata,
`PORT`, and `DAYTONA_PREVIEW=true`. Additional env vars must be named in
`DAYTONA_PREVIEW_ENV_ALLOWLIST` or provided in `DAYTONA_PREVIEW_ENV_JSON`. Names that
look like secrets are skipped unless `DAYTONA_PREVIEW_ALLOW_SECRET_NAMES=true`.

The first version should not use production secrets or production databases. A preview
that is clear about using seeded non-production data is useful. A preview that silently
looks production-like while skipping critical dependencies creates false confidence.

## How To Grow The Demo

The first preview should be app-only. Once people actually use it, add fidelity in
layers:

1. Define the preview environment contract, including `APP_ENV=preview`, `PREVIEW_ID`,
   branch, commit, URL, and TTL.
2. Add deterministic seed data or a local preview database.
3. Add non-production secrets behind branch trust rules.
4. Add schema-per-PR, database-per-PR, or database branches only when the data layer
   affects review quality.
5. Add workers, queues, webhooks, and scheduled jobs only for flows reviewers need.
6. Add cleanup sweeps, resource labels, ownership, TTLs, and cost reporting before broad
   rollout.

That order keeps the first milestone small and leaves room for a full-stack preview
system later.

## Definition Of Done

A PR preview system is ready for team use when:

- Opening or updating a trusted PR creates or refreshes one preview.
- The preview URL is visible in the PR.
- Setup/start/readiness failures are visible without shell access.
- Preview config excludes production secrets by default.
- Data is deterministic enough for review.
- Closing the PR deletes or marks the preview for deletion.
- A stale-preview cleanup policy exists.
- The team understands which dependencies are real, mocked, seeded, or disabled.

That is the line this demo is designed to make reachable. Start with a working branch
URL, make cleanup boring, and add platform complexity only where it improves the review.
