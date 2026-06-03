"""Create, update, and delete Daytona PR preview sandboxes.

The module intentionally uses only the Python standard library so it can run
from GitHub Actions without installing the Daytona SDK.
"""

from __future__ import annotations

import argparse
import dataclasses
import hashlib
import json
import os
import posixpath
import re
import shlex
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


DEFAULT_API_URL = "https://app.daytona.io/api"
DEFAULT_PROJECT_DIR = "/home/daytona/pr-preview"
DEFAULT_PREVIEW_PORT = 3000
DEFAULT_URL_EXPIRES_SECONDS = 86400
DEFAULT_AUTO_STOP_MINUTES = 30
DEFAULT_AUTO_DELETE_MINUTES = 1440
DEFAULT_WAIT_SECONDS = 600
DEFAULT_COMMAND_TIMEOUT_SECONDS = 900

STARTED_STATES = {"started"}
STARTING_STATES = {
    "creating",
    "starting",
    "restoring",
    "pulling_snapshot",
    "building_snapshot",
    "pending_build",
}
STOPPED_STATES = {"stopped", "archived"}
TERMINAL_ERROR_STATES = {"error", "build_failed", "destroyed", "destroying"}

ENV_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
SECRET_NAME_RE = re.compile(
    r"(SECRET|TOKEN|KEY|PASSWORD|PASS|CREDENTIAL|PRIVATE|AUTH)", re.IGNORECASE
)


class DaytonaApiError(RuntimeError):
    """Raised when the Daytona API returns an unexpected response."""


@dataclasses.dataclass(frozen=True)
class PreviewConfig:
    action: str
    repository: str
    pr_number: str
    sha: str
    head_ref: str
    repo_url: str
    api_url: str
    api_key: str
    organization_id: str
    target: str
    snapshot: str
    preview_port: int
    signed_url_expires_seconds: int
    auto_stop_minutes: int
    auto_delete_minutes: int
    cpu: int | None
    memory: int | None
    disk: int | None
    project_dir: str
    setup_command: str
    start_command: str
    ready_command: str
    command_timeout_seconds: int
    wait_seconds: int
    env_allowlist: tuple[str, ...]
    env_json: dict[str, str]
    allow_secret_env_names: bool
    git_username: str
    git_password: str
    dry_run: bool
    no_deploy: bool

    @property
    def effective_dry_run(self) -> bool:
        return self.dry_run or not self.api_key

    @property
    def dry_run_reason(self) -> str:
        if self.dry_run:
            return "requested with --dry-run"
        if not self.api_key:
            return "missing DAYTONA_API_KEY"
        return ""


class DaytonaClient:
    def __init__(self, api_url: str, api_key: str, organization_id: str = "") -> None:
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        self.organization_id = organization_id

    def request(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, Any] | None = None,
        body: dict[str, Any] | None = None,
        expected: tuple[int, ...] = (200,),
    ) -> Any:
        url = f"{self.api_url}{path}"
        if query:
            url = f"{url}?{urllib.parse.urlencode(query, doseq=True)}"

        data = None
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        if self.organization_id:
            headers["X-Daytona-Organization-ID"] = self.organization_id
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"

        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                response_body = response.read()
                if response.status not in expected:
                    raise DaytonaApiError(
                        f"{method} {path} returned HTTP {response.status}"
                    )
                return decode_response_body(
                    response_body, response.headers.get("content-type", "")
                )
        except urllib.error.HTTPError as exc:
            response_body = exc.read()
            if exc.code in expected:
                return decode_response_body(
                    response_body, exc.headers.get("content-type", "")
                )
            error_text = response_body.decode("utf-8", errors="replace").strip()
            detail = f": {error_text}" if error_text else ""
            raise DaytonaApiError(
                f"{method} {path} returned HTTP {exc.code}{detail}"
            ) from exc
        except urllib.error.URLError as exc:
            raise DaytonaApiError(f"{method} {path} failed: {exc.reason}") from exc

    def toolbox_request(
        self,
        sandbox: dict[str, Any],
        method: str,
        path: str,
        *,
        body: dict[str, Any] | None = None,
        expected: tuple[int, ...] = (200,),
    ) -> Any:
        toolbox_base = str(sandbox.get("toolboxProxyUrl") or "").rstrip("/")
        sandbox_id = str(sandbox.get("id") or "")
        if not toolbox_base or not sandbox_id:
            raise DaytonaApiError("sandbox response did not include toolbox proxy details")
        saved_api_url = self.api_url
        try:
            self.api_url = f"{toolbox_base}/{urllib.parse.quote(sandbox_id, safe='')}"
            return self.request(method, path, body=body, expected=expected)
        finally:
            self.api_url = saved_api_url


