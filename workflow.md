# Codex Workflow Contract

This file is the instruction file to give Codex when working in this repo.

If the user says something like "fix this feature", "implement this", "use the workflow", or "run the five-agent workflow", follow this contract automatically. Do not ask the user to manually start tester agents, reviewer agents, or worktrees.

## Current Reality

There are two possible execution modes:

1. **True Parallel Mode**: use separate worktrees and separate Codex sessions for each lane.
2. **Single-Session Mode**: if this Codex session cannot programmatically launch other Codex/Orca sessions, run the five lanes sequentially in this same session.

You must use True Parallel Mode only when you can actually launch and monitor the other sessions from tools available in this environment. Do not pretend that parallel agents are running.

If True Parallel Mode is not available, use Single-Session Mode without asking the user. The user wants the workflow handled automatically.

## Five Lanes

Every non-trivial feature/fix must pass through these five lanes:

1. `impl-a`: primary implementation.
2. `impl-b`: independent alternate review/implementation pass.
3. `deep-test`: behavioral tester.
4. `breaker-test`: adversarial tester.
5. `integrator-review`: final integrator/reviewer.

## True Parallel Mode

Use this mode only if you can launch independent Codex sessions yourself.

Steps:

1. Create the five worktrees:

```powershell
powershell -ExecutionPolicy Bypass -File .orca-agent-workflow\scripts\new-parallel-task.ps1 -TaskName "<task name>"
```

2. For each generated sibling worktree, read:

```text
.orca-agent-workflow/current-lane.md
```

3. Launch one Codex session per worktree using the exact lane prompt from `current-lane.md`.

4. Monitor lane completion. Each lane must write:

```text
.orca-agent-workflow/state/<task-slug>-<lane>-report.md
```

5. Use `integrator-review` to compare the implementation lanes and tester reports.

6. Do not merge or deploy.

If any part of launching or monitoring other sessions is not possible from the current tool environment, immediately switch to Single-Session Mode.

## Single-Session Mode

Use this mode when separate agent launching is unavailable. This is still mandatory. Do not skip it.

Run the five lanes in order inside the same session:

### Lane 1: impl-a

Implement the requested change with the smallest correct diff.

Rules:

- Read the relevant code before editing.
- Prefer existing project patterns.
- Keep the diff focused.
- Do not rewrite unrelated code.
- Add focused tests when needed to prove behavior.

Output checkpoint:

- what files changed
- what behavior was implemented
- what remains uncertain

### Lane 2: impl-b

Perform an independent alternate implementation/review pass.

Rules:

- Re-read the task and acceptance criteria.
- Look for a smaller or safer solution than the first implementation.
- If the current implementation is already best, explicitly say so.
- If a better local change is found, apply it.
- Do not expand scope.

Output checkpoint:

- whether the first implementation was kept or revised
- why this is the selected approach
- remaining implementation risks

### Lane 3: deep-test

Prove the intended behavior works.

Rules:

- Add or update behavioral tests.
- Prefer regression, integration, API, and scenario tests over tests that only mirror implementation details.
- Cover the main happy path and important failure paths.
- For this repo, focus especially on AgentArena benchmark behavior, evaluation lifecycle, Daytona sandbox contracts, API/service boundaries, and frontend-visible behavior when relevant.

Validation examples:

```powershell
py -3.11 -m pytest backend/tests
py -3.11 -m pytest backend/tests/test_specific_file.py
powershell -ExecutionPolicy Bypass -File scripts\agentarena.ps1 validate
```

Frontend validation when UI changes:

```powershell
Push-Location frontend
npm install
npm run build
Pop-Location
```

Output checkpoint:

- tests added or changed
- scenarios covered
- scenarios not covered and why

### Lane 4: breaker-test

Try to break the implementation.

Check for:

- invalid inputs
- missing env vars
- duplicate or concurrent requests
- stale evaluation state
- Daytona API failures and cleanup paths
- benchmark task/schema incompatibilities
- unsafe defaults around secrets or env pass-through
- WebSocket/event ordering issues
- database migration or data consistency risks

If bugs are found, fix them or clearly report why they remain.

Output checkpoint:

- failure modes tested
- bugs found and fixed
- unresolved risks

### Lane 5: integrator-review

Do the final review before responding.

Rules:

- Review the final diff against the task.
- Confirm the implementation is scoped.
- Confirm behavioral validation was run or explain why it could not be run.
- Confirm no unrelated files were changed.
- Do not merge.
- Do not deploy.

Final response must include:

- what was done
- what works
- what does not work
- validation commands and results
- remaining risks
- next recommended step

## Completion Report

For every workflow run, write a local report:

```text
.orca-agent-workflow/state/latest-report.md
```

Use this structure:

```markdown
# Workflow Report

Status: Complete | Partial | Blocked

## Task
- ...

## What Was Done
- ...

## What Works
- ...

## What Does Not Work
- ...

## Validation
- Command:
- Result:
- Evidence:

## Five-Lane Outcome
- impl-a:
- impl-b:
- deep-test:
- breaker-test:
- integrator-review:

## Remaining Risks
- ...

## Next Step
- ...
```

Keep the report concise. Do not paste long logs.

## Hard Rules

- Do not stop after implementation only.
- Do not skip tester lanes.
- Do not rely on linting as proof of behavior.
- Do not ask the user to manually run the five lanes.
- Do not claim True Parallel Mode ran unless separate sessions actually launched.
- If the task is tiny or docs-only, still run the five-lane reasoning pass, but scale validation appropriately.
- If blocked, report the exact blocker and the smallest next action needed.
