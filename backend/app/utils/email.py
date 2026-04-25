import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)


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

    if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("SMTP settings missing. Logging email content instead:")
        logger.warning(f"To: {email_to}")
        logger.warning(f"Subject: {subject}")
        logger.warning(f"Content: {invite_url}")
        logger.info(
            f"\n--- MOCK EMAIL ---\nTo: {email_to}\nSubject: {subject}\nLink: {invite_url}\n------------------\n"
        )
        return

    # Create message
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
        logger.info(f"Invitation email sent to {email_to}")
    except Exception as e:
        logger.error(f"Failed to send invitation email to {email_to}: {str(e)}")
        raise