def parse_int(value: str, default: int) -> int:
    if value == "":
        return default
    return int(value)


def parse_optional_int(value: str) -> int | None:
    if value == "":
        return None
    return int(value)


def parse_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def decode_response_body(response_body: bytes, content_type: str) -> Any:
    if not response_body:
        return None
    if "application/json" in content_type.lower():
        return json.loads(response_body.decode("utf-8"))
    return response_body.decode("utf-8", errors="replace")


def normalize_api_url(api_url: str) -> str:
    normalized = (api_url.strip() or DEFAULT_API_URL).rstrip("/")
    parsed = urllib.parse.urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("--api-url must be an absolute http(s) URL")
    if parsed.scheme == "http" and parsed.hostname not in {
        "localhost",
        "127.0.0.1",
        "::1",
    }:
        raise ValueError("--api-url must use https unless it targets localhost")
    return normalized


def parse_json_object(value: str) -> dict[str, str]:
    if not value.strip():
        return {}
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        raise ValueError("expected a JSON object")
    result: dict[str, str] = {}
    for key, raw_value in parsed.items():
        if not isinstance(key, str) or not ENV_NAME_RE.match(key):
            raise ValueError(f"invalid environment variable name in JSON: {key!r}")
        if raw_value is None:
            continue
        result[key] = str(raw_value)
    return result


def parse_env_allowlist(value: str) -> tuple[str, ...]:
    if not value.strip():
        return ()
    names = re.split(r"[\s,]+", value.strip())
    invalid = [name for name in names if name and not ENV_NAME_RE.match(name)]
    if invalid:
        raise ValueError(f"invalid environment variable name(s): {', '.join(invalid)}")
    return tuple(name for name in names if name)


def sanitized_name(value: str, max_length: int = 63) -> str:
    lowered = value.lower()
    safe = re.sub(r"[^a-z0-9.-]+", "-", lowered)
    safe = re.sub(r"-+", "-", safe).strip(".-")
    if not safe:
        safe = "preview"
    if len(safe) <= max_length:
        return safe
    digest = hashlib.sha1(safe.encode("utf-8")).hexdigest()[:8]
    return f"{safe[: max_length - 9].rstrip('.-')}-{digest}"


def sandbox_name(repository: str, pr_number: str) -> str:
    repo_slug = sanitized_name(repository.replace("/", "-"), max_length=44)
    return sanitized_name(f"pr-preview-{repo_slug}-pr-{pr_number}")


def preview_labels(config: PreviewConfig, name: str) -> dict[str, str]:
    return {
        "managed_by": "github-actions",
        "purpose": "pr-preview",
        "github_repository": config.repository,
        "github_pr": str(config.pr_number),
        "github_sha": config.sha,
        "sandbox_name": name,
    }


def selector_labels(config: PreviewConfig) -> dict[str, str]:
    return {
        "managed_by": "github-actions",
        "purpose": "pr-preview",
        "github_repository": config.repository,
        "github_pr": str(config.pr_number),
    }


def normalize_project_dir(project_dir: str) -> str:
    normalized = posixpath.normpath(project_dir)
    if not normalized.startswith("/"):
        raise ValueError("DAYTONA_PREVIEW_PROJECT_DIR must be an absolute sandbox path")
    safe_prefixes = (
        "/home/daytona/",
        "/workspace/",
        "/tmp/daytona-pr-preview/",
    )
    if not any(normalized.startswith(prefix) for prefix in safe_prefixes):
        raise ValueError(
            "DAYTONA_PREVIEW_PROJECT_DIR must stay under /home/daytona, "
            "/workspace, or /tmp/daytona-pr-preview"
        )
    return normalized


def build_sandbox_env(config: PreviewConfig) -> tuple[dict[str, str], list[str]]:
    env: dict[str, str] = {
        "GITHUB_REPOSITORY": config.repository,
        "GITHUB_PR_NUMBER": str(config.pr_number),
        "GITHUB_SHA": config.sha,
        "GITHUB_HEAD_REF": config.head_ref,
        "PORT": str(config.preview_port),
        "DAYTONA_PREVIEW": "true",
    }
    skipped: list[str] = []

    for name in config.env_allowlist:
        if name not in os.environ:
            continue
        if SECRET_NAME_RE.search(name) and not config.allow_secret_env_names:
            skipped.append(name)
            continue
        env[name] = os.environ[name]

    for name, value in config.env_json.items():
        if SECRET_NAME_RE.search(name) and not config.allow_secret_env_names:
            skipped.append(name)
            continue
        env[name] = value

    return env, sorted(set(skipped))


