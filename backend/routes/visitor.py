import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException
import logging

from schemas import VisitorCreate, VisitorResponse
from database import create_pass, get_pass_by_id, update_pass, utcnow
from email_service import EmailService
from payment_service import PaymentService
from rotating_qr import RotatingQRCodeService

logger = logging.getLogger(__name__)
router = APIRouter()
qr_service = RotatingQRCodeService()


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _portal_base_url() -> str:
    return os.getenv("PORTAL_BASE_URL", os.getenv("BASE_URL", "http://localhost:8000"))


def _serialize_visitor(doc: dict) -> VisitorResponse:
    return VisitorResponse(
        id=doc["id"],
        name=doc["name"],
        email=doc["email"],
        phone=doc.get("phone"),
        vehicle_info=doc.get("vehicle_info"),
        portal_token=doc["portal_token"],
        portal_url=f"{_portal_base_url()}/api/v1/access/portal/{doc['portal_token']}",
        created_at=doc["created_at"],
        access_start=doc["access_start"],
        access_end=doc["access_end"],
        payment_status=doc.get("payment_status", "unknown"),
        payment_reference=doc.get("payment_reference"),
        access_granted=doc.get("status") == "active",
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
        access_end = access_start + timedelta(days=visitor.num_days)

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
            "qr_refresh_seconds": 60,
        }
        created = await create_pass(pass_doc)

        portal_url = f"{_portal_base_url()}/api/v1/access/portal/{portal_token}"
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
