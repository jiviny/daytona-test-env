# Daytona PR Preview Demo

This repository is a runnable demo for Daytona-backed pull request preview
environments. It includes a Next.js preview console, a GitHub Actions workflow, and a
standard-library Python helper that creates, updates, comments on, and deletes Daytona
sandboxes for PRs.

The demo is built around one operational promise:

> Every trusted PR can get a live sandbox URL, and the preview has an automatic cleanup
> path.

## What You Can Run

The repo has three useful run modes:

| Mode | What it proves | Command or trigger |
| --- | --- | --- |
| Local dashboard | The reviewer-facing preview console renders and the app routes work. | `npm run dev` |
| Local production smoke test | The Next.js app can build, start, and answer HTTP before it is deployed. | `npm run preview:dry-run` |
| Customer demo script | The app and Daytona PR-preview helper produce a clean demo report and PR-comment artifacts. | `npm run demo:customer` |
| Daytona PR preview | A GitHub PR creates or updates a Daytona sandbox and receives a PR comment with the preview URL. | Open or update a PR after configuring the workflow |

The local app is a SaaS-style "Launchpad Preview Console" with preview metrics, active
branch rows, route readiness, review notes, and an audit timeline. It also exposes:

- `GET /api/health` for readiness checks.
- `POST /api/waitlist` for a small JSON API smoke path.

## Repository Map

- [.github/workflows/daytona-pr-preview.yml](.github/workflows/daytona-pr-preview.yml):
  PR workflow that creates, refreshes, comments, skips unsafe forks by default, and
  deletes previews on PR close.
- [scripts/daytona-pr-preview.py](scripts/daytona-pr-preview.py): CLI wrapper for the
  Daytona preview helper.
- [src/daytona/pr_preview.py](src/daytona/pr_preview.py): Daytona REST helper for
  sandbox upsert/delete, clone, setup/start/readiness commands, signed preview URLs,
  env allowlists, and dry-run output.
- [scripts/preview-dry-run.mjs](scripts/preview-dry-run.mjs): local production preview
  smoke test.
- [app/](app/) and [components/](components/): the Next.js demo dashboard and API
  routes.
- [article.md](article.md): publishable article and demo walkthrough.
- [docs/preview-environment-decision-guide.md](docs/preview-environment-decision-guide.md):
  decision guide plus implementation checklist for this demo.
- [docs/full-stack-extension-plan.md](docs/full-stack-extension-plan.md): phased plan
  for moving from app-only previews to full-stack previews.
- [docs/try-it-and-article-plan.md](docs/try-it-and-article-plan.md): short runbook
  for trying the demo yourself and turning it into a customer article.
- [docs/full-demo-walkthrough.md](docs/full-demo-walkthrough.md): exact end-to-end
  script for local app, GitHub PR, Daytona preview URL, and cleanup.

## Local Quickstart

Prerequisites:

- Node.js `20.11` or newer.
- npm.
- Python 3 for the Daytona helper.

Install dependencies and run the full local verification:

```bash
npm install
npm run verify
```

`npm run verify` runs lint, typecheck, production build, and the local preview dry-run.
It also runs the customer demo script. The preview dry-run starts the built app on
`http://127.0.0.1:3137` by default and waits for an HTTP response.

Generate the customer demo artifacts:

```bash
npm run demo:customer
```

That script starts the production app, checks `/api/health`, posts to
`/api/waitlist`, renders the Daytona PR comment in dry-run mode, exercises the
delete path, and writes `demo-artifacts/customer-demo-report.md`.

Run the interactive dashboard:

```bash
npm run dev
```

Open the printed local URL, usually `http://localhost:3000`. Use these smoke checks:

```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS -X POST http://127.0.0.1:3000/api/waitlist \
  -H "content-type: application/json" \
  -d '{"email":"founder@example.com","company":"Acme"}'
```

To create a visible branch change for the GitHub PR preview demo:

```bash
npm run demo:change
```

To reset that demo copy change:

