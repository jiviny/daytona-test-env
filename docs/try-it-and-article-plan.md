# Try It And Article Plan

## Current Status

- Local app verification passes with `npm run verify`.
- Live Daytona API smoke passes with a disposable `--no-deploy` sandbox.
- GitHub Actions path is ready but still needs this folder pushed to a GitHub repository and tested from a real pull request.
- In-app browser visual QA was not available in this Codex session, but the local server health check passes.

## How To View The Demo

Run the UI:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3001
```

Open:

```text
http://127.0.0.1:3001
```

Check the API:

```bash
curl -fsS http://127.0.0.1:3001/api/health
```

The GitHub workflow is here:

```text
.github/workflows/daytona-pr-preview.yml
```

Once this folder is pushed to GitHub, view it under:

```text
GitHub repository -> Actions -> Daytona PR Preview
```

## How To Try The Daytona Flow Locally

With `DAYTONA_API_KEY` populated in `.env`, run a low-risk live smoke test:

```bash
python scripts/daytona-pr-preview.py upsert \
  --repository daytona/demo-preview-smoke \
  --pr-number 9002 \
  --sha live-smoke \
  --head-ref codex/live-smoke \
  --no-deploy
```

Then delete it:

```bash
python scripts/daytona-pr-preview.py delete \
  --repository daytona/demo-preview-smoke \
  --pr-number 9002 \
  --sha live-smoke \
  --head-ref codex/live-smoke
```

This proves Daytona credentials, sandbox creation, lifecycle labels, signed preview URL generation, and cleanup.

## How To Try The Full GitHub PR Preview

1. Create a GitHub repo from this folder.
2. Add repository secret `DAYTONA_API_KEY`.
3. Set `Settings -> Actions -> General -> Workflow permissions` to `Read and write permissions`.
4. Add repository variables:
   - `DAYTONA_TARGET=us`
   - `DAYTONA_PREVIEW_SNAPSHOT=daytona-medium`
5. Push `main`.
6. Create a branch with a visible UI copy change.
7. Open a same-repository pull request.
8. Watch the `Daytona PR Preview` action run.
9. Confirm it posts a PR comment with a signed preview URL.
10. Close the PR and confirm the cleanup workflow deletes the sandbox.

## Article Angle

Working title:

```text
Preview Environments Without Building A Preview Platform
```

Thesis:

```text
For many teams, the first useful PR preview does not need Kubernetes, load balancers, DNS automation, and cleanup jobs. It needs an isolated runtime, a branch checkout, a readiness check, a URL, and automatic deletion. Daytona is a good fit for that lifecycle.
```

Recommended structure:

1. Start with the pain: every PR should be reviewable, but full cloud preview stacks are slow to build.
2. Show the simple lifecycle: PR opens, Daytona sandbox starts, branch runs, URL is posted, PR close deletes it.
3. Explain why Daytona is the right abstraction here: ephemeral isolated environments, fast lifecycle, simple cleanup, preview-safe cost control.
4. Walk through the demo app and the workflow file.
5. Show the GitHub PR comment as the artifact reviewers actually care about.
6. Be honest about boundaries: use hyperscalers when the preview must validate production IAM, private networking, managed services, or compliance topology.
7. End with the recommendation: start with Daytona app previews, then add databases, queues, workers, and production-like infrastructure only when the review loop actually needs them.

## Screenshots To Capture

- Local dashboard at `http://127.0.0.1:3001`.
- GitHub Actions run for `Daytona PR Preview`.
- PR comment with the signed preview URL.
- Daytona dashboard showing the PR sandbox.
- Daytona dashboard after closing the PR, showing cleanup or no matching sandbox.

## Demo Script

Short talk track:

```text
Here is the product change in a PR. Instead of deploying a full staging copy, the workflow creates a disposable Daytona sandbox for this branch. The app installs, starts, passes a readiness check, and GitHub gets a preview URL. When the PR closes, the sandbox is deleted. The point is not that this replaces every cloud deployment path. The point is that branch review environments should not require building a platform before the team can use them.
```

## Best Next Step

Push this folder to a GitHub repo and trigger one same-repository PR. That is the missing proof point before polishing the article.
