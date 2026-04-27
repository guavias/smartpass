import os
import base64
import logging
from pathlib import Path
from datetime import datetime
import pytz
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import (
    Mail, Attachment, FileContent, FileName,
    FileType, Disposition, ContentId,
)
from qr_generator import QRCodeGenerator


logger = logging.getLogger(__name__)

CST = pytz.timezone('America/Chicago')

_LOGO_PATH = Path(__file__).parent / "static" / "images" / "hilineLogo.png"


def _load_logo_bytes() -> bytes | None:
    try:
        return _LOGO_PATH.read_bytes()
    except Exception:
        return None

_LOGO_BYTES = _load_logo_bytes()


def _get_base_url() -> str:
    return os.getenv("BASE_URL", "http://localhost:8000")


def _to_cst(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=pytz.UTC)
    return dt.astimezone(CST)


def _get_client() -> SendGridAPIClient | None:
    api_key = os.getenv("SENDGRID_API_KEY")
    if not api_key:
        logger.warning("SENDGRID_API_KEY not set")
        return None
    return SendGridAPIClient(api_key)


def _from_address() -> str:
    return os.getenv("SENDGRID_FROM_EMAIL", "noreply@hilineresort.com")


def _attach_logo(message: Mail) -> bool:
    """Attach the Hi-Line logo as an inline CID attachment. Returns True if attached."""
    if not _LOGO_BYTES:
        return False
    attachment = Attachment(
        file_content=FileContent(base64.b64encode(_LOGO_BYTES).decode()),
        file_name=FileName("hilineLogo.png"),
        file_type=FileType("image/png"),
        disposition=Disposition("inline"),
        content_id=ContentId("hilineLogo"),
    )
    message.attachment = attachment
    return True


def _send(client: SendGridAPIClient, to: str, subject: str, html: str, plain: str = "") -> dict:
    message = Mail(
        from_email=_from_address(),
        to_emails=to,
        subject=subject,
        html_content=html,
        plain_text_content=plain or _strip_html(html),
    )
    # List-Unsubscribe header reduces spam scoring
    message.header = {"List-Unsubscribe": f"<mailto:{_from_address()}?subject=unsubscribe>"}
    _attach_logo(message)
    response = client.send(message)
    return {"success": True, "email_id": str(response.headers.get("X-Message-Id", ""))}


def _strip_html(html: str) -> str:
    """Very simple HTML → plain text fallback."""
    import re
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&bull;", "•", text)
    text = re.sub(r" {2,}", " ", text)
    return text.strip()


