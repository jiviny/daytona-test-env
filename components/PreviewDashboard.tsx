const previewSteps = [
  {
    label: "PR opened",
    detail: "GitHub Action receives branch metadata and chooses a deterministic sandbox name.",
    state: "complete",
  },
  {
    label: "Sandbox created",
    detail: "Daytona gets the branch in an isolated computer with preview-safe env vars.",
    state: "complete",
  },
  {
    label: "App verified",
    detail: "Setup, start, and readiness checks run before the reviewer link is posted.",
    state: "running",
  },
  {
    label: "Cleanup armed",
    detail: "Auto-stop and auto-delete keep stale previews from becoming cloud chores.",
    state: "queued",
  },
];

const activePreviews = [
  {
    pr: "#184",
    title: "Usage-based billing review",
    branch: "billing/meter-rollups",
    owner: "Asha",
    status: "Ready",
    ttl: "23h 14m",
  },
  {
    pr: "#187",
    title: "Team invite guardrails",
    branch: "growth/invite-review",
    owner: "Marco",
    status: "Building",
    ttl: "Creating",
  },
  {
    pr: "#190",
    title: "Checkout copy experiment",
    branch: "web/checkout-copy",
    owner: "Nina",
    status: "Skipped fork",
    ttl: "No secrets",
  },
];

const checks = [
  ["Build", "Passed"],
  ["Health route", "200 OK"],
  ["Preview token", "Signed"],
  ["Secrets", "Allowlisted"],
  ["Fork policy", "Protected"],
];

const costRows = [
  ["Idle previews", "Auto-stop after 30m"],
  ["Closed PRs", "Delete immediately"],
  ["Review links", "Expire in 24h"],
  ["Runner setup", "No app code on CI"],
];

function statusClass(status: string) {
  const normalized = status.toLowerCase();
  if (
    normalized.includes("ready") ||
    normalized.includes("passed") ||
    normalized.includes("signed") ||
    normalized.includes("ok") ||
    normalized.includes("allowlisted")
  ) {
    return "status status-good";
  }
  if (normalized.includes("build") || normalized.includes("creating")) {
    return "status status-running";
  }
  if (normalized.includes("skip") || normalized.includes("protect")) {
    return "status status-warn";
  }
  return "status status-neutral";
}

