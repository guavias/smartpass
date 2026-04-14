import os
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
import logging

from database import (
    find_passes_by_email,
    get_pass_by_id,
    query_admin_access_logs,
    query_admin_passes,
    update_pass,
)
from schemas import (
    AccessOverride,
    AdminAccessLogItem,
    AdminAccessLogListResponse,
    AdminLoginRequest,
    AdminLoginResponse,
    AdminPassItem,
    AdminPassListResponse,
    AdminPassPatchRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _normalize_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _to_admin_pass_item(doc: dict) -> AdminPassItem:
    return AdminPassItem(
        pass_id=doc.get("id", ""),
        reservation_id=doc.get("reservation_id"),
        guest_name=doc.get("name", ""),
        email=doc.get("email", ""),
        phone=doc.get("phone"),
        pass_type=doc.get("user_type", "visitor"),
        status=doc.get("status", "unknown"),
        start_at=doc.get("access_start"),
        end_at=doc.get("access_end"),
        adults=doc.get("adults", 0),
        children=doc.get("children", 0),
        vehicle_info=doc.get("vehicle_info"),
        created_at=doc.get("created_at"),
        updated_at=doc.get("updated_at"),
    )


def _to_admin_access_log_item(doc: dict) -> AdminAccessLogItem:
    return AdminAccessLogItem(
        event_id=doc.get("_id", ""),
        timestamp=doc.get("timestamp"),
        pass_id=doc.get("pass_id"),
        reservation_id=doc.get("reservation_id"),
        guest_name=doc.get("guest_name") or doc.get("holder_name"),
        location=doc.get("gate_location", "main_dock"),
        result=doc.get("validation_result", "unknown"),
        reason=doc.get("reason"),
        scanner_id=doc.get("scanner_id"),
    )


@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(payload: AdminLoginRequest):
    """Basic admin login endpoint for dashboard integration."""
    admin_email = os.getenv("ADMIN_EMAIL", "admin@smartpass.dev").strip().lower()
    admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
    admin_name = os.getenv("ADMIN_NAME", "SmartPass Admin")
    admin_role = os.getenv("ADMIN_ROLE", "admin")
    admin_id = os.getenv("ADMIN_ID", "admin-local-1")
    token_ttl = int(os.getenv("ADMIN_TOKEN_EXPIRES_IN", "3600"))

    if payload.email.strip().lower() != admin_email or payload.password != admin_password:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    return AdminLoginResponse(
        access_token=secrets.token_urlsafe(32),
        token_type="bearer",
        expires_in=token_ttl,
        admin_id=admin_id,
        role=admin_role,
        name=admin_name,
    )


@router.get("/passes", response_model=AdminPassListResponse)
async def list_admin_passes(
    search: str | None = Query(default=None),
    status: str | None = Query(default=None),
    pass_type: str | None = Query(default=None),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    offset = (page - 1) * page_size
    items, total = await query_admin_passes(
        search=search,
        status=status,
        pass_type=pass_type,
        start_date=_normalize_utc(start_date) if start_date else None,
        end_date=_normalize_utc(end_date) if end_date else None,
        limit=page_size,
        offset=offset,
    )
    return AdminPassListResponse(
        items=[_to_admin_pass_item(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/passes/{pass_id}", response_model=AdminPassItem)
async def get_admin_pass(pass_id: str):
    doc = await get_pass_by_id(pass_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Pass not found")
    return _to_admin_pass_item(doc)


@router.patch("/passes/{pass_id}", response_model=AdminPassItem)
async def patch_admin_pass(pass_id: str, payload: AdminPassPatchRequest):
    allowed_updates = payload.model_dump(exclude_none=True)
    if not allowed_updates:
        doc = await get_pass_by_id(pass_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Pass not found")
        return _to_admin_pass_item(doc)

    if "status" in allowed_updates:
        allowed_updates["status"] = str(allowed_updates["status"]).lower()

    if "access_start" in allowed_updates:
        allowed_updates["access_start"] = _normalize_utc(allowed_updates["access_start"])

    if "access_end" in allowed_updates:
        allowed_updates["access_end"] = _normalize_utc(allowed_updates["access_end"])

    updated = await update_pass(pass_id, allowed_updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Pass not found")
    return _to_admin_pass_item(updated)


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
async def get_access_logs(
    search: str | None = Query(default=None),
    result: str | None = Query(default=None),
    location: str | None = Query(default=None),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int | None = Query(default=None, ge=0),
):
    """
    Retrieve gate access logs (QR scans and validation results)
    """
    try:
        resolved_limit = limit if limit is not None else page_size
        resolved_offset = offset if offset is not None else (page - 1) * page_size

        logs, total = await query_admin_access_logs(
            search=search,
            result=result,
            location=location,
            start_date=_normalize_utc(start_date) if start_date else None,
            end_date=_normalize_utc(end_date) if end_date else None,
            limit=resolved_limit,
            offset=resolved_offset,
        )

        logger.info("Fetching %s access logs with offset %s", resolved_limit, resolved_offset)

        response = AdminAccessLogListResponse(
            items=[_to_admin_access_log_item(item) for item in logs],
            total=total,
            page=page,
            page_size=resolved_limit,
        )

        # Keep backwards compatibility for existing clients expecting access_logs/limit/offset.
        return {
            "items": [item.model_dump() for item in response.items],
            "total": response.total,
            "page": response.page,
            "page_size": response.page_size,
            "access_logs": [item.model_dump() for item in response.items],
            "limit": resolved_limit,
            "offset": resolved_offset,
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
