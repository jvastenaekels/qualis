import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)

# Captured when ENVIRONMENT="test" so that the /api/test/debug/last-email
# endpoint can return it to E2E tests without a real SMTP server.
_last_test_email: dict[str, str] | None = None


def _send_or_log(*, email_to: str, subject: str, html_content: str, label: str) -> None:
    """Send via SMTP, or log a structured MOCK EMAIL block when SMTP is unset.

    `label` is a short tag identifying the email type for log filtering
    (e.g., 'invitation', 'memo-mention', 'email-verification').
    """
    if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("SMTP settings missing. Logging email content instead:")
        logger.warning(f"To: {email_to}")
        logger.warning(f"Subject: {subject}")
        logger.info(
            f"\n--- MOCK EMAIL [{label}] ---\nTo: {email_to}\nSubject: {subject}\n"
            f"Body:\n{html_content}\n----------------------------\n"
        )
        if settings.ENVIRONMENT == "test":
            global _last_test_email
            _last_test_email = {
                "to": email_to,
                "subject": subject,
                "body": html_content,
                "label": label,
            }
        return

    message = MIMEMultipart()
    message["From"] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"
    message["To"] = email_to
    message["Subject"] = subject
    message.attach(MIMEText(html_content, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, int(settings.SMTP_PORT or 0)) as server:
            if settings.SMTP_TLS:
                server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(message)
        logger.info(f"Email sent to {email_to} [{label}]")
    except Exception as e:
        logger.error(f"Failed to send {label} email to {email_to}: {str(e)}")
        raise


def send_invitation_email(
    email_to: str, context_name: str, invite_url: str, context_type: str = "study"
) -> None:
    """
    Send an invitation email to a collaborator.

    Args:
        email_to: The recipient's email address.
        context_name: The title of the study or project.
        invite_url: The unique URL for accepting the invitation.
        context_type: "study" or "project".
    """
    subject = f"Invitation to collaborate on {context_type} '{context_name}'"

    html_content = f"""
    <html>
        <body>
            <h2>Hello!</h2>
            <p>You have been invited to collaborate on the {context_type} <strong>{context_name}</strong> on Qualis.</p>
            <p>To accept the invitation and register your account, please click the link below:</p>
            <p><a href="{invite_url}">{invite_url}</a></p>
            <p>If you already have an account, the link will associate your account with this {context_type}.</p>
            <br>
            <p>L'équipe Qualis</p>
        </body>
    </html>
    """

    _send_or_log(
        email_to=email_to,
        subject=subject,
        html_content=html_content,
        label="invitation",
    )


def send_memo_mention_email(
    email_to: str,
    *,
    project_name: str,
    parent_type: str,
    parent_title: str,
    mention_excerpt: str,
    link_url: str,
    mentioner_name: str,
) -> None:
    """Notify a project member that they were @-mentioned in a memo comment.

    Mirrors `send_invitation_email`: silently logs the message instead of
    sending when SMTP settings are missing (development environments).
    """
    subject = f"You were mentioned in {parent_title} ({parent_type})"

    html_content = f"""
    <html>
        <body>
            <p>{mentioner_name} mentioned you in <strong>{parent_title}</strong>
               ({parent_type}, project {project_name}).</p>
            <blockquote>{mention_excerpt}</blockquote>
            <p><a href="{link_url}">Open in Qualis</a></p>
            <br>
            <p>L'équipe Qualis</p>
        </body>
    </html>
    """

    _send_or_log(
        email_to=email_to,
        subject=subject,
        html_content=html_content,
        label="memo-mention",
    )


def send_email_verification(email_to: str, verify_url: str) -> None:
    subject = "Verify your Qualis account"
    html_content = f"""
    <html>
        <body>
            <h2>Welcome to Qualis</h2>
            <p>Click the link below to activate your account:</p>
            <p><a href="{verify_url}">{verify_url}</a></p>
            <p>This link expires in 24 hours.</p>
            <br>
            <p>L'équipe Qualis</p>
        </body>
    </html>
    """
    _send_or_log(
        email_to=email_to,
        subject=subject,
        html_content=html_content,
        label="email-verification",
    )


def send_register_already_registered(email_to: str, reset_url: str) -> None:
    """F-06-007 anti-enumeration: when /api/register receives a known email,
    we send this informational message to the address (instead of leaking
    "already exists" through the API response). The link goes to the
    password-reset flow so a legitimate owner who forgot they'd registered
    can recover, and an attacker probing for accounts gains no signal from
    the API itself.

    Distinct subject + body from ``send_password_reset`` so the legitimate
    owner can tell the message apart from an unsolicited reset request.
    """
    subject = "You already have a Qualis account"
    html_content = f"""
    <html>
        <body>
            <h2>You already have a Qualis account</h2>
            <p>Someone tried to create a new Qualis account with this email
               address, but an account already exists for it.</p>
            <p>If this was you, you can sign in with your existing password,
               or reset it using the link below:</p>
            <p><a href="{reset_url}">{reset_url}</a></p>
            <p>If you did not try to register, you can safely ignore this
               email — your account is unchanged.</p>
            <br>
            <p>L'équipe Qualis</p>
        </body>
    </html>
    """
    _send_or_log(
        email_to=email_to,
        subject=subject,
        html_content=html_content,
        label="register-already-registered",
    )


def send_password_reset(email_to: str, reset_url: str) -> None:
    subject = "Reset your Qualis password"
    html_content = f"""
    <html>
        <body>
            <h2>Password reset</h2>
            <p>Someone (hopefully you) requested a password reset for your Qualis account.</p>
            <p><a href="{reset_url}">{reset_url}</a></p>
            <p>This link expires in 1 hour. If you did not request this, you can safely ignore this email.</p>
            <br>
            <p>L'équipe Qualis</p>
        </body>
    </html>
    """
    _send_or_log(
        email_to=email_to,
        subject=subject,
        html_content=html_content,
        label="password-reset",
    )


def send_twofa_disable_link(email_to: str, disable_url: str) -> None:
    subject = "Disable two-factor authentication on Qualis"
    html_content = f"""
    <html>
        <body>
            <h2>Disable 2FA</h2>
            <p>Someone (hopefully you) requested to disable two-factor authentication on your Qualis account.</p>
            <p>Open the link below and click "Confirm" to proceed:</p>
            <p><a href="{disable_url}">{disable_url}</a></p>
            <p>This link expires in 15 minutes and can only be used once.</p>
            <p>If you did not request this, change your Qualis password immediately and contact an administrator.</p>
            <br>
            <p>L'équipe Qualis</p>
        </body>
    </html>
    """
    _send_or_log(
        email_to=email_to,
        subject=subject,
        html_content=html_content,
        label="2fa-disable-link",
    )


def send_twofa_disabled_notification(
    email_to: str, *, when: str, ip_hint: str | None
) -> None:
    subject = "Two-factor authentication was disabled on your Qualis account"
    ip_line = f"<p>Origin IP: {ip_hint}</p>" if ip_hint else ""
    html_content = f"""
    <html>
        <body>
            <h2>2FA disabled</h2>
            <p>Two-factor authentication on your Qualis account was disabled at {when}.</p>
            {ip_line}
            <p>If this was not you, change your password immediately and contact an administrator.</p>
            <br>
            <p>L'équipe Qualis</p>
        </body>
    </html>
    """
    _send_or_log(
        email_to=email_to,
        subject=subject,
        html_content=html_content,
        label="2fa-disabled-notification",
    )


def send_email_change_confirmation(email_to: str, confirm_url: str) -> None:
    """Send the confirmation link to the NEW email address (F-03-011).

    The link's purpose is to prove the user controls the destination
    mailbox. Consuming it swaps ``users.email`` to the new value.
    """
    subject = "Confirm your new Qualis email address"
    html_content = f"""
    <html>
        <body>
            <h2>Confirm your new email</h2>
            <p>Someone (hopefully you) requested to change the email address on a Qualis account to this one.</p>
            <p>Click the link below to confirm and switch your account email:</p>
            <p><a href="{confirm_url}">{confirm_url}</a></p>
            <p>This link expires in 1 hour and can only be used once. If you did not request this, you can safely ignore this email — no change has been made yet.</p>
            <br>
            <p>L'équipe Qualis</p>
        </body>
    </html>
    """
    _send_or_log(
        email_to=email_to,
        subject=subject,
        html_content=html_content,
        label="email-change-confirmation",
    )


def send_email_change_notification(
    email_to: str, *, new_email: str, cancel_url: str
) -> None:
    """Notify the OLD email address that a change was requested (F-03-011).

    Sent in parallel with the confirmation link to the new address.
    Lets the legitimate account owner cancel the change if it was
    initiated by an attacker who reached the authenticated session.
    """
    subject = "Email change requested on your Qualis account"
    html_content = f"""
    <html>
        <body>
            <h2>Email change requested</h2>
            <p>Someone requested to change the email address on your Qualis account to:</p>
            <p><strong>{new_email}</strong></p>
            <p>If this was you, no action is required — you should also receive a confirmation link at the new address. Click the link there to complete the change.</p>
            <p>If this was <strong>not</strong> you, click below to cancel the request and keep your current email:</p>
            <p><a href="{cancel_url}">{cancel_url}</a></p>
            <p>This cancellation link expires in 24 hours. You should also change your Qualis password immediately if you suspect your account is compromised.</p>
            <br>
            <p>L'équipe Qualis</p>
        </body>
    </html>
    """
    _send_or_log(
        email_to=email_to,
        subject=subject,
        html_content=html_content,
        label="email-change-notification",
    )
