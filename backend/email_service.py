import os
import logging
from typing import Optional
from datetime import datetime
import resend
from schemas import QRCodeEmailNotification, AccessGrantedEmail, AccessDeniedEmail, ExpirationWarningEmail
from qr_generator import QRCodeGenerator


logger = logging.getLogger(__name__)

# Get base URL from environment at runtime (after .env is loaded)
def _get_base_url() -> str:
    return os.getenv("BASE_URL", "http://localhost:8000")

# Lazy-load Resend API key on first use
_resend_initialized = False

def _init_resend():
    """Initialize Resend API key when first needed"""
    global _resend_initialized
    if not _resend_initialized:
        api_key = os.getenv("RESEND_API_KEY")
        if not api_key:
            logger.warning("RESEND_API_KEY not found in environment variables")
            return False
        resend.api_key = api_key
        _resend_initialized = True
        logger.info("Resend API initialized successfully")
    return _resend_initialized


class EmailService:
    """Service for sending emails via Resend API"""

    @staticmethod
    def send_qr_code_email(
        recipient_email: str,
        recipient_name: str,
        qr_code: str,
        user_type: str,
        access_expires_at: datetime,
    ) -> dict:
        """
        Send QR code email to visitor/guest with locally generated QR image
        
        Args:
            recipient_email: Email address of recipient
            recipient_name: Name of recipient
            qr_code: QR code string/token (will be encoded into the QR image)
            user_type: "visitor" or "guest"
            access_expires_at: When the QR code expires
            
        Returns:
            dict with email send result
        """
        if not _init_resend():
            logger.error("Resend API key not configured. Check RESEND_API_KEY.")
            return {"success": False, "error": "Email service not configured"}

        try:
            # Generate QR code locally and get URL
            qr_result = QRCodeGenerator.generate_and_get_url(qr_code, _get_base_url())
            
            if not qr_result["success"]:
                logger.error(f"Failed to generate QR code: {qr_result.get('error')}")
                raise Exception("Could not generate QR code")
            
            qr_image_url = qr_result["qr_url"]
            
            subject = "Your Smart Pass QR Code - Access Your Visit"
            
            # Build HTML email with embedded QR code image
            expires_formatted = access_expires_at.strftime("%I:%M %p on %B %d, %Y")
            user_type_friendly = "Visit" if user_type == "visitor" else "Reservation"
            
            html_body = f"""
            <html>
                <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 30px;">
                        <h2 style="margin: 0;">🔑 Welcome to Smart Pass!</h2>
                    </div>
                    
                    <p>Hi {recipient_name},</p>
                    <p>Your {user_type_friendly} has been confirmed. Below is your unique QR code for gate access:</p>
                    
                    <div style="margin: 30px 0; text-align: center; background: #f5f5f5; padding: 20px; border-radius: 10px;">
                        <img src="{qr_image_url}" 
                             alt="Smart Pass QR Code" 
                             style="width: 250px; height: 250px; border: 2px solid #667eea; border-radius: 8px;">
                        <p style="font-size: 11px; color: #666; margin-top: 15px; font-family: monospace; word-break: break-all;">Token: {qr_code}</p>
                    </div>
                    
                    <div style="background: #e8f4f8; border-left: 4px solid #0288d1; padding: 15px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 0; color: #01579b;"><strong>⏰ Access expires at:</strong> {expires_formatted}</p>
                    </div>
                    
                    <p style="color: #d32f2f; font-weight: bold;">⚠️ Important:</p>
                    <ul>
                        <li>This QR code is unique and non-transferable</li>
                        <li>Do not share it with others</li>
                        <li>Scan it at the gate to gain access</li>
                    </ul>
                    
                    <div style="border-top: 1px solid #ddd; padding-top: 20px; margin-top: 30px;">
                        <p style="color: #666; font-size: 12px; text-align: center;">
                            Smart Pass System • Hi-Line Resort<br>
                            If you have any questions, please contact the resort staff.
                        </p>
                    </div>
                </body>
            </html>
            """
            
            response = resend.Emails.send(
                {
                    "from": "Smart Pass <onboarding@resend.dev>",
                    "to": [recipient_email],
                    "subject": subject,
                    "html": html_body,
                }
            )
            
            logger.info(f"QR code email sent to {recipient_email}")
            return {"success": True, "email_id": response.get("id")}
            
        except Exception as e:
            logger.error(f"Failed to send QR code email to {recipient_email}: {str(e)}")
            return {"success": False, "error": str(e)}

    @staticmethod
    def send_access_granted_email(
        recipient_email: str,
        recipient_name: str,
        access_timestamp: datetime,
    ) -> dict:
        """Send notification that access was granted"""
        if not _init_resend():
            logger.error("Resend API key not configured. Check RESEND_API_KEY.")
            return {"success": False, "error": "Email service not configured"}

        try:
            timestamp_formatted = access_timestamp.strftime("%I:%M %p on %B %d, %Y")
            
            html_body = f"""
            <html>
                <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #28a745;">✓ Access Granted</h2>
                    <p>Hi {recipient_name},</p>
                    <p>Your QR code was successfully scanned and validated. Welcome!</p>
                    <p><strong>Access timestamp:</strong> {timestamp_formatted}</p>
                    <p>Enjoy your visit!</p>
                </body>
            </html>
            """
            
            response = resend.Emails.send(
                {
                    "from": "Smart Pass <onboarding@resend.dev>",
                    "to": [recipient_email],
                    "subject": "Access Granted - Smart Pass",
                    "html": html_body,
                }
            )
            
            logger.info(f"Access granted email sent to {recipient_email}")
            return {"success": True, "email_id": response.get("id")}
            
        except Exception as e:
            logger.error(f"Failed to send access granted email to {recipient_email}: {str(e)}")
            return {"success": False, "error": str(e)}

    @staticmethod
    def send_access_denied_email(
        recipient_email: str,
        recipient_name: str,
        denial_reason: str,
    ) -> dict:
        """Send notification that access was denied"""
        if not _init_resend():
            logger.error("Resend API key not configured. Check RESEND_API_KEY.")
            return {"success": False, "error": "Email service not configured"}

        try:
            reason_friendly = {
                "expired": "Your QR code has expired",
                "invalid_qr": "The QR code was invalid or not recognized",
                "payment_failed": "Payment validation failed",
            }.get(denial_reason, "Access validation failed")
            
            html_body = f"""
            <html>
                <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #d9534f;">✗ Access Denied</h2>
                    <p>Hi {recipient_name},</p>
                    <p><strong>Reason:</strong> {reason_friendly}</p>
                    <p>Please contact the resort staff for assistance.</p>
                </body>
            </html>
            """
            
            response = resend.Emails.send(
                {
                    "from": "Smart Pass <onboarding@resend.dev>",
                    "to": [recipient_email],
                    "subject": "Access Denied - Smart Pass",
                    "html": html_body,
                }
            )
            
            logger.info(f"Access denied email sent to {recipient_email}")
            return {"success": True, "email_id": response.get("id")}
            
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
        """Send warning that QR code is expiring soon"""
        if not _init_resend():
            logger.error("Resend API key not configured. Check RESEND_API_KEY.")
            return {"success": False, "error": "Email service not configured"}

        try:
            expires_formatted = access_expires_at.strftime("%I:%M %p on %B %d, %Y")
            
            html_body = f"""
            <html>
                <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #ffc107;">⏰ Access Expiring Soon</h2>
                    <p>Hi {recipient_name},</p>
                    <p>Your Smart Pass QR code will expire in <strong>{hours_remaining} hours</strong>.</p>
                    <p><strong>Expires at:</strong> {expires_formatted}</p>
                    <p>If you need extended access, please contact the resort staff.</p>
                </body>
            </html>
            """
            
            response = resend.Emails.send(
                {
                    "from": "Smart Pass <onboarding@resend.dev>",
                    "to": [recipient_email],
                    "subject": "Your Smart Pass is Expiring Soon",
                    "html": html_body,
                }
            )
            
            logger.info(f"Expiration warning email sent to {recipient_email}")
            return {"success": True, "email_id": response.get("id")}
            
        except Exception as e:
            logger.error(f"Failed to send expiration warning email to {recipient_email}: {str(e)}")
            return {"success": False, "error": str(e)}
