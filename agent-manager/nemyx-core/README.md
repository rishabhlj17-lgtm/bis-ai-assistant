# NEMYX Core — Milestone 1

NEMYX is intended to be a local-first central intelligence that coordinates bounded specialist agents across projects. This folder is the **first real backend foundation**, separate from the existing BIS Assistant deployment and separate from the older browser-only dashboard.

## What works in this milestone

- Local SQLite database for projects, tasks, approval requests, and audit events.
- CLI commands to create projects/tasks and inspect task/approval state.
- Conservative approval policy for high-impact actions.
- No API keys, client credentials, model calls, shell execution, browser automation, or deployments are implemented yet.
- No agent execution is claimed: this milestone establishes durable state and policy gates first.

## Requirements

- Python 3.11+ (standard library only; no package installation required for the core).
- Windows, macOS, or Linux for development. The intended first desktop target is Windows.

## Run on Windows

From the repository folder:

```powershell
cd agent-manager\nemyx-core
py -3 -m nemyx_core.cli init
py -3 -m nemyx_core.cli project-add --name "BIS AI Assistant" --description "Existing BIS assistant project"
py -3 -m nemyx_core.cli project-list
```

To create a task, copy the project ID printed by `project-list`:

```powershell
py -3 -m nemyx_core.cli task-add --project PROJECT_ID --title "Review current project structure" --description "Inspect files and report risks before making changes"
py -3 -m nemyx_core.cli task-list
```

The database is stored under `%LOCALAPPDATA%\NEMYX\nemyx.db` on Windows. Set `NEMYX_DB_PATH` to use a different path (for example, a temporary test database). The application does not store API keys or passwords in this database.

## Safety boundary

Approval requests are records, not proof that an action is safe. Before any real worker execution is added, NEMYX still needs OS-protected secret storage, per-project tool allowlists, isolated workspaces, time/resource limits, redacted logs, and tested backup/restore. Agents must not approve their own requests. Production deployments, external messages, account/permission changes, destructive actions, official submissions, spending, and sensitive-data operations must remain behind a human approval gate.

## Next milestones

1. Durable project/task state and approval policy (this folder).
2. Automated tests and a small local-only API/UI bridge.
3. Local model adapter with an explicit offline mode and no-secret default.
4. Bounded specialist workers with per-project permissions and isolated workspaces.
5. Human review, diffs, test evidence, backup/restore, and rollback.
6. Optional explicitly enabled online connectors and desktop packaging.

The existing `dashboard.html` remains a prototype and still uses browser storage. Do not enter real secrets or sensitive client data into it.
