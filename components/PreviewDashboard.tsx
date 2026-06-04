"use client";

import { useCallback, useEffect, useState } from "react";

type ServiceStatus = "ok" | "down";

interface Health {
  ok: boolean;
  ready: boolean;
  preview: boolean;
  pr: string | null;
  sha: string | null;
  services: Record<string, ServiceStatus>;
}

interface Customer {
  id: string;
  name: string;
  contact_email: string;
}

interface Subscription {
  plan: string;
  requested_plan: string | null;
  status: string;
  priority_provisioning: boolean;
  updated_at: string;
}

interface Job {
  id: string;
  from_plan: string;
  to_plan: string;
  status: string;
  priority: boolean;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: number;
  kind: string;
  message: string;
  created_at: string;
}

interface EmailRow {
  id: number;
  recipient: string;
  subject: string;
  body: string;
  created_at: string;
}

interface WebhookRow {
  id: number;
  event_type: string;
  payload: unknown;
  signature_valid: boolean;
  source: string;
  created_at: string;
}

interface PreviewState {
  preview: boolean;
  pr: string | null;
  sha: string | null;
  repository: string | null;
  headRef: string | null;
  customer: Customer | null;
  subscription: Subscription | null;
  jobs: Job[];
  events: EventRow[];
  emails: EmailRow[];
  webhooks: WebhookRow[];
  health: Health | null;
}

const SERVICES: ReadonlyArray<readonly [string, string]> = [
  ["web", "Web app"],
  ["database", "Postgres"],
  ["queue", "Redis"],
  ["worker", "Worker"],
  ["webhook", "Webhook receiver"],
  ["email", "Email capture"],
];

const WEBHOOK_CURL = [
  `curl -X POST "$PREVIEW_URL/api/webhooks/billing" \\`,
  `  -H "content-type: application/json" \\`,
  `  -H "x-demo-signature: <hmac-sha256(body, demo secret)>" \\`,
  `  -d '{"type":"invoice.paid","customer":"acme-logistics"}'`,
].join("\n");

function statusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (["ok", "provisioned", "completed", "active"].includes(normalized)) return "status status-good";
  if (["provisioning", "queued", "running"].includes(normalized)) return "status status-running";
  if (["down", "failed"].includes(normalized)) return "status status-attention";
  return "status status-neutral";
}

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : "local";
}

function formatTime(value: string): string {
  try {
    return new Date(value).toLocaleTimeString();
  } catch {
    return value;
  }
}

