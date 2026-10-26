"""Policy gates for actions that must not run without human review."""

from __future__ import annotations

import re

# Exact, normalized action identifiers. Unknown action names are not automatically
# safe: callers should use the registry and default unknown tools to deny.
APPROVAL_REQUIRED = frozenset(
    {
        "production_deploy",
        "send_external_message",
        "change_account_permissions",
        "delete_data",
        "change_security_settings",
        "submit_official_record",
        "spend_money",
        "access_sensitive_data",
        "publish_public_content",
        "modify_production_data",
    }
)

SAFE_METADATA_ACTIONS = frozenset(
    {
        "read_project_metadata",
        "create_local_draft",
        "run_unit_tests",
        "inspect_diff",
    }
)


def normalize_action(action: str) -> str:
    """Normalize a user-supplied action identifier."""
    return re.sub(r"[^a-z0-9_]+", "_", action.strip().lower()).strip("_")


def requires_human_approval(action: str) -> bool:
    """Return True for known high-impact actions and fail closed for unknown ones."""
    normalized = normalize_action(action)
    if normalized in SAFE_METADATA_ACTIONS:
        return False
    # The core does not yet execute tools. Unknown actions are conservatively gated.
    return normalized not in SAFE_METADATA_ACTIONS


def is_registered_action(action: str) -> bool:
    normalized = normalize_action(action)
    return normalized in APPROVAL_REQUIRED or normalized in SAFE_METADATA_ACTIONS
