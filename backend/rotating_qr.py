import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timezone
from typing import Any, Optional


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RotatingQRCodeService:
    """Create and validate signed QR payloads."""

    def __init__(self, secret: Optional[str] = None) -> None:
        self.secret = (secret or os.getenv("QR_SIGNING_SECRET") or "dev-rotate-secret").encode("utf-8")

    @staticmethod
    def generate_seed() -> str:
        return secrets.token_hex(16)

    @staticmethod
    def _encode(payload: dict[str, Any]) -> str:
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")

    @staticmethod
    def _decode(payload: str) -> dict[str, Any]:
        pad = "=" * (-len(payload) % 4)
        raw = base64.urlsafe_b64decode((payload + pad).encode("utf-8"))
        return json.loads(raw)

    def decode_payload(self, qr_payload: str) -> dict[str, Any]:
        return self._decode(qr_payload)

    def _signature(self, pass_id: str, token_seed: str) -> str:
        message = f"{pass_id}:{token_seed}".encode("utf-8")
        return hmac.new(self.secret, message, hashlib.sha256).hexdigest()[:24]

    def create_payload(
        self,
        pass_id: str,
        token_seed: str,
        at_time: Optional[datetime] = None,
        valid_until: Optional[datetime] = None,
    ) -> dict[str, Any]:
        now = at_time or utcnow()
        signature = self._signature(pass_id=pass_id, token_seed=token_seed)
        token = self._encode({"p": pass_id, "s": signature})
        resolved_valid_until = valid_until or now

        return {
            "qr_payload": token,
            "generated_at": now,
            "valid_until": resolved_valid_until,
            "refresh_seconds": 0,
        }

    def validate_payload(self, qr_payload: str, pass_id: str, token_seed: str, at_time: Optional[datetime] = None) -> bool:
        _ = at_time or utcnow()
        try:
            decoded = self._decode(qr_payload)
            if decoded.get("p") != pass_id:
                return False

            signature = decoded.get("s")
            expected = self._signature(pass_id=pass_id, token_seed=token_seed)
            if signature != expected:
                return False
            return True
        except Exception:
            return False
