"""Operator-facing startup banner for SMTP-optional mode."""


def smtp_mode_banner_lines(*, smtp_configured: bool) -> list[str]:
    """Return the log lines to emit at startup describing email
    capabilities. Empty when SMTP is configured (nothing to warn about)."""
    if smtp_configured:
        return []
    return [
        "Email delivery is not configured. Qualis is running in email-optional mode.",
        "  Outgoing emails are written to the application log only.",
        "  Password reset: generate a recovery link from "
        "Admin > Users (no email needed).",
        "  Project invitations: copy the invite link shown after inviting.",
        "  Email change: a superuser sets the address from Admin > Users.",
        "  Email-based 2FA is disabled; use an authenticator app.",
        "  See docs/guides/running-without-smtp.md for the full matrix.",
    ]