export function PreviewDashboard() {
  const [state, setState] = useState<PreviewState | null>(null);
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const data = (await res.json()) as PreviewState;
      setState(data);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    // Poll the live state. The first tick is deferred (not a synchronous effect body
    // call) and subsequent ticks run on the interval.
    const first = setTimeout(refresh, 0);
    const interval = setInterval(refresh, 2000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [refresh]);

  const action = useCallback(
    async (label: string, path: string) => {
      setBusy(label);
      setNotice(null);
      try {
        const res = await fetch(path, { method: "POST", cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        setNotice(
          data.ok === false ? `${label} failed: ${data.error ?? res.status}` : `${label} accepted.`,
        );
        await refresh();
      } catch (error) {
        setNotice(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const health = state?.health ?? null;
  const subscription = state?.subscription ?? null;
  const customer = state?.customer ?? null;
  const events = state?.events ?? [];
  const emails = state?.emails ?? [];
  const webhooks = state?.webhooks ?? [];
  const latestJob = state?.jobs?.[0] ?? null;

  const connectionLabel = state === null ? "connecting" : online ? "live" : "reconnecting";
  const isPro = subscription?.plan === "Pro";
  const provisioning = subscription?.status === "provisioning";
  const upgradeLabel =
    busy === "Upgrade to Pro"
      ? "Upgrading…"
      : isPro
        ? "On Pro plan"
        : provisioning
          ? "Provisioning…"
          : "Upgrade to Pro";

  return (
    <main className="dashboard-shell">
      <aside className="sidebar" aria-label="Preview metadata">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            DT
          </div>
          <div>
            <p className="eyebrow">Daytona preview</p>
            <h1>Billing Operations Preview</h1>
          </div>
        </div>

        <div className="meta-list">
          <div className="meta-row">
            <span>PR</span>
            <strong>{state?.pr ? `#${state.pr}` : "local"}</strong>
          </div>
          <div className="meta-row">
            <span>Commit</span>
            <code>{shortSha(state?.sha ?? null)}</code>
          </div>
          <div className="meta-row">
            <span>Branch</span>
            <code>{state?.headRef ?? "—"}</code>
          </div>
          <div className="meta-row">
            <span>Mode</span>
            <span className={state?.preview ? "status status-good" : "status status-neutral"}>
              {state?.preview ? "Daytona" : "Local"}
            </span>
          </div>
          <div className="meta-row">
            <span>Readiness</span>
            <span className={health?.ready ? "status status-good" : "status status-running"}>
              {health?.ready ? "ready" : "starting"}
            </span>
          </div>
        </div>

        <div className="sidebar-note">
          <p className="eyebrow">Why Daytona</p>
          <strong>This PR needs more than localhost.</strong>
          <span>
            A database, a queue, a worker, email capture, and a webhook — disposable, online, and
            deleted on PR close.
          </span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="hero-copy">
            <p className="eyebrow">Full-stack branch review</p>
            <h2>Provision {customer?.name ?? "Acme Logistics"} from Starter to Pro.</h2>
            <p>
              Trigger the upgrade and watch real services move it through the queue and worker — no
              local Docker, no shared staging.
            </p>
          </div>
          <div className="topbar-actions" aria-label="Demo actions">
            <button
              className="button button-primary"
              type="button"
              disabled={busy !== null || isPro || provisioning}
              onClick={() => action("Upgrade to Pro", "/api/billing/upgrade")}
            >
              <span className="button-glyph" aria-hidden="true">
                ↑
              </span>
              {upgradeLabel}
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={busy !== null}
              onClick={() => action("Replay billing webhook", "/api/webhooks/billing/replay")}
            >
              <span className="button-glyph" aria-hidden="true">
                ⟳
              </span>
              Replay webhook
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={busy !== null}
              onClick={() => action("Reset demo", "/api/demo/reset")}
            >
              Reset
            </button>
          </div>
        </header>

        {notice ? <div className="notice">{notice}</div> : null}

        <section className="metric-grid" aria-label="Subscription summary">
          <article className="metric-card">
            <p>Current plan</p>
            <div className="metric-value-row">
              <strong>{subscription?.plan ?? "—"}</strong>
              <span className={statusClass(subscription?.status ?? "neutral")}>
                {subscription?.status ?? "unknown"}
              </span>
            </div>
            <span>
              {subscription?.requested_plan
                ? `Requested: ${subscription.requested_plan}`
                : "No pending change"}
            </span>
          </article>
          <article className="metric-card">
            <p>Priority provisioning</p>
            <div className="metric-value-row">
              <strong>{subscription?.priority_provisioning ? "On" : "Off"}</strong>
              <span
                className={
                  subscription?.priority_provisioning ? "status status-good" : "status status-neutral"
                }
              >
                {subscription?.priority_provisioning ? "Pro" : "Standard"}
              </span>
            </div>
            <span>Pro plans get priority provisioning.</span>
          </article>
          <article className="metric-card">
            <p>Latest job</p>
            <div className="metric-value-row">
              <strong>{latestJob ? latestJob.status : "idle"}</strong>
              <span className={statusClass(latestJob?.status ?? "neutral")}>
                {latestJob ? `${latestJob.from_plan}→${latestJob.to_plan}` : "—"}
              </span>
            </div>
            <span>{latestJob ? latestJob.id : "No provisioning yet"}</span>
          </article>
          <article className="metric-card">
            <p>Connection</p>
            <div className="metric-value-row">
              <strong>{connectionLabel}</strong>
              <span className={online ? "status status-good" : "status status-running"}>
                /api/state
              </span>
            </div>
            <span>Refreshes every 2 seconds.</span>
          </article>
        </section>

        <section className="main-grid">
          <article className="preview-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Customer</p>
                <h3>{customer?.name ?? "Acme Logistics"}</h3>
              </div>
              <span className={statusClass(subscription?.status ?? "neutral")}>
                {subscription?.status ?? "unknown"}
              </span>
            </div>

            <div className="kpi-grid">
              <div className="kpi">
                <span>Plan</span>
                <strong>{subscription?.plan ?? "—"}</strong>
              </div>
              <div className="kpi">
                <span>Contact</span>
                <strong>{customer?.contact_email ?? "reviewer@example.com"}</strong>
              </div>
              <div className="kpi">
                <span>Updated</span>
                <strong>{subscription?.updated_at ? formatTime(subscription.updated_at) : "—"}</strong>
              </div>
            </div>

            <div className="panel-heading">
              <div>
                <p className="eyebrow">Event timeline</p>
                <h3>Provisioning activity</h3>
              </div>
              <span className="status status-neutral">{events.length} events</span>
            </div>
            <ol className="timeline-feed">
              {events.length === 0 ? (
                <li className="timeline-empty">
                  No activity yet. Click <strong>Upgrade to Pro</strong> to start the flow.
                </li>
              ) : (
                events.map((event) => (
                  <li key={event.id}>
                    <span className={`feed-dot feed-${event.kind}`} aria-hidden="true" />
                    <div>
                      <strong>{event.message}</strong>
                      <time>{formatTime(event.created_at)}</time>
                    </div>
                  </li>
                ))
              )}
            </ol>
          </article>

          <div className="side-stack">
            <article className="review-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Service health</p>
                  <h3>{health?.ready ? "All services ready" : "Bringing services up"}</h3>
                </div>
              </div>
              <div className="svc-list">
                {SERVICES.map(([key, label]) => {
                  const status = health?.services?.[key] ?? "down";
                  return (
                    <div className="svc-row" key={key}>
                      <span>
                        <span className={`svc-dot svc-${status}`} aria-hidden="true" />
                        {label}
                      </span>
                      <span
                        className={status === "ok" ? "status status-good" : "status status-attention"}
                      >
                        {status === "ok" ? "OK" : "down"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="review-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Preview inbox</p>
                  <h3>Captured email</h3>
                </div>
                <span className="status status-neutral">{emails.length}</span>
              </div>
              {emails.length === 0 ? (
                <p className="muted-line">No email captured yet. Emails are stored, never sent.</p>
              ) : (
                <div className="email-list">
                  {emails.slice(0, 3).map((email) => (
                    <div className="email-item" key={email.id}>
                      <strong>{email.subject}</strong>
                      <span>To: {email.recipient}</span>
                      <pre>{email.body}</pre>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="review-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Webhook receiver</p>
                  <h3>Replay a billing event</h3>
                </div>
                <span className="status status-neutral">{webhooks.length}</span>
              </div>
              <p className="muted-line">Public endpoint reviewers can hit from anywhere:</p>
              <pre className="code-block">{WEBHOOK_CURL}</pre>
              {webhooks.length > 0 ? (
                <div className="checks-list">
                  {webhooks.slice(0, 3).map((hook) => (
                    <div className="check-row" key={hook.id}>
                      <span>
                        {hook.event_type} <small>({hook.source})</small>
                      </span>
                      <strong className={hook.signature_valid ? "ok-text" : "down-text"}>
                        {hook.signature_valid ? "verified" : "rejected"}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}
