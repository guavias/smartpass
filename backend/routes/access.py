import io
from datetime import timezone
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import qrcode

from database import get_pass_by_portal_token, get_pass_by_qr_payload, log_access_event, update_pass, utcnow
from rotating_qr import RotatingQRCodeService
from schemas import PortalAccessResponse, RotatingQRResponse, ValidateQRRequest, ValidateQRResponse


logger = logging.getLogger(__name__)
router = APIRouter()
qr_service = RotatingQRCodeService()


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


def _status_for_doc(doc: dict) -> str:
    now = utcnow()
    status_override = str(doc.get("status_override", "")).lower()
    if status_override in {"revoked", "inactive", "expired"}:
        return status_override
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


async def _resolve_active_doc_by_portal(portal_token: str) -> dict:
    doc = await get_pass_by_portal_token(portal_token)
    if not doc:
        raise HTTPException(status_code=404, detail="Portal not found")

    status = _status_for_doc(doc)
    if not doc.get("status_override") and status != doc.get("status"):
        doc = await update_pass(doc["id"], {"status": status}) or doc
    return doc


async def _ensure_static_qr_payload(doc: dict) -> tuple[dict, dict]:
    existing_payload = doc.get("qr_static_payload")
    if existing_payload:
        payload = {
            "qr_payload": existing_payload,
            "generated_at": doc.get("qr_generated_at") or doc.get("created_at") or utcnow(),
            "valid_until": doc.get("qr_valid_until") or doc.get("access_end") or utcnow(),
            "refresh_seconds": 0,
        }
        return doc, payload

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


@router.get("/portal/{portal_token}", response_model=PortalAccessResponse)
async def get_portal(portal_token: str):
    doc = await _resolve_active_doc_by_portal(portal_token)
    status = _status_for_doc(doc)

    return PortalAccessResponse(
        pass_id=doc["id"],
        portal_token=doc["portal_token"],
        user_type=doc["user_type"],
        holder_name=doc["name"],
        access_start=doc["access_start"],
        access_end=doc["access_end"],
        status=status,
        qr_refresh_seconds=doc.get("qr_refresh_seconds", 60),
    )


@router.get("/portal/{portal_token}/qr", response_model=RotatingQRResponse)
async def get_portal_qr(portal_token: str):
    doc = await _resolve_active_doc_by_portal(portal_token)
    status = _status_for_doc(doc)
    if status != "active":
        raise HTTPException(status_code=403, detail=f"Portal is {status}")

    doc, payload = await _ensure_static_qr_payload(doc)
    return RotatingQRResponse(**payload)


@router.get("/portal/{portal_token}/qr-image")
async def get_portal_qr_image(portal_token: str):
    doc = await _resolve_active_doc_by_portal(portal_token)
    status = _status_for_doc(doc)
    if status != "active":
        raise HTTPException(status_code=403, detail=f"Portal is {status}")

    doc, payload = await _ensure_static_qr_payload(doc)

    png_bytes = _render_qr_png(payload["qr_payload"])
    headers = {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "X-QR-Valid-Until": payload["valid_until"].isoformat(),
    }
    return StreamingResponse(io.BytesIO(png_bytes), media_type="image/png", headers=headers)


@router.post("/validate", response_model=ValidateQRResponse)
async def validate_qr(payload: ValidateQRRequest):
    try:
        doc = await get_pass_by_qr_payload(payload.qr_payload)
        if not doc:
            result = ValidateQRResponse(status="invalid")
            await log_access_event(
                {
                    "pass_id": None,
                    "qr_scanned": payload.qr_payload,
                    "validation_result": result.status,
                    "gate_location": payload.gate_location,
                }
            )
            return result

        status = _status_for_doc(doc)
        if status == "revoked":
            result = ValidateQRResponse(status="revoked", pass_id=doc["id"], user_type=doc["user_type"], access_end=doc["access_end"])
        elif status == "expired":
            if doc.get("status") != "expired":
                await update_pass(doc["id"], {"status": "expired"})
            result = ValidateQRResponse(status="expired", pass_id=doc["id"], user_type=doc["user_type"], access_end=doc["access_end"])
        elif status == "inactive":
            result = ValidateQRResponse(status="invalid", pass_id=doc["id"], user_type=doc["user_type"], access_end=doc["access_end"])
        else:
            result = ValidateQRResponse(status="approved", pass_id=doc["id"], user_type=doc["user_type"], access_end=doc["access_end"])

        await log_access_event(
            {
                "pass_id": doc["id"],
                "user_id": doc.get("user_id"),
                "qr_scanned": payload.qr_payload,
                "validation_result": result.status,
                "gate_location": payload.gate_location,
            }
        )
        return result

    except Exception as exc:
        logger.error(f"QR validation error: {exc}")
        raise HTTPException(status_code=400, detail="Invalid QR payload")
