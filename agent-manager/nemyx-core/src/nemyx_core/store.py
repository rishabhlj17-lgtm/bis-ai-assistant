"""SQLite persistence for NEMYX's local task ledger."""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .policy import requires_human_approval


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def default_db_path() -> Path:
    override = os.environ.get("NEMYX_DB_PATH")
    if override:
        return Path(override).expanduser()
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "NEMYX" / "nemyx.db"
    xdg = os.environ.get("XDG_DATA_HOME")
    if xdg:
        return Path(xdg) / "nemyx" / "nemyx.db"
    return Path.home() / ".local" / "share" / "nemyx" / "nemyx.db"


class Store:
    def __init__(self, path: str | Path | None = None) -> None:
        self.path = Path(path) if path else default_db_path()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        return connection

    def _initialize(self) -> None:
        with self._connect() as db:
            db.execute("PRAGMA journal_mode = WAL")
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id),
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL CHECK(status IN
                        ('draft','planned','queued','running','review',
                         'completed','needs_approval','blocked','failed','cancelled')),
                    action_type TEXT NOT NULL DEFAULT 'create_local_draft',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS approvals (
                    id TEXT PRIMARY KEY,
                    task_id TEXT REFERENCES tasks(id),
                    action_type TEXT NOT NULL,
                    details TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL CHECK(status IN ('pending','approved','denied')),
                    requested_at TEXT NOT NULL,
                    decided_at TEXT,
                    decided_by TEXT
                );
                CREATE TABLE IF NOT EXISTS audit_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    occurred_at TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    details_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status, requested_at);
                CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);
                """
            )

    def _audit(
        self, db: sqlite3.Connection, event_type: str,
        entity_type: str, entity_id: str, details: dict[str, Any]
    ) -> None:
        db.execute(
            """INSERT INTO audit_events
               (occurred_at, event_type, entity_type, entity_id, details_json)
               VALUES (?, ?, ?, ?, ?)""",
            (utc_now(), event_type, entity_type, entity_id,
             json.dumps(details, ensure_ascii=False, sort_keys=True)),
        )

    def add_project(self, name: str, description: str = "") -> dict[str, Any]:
        name = name.strip()
        if not name:
            raise ValueError("Project name cannot be empty.")
        project_id = str(uuid.uuid4())
        created_at = utc_now()
        with self._connect() as db:
            db.execute(
                "INSERT INTO projects(id, name, description, created_at) VALUES (?, ?, ?, ?)",
                (project_id, name, description.strip(), created_at),
            )
            self._audit(db, "project.created", "project", project_id, {"name": name})
        return {"id": project_id, "name": name, "description": description.strip(),
                "created_at": created_at}

    def list_projects(self) -> list[dict[str, Any]]:
        with self._connect() as db:
            rows = db.execute(
                "SELECT id, name, description, created_at FROM projects ORDER BY created_at"
            ).fetchall()
        return [dict(row) for row in rows]

    def add_task(
        self, project_id: str, title: str, description: str = "",
        action_type: str = "create_local_draft"
    ) -> dict[str, Any]:
        title = title.strip()
        if not title:
            raise ValueError("Task title cannot be empty.")
        task_id = str(uuid.uuid4())
        now = utc_now()
        needs_approval = requires_human_approval(action_type)
        status = "needs_approval" if needs_approval else "draft"
        with self._connect() as db:
            project = db.execute("SELECT id FROM projects WHERE id = ?", (project_id,)).fetchone()
            if project is None:
                raise ValueError("Project ID was not found.")
            db.execute(
                """INSERT INTO tasks
                   (id, project_id, title, description, status, action_type, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (task_id, project_id, title, description.strip(), status,
                 action_type.strip(), now, now),
            )
            self._audit(db, "task.created", "task", task_id,
                        {"project_id": project_id, "status": status, "action_type": action_type})
            if needs_approval:
                approval_id = str(uuid.uuid4())
                db.execute(
                    """INSERT INTO approvals
                       (id, task_id, action_type, details, status, requested_at)
                       VALUES (?, ?, ?, ?, 'pending', ?)""",
                    (approval_id, task_id, action_type, title, now),
                )
                self._audit(db, "approval.requested", "approval", approval_id,
                            {"task_id": task_id, "action_type": action_type})
        return {"id": task_id, "project_id": project_id, "title": title,
                "description": description.strip(), "status": status,
                "action_type": action_type, "created_at": now, "updated_at": now}

    def list_tasks(self, project_id: str | None = None) -> list[dict[str, Any]]:
        query = """SELECT id, project_id, title, description, status, action_type,
                          created_at, updated_at FROM tasks"""
        params: tuple[Any, ...] = ()
        if project_id:
            query += " WHERE project_id = ?"
            params = (project_id,)
        query += " ORDER BY created_at DESC"
        with self._connect() as db:
            rows = db.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def list_approvals(self, status: str | None = "pending") -> list[dict[str, Any]]:
        query = """SELECT id, task_id, action_type, details, status, requested_at,
                          decided_at, decided_by FROM approvals"""
        params: tuple[Any, ...] = ()
        if status:
            query += " WHERE status = ?"
            params = (status,)
        query += " ORDER BY requested_at"
        with self._connect() as db:
            rows = db.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def decide_approval(self, approval_id: str, decision: str, decided_by: str) -> None:
        decision = decision.strip().lower()
        decided_by = decided_by.strip()
        if decision not in {"approved", "denied"}:
            raise ValueError("Decision must be 'approved' or 'denied'.")
        if not decided_by or decided_by.lower() in {"agent", "worker", "system", "nemyx"}:
            raise ValueError("A named human must decide; agents cannot approve their own actions.")
        now = utc_now()
        with self._connect() as db:
            row = db.execute(
                "SELECT id, task_id, status FROM approvals WHERE id = ?", (approval_id,)
            ).fetchone()
            if row is None:
                raise ValueError("Approval ID was not found.")
            if row["status"] != "pending":
                raise ValueError("This approval has already been decided.")
            db.execute(
                """UPDATE approvals SET status = ?, decided_at = ?, decided_by = ?
                   WHERE id = ? AND status = 'pending'""",
                (decision, now, decided_by, approval_id),
            )
            self._audit(db, f"approval.{decision}", "approval", approval_id,
                        {"task_id": row["task_id"], "decided_by": decided_by})
            if row["task_id"]:
                task_status = "planned" if decision == "approved" else "blocked"
                db.execute("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?",
                           (task_status, now, row["task_id"]))
                self._audit(db, f"task.{task_status}", "task", row["task_id"],
                            {"approval_id": approval_id})