export function PreviewDashboard() {
  return (
    <main className="dashboard-shell">
      <aside className="sidebar" aria-label="Demo navigation">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">DT</div>
          <div>
            <p className="eyebrow">Daytona demo</p>
            <h1>PR Preview Control Room</h1>
          </div>
        </div>

        <nav className="nav-list" aria-label="Sections">
          {["Overview", "Sandbox", "Review link", "Full-stack later"].map((item) => (
            <a className={item === "Overview" ? "nav-item nav-item-active" : "nav-item"} href={`#${item.toLowerCase().replaceAll(" ", "-")}`} key={item}>
              <span className="nav-glyph" aria-hidden="true" />
              {item}
            </a>
          ))}
        </nav>

        <div className="sidebar-note">
          <p className="eyebrow">The point</p>
          <strong>Preview infra should be disposable.</strong>
          <span>One branch, one sandbox, one URL, automatic cleanup.</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar" id="overview">
          <div className="hero-copy">
            <p className="eyebrow">Customer-facing demo</p>
            <h2>Every pull request gets a live app without building a preview platform.</h2>
            <p>
              Daytona turns branch code into a disposable sandbox URL, then keeps
              secrets, setup failures, and cleanup visible in the PR.
            </p>
          </div>
          <div className="topbar-actions" aria-label="Demo actions">
            <button className="button button-secondary" type="button">
              <span className="button-glyph" aria-hidden="true">PR</span>
              View PR comment
            </button>
            <button className="button button-primary" type="button">
              <span className="button-glyph" aria-hidden="true">URL</span>
              Open signed preview
            </button>
          </div>
        </header>

        <section className="metric-grid" aria-label="Demo metrics">
          <article className="metric-card">
            <p>Preview setup</p>
            <div className="metric-value-row"><strong>1 file</strong><span className="status status-good">Action</span></div>
            <span>Drop in a workflow and helper script.</span>
          </article>
          <article className="metric-card">
            <p>Sandbox lifecycle</p>
            <div className="metric-value-row"><strong>Auto</strong><span className="status status-running">TTL</span></div>
            <span>Create on PR update, delete on close.</span>
          </article>
          <article className="metric-card">
            <p>Reviewer handoff</p>
            <div className="metric-value-row"><strong>URL</strong><span className="status status-good">Signed</span></div>
            <span>No headers or local setup for reviewers.</span>
          </article>
          <article className="metric-card">
            <p>Cloud work avoided</p>
            <div className="metric-value-row"><strong>DNS</strong><span className="status status-warn">Skipped</span></div>
            <span>No load balancer, ingress, or cleanup service for v0.</span>
          </article>
        </section>

        <section className="main-grid">
          <article className="preview-panel" id="sandbox">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">What Daytona runs</p>
                <h3>Branch app in an isolated sandbox</h3>
              </div>
              <span className="status status-good">Ready for review</span>
            </div>

            <div className="browser-frame" aria-label="Preview mock browser">
              <div className="browser-topbar">
                <span /><span /><span />
                <p>3000-pr-preview-acme-app-pr-184.daytona</p>
              </div>
              <div className="preview-canvas">
                <div className="invoice-strip">
                  <span>Billing meters branch</span>
                  <strong>$4,280</strong>
                </div>
                <div className="usage-chart" aria-hidden="true">
                  <span style={{ height: "36%" }} />
                  <span style={{ height: "58%" }} />
                  <span style={{ height: "44%" }} />
                  <span style={{ height: "82%" }} />
                  <span style={{ height: "64%" }} />
                  <span style={{ height: "90%" }} />
                </div>
                <div className="canvas-footer">
                  <span>npm ci</span>
                  <span>npm run dev</span>
                  <span>/api/health 200</span>
                </div>
              </div>
            </div>

            <div className="route-grid" aria-label="Preview checks">
              {checks.map(([name, value]) => (
                <div className="route-row" key={name}>
                  <code>{name}</code>
                  <span className={statusClass(value)}>{value}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="review-panel" id="review-link">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">PR comment</p>
                <h3>What the reviewer sees</h3>
              </div>
            </div>

            <div className="comment-card">
              <p className="eyebrow">Daytona PR preview</p>
              <h4>Status: ready</h4>
              <code>Sandbox: pr-preview-acme-app-pr-184</code>
              <code>Port: 3000</code>
              <code>Signed URL expires in: 86400 seconds</code>
              <button className="button button-primary" type="button">Open preview URL</button>
            </div>

            <div className="checks-list" aria-label="Guardrails">
              {costRows.map(([name, value]) => (
                <div className="check-row" key={name}>
                  <span>{name}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="lower-grid">
          <article className="table-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Live branches</p>
                <h3>Preview environments</h3>
              </div>
            </div>
            <div className="preview-table" role="table" aria-label="Preview environments">
              <div className="table-row table-head" role="row">
                <span role="columnheader">PR</span>
                <span role="columnheader">Branch</span>
                <span role="columnheader">Owner</span>
                <span role="columnheader">State</span>
                <span role="columnheader">TTL</span>
              </div>
              {activePreviews.map((preview) => (
                <div className="table-row" role="row" key={preview.pr}>
                  <span role="cell"><strong>{preview.pr}</strong><small>{preview.title}</small></span>
                  <span role="cell"><code>{preview.branch}</code></span>
                  <span role="cell">{preview.owner}</span>
                  <span role="cell"><span className={statusClass(preview.status)}>{preview.status}</span></span>
                  <span role="cell">{preview.ttl}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="activity-panel" id="full-stack-later">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Demo script</p>
                <h3>Four moments to show customers</h3>
              </div>
            </div>
            <ol className="timeline">
              {previewSteps.map((step, index) => (
                <li key={step.label}>
                  <time>{String(index + 1).padStart(2, "0")}</time>
                  <div>
                    <strong>{step.label}</strong>
                    <p>{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </article>
        </section>
      </section>
    </main>
  );
}
