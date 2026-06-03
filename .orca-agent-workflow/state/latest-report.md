# Workflow Report

Status: Complete

## Task
- Validate the Daytona PR preview demo after adding a real API key, fix any blockers, start the local demo, and prepare a short article/runbook plan.

## What Was Done
- Re-ran the full local verification flow.
- Ran a live Daytona `--no-deploy` smoke test that created a disposable sandbox, generated a signed preview URL, and deleted the sandbox.
- Fixed the Daytona lifecycle compatibility issue where the autostop/autodelete endpoints may return HTTP `201`.
- Added local `.env` loading to the Daytona CLI wrapper so pasted credentials work for local runs.
- Started the local Next.js demo on `http://127.0.0.1:3001`.
- Added `docs/try-it-and-article-plan.md` with the self-serve trial steps and article outline.
- Added `docs/full-demo-walkthrough.md` with the exact local app -> GitHub PR -> Daytona preview -> cleanup demo script.
- Added `npm run demo:change` and `npm run demo:reset` for a visible, reversible PR change.
- Hardened `.gitignore` for editor backup files that may contain `.env` secrets and removed local backup/live-smoke artifacts.

## What Works
- The Next.js app builds, typechecks, lints, and serves successfully.
- `/api/health` returns HTTP 200 on the local demo server.
- `npm run verify` passes end to end.
- The Daytona helper can use the `.env` API key locally.
- Live Daytona sandbox create/delete works with `DAYTONA_TARGET=us` and `DAYTONA_PREVIEW_SNAPSHOT=daytona-medium`.
- The workflow YAML is ready to run from GitHub PR events.
- The visible demo-change command applies and resets cleanly.

## What Does Not Work
- The GitHub Actions trigger path has not been proven yet because this folder is not currently inside a GitHub repository with a real PR.
- In-app Browser visual verification could not run because the `iab` browser backend is unavailable in this session.

## Validation
- Command: `npm run verify`
- Result: Passed
- Evidence: lint, typecheck, build, preview dry-run, and customer demo all passed; preview dry-run returned HTTP 200.

- Command: `python -m py_compile scripts/daytona-pr-preview.py src/daytona/pr_preview.py`
- Result: Passed
- Evidence: Python wrapper/helper compiled.

- Command: live Daytona `upsert --no-deploy` then `delete`
- Result: Passed
- Evidence: created sandbox `pr-preview-daytona-demo-preview-smoke-pr-9002` in target `us`, generated a signed preview URL, then deleted one matching sandbox.

- Command: local server probe
- Result: Passed
- Evidence: `http://127.0.0.1:3001/api/health` returned HTTP 200.

- Command: `npm run demo:change` then `npm run demo:reset`
- Result: Passed
- Evidence: the branch-demo copy was applied to and restored from `components/PreviewDashboard.tsx`.

## Five-Lane Outcome
- impl-a: Kept the existing PR preview demo and added the try-it/article runbook.
- impl-b: Added a more concrete full demo walkthrough and reversible visible PR-change script.
- deep-test: Re-ran full local verification, Python compile checks, and demo change/reset checks.
- breaker-test: Exercised live create/delete cleanup and removed generated secret-adjacent artifacts.
- integrator-review: Confirmed the remaining unproven path is GitHub PR execution, not Daytona credentials or local app behavior.

## Remaining Risks
- A full live preview still needs this project pushed to GitHub and opened as a same-repository PR.
- Private repository previews require clone credentials via `DAYTONA_PREVIEW_GIT_USERNAME` and `DAYTONA_PREVIEW_GIT_PASSWORD`.
- Browser screenshot QA remains pending due unavailable in-app browser backend.

## Next Step
- Push this folder to a GitHub repository, add `DAYTONA_API_KEY` as a repo secret, set `DAYTONA_TARGET=us` and `DAYTONA_PREVIEW_SNAPSHOT=daytona-medium` as repo variables, then open a same-repository PR to validate the complete comment-and-preview workflow.
