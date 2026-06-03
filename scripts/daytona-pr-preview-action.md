# Daytona PR Preview GitHub Action

The maintained workflow lives at:

```text
.github/workflows/daytona-pr-preview.yml
```

Copy that file, plus `scripts/daytona-pr-preview.py` and `src/daytona/pr_preview.py`,
into the repo that should receive PR preview sandboxes.

Required secret:

- `DAYTONA_API_KEY`

Optional repository variables:

- `DAYTONA_API_URL`, default `https://app.daytona.io/api`
- `DAYTONA_TARGET`
- `DAYTONA_ORGANIZATION_ID`
- `DAYTONA_PREVIEW_SNAPSHOT` or `DAYTONA_SNAPSHOT`
- `DAYTONA_PREVIEW_PORT`, default `3000`
- `DAYTONA_PREVIEW_URL_EXPIRES_SECONDS` or `DAYTONA_PREVIEW_EXPIRES_SECONDS`, default `86400`
- `DAYTONA_PREVIEW_AUTO_STOP_MINUTES`, default `30`
- `DAYTONA_PREVIEW_AUTO_DELETE_MINUTES`, default `1440`
- `DAYTONA_PREVIEW_CPU`, `DAYTONA_PREVIEW_MEMORY`, and `DAYTONA_PREVIEW_DISK`, optional sandbox sizing
- `DAYTONA_PREVIEW_PROJECT_DIR`, default `/home/daytona/pr-preview`
- `DAYTONA_PREVIEW_SETUP_COMMAND` or `DAYTONA_PREVIEW_BOOT_COMMAND`, for example `npm ci`
- `DAYTONA_PREVIEW_START_COMMAND`, for example `npm run dev -- --hostname 0.0.0.0 --port 3000`
- `DAYTONA_PREVIEW_READY_COMMAND`, command retried until it passes before the URL is posted
- `DAYTONA_PREVIEW_COMMAND_TIMEOUT_SECONDS`, default `900`
- `DAYTONA_PREVIEW_WAIT_SECONDS`, default `600`
- `DAYTONA_PREVIEW_ENV_ALLOWLIST`, comma-separated non-secret env names to inject
- `DAYTONA_PREVIEW_ENV_JSON`, JSON object for explicit non-secret preview env
- `DAYTONA_PREVIEW_ALLOW_SECRET_NAMES`, default `false`
- `DAYTONA_PREVIEW_ALLOW_FORKS`, default `false`
- `DAYTONA_PREVIEW_NO_DEPLOY`, default `false`

Optional secrets:

- `DAYTONA_ORGANIZATION_ID`, if this value should not be visible as a variable
- `DAYTONA_PREVIEW_GIT_USERNAME` and `DAYTONA_PREVIEW_GIT_PASSWORD` for private repo clone access

The helper intentionally dry-runs when `DAYTONA_API_KEY` is missing, so repos
without Daytona credentials still get a non-destructive workflow result.
It never forwards the runner environment wholesale. Only metadata, `PORT`, names
listed in `DAYTONA_PREVIEW_ENV_ALLOWLIST`, and keys from `DAYTONA_PREVIEW_ENV_JSON`
are sent to the sandbox. Secret-looking names such as `TOKEN`, `KEY`, `SECRET`,
and `PASSWORD` are skipped unless `DAYTONA_PREVIEW_ALLOW_SECRET_NAMES=true`.

The workflow uses `pull_request_target` but checks out the trusted base branch and
skips fork previews by default. It never checks out or executes PR code on the
GitHub runner; PR code is cloned only inside the Daytona sandbox when previews are
allowed.

Set `DAYTONA_PREVIEW_ALLOW_FORKS=true` only for repositories prepared to run fork
code in disposable sandboxes. Be careful with `DAYTONA_PREVIEW_GIT_USERNAME`,
`DAYTONA_PREVIEW_GIT_PASSWORD`, and `DAYTONA_PREVIEW_ALLOW_SECRET_NAMES`; any
credential made available to the clone or preview environment should be treated as
reachable by the previewed PR code.