class EmailService:

    @staticmethod
    def send_portal_access_email(
        recipient_email: str,
        recipient_name: str,
        portal_url: str,
        user_type: str,
        access_start: datetime,
        access_end: datetime,
    ) -> dict:
        """Send portal access link to guest so they can view their QR code."""
        client = _get_client()
        if not client:
            return {"success": False, "error": "Email service not configured"}

        try:
            pass_label = "Day Pass" if user_type == "visitor" else "Crappie House Access Pass"
            subject = "Your Hi-Line Resort Day Pass" if user_type == "visitor" else "Your Hi-Line Resort Access Pass"
            start_cst = _to_cst(access_start)
            end_cst = _to_cst(access_end)
            start_formatted = start_cst.strftime("%B %d, %Y at %I:%M %p CDT")
            end_formatted = end_cst.strftime("%B %d, %Y at %I:%M %p CDT")

            # Use cid:hilineLogo to reference the inline attachment
            logo_tag = '<img src="cid:hilineLogo" alt="Hi-Line Resort" width="160" style="display:block;max-width:160px;">'

            html_body = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <tr><td align="center" style="background:#ffffff;padding:32px 40px 16px;">
          {logo_tag}
        </td></tr>

        <tr><td align="center" style="padding:8px 40px 24px;">
          <h1 style="margin:0;font-size:22px;color:#1a1a1a;">Your {pass_label} is Ready</h1>
        </td></tr>

        <tr><td style="padding:0 40px 24px;">
          <p style="margin:0 0 16px;color:#333;font-size:15px;">Hi {recipient_name},</p>
          <p style="margin:0 0 24px;color:#333;font-size:15px;">
            Your Crappie House access pass has been confirmed. Use the button below to view your QR code — you'll need it to enter the Crappie House.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:28px;">
            <a href="{portal_url}"
               style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 32px;border-radius:8px;">
              View My Pass &amp; QR Code
            </a>
          </td></tr></table>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7ff;border-left:4px solid #2563eb;border-radius:4px;">
            <tr><td style="padding:14px 16px;">
              <p style="margin:0 0 6px;color:#1e3a8a;font-size:14px;"><strong>Access Start:</strong> {start_formatted}</p>
              <p style="margin:0;color:#1e3a8a;font-size:14px;"><strong>Access End:</strong> {end_formatted}</p>
            </td></tr>
          </table>

          <p style="margin:20px 0 0;color:#666;font-size:13px;">
            Your QR code is only visible while your pass is active. Present it to the scanner at the Crappie House dock.
          </p>
        </td></tr>

        <tr><td style="background:#f9f9f9;padding:20px 40px;border-top:1px solid #e5e5e5;">
          <p style="margin:0;color:#999;font-size:12px;text-align:center;">
            Hi-Line Resort &bull; Crappie House Access System<br>
            Questions? Email <a href="mailto:reservations@hilineresort.com" style="color:#2563eb;">reservations@hilineresort.com</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""

            plain = (
                f"Hi {recipient_name},\n\n"
                f"Your {pass_label} is confirmed.\n\n"
                f"View your pass and QR code: {portal_url}\n\n"
                f"Access Start: {start_formatted}\n"
                f"Access End:   {end_formatted}\n\n"
                f"Present your QR code at the Crappie House dock.\n\n"
                f"Hi-Line Resort | reservations@hilineresort.com"
            )

            return _send(client, recipient_email, subject, html_body, plain)

        except Exception as e:
            logger.error(f"Failed to send portal email to {recipient_email}: {str(e)}")
            return {"success": False, "error": str(e)}

    @staticmethod
    def send_qr_code_email(
        recipient_email: str,
        recipient_name: str,
        qr_code: str,
        user_type: str,
        access_expires_at: datetime,
    ) -> dict:
        client = _get_client()
        if not client:
            return {"success": False, "error": "Email service not configured"}

        try:
            qr_result = QRCodeGenerator.generate_and_get_url(qr_code, _get_base_url())
            if not qr_result["success"]:
                raise Exception("Could not generate QR code")

            qr_image_url = qr_result["qr_url"]
            expires_cst = _to_cst(access_expires_at)
            expires_formatted = expires_cst.strftime("%I:%M %p on %B %d, %Y")
            user_type_friendly = "Visit" if user_type == "visitor" else "Reservation"

            html_body = f"""<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2>Hi {recipient_name},</h2>
  <p>Your {user_type_friendly} has been confirmed. Here is your QR code for gate access:</p>
  <div style="text-align:center;margin:30px 0;">
    <img src="{qr_image_url}" alt="QR Code" style="width:250px;height:250px;">
  </div>
  <p><strong>Expires:</strong> {expires_formatted}</p>
  <p style="color:#666;font-size:12px;">Hi-Line Resort &bull; Crappie House Access System</p>
</body></html>"""

            return _send(client, recipient_email, "Your Smart Pass QR Code", html_body)

        except Exception as e:
            logger.error(f"Failed to send QR code email to {recipient_email}: {str(e)}")
            return {"success": False, "error": str(e)}

    @staticmethod
    def send_access_granted_email(
        recipient_email: str,
        recipient_name: str,
        access_timestamp: datetime,
    ) -> dict:
        client = _get_client()
        if not client:
            return {"success": False, "error": "Email service not configured"}

        try:
            timestamp_formatted = _to_cst(access_timestamp).strftime("%I:%M %p on %B %d, %Y")
            html_body = f"""<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <h2 style="color:#28a745;">Access Granted</h2>
  <p>Hi {recipient_name},</p>
  <p>Your QR code was successfully scanned at <strong>{timestamp_formatted}</strong>. Enjoy your visit!</p>
</body></html>"""
            return _send(client, recipient_email, "Access Granted - Hi-Line Resort", html_body)

        except Exception as e:
            logger.error(f"Failed to send access granted email to {recipient_email}: {str(e)}")
            return {"success": False, "error": str(e)}

    @staticmethod
    def send_access_denied_email(
        recipient_email: str,
        recipient_name: str,
        denial_reason: str,
    ) -> dict:
        client = _get_client()
        if not client:
            return {"success": False, "error": "Email service not configured"}

        try:
            reason_friendly = {
                "expired": "Your pass has expired.",
                "invalid_qr": "The QR code was invalid or not recognized.",
                "payment_failed": "Payment validation failed.",
                "revoked": "This pass has been revoked.",
                "inactive": "This pass is not yet active.",
            }.get(denial_reason, "Access validation failed.")

            html_body = f"""<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <h2 style="color:#d9534f;">Access Denied</h2>
  <p>Hi {recipient_name},</p>
  <p><strong>Reason:</strong> {reason_friendly}</p>
  <p>Please contact resort staff for assistance.</p>
</body></html>"""
            return _send(client, recipient_email, "Access Denied - Hi-Line Resort", html_body)

        except Exception as e:
            logger.error(f"Failed to send access denied email to {recipient_email}: {str(e)}")
            return {"success": False, "error": str(e)}

    @staticmethod
    def send_expiration_warning_email(
        recipient_email: str,
        recipient_name: str,
        hours_remaining: int,
        access_expires_at: datetime,
    ) -> dict:
        client = _get_client()
        if not client:
            return {"success": False, "error": "Email service not configured"}

        try:
            expires_formatted = _to_cst(access_expires_at).strftime("%I:%M %p on %B %d, %Y")
            html_body = f"""<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <h2 style="color:#ffc107;">Pass Expiring Soon</h2>
  <p>Hi {recipient_name},</p>
  <p>Your pass expires in <strong>{hours_remaining} hours</strong> at {expires_formatted}.</p>
  <p>Contact resort staff if you need an extension.</p>
</body></html>"""
            return _send(client, recipient_email, "Your Pass is Expiring Soon - Hi-Line Resort", html_body)

        except Exception as e:
            logger.error(f"Failed to send expiration warning email to {recipient_email}: {str(e)}")
            return {"success": False, "error": str(e)}
