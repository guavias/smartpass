import asyncio
import io
from datetime import timezone
import logging

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
import qrcode

from database import get_pass_by_id, get_pass_by_portal_token, log_access_event, update_pass, utcnow
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
    if doc.get("status") == "revoked":
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
    if status == "expired" and doc.get("status") != "expired":
        doc = await update_pass(doc["id"], {"status": "expired"}) or doc
    return doc


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
async def get_rotating_qr(portal_token: str):
    doc = await _resolve_active_doc_by_portal(portal_token)
    status = _status_for_doc(doc)
    if status != "active":
        raise HTTPException(status_code=403, detail=f"Portal is {status}")

    payload = qr_service.create_payload(pass_id=doc["id"], token_seed=doc["token_seed"])
    await update_pass(doc["id"], {"last_rotated_at": payload["generated_at"]})
    return RotatingQRResponse(**payload)


@router.get("/portal/{portal_token}/qr-image")
async def get_rotating_qr_image(portal_token: str):
    doc = await _resolve_active_doc_by_portal(portal_token)
    status = _status_for_doc(doc)
    if status != "active":
        raise HTTPException(status_code=403, detail=f"Portal is {status}")

    payload = qr_service.create_payload(pass_id=doc["id"], token_seed=doc["token_seed"])
    await update_pass(doc["id"], {"last_rotated_at": payload["generated_at"]})

    png_bytes = _render_qr_png(payload["qr_payload"])
    headers = {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "X-QR-Valid-Until": payload["valid_until"].isoformat(),
        "X-QR-Refresh-Seconds": str(payload["refresh_seconds"]),
    }
    return StreamingResponse(io.BytesIO(png_bytes), media_type="image/png", headers=headers)


@router.websocket("/portal/{portal_token}/ws")
async def stream_rotating_qr(portal_token: str, websocket: WebSocket):
    await websocket.accept()
    last_payload = None

    try:
        while True:
            doc = await _resolve_active_doc_by_portal(portal_token)
            status = _status_for_doc(doc)

            if status != "active":
                await websocket.send_json({"type": "error", "status": status, "detail": f"Portal is {status}"})
                await websocket.close(code=1008, reason=f"Portal is {status}")
                break

            payload = qr_service.create_payload(pass_id=doc["id"], token_seed=doc["token_seed"])
            if payload["qr_payload"] != last_payload:
                last_payload = payload["qr_payload"]
                await update_pass(doc["id"], {"last_rotated_at": payload["generated_at"]})
                await websocket.send_json(
                    {
                        "type": "qr_update",
                        "pass_id": doc["id"],
                        "qr_payload": payload["qr_payload"],
                        "generated_at": payload["generated_at"].isoformat(),
                        "valid_until": payload["valid_until"].isoformat(),
                        "refresh_seconds": payload["refresh_seconds"],
                    }
                )

            now = utcnow()
            wait_seconds = max(1, int((payload["valid_until"] - now).total_seconds()))
            await asyncio.sleep(min(wait_seconds, 15))
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for portal token %s", portal_token)
    except Exception as exc:
        logger.error("WebSocket stream error for portal token %s: %s", portal_token, exc)
        try:
            await websocket.close(code=1011, reason="WebSocket stream error")
        except Exception:
            pass


@router.post("/validate", response_model=ValidateQRResponse)
async def validate_qr(payload: ValidateQRRequest):
    try:
        decoded = qr_service.decode_payload(payload.qr_payload)
        pass_id = decoded.get("p")
        if not pass_id:
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

        doc = await get_pass_by_id(pass_id)
        if not doc:
            result = ValidateQRResponse(status="invalid")
            await log_access_event(
                {
                    "pass_id": pass_id,
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
            is_valid = qr_service.validate_payload(
                qr_payload=payload.qr_payload,
                pass_id=doc["id"],
                token_seed=doc["token_seed"],
            )
            if not is_valid:
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