def sandbox_summary(sandbox: dict[str, Any] | None) -> dict[str, Any] | None:
    if not sandbox:
        return None
    return {
        "id": sandbox.get("id"),
        "name": sandbox.get("name"),
        "state": sandbox.get("state"),
        "target": sandbox.get("target"),
        "createdAt": sandbox.get("createdAt"),
        "updatedAt": sandbox.get("updatedAt"),
    }


def sandbox_matches_selector(
    sandbox: dict[str, Any], config: PreviewConfig, expected_name: str
) -> bool:
    labels = sandbox.get("labels") if isinstance(sandbox.get("labels"), dict) else {}
    name_matches = (
        sandbox.get("name") == expected_name
        or labels.get("sandbox_name") == expected_name
    )
    if not name_matches:
        return False
    selector = selector_labels(config)
    return all(labels.get(key) == value for key, value in selector.items())


def get_sandbox_by_name_if_owned(
    client: DaytonaClient, config: PreviewConfig, name: str
) -> dict[str, Any] | None:
    response = client.request(
        "GET",
        f"/sandbox/{urllib.parse.quote(name, safe='')}",
        expected=(200, 404),
    )
    if isinstance(response, dict) and sandbox_matches_selector(response, config, name):
        return response
    return None


def list_matching_sandboxes(client: DaytonaClient, config: PreviewConfig) -> list[dict[str, Any]]:
    query = {
        "labels": json.dumps(selector_labels(config), separators=(",", ":")),
        "limit": 100,
    }
    response = client.request("GET", "/sandbox", query=query)
    items = response.get("items", []) if isinstance(response, dict) else []
    if not isinstance(items, list):
        raise DaytonaApiError("unexpected /sandbox list response")
    expected_name = sandbox_name(config.repository, str(config.pr_number))
    matches = [
        item
        for item in items
        if sandbox_matches_selector(item, config, expected_name)
    ]
    if matches:
        return matches

    by_name = get_sandbox_by_name_if_owned(client, config, expected_name)
    return [by_name] if by_name else []


def create_sandbox(
    client: DaytonaClient,
    config: PreviewConfig,
    name: str,
    labels: dict[str, str],
    env: dict[str, str],
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": name,
        "labels": labels,
        "env": env,
        "public": False,
        "autoStopInterval": config.auto_stop_minutes,
        "autoDeleteInterval": config.auto_delete_minutes,
    }
    if config.snapshot:
        payload["snapshot"] = config.snapshot
    if config.target:
        payload["target"] = config.target
    if config.cpu is not None:
        payload["cpu"] = config.cpu
    if config.memory is not None:
        payload["memory"] = config.memory
    if config.disk is not None:
        payload["disk"] = config.disk
    response = client.request(
        "POST", "/sandbox", body=payload, expected=(200, 201, 202)
    )
    if isinstance(response, dict):
        return response
    created = get_sandbox_by_name_if_owned(client, config, name)
    if created:
        return created
    raise DaytonaApiError("sandbox create response did not include sandbox details")


def refresh_sandbox(client: DaytonaClient, sandbox_id_or_name: str) -> dict[str, Any]:
    quoted = urllib.parse.quote(sandbox_id_or_name, safe="")
    return client.request("GET", f"/sandbox/{quoted}")


def wait_for_started(
    client: DaytonaClient, sandbox: dict[str, Any], wait_seconds: int
) -> dict[str, Any]:
    sandbox_id = str(sandbox.get("id") or sandbox.get("name") or "")
    if not sandbox_id:
        raise DaytonaApiError("sandbox response did not include id or name")

    deadline = time.monotonic() + wait_seconds
    current = sandbox
    while True:
        state = str(current.get("state") or "").lower()
        if state in STARTED_STATES:
            return current
        if state in STOPPED_STATES:
            started = client.request(
                "POST",
                f"/sandbox/{urllib.parse.quote(sandbox_id, safe='')}/start",
                expected=(200, 202, 204),
            )
            current = (
                started
                if isinstance(started, dict)
                else refresh_sandbox(client, sandbox_id)
            )
            continue
        if state in TERMINAL_ERROR_STATES:
            raise DaytonaApiError(f"sandbox entered terminal state: {state}")
        if time.monotonic() >= deadline:
            raise DaytonaApiError(
                f"timed out waiting for sandbox {sandbox_id} to start; last state={state}"
            )
        time.sleep(5)
        current = refresh_sandbox(client, sandbox_id)


