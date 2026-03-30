from fastapi import APIRouter, HTTPException
from datetime import datetime
import logging

from database import find_passes_by_email, get_access_logs as db_get_access_logs, get_access_logs_total
from schemas import AccessOverride, SystemLog

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/override")
async def manual_access_override(override: AccessOverride):
    """
    Admin manual override for gate access
    
    Allows admin to grant immediate access without requiring QR code scan
    """
    try:
        logger.info(f"Manual access override requested by {override.approved_by} for user {override.user_id}")
        
        # TODO: Record override in MongoDB
        # TODO: Optionally send notification email
        
        return {
            "status": "override granted",
            "user_id": override.user_id,
            "expires_at": override.expires_at,
        }
    
    except Exception as e:
        logger.error(f"Error processing access override: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/logs")
async def get_system_logs(limit: int = 100, offset: int = 0):
    """
    Retrieve system logs (access attempts, emails sent, system events)
    
    Args:
        limit: Number of logs to return
        offset: Pagination offset
    """
    try:
        # TODO: Fetch from MongoDB with pagination
        logger.info(f"Fetching {limit} system logs with offset {offset}")
        
        return {
            "logs": [],
            "total": 0,
            "limit": limit,
            "offset": offset,
        }
    
    except Exception as e:
        logger.error(f"Error retrieving system logs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/access-logs")
async def get_access_logs(limit: int = 100, offset: int = 0):
    """
    Retrieve gate access logs (QR scans and validation results)
    """
    try:
        logs = await db_get_access_logs(limit=limit, offset=offset)
        total = await get_access_logs_total()
        logger.info(f"Fetching {limit} access logs with offset {offset}")
        
        return {
            "access_logs": logs,
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    
    except Exception as e:
        logger.error(f"Error retrieving access logs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{user_id}/profile")
async def get_user_profile(user_id: str):
    """Get user profile and pass history"""
    try:
        passes = await find_passes_by_email(user_id, limit=20)
        return {
            "user_id": user_id,
            "passes": passes,
            "access_history": [],
        }
    
    except Exception as e:
        logger.error(f"Error retrieving user profile: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/users/{user_id}")
async def delete_user_account(user_id: str):
    """Delete user account and all associated passes (soft delete)"""
    try:
        # TODO: Mark user as deleted in MongoDB (soft delete to preserve logs)
        logger.info(f"User account {user_id} deleted")
        
        return {"status": "user deleted", "user_id": user_id}
    
    except Exception as e:
        logger.error(f"Error deleting user account: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
