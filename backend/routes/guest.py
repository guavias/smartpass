import os
import uuid
import logging
from datetime import datetime, timezone
import pytz

from fastapi import APIRouter, HTTPException

from database import create_pass, get_day_pass_by_reservation, get_guest_pass_by_reservation, get_pass_by_id, update_pass, utcnow
from email_service import EmailService
from payment_service import PaymentService
from rotating_qr import RotatingQRCodeService
from schemas import GuestCreate, GuestLookupRequest, GuestResponse

logger = logging.getLogger(__name__)
router = APIRouter()
qr_service = RotatingQRCodeService()

# Central timezone for time display
CST = pytz.timezone('America/Chicago')


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _portal_base_url() -> str:
    return os.getenv("PORTAL_BASE_URL", os.getenv("BASE_URL", "http://localhost:8000"))


def _normalize_checkin_to_start_of_day(checkin: datetime) -> datetime:
    """
    Normalize check-in time:
    - Same-day or past booking: start immediately (now)
    - Future-date booking: start at 12:00 AM CST/CDT of that date

    Uses UTC date comparison to avoid off-by-one: the frontend sends date-only
    strings as UTC midnight (e.g. "2026-04-23T00:00:00Z"), which converts to the
    previous evening in CDT and would wrongly be treated as a past date.
    """
    now = utcnow()
    checkin_utc_date = checkin.astimezone(timezone.utc).date()
    today_utc = now.date()

    if checkin_utc_date <= today_utc:
        return now

    naive_midnight = datetime(checkin_utc_date.year, checkin_utc_date.month, checkin_utc_date.day, 0, 0, 0)
    return CST.localize(naive_midnight).astimezone(pytz.UTC)


def _normalize_checkout_to_end_of_day(checkout: datetime) -> datetime:
    """
    Normalize checkout time to 11:59:59 PM CST on that date.
    Ensures continuous access throughout the checkout day.
    Example: checkout 11:00 AM Apr 15 → 11:59:59 PM Apr 15 CST
    """
    # Convert to CST to work with local date/time
    checkout_cst = checkout.astimezone(CST) if checkout.tzinfo else checkout.replace(tzinfo=pytz.UTC).astimezone(CST)
    
    # Set to 23:59:59 in CST
    end_cst = checkout_cst.replace(hour=23, minute=59, second=59, microsecond=0)
    
    # Convert back to UTC for storage
    return end_cst.astimezone(pytz.UTC)


def _calculate_pass_status(doc: dict) -> str:
    """Calculate the current status of a pass based on access windows.

    Only 'revoked' is a persistent manual override (set by admin).
    All other statuses (inactive/active/expired) are derived from the time window
    so they transition automatically without any manual intervention.
    """
    now = utcnow()
    # Only "revoked" is a persistent manual override
    if str(doc.get("status_override", "")).lower() == "revoked":
        return "revoked"
    if str(doc.get("status", "")).lower() == "revoked":
        return "revoked"
    # Time-derived statuses
    access_start = doc.get("access_start")
    if access_start and access_start.tzinfo is None:
        access_start = access_start.replace(tzinfo=timezone.utc)
    if access_start and now < access_start:
        return "inactive"
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
        num_adults=doc.get("num_adults", 1),
        num_children=doc.get("num_children", 0),
        pets=doc.get("pets", 0),
        payment_status=doc.get("payment_status", "not_required"),
        payment_reference=doc.get("payment_reference"),
        payment_amount=doc.get("payment_amount"),
        access_granted=status == "active",
        status=status,
    )


