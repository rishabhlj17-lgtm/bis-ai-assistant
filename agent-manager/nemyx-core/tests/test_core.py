from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from nemyx_core.policy import requires_human_approval
from nemyx_core.store import Store


class NemyxCoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp_dir.name) / "test.db")
        self.project = self.store.add_project("Test project")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_safe_local_draft_starts_as_draft(self) -> None:
        task = self.store.add_task(self.project["id"], "Draft task")
        self.assertEqual(task["status"], "draft")

    def test_high_impact_task_creates_pending_approval(self) -> None:
        task = self.store.add_task(
            self.project["id"], "Deploy", action_type="production_deploy"
        )
        self.assertEqual(task["status"], "needs_approval")
        approvals = self.store.list_approvals()
        self.assertEqual(len(approvals), 1)
        self.assertEqual(approvals[0]["status"], "pending")

    def test_unknown_action_fails_closed(self) -> None:
        self.assertTrue(requires_human_approval("unknown_tool_action"))

    def test_agent_cannot_approve(self) -> None:
        task = self.store.add_task(
            self.project["id"], "Deploy", action_type="production_deploy"
        )
        approval = self.store.list_approvals()[0]
        with self.assertRaises(ValueError):
            self.store.decide_approval(approval["id"], "approved", "NEMYX")

    def test_human_decision_updates_task_but_does_not_execute_action(self) -> None:
        self.store.add_task(
            self.project["id"], "Deploy", action_type="production_deploy"
        )
        approval = self.store.list_approvals()[0]
        self.store.decide_approval(approval["id"], "approved", "human-operator")
        self.assertEqual(self.store.list_approvals()[0]["status"], "approved")
        self.assertEqual(self.store.list_tasks()[0]["status"], "planned")


if __name__ == "__main__":
    unittest.main()
