# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Structured audit logging for security-relevant admin operations.

Every admin mutation that changes ownership, permissions, or shared state
should emit one audit entry via `log_admin_action`. The entries are
written to a dedicated `app.audit` logger so they can be redirected to
a separate sink (file, syslog, SIEM) without touching application code.

Audit log entries follow the format:

    actor_user_id=42 action=create resource=study id=17 details={'slug': 'study-x'}

The `details` dict is for context that helps a human investigator (e.g.,
what was changed, what role was granted) but MUST NOT contain
participant data, plaintext passwords, or token values.
"""

import logging

audit_logger = logging.getLogger("app.audit")


def log_admin_action(
    *,
    actor_user_id: int | None,
    action: str,
    resource: str,
    resource_id: int | str | None = None,
    **details: object,
) -> None:
    """Emit a structured audit entry for a security-relevant admin operation.

    Args:
        actor_user_id: ID of the user performing the action. None only if
            the action is system-initiated (e.g., a scheduled cleanup).
        action: Verb describing the action ('create', 'update', 'delete',
            'role_change', 'state_change', 'invite', etc.).
        resource: Resource type ('user', 'study', 'project_member',
            'invitation', 'recruitment_link', 'analysis_run', etc.).
        resource_id: Database id of the resource (or natural key like a
            slug) when applicable.
        **details: Free-form context (changed fields, old/new values,
            target email for invites, etc.). Must not contain PII or
            secrets. Exception: identity-change events (e.g.
            ``admin_set_email``) and invitation targets intentionally
            record the email address as forensic context — this is a
            deliberate, reviewed exception, not a PII leak.
    """
    audit_logger.info(
        "actor_user_id=%s action=%s resource=%s id=%s details=%s",
        actor_user_id,
        action,
        resource,
        resource_id,
        details,
    )
