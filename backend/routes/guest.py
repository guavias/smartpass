import os
import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from database import create_pass, get_guest_pass_by_reservation, get_pass_by_id, update_pass, utcnow
from email_service import EmailService
from rotating_qr import RotatingQRCodeService
from schemas import GuestCreate, GuestLookupRequest, GuestResponse

logger = logging.getLogger(__name__)
router = APIRouter()
qr_service = RotatingQRCodeService()


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _portal_base_url() -> str:
    return os.getenv("PORTAL_BASE_URL", os.getenv("BASE_URL", "http://localhost:8000"))


def _calculate_pass_status(doc: dict) -> str:
    """Calculate the current status of a pass based on access windows and stored status"""
    now = utcnow()
    # If revoked, always revoked
    if doc.get("status") == "revoked":
        return "revoked"
    # Check if not yet active
    access_start = doc.get("access_start")
    if access_start and access_start.tzinfo is None:
        access_start = access_start.replace(tzinfo=timezone.utc)
    if access_start and now < access_start:
        return "inactive"
    # Check if expired
    access_end = doc.get("access_end")
    if access_end and access_end.tzinfo is None:
        access_end = access_end.replace(tzinfo=timezone.utc)
    if access_end and now > access_end:
        return "expired"
    return "active"


def _serialize_guest(doc: dict) -> GuestResponse:
    status = _calculate_pass_status(doc)
    return GuestResponse(
        id=doc["id"],
        name=doc["name"],
        email=doc["email"],
        phone=doc.get("phone"),
        reservation_id=doc["reservation_id"],
        portal_token=doc["portal_token"],
        portal_url=f"{_portal_base_url()}/reservation/{doc['id']}",
        created_at=doc["created_at"],
        access_start=doc["access_start"],
        access_end=doc["access_end"],
        access_granted=status == "active",
        status=status,
    )


@router.post("/", response_model=GuestResponse)
async def create_guest_pass(guest: GuestCreate):
    """
    Create a guest pass for a reservation and send QR code via email
    
    Flow:
    1. Validate guest and reservation details
    2. Generate QR code
    3. Send email via Resend with QR code (valid for check-in period)
    """
    try:
        check_in = _to_utc(guest.check_in)
        check_out = _to_utc(guest.check_out)
        if check_out <= check_in:
            raise HTTPException(status_code=400, detail="check_out must be after check_in")

        existing = await get_guest_pass_by_reservation(guest.email, guest.reservation_id)
        if existing and existing.get("status") != "revoked":
            updated = await update_pass(
                existing["id"],
                {
                    "name": guest.name,
                    "phone": guest.phone,
                    "access_start": check_in,
                    "access_end": check_out,
                    "status": "active",
                },
            )
            if updated:
                return _serialize_guest(updated)

        guest_id = str(uuid.uuid4())
        portal_token = str(uuid.uuid4())
        token_seed = qr_service.generate_seed()
        created_at = utcnow()

        pass_doc = {
            "id": guest_id,
            "user_id": guest_id,
            "user_type": "guest",
            "name": guest.name,
            "email": guest.email.lower(),
            "phone": guest.phone,
            "reservation_id": guest.reservation_id,
            "portal_token": portal_token,
            "token_seed": token_seed,
            "status": "active",
            "created_at": created_at,
            "access_start": check_in,
            "access_end": check_out,
            "payment_status": "not_required",
            "qr_refresh_seconds": 60,
        }
        created = await create_pass(pass_doc)

        portal_url = f"{_portal_base_url()}/reservation/{guest_id}"
        email_result = EmailService.send_portal_access_email(
            recipient_email=guest.email,
            recipient_name=guest.name,
            portal_url=portal_url,
            user_type="guest",
            access_start=check_in,
            access_end=check_out,
        )
        if not email_result.get("success"):
            await update_pass(guest_id, {"email_status": "failed", "email_error": email_result.get("error")})
        else:
            await update_pass(guest_id, {"email_status": "sent", "email_reference": email_result.get("email_id")})

        logger.info(f"Guest pass created for {guest.email} (Reservation: {guest.reservation_id}) with ID {guest_id}")
        return _serialize_guest(created)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating guest pass: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{guest_id}", response_model=GuestResponse)
async def get_guest_pass(guest_id: str):
    """Retrieve guest pass details"""
    doc = await get_pass_by_id(guest_id)
    if not doc or doc.get("user_type") != "guest":
        raise HTTPException(status_code=404, detail="Guest pass not found")
    return _serialize_guest(doc)


@router.post("/find", response_model=GuestResponse)
async def find_guest_portal(payload: GuestLookupRequest):
    """Find an existing guest portal by reservation + email."""
    doc = await get_guest_pass_by_reservation(payload.email, payload.reservation_id)
    if not doc:
        raise HTTPException(status_code=404, detail="No reservation portal found")
    return _serialize_guest(doc)


@router.put("/{guest_id}")
async def update_guest_pass(guest_id: str, guest_data: dict):
    """Update guest pass (e.g., extend check-out date)"""
    doc = await get_pass_by_id(guest_id)
    if not doc or doc.get("user_type") != "guest":
        raise HTTPException(status_code=404, detail="Guest pass not found")

    safe_updates = {
        key: value
        for key, value in guest_data.items()
        if key in {"name", "phone", "access_start", "access_end", "status"}
    }
    updated = await update_pass(guest_id, safe_updates)
    return {"status": "pass updated", "guest_id": guest_id, "updated": bool(updated)}


@router.delete("/{guest_id}")
async def revoke_guest_pass(guest_id: str):
    """Revoke a guest pass"""
    doc = await get_pass_by_id(guest_id)
    if not doc or doc.get("user_type") != "guest":
        raise HTTPException(status_code=404, detail="Guest pass not found")

    await update_pass(guest_id, {"status": "revoked", "revoked_at": utcnow()})
    return {"status": "pass revoked", "guest_id": guest_id}