def replace_labels(
    client: DaytonaClient, sandbox: dict[str, Any], labels: dict[str, str]
) -> None:
    sandbox_id = str(sandbox.get("id") or sandbox.get("name") or "")
    if not sandbox_id:
        return
    existing = sandbox.get("labels") if isinstance(sandbox.get("labels"), dict) else {}
    merged = {str(key): str(value) for key, value in existing.items()}
    merged.update(labels)
    client.request(
        "PUT",
        f"/sandbox/{urllib.parse.quote(sandbox_id, safe='')}/labels",
        body={"labels": merged},
        expected=(200, 204),
    )


def set_lifecycle(client: DaytonaClient, sandbox: dict[str, Any], config: PreviewConfig) -> None:
    sandbox_id = str(sandbox.get("id") or sandbox.get("name") or "")
    if not sandbox_id:
        return
    quoted = urllib.parse.quote(sandbox_id, safe="")
    client.request(
        "POST",
        f"/sandbox/{quoted}/autostop/{config.auto_stop_minutes}",
        expected=(200, 201, 202, 204),
    )
    client.request(
        "POST",
        f"/sandbox/{quoted}/autodelete/{config.auto_delete_minutes}",
        expected=(200, 201, 202, 204),
    )


def execute_shell(
    client: DaytonaClient,
    sandbox: dict[str, Any],
    command: str,
    *,
    cwd: str | None = None,
    env: dict[str, str] | None = None,
    timeout: int = 60,
) -> dict[str, Any]:
    body: dict[str, Any] = {"command": command, "timeout": timeout}
    if cwd:
        body["cwd"] = cwd
    if env:
        body["envs"] = env
    response = client.toolbox_request(sandbox, "POST", "/process/execute", body=body)
    exit_code = response.get("exitCode", 0) if isinstance(response, dict) else 0
    if exit_code not in (0, None):
        output = response.get("result", "") if isinstance(response, dict) else ""
        raise DaytonaApiError(f"sandbox command failed with exit code {exit_code}: {output}")
    return response if isinstance(response, dict) else {"result": str(response)}


def clone_repository(
    client: DaytonaClient, sandbox: dict[str, Any], config: PreviewConfig
) -> None:
    project_dir = normalize_project_dir(config.project_dir)
    parent_dir = posixpath.dirname(project_dir)
    cleanup = (
        f"rm -rf {shlex.quote(project_dir)} && "
        f"mkdir -p {shlex.quote(parent_dir)}"
    )
    execute_shell(client, sandbox, cleanup, timeout=120)

    clone_body: dict[str, Any] = {
        "url": config.repo_url,
        "path": project_dir,
    }
    if config.head_ref:
        clone_body["branch"] = config.head_ref
    if config.sha:
        clone_body["commit_id"] = config.sha
    if config.git_username:
        clone_body["username"] = config.git_username
    if config.git_password:
        clone_body["password"] = config.git_password
    client.toolbox_request(
        sandbox, "POST", "/git/clone", body=clone_body, expected=(200, 201, 204)
    )


def wait_for_ready_command(
    client: DaytonaClient,
    sandbox: dict[str, Any],
    config: PreviewConfig,
    sandbox_env: dict[str, str],
    project_dir: str,
) -> int:
    deadline = time.monotonic() + config.wait_seconds
    attempts = 0
    while True:
        attempts += 1
        remaining = max(1, int(deadline - time.monotonic()))
        try:
            execute_shell(
                client,
                sandbox,
                config.ready_command,
                cwd=project_dir,
                env=sandbox_env,
                timeout=min(config.command_timeout_seconds, 300, remaining),
            )
            return attempts
        except DaytonaApiError as exc:
            if time.monotonic() >= deadline:
                raise DaytonaApiError(
                    "readiness command did not succeed after "
                    f"{attempts} attempt(s): {exc}"
                ) from exc
            time.sleep(min(5, max(0.0, deadline - time.monotonic())))


