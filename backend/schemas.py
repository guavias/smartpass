from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ============ Visitor & Guest Models ============
class VisitorBase(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    vehicle_info: Optional[str] = None


class VisitorCreate(VisitorBase):
    payment_amount: float
    payment_tax: Optional[float] = None
    payment_method: str = "card"  # e.g., "card", "cash"
    num_days: int = Field(default=1, ge=1, le=30)
    num_adults: int = Field(default=1, ge=1, le=20)
    num_children: int = Field(default=0, ge=0, le=20)
    access_start: Optional[datetime] = None
    payment_source_id: Optional[str] = None
    idempotency_key: Optional[str] = None


class VisitorResponse(VisitorBase):
    id: str
    portal_token: str
    portal_url: str
    pass_type: Literal["visitor"] = "visitor"
    created_at: datetime
    access_start: datetime
    access_end: datetime
    payment_status: str
    payment_reference: Optional[str] = None
    payment_amount: float
    num_days: int
    num_adults: int
    num_children: int
    qr_refresh_seconds: int = 60
    access_granted: bool = False
    status: str


class GuestBase(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    reservation_id: str


class GuestCreate(GuestBase):
    check_in: datetime
    check_out: datetime
    num_adults: int = Field(default=1, ge=1, le=20)
    num_children: int = Field(default=0, ge=0, le=20)
    pets: int = Field(default=0, ge=0, le=10)
    payment_amount: Optional[float] = None
    payment_tax: Optional[float] = None
    payment_method: str = "card"  # e.g., "card", "not_required"
    payment_source_id: Optional[str] = None
    idempotency_key: Optional[str] = None


class GuestResponse(GuestBase):
    id: str
    portal_token: str
    portal_url: str
    pass_type: Literal["guest"] = "guest"
    created_at: datetime
    access_start: datetime
    access_end: datetime
    num_adults: int = 1
    num_children: int = 0
    pets: int = 0
    payment_status: str = "not_required"
    payment_reference: Optional[str] = None
    payment_amount: Optional[float] = None
    access_granted: bool = False
    status: str


class GuestLookupRequest(BaseModel):
    email: EmailStr
    reservation_id: str


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
    portal_token: str
    token_seed: str
    reservation_id: Optional[str] = None
    payment_reference: Optional[str] = None
    payment_status: str = "not_required"
    status: str  # "active", "used", "expired", "revoked"
    created_at: datetime
    access_start: datetime
    access_end: datetime
    qr_refresh_seconds: int = 60
    used_at: Optional[datetime] = None


class PortalAccessResponse(BaseModel):
    model_config = ConfigDict(ser_json_timedelta="float")
    
    pass_id: str
    portal_token: str
    user_type: Literal["visitor", "guest"]
    holder_name: str
    access_start: datetime
    access_end: datetime
    status: str
    qr_refresh_seconds: int = 60


class RotatingQRResponse(BaseModel):
    qr_payload: str
    generated_at: datetime
    valid_until: datetime
    refresh_seconds: int = 60


class ValidateQRRequest(BaseModel):
    qr_payload: str
    gate_location: str = "main_dock"


class ValidateQRResponse(BaseModel):
    status: Literal["approved", "expired", "invalid", "revoked"]
    pass_id: Optional[str] = None
    user_type: Optional[str] = None
    access_end: Optional[datetime] = None


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


class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str


class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    admin_id: str
    role: str
    name: str


class AdminPassItem(BaseModel):
    pass_id: str
    reservation_id: Optional[str] = None
    portal_token: Optional[str] = None
    guest_name: str
    email: str
    phone: Optional[str] = None
    pass_type: str
    status: str
    start_at: datetime
    end_at: datetime
    adults: int = 0
    children: int = 0
    num_days: Optional[int] = None
    vehicle_info: Optional[str] = None
    payment_amount: Optional[float] = None
    payment_tax: Optional[float] = None
    payment_reference: Optional[str] = None
    payment_status: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class AdminPassListResponse(BaseModel):
    items: list[AdminPassItem]
    total: int
    page: int
    page_size: int


class AdminPassPatchRequest(BaseModel):
    status: Optional[str] = None
    access_start: Optional[datetime] = None
    access_end: Optional[datetime] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    vehicle_info: Optional[str] = None
    num_adults: Optional[int] = None
    num_children: Optional[int] = None


class AdminAccessLogItem(BaseModel):
    event_id: str
    timestamp: datetime
    pass_id: Optional[str] = None
    reservation_id: Optional[str] = None
    guest_name: Optional[str] = None
    location: str
    result: str
    reason: Optional[str] = None
    scanner_id: Optional[str] = None


class AdminAccessLogListResponse(BaseModel):
    items: list[AdminAccessLogItem]
    total: int
    page: int
    page_size: int


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


class PaymentResult(BaseModel):
    success: bool
    status: str
    transaction_id: Optional[str] = None
    error: Optional[str] = None