@router.post("/", response_model=GuestResponse)
async def create_guest_pass(guest: GuestCreate):
    """
    Create a guest pass for a reservation with optional payment processing
    
    Flow:
    1. If payment_source_id provided: Process Square payment
    2. Create guest pass record
    3. Send confirmation email via Resend
    """
    try:
        raw_check_in = _to_utc(guest.check_in)
        check_out_raw = _to_utc(guest.check_out)
        if check_out_raw <= raw_check_in:
            raise HTTPException(status_code=400, detail="check_out must be after check_in")

        check_in = _normalize_checkin_to_start_of_day(raw_check_in)

        # Normalize checkout to 11:59:59 PM on checkout date for continuous access
        check_out = _normalize_checkout_to_end_of_day(check_out_raw)

        # Process payment if payment_source_id is provided
        payment_status = "not_required"
        payment_reference = None
        
        if guest.payment_source_id and guest.payment_amount:
            try:
                idempotency_key = guest.idempotency_key or f"guest-{guest.reservation_id}-{datetime.now().timestamp()}"
                payment_result = await PaymentService.process_square_payment(
                    amount_usd=guest.payment_amount,
                    source_id=guest.payment_source_id,
                    idempotency_key=idempotency_key,
                )
                
                if payment_result.get("success"):
                    payment_status = "completed"
                    payment_reference = payment_result.get("transaction_id")
                    logger.info(f"Payment processed for {guest.email}: {payment_reference}")
                else:
                    raise HTTPException(
                        status_code=402,
                        detail=f"Payment failed: {payment_result.get('status', 'Unknown error')}"
                    )
            except Exception as e:
                logger.error(f"Payment processing error for {guest.email}: {str(e)}")
                raise HTTPException(status_code=402, detail=f"Payment processing failed: {str(e)}")

        existing = await get_guest_pass_by_reservation(guest.email, guest.reservation_id)
        if existing and existing.get("status") != "revoked":
            initial_status = "inactive" if check_in > utcnow() else "active"
            updated = await update_pass(
                existing["id"],
                {
                    "name": guest.name,
                    "phone": guest.phone,
                    "access_start": check_in,
                    "access_end": check_out,
                    "status": initial_status,
                    "status_override": None,
                    "num_adults": guest.num_adults,
                    "num_children": guest.num_children,
                    "pets": guest.pets,
                    "payment_status": payment_status,
                    "payment_reference": payment_reference,
                    "payment_amount": guest.payment_amount,
                    "payment_tax": guest.payment_tax,
                },
            )
            if updated:
                return _serialize_guest(updated)

        guest_id = str(uuid.uuid4())
        portal_token = str(uuid.uuid4())
        token_seed = qr_service.generate_seed()
        created_at = utcnow()
        guest_qr_payload = qr_service.create_payload(
            pass_id=guest_id,
            token_seed=token_seed,
            valid_until=check_out,
        )

        initial_status = "inactive" if check_in > utcnow() else "active"

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
            "status": initial_status,
            "created_at": created_at,
            "access_start": check_in,
            "access_end": check_out,
            "num_adults": guest.num_adults,
            "num_children": guest.num_children,
            "pets": guest.pets,
            "payment_status": payment_status,
            "payment_reference": payment_reference,
            "payment_amount": guest.payment_amount,
            "payment_tax": guest.payment_tax,
            "qr_static_payload": guest_qr_payload["qr_payload"],
            "qr_generated_at": guest_qr_payload["generated_at"],
            "qr_valid_until": guest_qr_payload["valid_until"],
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
    """
    Find guest portal by reservation ID or pass ID + email.
    Lookup order:
      1. Companion day pass (visitor type) by reservation_id
      2. Overnight guest pass by reservation_id
      3. Any pass directly by pass_id (UUID), verified against email
    Status is recalculated from access window on each lookup.
    """
    identifier = payload.reservation_id.strip()

    # Try companion day pass first (the Crappie House QR pass included with overnight stays)
    doc = await get_day_pass_by_reservation(payload.email, identifier)

    # Fall back to the overnight guest pass by reservation_id
    if not doc:
        doc = await get_guest_pass_by_reservation(payload.email, identifier)

    # Fall back to direct pass_id lookup (UUID entered instead of reservation_id)
    if not doc:
        doc = await get_pass_by_id(identifier)
        if doc and doc.get("email", "").lower() != payload.email.strip().lower():
            doc = None

    if not doc:
        raise HTTPException(status_code=404, detail="No reservation portal found")

    # Recalculate status from access window and persist if changed
    calculated_status = _calculate_pass_status(doc)
    if calculated_status != doc.get("status"):
        doc = await update_pass(doc["id"], {"status": calculated_status}) or doc

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