def run_preview_commands(
    client: DaytonaClient,
    sandbox: dict[str, Any],
    config: PreviewConfig,
    sandbox_env: dict[str, str],
) -> list[str]:
    if config.no_deploy:
        return ["deployment skipped by --no-deploy"]

    messages: list[str] = []
    if config.repo_url:
        clone_repository(client, sandbox, config)
        messages.append("repository cloned at requested PR commit")
    else:
        messages.append("repository clone skipped because repo URL was empty")

    project_dir = normalize_project_dir(config.project_dir)
    if config.setup_command:
        execute_shell(
            client,
            sandbox,
            config.setup_command,
            cwd=project_dir,
            env=sandbox_env,
            timeout=config.command_timeout_seconds,
        )
        messages.append("setup command completed")

    if config.start_command:
        stop_command = (
            "if [ -f .daytona-preview.pid ]; then "
            "pid=$(cat .daytona-preview.pid); "
            "kill \"$pid\" >/dev/null 2>&1 || true; "
            "rm -f .daytona-preview.pid; "
            "fi"
        )
        execute_shell(client, sandbox, stop_command, cwd=project_dir, timeout=30)
        start_command = (
            f"nohup sh -lc {shlex.quote(config.start_command)} "
            "> .daytona-preview.log 2>&1 & echo $! > .daytona-preview.pid"
        )
        execute_shell(
            client,
            sandbox,
            start_command,
            cwd=project_dir,
            env=sandbox_env,
            timeout=30,
        )
        messages.append("preview command started in background")
    else:
        messages.append("preview command skipped because DAYTONA_PREVIEW_START_COMMAND is empty")

    if config.ready_command:
        attempts = wait_for_ready_command(
            client, sandbox, config, sandbox_env, project_dir
        )
        if attempts == 1:
            messages.append("readiness command completed")
        else:
            messages.append(f"readiness command completed after {attempts} attempts")
    return messages


def create_signed_preview_url(
    client: DaytonaClient, sandbox: dict[str, Any], config: PreviewConfig
) -> dict[str, Any]:
    sandbox_id = str(sandbox.get("id") or sandbox.get("name") or "")
    if not sandbox_id:
        raise DaytonaApiError("sandbox response did not include id or name")
    quoted = urllib.parse.quote(sandbox_id, safe="")
    return client.request(
        "GET",
        f"/sandbox/{quoted}/ports/{config.preview_port}/signed-preview-url",
        query={"expiresInSeconds": config.signed_url_expires_seconds},
    )


def upsert_preview(config: PreviewConfig) -> dict[str, Any]:
    name = sandbox_name(config.repository, str(config.pr_number))
    labels = preview_labels(config, name)
    sandbox_env, skipped_env = build_sandbox_env(config)
    result: dict[str, Any] = base_result(config, name)
    result["forwarded_env_names"] = sorted(sandbox_env)
    result["skipped_env_names"] = skipped_env

    if config.effective_dry_run:
        result["dry_run"] = True
        result["dry_run_reason"] = config.dry_run_reason
        result["would_create_or_update"] = True
        result["would_forward_env_names"] = sorted(sandbox_env)
        return result

    client = DaytonaClient(config.api_url, config.api_key, config.organization_id)
    matches = list_matching_sandboxes(client, config)
    result["matched_sandboxes"] = [sandbox_summary(item) for item in matches]

    if matches:
        sandbox = refresh_sandbox(client, str(matches[0].get("id") or matches[0].get("name")))
        result["created"] = False
        result["updated"] = True
    else:
        sandbox = create_sandbox(client, config, name, labels, sandbox_env)
        result["created"] = True
        result["updated"] = False

    replace_labels(client, sandbox, labels)
    set_lifecycle(client, sandbox, config)
    sandbox = wait_for_started(client, sandbox, config.wait_seconds)
    deploy_messages = run_preview_commands(client, sandbox, config, sandbox_env)
    preview = create_signed_preview_url(client, sandbox, config)

    result["sandbox"] = sandbox_summary(sandbox)
    result["preview"] = {
        "url": preview.get("url"),
        "port": preview.get("port", config.preview_port),
        "expires_in_seconds": config.signed_url_expires_seconds,
    }
    result["messages"] = deploy_messages
    return result


def delete_preview(config: PreviewConfig) -> dict[str, Any]:
    name = sandbox_name(config.repository, str(config.pr_number))
    result = base_result(config, name)
    if config.effective_dry_run:
        result["dry_run"] = True
        result["dry_run_reason"] = config.dry_run_reason
        result["would_delete"] = True
        return result

    client = DaytonaClient(config.api_url, config.api_key, config.organization_id)
    matches = list_matching_sandboxes(client, config)
    deleted: list[dict[str, Any]] = []
    for sandbox in matches:
        sandbox_id = str(sandbox.get("id") or sandbox.get("name") or "")
        if not sandbox_id:
            continue
        response = client.request(
            "DELETE",
            f"/sandbox/{urllib.parse.quote(sandbox_id, safe='')}",
            expected=(200, 202, 204),
        )
        deleted.append(sandbox_summary(response) or sandbox_summary(sandbox) or {})

    result["matched_sandboxes"] = [sandbox_summary(item) for item in matches]
    result["deleted_sandboxes"] = deleted
    return result


