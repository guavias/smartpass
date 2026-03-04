from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


# ============ Visitor & Guest Models ============
class VisitorBase(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    vehicle_info: Optional[str] = None


class VisitorCreate(VisitorBase):
    payment_amount: float
    payment_method: str = "card"  # e.g., "card", "cash"


class VisitorResponse(VisitorBase):
    id: str
    qr_code: str
    created_at: datetime
    expires_at: datetime
    access_granted: bool = False


class GuestBase(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    reservation_id: str


class GuestCreate(GuestBase):
    check_in: datetime
    check_out: datetime


class GuestResponse(GuestBase):
    id: str
    qr_code: str
    created_at: datetime
    expires_at: datetime
    access_granted: bool = False


# ============ QR & Pass Models ============
class QRCode(BaseModel):
    token: str
    user_id: str
    user_type: str  # "visitor" or "guest"
    generated_at: datetime
    expires_at: datetime
    scans_remaining: int = 1


class Pass(BaseModel):
    id: str
    user_id: str
    user_type: str
    qr_code: str
    status: str  # "active", "used", "expired", "revoked"
    created_at: datetime
    expires_at: datetime
    used_at: Optional[datetime] = None


class GateAccessLog(BaseModel):
    id: str
    pass_id: str
    user_id: str
    qr_scanned: str
    validation_result: str  # "approved", "denied", "expired", "invalid"
    timestamp: datetime
    gate_location: str = "main_dock"


# ============ Email Notification Models ============
class EmailNotification(BaseModel):
    recipient_email: EmailStr
    recipient_name: str
    subject: str
    body: str
    html_body: Optional[str] = None


class QRCodeEmailNotification(EmailNotification):
    qr_code: str
    qr_code_image_url: Optional[str] = None
    access_expires_at: datetime
    user_type: str  # "visitor" or "guest"


class AccessGrantedEmail(EmailNotification):
    pass_id: str
    access_timestamp: datetime


class AccessDeniedEmail(EmailNotification):
    denial_reason: str  # "expired", "invalid_qr", "payment_failed"


class ExpirationWarningEmail(EmailNotification):
    hours_remaining: int
    access_expires_at: datetime


# ============ Payment Models ============
class PaymentIntent(BaseModel):
    amount: float
    currency: str = "USD"
    payment_method: str
    user_id: str
    user_type: str


class PaymentSuccess(BaseModel):
    transaction_id: str
    amount: float
    timestamp: datetime
    user_id: str


class PaymentFailed(BaseModel):
    reason: str
    user_id: str
    timestamp: datetime


# ============ Admin/Management Models ============
class AdminUser(BaseModel):
    id: str
    username: str
    email: EmailStr
    role: str  # "admin", "staff", "manager"
    created_at: datetime


class AccessOverride(BaseModel):
    user_id: str
    override_reason: str
    approved_by: str  # admin user id
    expires_at: datetime
    created_at: datetime


class SystemLog(BaseModel):
    id: str
    event_type: str  # "pass_created", "access_granted", "access_denied", "email_sent", etc.
    user_id: Optional[str] = None
    details: dict
    timestamp: datetime
    status: str  # "success", "failed"