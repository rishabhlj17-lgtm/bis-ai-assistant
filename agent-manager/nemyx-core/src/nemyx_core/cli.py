"""Command-line entry point for the NEMYX local core."""

from __future__ import annotations

import argparse
import json
import sys

from .store import Store, default_db_path


def _print(value: object) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="nemyx", description="NEMYX local task and approval ledger")
    parser.add_argument("--db", help="Optional database path; overrides NEMYX_DB_PATH/default path")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init", help="Initialize the local database")

    project_add = commands.add_parser("project-add", help="Create a project")
    project_add.add_argument("--name", required=True)
    project_add.add_argument("--description", default="")

    commands.add_parser("project-list", help="List projects")

    task_add = commands.add_parser("task-add", help="Create a task record (does not execute it)")
    task_add.add_argument("--project", required=True, dest="project_id")
    task_add.add_argument("--title", required=True)
    task_add.add_argument("--description", default="")
    task_add.add_argument("--action-type", default="create_local_draft")

    task_list = commands.add_parser("task-list", help="List tasks")
    task_list.add_argument("--project", dest="project_id")

    approval_list = commands.add_parser("approval-list", help="List approval requests")
    approval_list.add_argument("--all", action="store_true", help="Include decided requests")

    approval_decide = commands.add_parser("approval-decide", help="Record a human approval decision")
    approval_decide.add_argument("--id", required=True, dest="approval_id")
    approval_decide.add_argument("--decision", required=True, choices=["approved", "denied"])
    approval_decide.add_argument("--by", required=True, dest="decided_by",
                                 help="Name/identifier of the human making this decision")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        store = Store(args.db) if args.db else Store()
        if args.command == "init":
            print(f"NEMYX database ready: {store.path}")
        elif args.command == "project-add":
            _print(store.add_project(args.name, args.description))
        elif args.command == "project-list":
            _print(store.list_projects())
        elif args.command == "task-add":
            _print(store.add_task(args.project_id, args.title, args.description, args.action_type))
        elif args.command == "task-list":
            _print(store.list_tasks(args.project_id))
        elif args.command == "approval-list":
            _print(store.list_approvals(None if args.all else "pending"))
        elif args.command == "approval-decide":
            store.decide_approval(args.approval_id, args.decision, args.decided_by)
            print("Decision recorded. No external action was executed.")
        return 0
    except (ValueError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