```bash
npm run demo:reset
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

## Run A Live Daytona PR Preview

1. Keep these paths in the target repository:
   - `.github/workflows/daytona-pr-preview.yml`
   - `scripts/daytona-pr-preview.py`
   - `src/daytona/pr_preview.py`
2. Add repository secret `DAYTONA_API_KEY`.
3. Add `DAYTONA_ORGANIZATION_ID` as a secret or variable if your Daytona account needs
   it.
4. Set optional repository variables only when the defaults are wrong for your app.
5. Open a same-repository PR or push to an existing PR.
6. Watch the workflow post or update one PR comment marked `<!-- daytona-pr-preview -->`.
7. Close the PR to run the delete path.

The default workflow settings are:

| Name | Default | Purpose |
| --- | --- | --- |
| `DAYTONA_API_URL` | `https://app.daytona.io/api` | Daytona API endpoint. |
| `DAYTONA_TARGET` | empty | Optional Daytona target. |
| `DAYTONA_PREVIEW_SNAPSHOT` | empty | Optional snapshot/template. |
| `DAYTONA_PREVIEW_PORT` | `3000` | Port used for the signed preview URL. |
| `DAYTONA_PREVIEW_URL_EXPIRES_SECONDS` | `86400` | Signed URL lifetime, max one day. |
| `DAYTONA_PREVIEW_AUTO_STOP_MINUTES` | `30` | Idle auto-stop interval. |
| `DAYTONA_PREVIEW_AUTO_DELETE_MINUTES` | `1440` | Auto-delete interval. |
| `DAYTONA_PREVIEW_SETUP_COMMAND` | `npm ci` | Runs after the PR branch is cloned in the sandbox. |
| `DAYTONA_PREVIEW_START_COMMAND` | `npm run dev -- --hostname 0.0.0.0 --port 3000` | Starts the preview process in the sandbox. |
| `DAYTONA_PREVIEW_READY_COMMAND` | `curl -fsS http://127.0.0.1:3000/api/health` | Must pass before the URL is posted. |
| `DAYTONA_PREVIEW_ENV_ALLOWLIST` | empty | Non-secret CI env names to forward. |
| `DAYTONA_PREVIEW_ENV_JSON` | empty | Explicit JSON object of preview env values. |
| `DAYTONA_PREVIEW_ALLOW_SECRET_NAMES` | `false` | Allows secret-looking env names only when intentionally enabled. |
| `DAYTONA_PREVIEW_ALLOW_FORKS` | `false` | Keeps fork PR code from running by default. |

For private repositories, configure `DAYTONA_PREVIEW_GIT_USERNAME` and
`DAYTONA_PREVIEW_GIT_PASSWORD` as secrets so the sandbox can clone the PR head repo.

## Security Model

The workflow uses `pull_request_target` so it can comment on PRs, but it checks out the
trusted base branch before running the helper. PR code is cloned only inside the Daytona
sandbox. Fork previews are skipped unless `DAYTONA_PREVIEW_ALLOW_FORKS=true`.

The helper does not forward the full runner environment. It always sends metadata such
as repository, PR number, SHA, branch, `PORT`, and `DAYTONA_PREVIEW=true`. Additional
values must come from `DAYTONA_PREVIEW_ENV_ALLOWLIST` or `DAYTONA_PREVIEW_ENV_JSON`.
Names containing `SECRET`, `TOKEN`, `KEY`, `PASSWORD`, `PASS`, `CREDENTIAL`, `PRIVATE`,
or `AUTH` are skipped unless `DAYTONA_PREVIEW_ALLOW_SECRET_NAMES=true`.

Do not use production secrets, production databases, or long-lived cloud credentials in
the first preview version.

## When To Use Daytona First

Use Daytona-backed previews when the team needs a working review URL quickly, the app can
run with preview-safe dependencies, and the preview system should stay small while the
team learns what fidelity matters.

Build directly on AWS, GCP, or Azure primitives first when the preview must validate
production networking, cloud IAM, managed-service topology, private access controls, or
compliance boundaries from day one.

The recommended path for startups is:

1. Ship app-only PR previews.
2. Add explicit preview config and deterministic seed data.
3. Add non-production secrets behind branch-trust rules.
4. Add isolated databases after app previews are being used.
5. Add workers, queues, webhooks, cleanup audits, and cost controls only where they
   improve review quality.

See [docs/preview-environment-decision-guide.md](docs/preview-environment-decision-guide.md)
and [docs/full-stack-extension-plan.md](docs/full-stack-extension-plan.md) for the
detailed rollout plan. See [docs/try-it-and-article-plan.md](docs/try-it-and-article-plan.md)
for the hands-on trial and article outline.
