import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException
import logging
import pytz

from schemas import VisitorCreate, VisitorResponse
from database import create_pass, get_pass_by_id, update_pass, utcnow
from email_service import EmailService
from payment_service import PaymentService
from rotating_qr import RotatingQRCodeService

logger = logging.getLogger(__name__)
router = APIRouter()
qr_service = RotatingQRCodeService()

# Central timezone for time display
CST = pytz.timezone('America/Chicago')


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _calculate_day_pass_end_time(start: datetime, num_days: int) -> datetime:
    """
    Calculate end time for day passes in CST timezone.
    For N days, end at 11:59:59 PM CST of the Nth day (inclusive).
    Example: 1-day pass starting Apr 14 3:04 PM CDT ends Apr 14 11:59:59 PM CDT
    Example: 2-day pass starting Apr 14 3:04 PM CDT ends Apr 15 11:59:59 PM CDT
    """
    # Convert start to CST to work with local dates
    start_cst = start.astimezone(CST) if start.tzinfo else start.replace(tzinfo=pytz.UTC).astimezone(CST)
    
    # Add (num_days - 1) full days to get to the last day
    end_date_cst = start_cst + timedelta(days=num_days - 1)
    
    # Set to 23:59:59 in CST
    end_cst = end_date_cst.replace(hour=23, minute=59, second=59, microsecond=0)
    
    # Convert back to UTC for storage
    return end_cst.astimezone(pytz.UTC)


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


def _serialize_visitor(doc: dict) -> VisitorResponse:
    status = _calculate_pass_status(doc)
    return VisitorResponse(
        id=doc["id"],
        name=doc["name"],
        email=doc["email"],
        phone=doc.get("phone"),
        vehicle_info=doc.get("vehicle_info"),
        portal_token=doc["portal_token"],
        portal_url=f"{_portal_base_url()}/reservation/{doc['id']}",
        created_at=doc["created_at"],
        access_start=doc["access_start"],
        access_end=doc["access_end"],
        payment_status=doc.get("payment_status", "unknown"),
        payment_reference=doc.get("payment_reference"),
        payment_amount=doc.get("payment_amount", 0),
        num_days=doc.get("num_days", 1),
        num_adults=doc.get("num_adults", 1),
        num_children=doc.get("num_children", 0),
        access_granted=status == "active",
        status=status,
        pass_type="visitor",
    )


@router.post("/", response_model=VisitorResponse)
async def create_visitor_pass(visitor: VisitorCreate):
    """
    Create a walk-up visitor pass and send QR code via email
    
    Flow:
    1. Validate visitor information
    2. Process payment via Square (not implemented yet)
    3. Generate QR code
    4. Send email via Resend with QR code
    """
    try:
        visitor_id = str(uuid.uuid4())
        portal_token = str(uuid.uuid4())
        token_seed = qr_service.generate_seed()

        created_at = utcnow()
        access_start = _to_utc(visitor.access_start) if visitor.access_start else created_at
        access_end = _calculate_day_pass_end_time(access_start, visitor.num_days)

        payment_status = "not_required"
        payment_reference = None
        if visitor.payment_method.lower() == "card":
            payment_result = await PaymentService.process_square_payment(
                amount_usd=visitor.payment_amount,
                source_id=visitor.payment_source_id or "",
                idempotency_key=visitor.idempotency_key,
            )
            if not payment_result.get("success"):
                raise HTTPException(status_code=402, detail=payment_result.get("error", "Payment failed"))
            payment_status = payment_result.get("status", "completed")
            payment_reference = payment_result.get("transaction_id")

        pass_doc = {
            "id": visitor_id,
            "user_id": visitor_id,
            "user_type": "visitor",
            "name": visitor.name,
            "email": visitor.email.lower(),
            "phone": visitor.phone,
            "vehicle_info": visitor.vehicle_info,
            "portal_token": portal_token,
            "token_seed": token_seed,
            "status": "active",
            "created_at": created_at,
            "access_start": access_start,
            "access_end": access_end,
            "payment_status": payment_status,
            "payment_reference": payment_reference,
            "payment_method": visitor.payment_method,
            "payment_amount": visitor.payment_amount,
            "num_days": visitor.num_days,
            "num_adults": visitor.num_adults,
            "num_children": visitor.num_children,
            "qr_refresh_seconds": 60,
        }
        created = await create_pass(pass_doc)

        portal_url = f"{_portal_base_url()}/reservation/{visitor_id}"
        email_result = EmailService.send_portal_access_email(
            recipient_email=visitor.email,
            recipient_name=visitor.name,
            portal_url=portal_url,
            user_type="visitor",
            access_start=access_start,
            access_end=access_end,
        )

        if not email_result.get("success"):
            await update_pass(visitor_id, {"email_status": "failed", "email_error": email_result.get("error")})
        else:
            await update_pass(visitor_id, {"email_status": "sent", "email_reference": email_result.get("email_id")})

        logger.info(f"Visitor pass created for {visitor.email} with ID {visitor_id}")
        return _serialize_visitor(created)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating visitor pass: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{visitor_id}", response_model=VisitorResponse)
async def get_visitor_pass(visitor_id: str):
    """Retrieve visitor pass details"""
    doc = await get_pass_by_id(visitor_id)
    if not doc or doc.get("user_type") != "visitor":
        raise HTTPException(status_code=404, detail="Visitor not found")
    return _serialize_visitor(doc)


@router.delete("/{visitor_id}")
async def revoke_visitor_pass(visitor_id: str):
    """Revoke a visitor pass"""
    doc = await get_pass_by_id(visitor_id)
    if not doc or doc.get("user_type") != "visitor":
        raise HTTPException(status_code=404, detail="Visitor not found")

    await update_pass(visitor_id, {"status": "revoked", "revoked_at": utcnow()})
    return {"status": "pass revoked", "visitor_id": visitor_id}