def base_result(config: PreviewConfig, name: str) -> dict[str, Any]:
    return {
        "action": config.action,
        "dry_run": False,
        "repository": config.repository,
        "pr_number": str(config.pr_number),
        "sha": config.sha,
        "head_ref": config.head_ref,
        "sandbox_name": name,
        "preview_port": config.preview_port,
        "signed_url_expires_seconds": config.signed_url_expires_seconds,
        "auto_stop_minutes": config.auto_stop_minutes,
        "auto_delete_minutes": config.auto_delete_minutes,
    }


def render_markdown(result: dict[str, Any]) -> str:
    action = result.get("action")
    sandbox = result.get("sandbox") or {}
    preview = result.get("preview") or {}
    lines: list[str] = []

    if result.get("dry_run"):
        lines.append("## Daytona PR preview dry run")
        lines.append("")
        lines.append(f"- Reason: {result.get('dry_run_reason', 'dry run')}")
        lines.append(f"- Sandbox name: `{result.get('sandbox_name')}`")
        if action == "delete":
            lines.append("- Cleanup: would delete matching PR preview sandboxes")
        else:
            lines.append("- Preview URL: not created")
        lines.append("")
        lines.append(
            "Configure `DAYTONA_API_KEY` as a repository secret to enable live sandboxes."
        )
        return "\n".join(lines) + "\n"

    if action == "delete":
        lines.append("## Daytona PR preview cleanup")
        lines.append("")
        deleted = result.get("deleted_sandboxes") or []
        if deleted:
            lines.append(f"- Deleted: {len(deleted)} sandbox(es)")
            for item in deleted:
                lines.append(
                    f"- `{item.get('name') or item.get('id')}` state: `{item.get('state', 'unknown')}`"
                )
        else:
            lines.append("- Deleted: none; no matching PR preview sandbox was found")
        return "\n".join(lines) + "\n"

    lines.append("## Daytona PR preview")
    lines.append("")
    if preview.get("url"):
        lines.append(f"- URL: {preview['url']}")
    else:
        lines.append("- URL: unavailable")
    lines.append(f"- Sandbox: `{sandbox.get('name') or result.get('sandbox_name')}`")
    if sandbox.get("id"):
        lines.append(f"- Sandbox ID: `{sandbox['id']}`")
    lines.append(f"- State: `{sandbox.get('state', 'unknown')}`")
    lines.append(f"- Commit: `{result.get('sha')}`")
    lines.append(f"- Port: `{preview.get('port', result.get('preview_port'))}`")
    lines.append(
        f"- Signed URL expires in: `{result.get('signed_url_expires_seconds')}` seconds"
    )
    messages = result.get("messages") or []
    if messages:
        lines.append("")
        lines.append("Deployment:")
        for message in messages:
            lines.append(f"- {message}")
    skipped = result.get("skipped_env_names") or []
    if skipped:
        lines.append("")
        lines.append(
            "Skipped secret-looking env names by default: "
            + ", ".join(f"`{name}`" for name in skipped)
        )
    return "\n".join(lines) + "\n"


def write_github_output(path: str, result: dict[str, Any]) -> None:
    preview = result.get("preview") or {}
    sandbox = result.get("sandbox") or {}
    values = {
        "dry_run": str(bool(result.get("dry_run"))).lower(),
        "action": str(result.get("action", "")),
        "sandbox_name": str(result.get("sandbox_name", "")),
        "sandbox_id": str(sandbox.get("id", "")),
        "preview_url": str(preview.get("url", "")),
    }
    with open(path, "a", encoding="utf-8") as handle:
        for key, value in values.items():
            if "\n" in value or "\r" in value:
                delimiter = github_output_delimiter(key, value)
                handle.write(f"{key}<<{delimiter}\n{value}\n{delimiter}\n")
            else:
                handle.write(f"{key}={value}\n")


