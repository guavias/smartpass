from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta
import uuid
import logging

from schemas import VisitorCreate, VisitorResponse
from email_service import EmailService

logger = logging.getLogger(__name__)
router = APIRouter()


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
        # Generate unique pass ID and QR token
        visitor_id = str(uuid.uuid4())
        qr_token = str(uuid.uuid4())
        
        # Set expiration (24 hours from now for walk-up visitors)
        created_at = datetime.now()
        expires_at = created_at + timedelta(hours=24)
        
        # TODO: Process payment via Square API
        logger.info(f"Processing payment for visitor {visitor.email}: ${visitor.payment_amount}")
        
        # Send QR code email via Resend
        email_result = EmailService.send_qr_code_email(
            recipient_email=visitor.email,
            recipient_name=visitor.name,
            qr_code=qr_token,
            user_type="visitor",
            access_expires_at=expires_at,
        )
        
        if not email_result.get("success"):
            logger.error(f"Failed to send email to {visitor.email}: {email_result.get('error')}")
            raise HTTPException(status_code=500, detail="Failed to send QR code via email")
        
        logger.info(f"Visitor pass created for {visitor.email} with ID {visitor_id}")
        
        # TODO: Save to MongoDB
        return VisitorResponse(
            id=visitor_id,
            name=visitor.name,
            email=visitor.email,
            phone=visitor.phone,
            vehicle_info=visitor.vehicle_info,
            qr_code=qr_token,
            created_at=created_at,
            expires_at=expires_at,
            access_granted=False,
        )
    
    except Exception as e:
        logger.error(f"Error creating visitor pass: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{visitor_id}", response_model=VisitorResponse)
async def get_visitor_pass(visitor_id: str):
    """Retrieve visitor pass details"""
    # TODO: Fetch from MongoDB
    raise HTTPException(status_code=404, detail="Visitor not found")


@router.delete("/{visitor_id}")
async def revoke_visitor_pass(visitor_id: str):
    """Revoke a visitor pass"""
    # TODO: Update MongoDB status to "revoked"
    return {"status": "pass revoked", "visitor_id": visitor_id}
