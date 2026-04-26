import os
import secrets
import io
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
import logging
import qrcode

from database import (
    find_passes_by_email,
    get_admin_by_email,
    get_pass_by_id,
    query_admin_access_logs,
    query_admin_passes,
    update_pass,
    verify_admin_credentials,
)
from rotating_qr import RotatingQRCodeService
from schemas import (
    AccessOverride,
    AdminAccessLogItem,
    AdminAccessLogListResponse,
    AdminLoginRequest,
    AdminLoginResponse,
    AdminPassItem,
    AdminPassListResponse,
    AdminPassPatchRequest,
    RotatingQRResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()
qr_service = RotatingQRCodeService()


def _calculate_pass_status(doc: dict) -> str:
    """Live status derived from the access window. Only 'revoked' is a manual override."""
    from database import utcnow
    now = utcnow()
    if str(doc.get("status_override", "")).lower() == "revoked":
        return "revoked"
    if str(doc.get("status", "")).lower() == "revoked":
        return "revoked"
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


def _render_qr_png(payload: str) -> bytes:
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=2,
    )
    qr.add_data(payload)
    qr.make(fit=True)

    image = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


async def _ensure_admin_static_qr_payload(doc: dict) -> tuple[dict, dict]:
    existing_payload = doc.get("qr_static_payload")
    if existing_payload:
        payload = {
            "qr_payload": existing_payload,
            "generated_at": doc.get("qr_generated_at") or doc.get("created_at") or datetime.now(timezone.utc),
            "valid_until": doc.get("qr_valid_until") or doc.get("access_end") or datetime.now(timezone.utc),
            "refresh_seconds": 0,
        }
        return doc, payload

    if not doc.get("token_seed"):
        raise HTTPException(status_code=500, detail="Pass is missing QR seed")

    payload = qr_service.create_payload(
        pass_id=doc["id"],
        token_seed=doc["token_seed"],
        valid_until=doc.get("access_end"),
    )
    doc = await update_pass(
        doc["id"],
        {
            "qr_static_payload": payload["qr_payload"],
            "qr_generated_at": payload["generated_at"],
            "qr_valid_until": payload["valid_until"],
        },
    ) or doc
    return doc, payload


def _normalize_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _to_admin_pass_item(doc: dict) -> AdminPassItem:
    return AdminPassItem(
        pass_id=doc.get("id", ""),
        reservation_id=doc.get("reservation_id"),
        portal_token=doc.get("portal_token"),
        guest_name=doc.get("name", ""),
        email=doc.get("email", ""),
        phone=doc.get("phone"),
        pass_type=doc.get("user_type", "visitor"),
        status=_calculate_pass_status(doc),
        start_at=doc.get("access_start"),
        end_at=doc.get("access_end"),
        adults=doc.get("num_adults", doc.get("adults", 0)),
        children=doc.get("num_children", doc.get("children", 0)),
        num_days=doc.get("num_days"),
        vehicle_info=doc.get("vehicle_info"),
        payment_amount=doc.get("payment_amount"),
        payment_tax=doc.get("payment_tax"),
        payment_reference=doc.get("payment_reference"),
        payment_status=doc.get("payment_status"),
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
    """Admin login backed by MongoDB with environment fallback."""
    token_ttl = int(os.getenv("ADMIN_TOKEN_EXPIRES_IN", "3600"))

    admin_doc = await verify_admin_credentials(payload.email, payload.password)
    if admin_doc:
        return AdminLoginResponse(
            access_token=secrets.token_urlsafe(32),
            token_type="bearer",
            expires_in=token_ttl,
            admin_id=str(admin_doc.get("id", "admin-local-1")),
            role=str(admin_doc.get("role", "admin")),
            name=str(admin_doc.get("name", "SmartPass Admin")),
        )

    # Backwards-compatible env login while teams migrate to Mongo-backed admin users.
    admin_email = os.getenv("ADMIN_EMAIL", "admin@smartpass.dev").strip().lower()
    admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
    admin_name = os.getenv("ADMIN_NAME", "SmartPass Admin")
    admin_role = os.getenv("ADMIN_ROLE", "admin")
    admin_id = os.getenv("ADMIN_ID", "admin-local-1")

    existing_admin = await get_admin_by_email(payload.email)
    if existing_admin:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

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
        requested_status = str(allowed_updates["status"]).strip().lower()
        if requested_status == "upcoming":
            requested_status = "inactive"
        if requested_status not in {"active", "inactive", "expired", "revoked"}:
            raise HTTPException(status_code=400, detail="Invalid status. Use active, inactive, expired, or revoked.")
        allowed_updates["status"] = requested_status
        # Only "revoked" is a persistent manual override; all other statuses are time-derived
        allowed_updates["status_override"] = "revoked" if requested_status == "revoked" else None

    if "access_start" in allowed_updates:
        allowed_updates["access_start"] = _normalize_utc(allowed_updates["access_start"])

    if "access_end" in allowed_updates:
        allowed_updates["access_end"] = _normalize_utc(allowed_updates["access_end"])

    if "email" in allowed_updates:
        allowed_updates["email"] = str(allowed_updates["email"]).strip().lower()

    updated = await update_pass(pass_id, allowed_updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Pass not found")
    return _to_admin_pass_item(updated)


@router.get("/passes/{pass_id}/qr", response_model=RotatingQRResponse)
async def get_admin_pass_qr(pass_id: str):
    doc = await get_pass_by_id(pass_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Pass not found")

    _, payload = await _ensure_admin_static_qr_payload(doc)
    return RotatingQRResponse(**payload)


@router.get("/passes/{pass_id}/qr-image")
async def get_admin_pass_qr_image(pass_id: str):
    doc = await get_pass_by_id(pass_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Pass not found")

    _, payload = await _ensure_admin_static_qr_payload(doc)
    png_bytes = _render_qr_png(payload["qr_payload"])

    headers = {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "X-QR-Valid-Until": payload["valid_until"].isoformat(),
    }
    return StreamingResponse(io.BytesIO(png_bytes), media_type="image/png", headers=headers)


@router.post("/passes/{pass_id}/qr/regenerate", response_model=RotatingQRResponse)
async def regenerate_admin_pass_qr(pass_id: str):
    """Generate a new QR seed and payload for a pass, invalidating the old one."""
    doc = await get_pass_by_id(pass_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Pass not found")

    new_seed = qr_service.generate_seed()
    payload = qr_service.create_payload(
        pass_id=doc["id"],
        token_seed=new_seed,
        valid_until=doc.get("access_end"),
    )
    await update_pass(
        doc["id"],
        {
            "token_seed": new_seed,
            "qr_static_payload": payload["qr_payload"],
            "qr_generated_at": payload["generated_at"],
            "qr_valid_until": payload["valid_until"],
        },
    )
    return RotatingQRResponse(**payload)


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