def github_output_delimiter(key: str, value: str) -> str:
    digest = hashlib.sha1(f"{key}\0{value}".encode("utf-8")).hexdigest()
    delimiter = f"daytona_{key}_{digest}"
    while delimiter in value:
        digest = hashlib.sha1(f"{delimiter}\0{value}".encode("utf-8")).hexdigest()
        delimiter = f"daytona_{key}_{digest}"
    return delimiter


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("upsert", "delete"))
    parser.add_argument("--repository", default=os.getenv("GITHUB_REPOSITORY", ""))
    parser.add_argument("--pr-number", default=os.getenv("PR_NUMBER", ""))
    parser.add_argument("--sha", default=os.getenv("PR_HEAD_SHA", os.getenv("GITHUB_SHA", "")))
    parser.add_argument("--head-ref", default=os.getenv("GITHUB_HEAD_REF", ""))
    parser.add_argument("--repo-url", default="")
    parser.add_argument("--api-url", default=os.getenv("DAYTONA_API_URL", DEFAULT_API_URL))
    parser.add_argument("--organization-id", default=os.getenv("DAYTONA_ORGANIZATION_ID", ""))
    parser.add_argument("--target", default=os.getenv("DAYTONA_TARGET", ""))
    parser.add_argument(
        "--snapshot",
        default=os.getenv("DAYTONA_PREVIEW_SNAPSHOT", os.getenv("DAYTONA_SNAPSHOT", "")),
    )
    parser.add_argument(
        "--preview-port",
        type=int,
        default=parse_int(os.getenv("DAYTONA_PREVIEW_PORT", ""), DEFAULT_PREVIEW_PORT),
    )
    parser.add_argument(
        "--signed-url-expires-seconds",
        type=int,
        default=parse_int(
            os.getenv(
                "DAYTONA_PREVIEW_URL_EXPIRES_SECONDS",
                os.getenv("DAYTONA_PREVIEW_EXPIRES_SECONDS", ""),
            ),
            DEFAULT_URL_EXPIRES_SECONDS,
        ),
    )
    parser.add_argument(
        "--auto-stop-minutes",
        type=int,
        default=parse_int(
            os.getenv("DAYTONA_PREVIEW_AUTO_STOP_MINUTES", ""),
            DEFAULT_AUTO_STOP_MINUTES,
        ),
    )
    parser.add_argument(
        "--auto-delete-minutes",
        type=int,
        default=parse_int(
            os.getenv("DAYTONA_PREVIEW_AUTO_DELETE_MINUTES", ""),
            DEFAULT_AUTO_DELETE_MINUTES,
        ),
    )
    parser.add_argument("--cpu", type=int, default=parse_optional_int(os.getenv("DAYTONA_PREVIEW_CPU", "")))
    parser.add_argument(
        "--memory", type=int, default=parse_optional_int(os.getenv("DAYTONA_PREVIEW_MEMORY", ""))
    )
    parser.add_argument("--disk", type=int, default=parse_optional_int(os.getenv("DAYTONA_PREVIEW_DISK", "")))
    parser.add_argument(
        "--project-dir",
        default=os.getenv("DAYTONA_PREVIEW_PROJECT_DIR", DEFAULT_PROJECT_DIR),
    )
    parser.add_argument(
        "--setup-command",
        default=os.getenv(
            "DAYTONA_PREVIEW_SETUP_COMMAND",
            os.getenv("DAYTONA_PREVIEW_BOOT_COMMAND", ""),
        ),
    )
    parser.add_argument(
        "--start-command",
        default=os.getenv("DAYTONA_PREVIEW_START_COMMAND", ""),
    )
    parser.add_argument(
        "--ready-command",
        default=os.getenv("DAYTONA_PREVIEW_READY_COMMAND", ""),
    )
    parser.add_argument(
        "--command-timeout-seconds",
        type=int,
        default=parse_int(
            os.getenv("DAYTONA_PREVIEW_COMMAND_TIMEOUT_SECONDS", ""),
            DEFAULT_COMMAND_TIMEOUT_SECONDS,
        ),
    )
    parser.add_argument(
        "--wait-seconds",
        type=int,
        default=parse_int(os.getenv("DAYTONA_PREVIEW_WAIT_SECONDS", ""), DEFAULT_WAIT_SECONDS),
    )
    parser.add_argument(
        "--env-allowlist",
        default=os.getenv("DAYTONA_PREVIEW_ENV_ALLOWLIST", ""),
        help="Comma or whitespace separated env var names to forward into the sandbox.",
    )
    parser.add_argument(
        "--env-json",
        default=os.getenv("DAYTONA_PREVIEW_ENV_JSON", ""),
        help="JSON object of extra env vars to inject into the sandbox.",
    )
    parser.add_argument(
        "--allow-secret-env-names",
        action="store_true",
        default=parse_bool(os.getenv("DAYTONA_PREVIEW_ALLOW_SECRET_NAMES", "")),
    )
    parser.add_argument(
        "--git-username",
        default=os.getenv("DAYTONA_PREVIEW_GIT_USERNAME", ""),
    )
    parser.add_argument(
        "--git-password",
        default=os.getenv("DAYTONA_PREVIEW_GIT_PASSWORD", ""),
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--no-deploy",
        action="store_true",
        default=parse_bool(os.getenv("DAYTONA_PREVIEW_NO_DEPLOY", "")),
    )
    parser.add_argument("--output", default="")
    parser.add_argument("--markdown-output", default="")
    parser.add_argument(
        "--github-output",
        default=os.getenv("GITHUB_OUTPUT", ""),
        help="Append selected outputs to a GitHub Actions output file.",
    )
    return parser


