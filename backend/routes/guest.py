from fastapi import APIRouter, HTTPException
from datetime import datetime
import uuid
import logging

from schemas import GuestCreate, GuestResponse
from email_service import EmailService

logger = logging.getLogger(__name__)
router = APIRouter()


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
        # Generate unique pass ID and QR token
        guest_id = str(uuid.uuid4())
        qr_token = str(uuid.uuid4())
        
        # QR code expires at check-out time
        created_at = datetime.now()
        expires_at = guest.check_out
        
        # Send QR code email via Resend
        email_result = EmailService.send_qr_code_email(
            recipient_email=guest.email,
            recipient_name=guest.name,
            qr_code=qr_token,
            user_type="guest",
            access_expires_at=expires_at,
        )
        
        if not email_result.get("success"):
            logger.error(f"Failed to send email to {guest.email}: {email_result.get('error')}")
            raise HTTPException(status_code=500, detail="Failed to send QR code via email")
        
        logger.info(f"Guest pass created for {guest.email} (Reservation: {guest.reservation_id}) with ID {guest_id}")
        
        # TODO: Save to MongoDB
        return GuestResponse(
            id=guest_id,
            name=guest.name,
            email=guest.email,
            phone=guest.phone,
            reservation_id=guest.reservation_id,
            qr_code=qr_token,
            created_at=created_at,
            expires_at=expires_at,
            access_granted=False,
        )
    
    except Exception as e:
        logger.error(f"Error creating guest pass: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{guest_id}", response_model=GuestResponse)
async def get_guest_pass(guest_id: str):
    """Retrieve guest pass details"""
    # TODO: Fetch from MongoDB
    raise HTTPException(status_code=404, detail="Guest pass not found")


@router.put("/{guest_id}")
async def update_guest_pass(guest_id: str, guest_data: dict):
    """Update guest pass (e.g., extend check-out date)"""
    # TODO: Update MongoDB and potentially resend email if dates changed
    return {"status": "pass updated", "guest_id": guest_id}


@router.delete("/{guest_id}")
async def revoke_guest_pass(guest_id: str):
    """Revoke a guest pass"""
    # TODO: Update MongoDB status to "revoked"
    return {"status": "pass revoked", "guest_id": guest_id}
