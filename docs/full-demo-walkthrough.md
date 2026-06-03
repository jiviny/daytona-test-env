# Full Demo Walkthrough

## What The Local App Is

`http://127.0.0.1:3001` is not running inside Daytona. It is the local version of the target Next.js app.

The actual Daytona demo is:

```text
Make a small branch change
  -> open a GitHub pull request
  -> GitHub Actions creates a Daytona sandbox
  -> the sandbox clones and runs that PR branch
  -> GitHub posts a signed preview URL
  -> closing the PR deletes the sandbox
```

That is the point to show: you do not deploy the whole app to staging just to review a branch.

## What To Demo

The clean demo story:

```text
"Here is a Next.js app. I made one visible UI change on a feature branch. Instead of deploying a full staging copy, the PR workflow spins up a Daytona sandbox, runs that exact branch, posts a preview URL, and deletes the sandbox when the PR closes."
```

## Prerequisites

- Node.js and npm.
- Python 3.
- A GitHub repo created from this folder.
- GitHub Actions enabled.
- GitHub Actions workflow permissions set to `Read and write permissions`.
- Repository secret `DAYTONA_API_KEY`.
- Repository variables:
  - `DAYTONA_TARGET=us`
  - `DAYTONA_PREVIEW_SNAPSHOT=daytona-medium`

Optional for private repos:

- Repository secret `DAYTONA_PREVIEW_GIT_USERNAME`
- Repository secret `DAYTONA_PREVIEW_GIT_PASSWORD`

## Step 1: Prove The App Works Locally

From this folder:

```bash
npm install
npm run verify
```

Run the local app:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3001
```

Open:

```text
http://127.0.0.1:3001
```

Say:

```text
"This is just local development. Daytona is not involved yet. This is the app we want to preview from a pull request."
```

## Step 2: Put The Demo In GitHub

If this folder is not already a Git repo:

```bash
git init -b main
git add .
git commit -m "Add Daytona PR preview demo"
```

Create a GitHub repo, then push:

```bash
git remote add origin git@github.com:YOUR_ORG/daytona-pr-preview-demo.git
git push -u origin main
```

In GitHub, add:

```text
Settings -> Secrets and variables -> Actions -> Secrets -> New repository secret
DAYTONA_API_KEY=<your key>
```

Allow the workflow to post the preview URL comment:

```text
Settings -> Actions -> General -> Workflow permissions
Select: Read and write permissions
Save
```

Then add variables:

```text
Settings -> Secrets and variables -> Actions -> Variables -> New repository variable
DAYTONA_TARGET=us
DAYTONA_PREVIEW_SNAPSHOT=daytona-medium
```

## Step 3: Make A Visible Product Change

Create a branch:

```bash
git checkout -b demo/daytona-preview-copy
```

Apply a visible UI change:

```bash
npm run demo:change
```

Confirm it still works:

```bash
npm run verify
```

Commit and push:

```bash
git add components/PreviewDashboard.tsx
git commit -m "Demo visible PR preview change"
git push -u origin demo/daytona-preview-copy
```

Open a pull request from `demo/daytona-preview-copy` into `main`.

## Step 4: Watch Daytona Create The Preview

In GitHub:

```text
Pull request -> Checks
```

Open:

```text
Daytona PR Preview
```

The workflow runs:

```text
.github/workflows/daytona-pr-preview.yml
```

What it does:

```text
1. Checks out trusted workflow/helper code from the base branch.
2. Creates or updates one Daytona sandbox for this PR.
3. Clones the PR branch inside the sandbox.
4. Runs npm ci.
5. Starts Next.js on port 3000.
6. Waits for /api/health to return 200.
7. Creates a signed preview URL.
8. Posts or updates one PR comment.
```

## Step 5: Open The Preview URL

On the pull request, look for the comment:

```text
Daytona PR preview
```

Open the signed URL from that comment.

You should see the changed branch copy:

```text
Billing approvals are live on this branch before staging exists.
```

Say:

```text
"This URL is not my laptop and it is not staging. It is the pull request branch running inside a disposable Daytona sandbox."
```

## Step 6: Prove Cleanup

Close the pull request.

Go back to:

```text
Pull request -> Checks -> Daytona PR Preview
```

The same workflow runs the delete path. It finds the sandbox by deterministic PR labels and deletes it.

Say:

```text
"The important part is not only creation. Cleanup is built into the PR lifecycle, so preview environments do not become permanent cloud resources."
```

## What To Screenshot For The Article

1. Local Next.js app before the change.
2. The PR diff showing `components/PreviewDashboard.tsx`.
3. GitHub Actions running `Daytona PR Preview`.
4. The PR comment with the signed Daytona URL.
5. The Daytona preview URL showing the changed copy.
6. The cleanup action after closing the PR.

## Clean Reset After The Demo

If you want to remove the demo copy change locally:

```bash
npm run demo:reset
npm run verify
```

## Short Article Outline

Title:

```text
Preview Environments Without Building A Preview Platform
```

Thesis:

```text
A pull request preview does not need to start as a Kubernetes/ECS platform. For many apps, the first useful version is a disposable sandbox that runs the branch, exposes a signed URL, and deletes itself when review is over.
```

Sections:

1. The problem with traditional preview environments.
2. The simple PR lifecycle Daytona makes possible.
3. The Next.js demo app.
4. The GitHub Action.
5. The PR comment as the reviewer handoff.
6. Cleanup as the real cost-control feature.
7. When to graduate to full cloud infrastructure.

Best closing line:

```text
Use Daytona when the job is branch review. Use the hyperscaler directly when the job is validating production infrastructure.
```