def config_from_args(args: argparse.Namespace) -> PreviewConfig:
    repository = args.repository.strip()
    pr_number = str(args.pr_number).strip()
    if not repository:
        raise ValueError("--repository or GITHUB_REPOSITORY is required")
    if not pr_number:
        raise ValueError("--pr-number or PR_NUMBER is required")
    if args.preview_port < 1 or args.preview_port > 65535:
        raise ValueError("--preview-port must be between 1 and 65535")
    if args.signed_url_expires_seconds < 1 or args.signed_url_expires_seconds > 86400:
        raise ValueError("--signed-url-expires-seconds must be between 1 and 86400")
    if args.auto_stop_minutes < 1:
        raise ValueError("--auto-stop-minutes must be at least 1")
    if args.auto_delete_minutes < 1:
        raise ValueError("--auto-delete-minutes must be at least 1")
    if args.command_timeout_seconds < 1 or args.command_timeout_seconds > 3600:
        raise ValueError("--command-timeout-seconds must be between 1 and 3600")
    if args.wait_seconds < 1 or args.wait_seconds > 3600:
        raise ValueError("--wait-seconds must be between 1 and 3600")
    for name, value in (
        ("--cpu", args.cpu),
        ("--memory", args.memory),
        ("--disk", args.disk),
    ):
        if value is not None and value < 1:
            raise ValueError(f"{name} must be at least 1 when set")

    repo_url = args.repo_url.strip()
    if not repo_url and repository:
        repo_url = f"https://github.com/{repository}.git"

    return PreviewConfig(
        action=args.action,
        repository=repository,
        pr_number=pr_number,
        sha=args.sha.strip(),
        head_ref=args.head_ref.strip(),
        repo_url=repo_url,
        api_url=normalize_api_url(args.api_url),
        api_key=os.getenv("DAYTONA_API_KEY", ""),
        organization_id=args.organization_id.strip(),
        target=args.target.strip(),
        snapshot=args.snapshot.strip(),
        preview_port=args.preview_port,
        signed_url_expires_seconds=args.signed_url_expires_seconds,
        auto_stop_minutes=args.auto_stop_minutes,
        auto_delete_minutes=args.auto_delete_minutes,
        cpu=args.cpu,
        memory=args.memory,
        disk=args.disk,
        project_dir=normalize_project_dir(args.project_dir),
        setup_command=args.setup_command,
        start_command=args.start_command,
        ready_command=args.ready_command,
        command_timeout_seconds=args.command_timeout_seconds,
        wait_seconds=args.wait_seconds,
        env_allowlist=parse_env_allowlist(args.env_allowlist),
        env_json=parse_json_object(args.env_json),
        allow_secret_env_names=args.allow_secret_env_names,
        git_username=args.git_username,
        git_password=args.git_password,
        dry_run=args.dry_run,
        no_deploy=args.no_deploy,
    )


def main(argv: list[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    try:
        config = config_from_args(args)
        if config.action == "upsert":
            result = upsert_preview(config)
        else:
            result = delete_preview(config)
    except Exception as exc:
        print(f"daytona-pr-preview: {exc}", file=sys.stderr)
        return 1

    json_result = json.dumps(result, indent=2, sort_keys=True)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(json_result + "\n")
    if args.markdown_output:
        with open(args.markdown_output, "w", encoding="utf-8") as handle:
            handle.write(render_markdown(result))
    if args.github_output:
        write_github_output(args.github_output, result)
    print(json_result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
