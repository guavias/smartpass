import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RotatingQRCodeService:
    """Create and validate minute-based rotating QR payloads."""

    def __init__(self, secret: Optional[str] = None, refresh_seconds: int = 60, allowed_skew_minutes: int = 1) -> None:
        self.secret = (secret or os.getenv("QR_SIGNING_SECRET") or "dev-rotate-secret").encode("utf-8")
        self.refresh_seconds = refresh_seconds
        self.allowed_skew_minutes = allowed_skew_minutes

    @staticmethod
    def generate_seed() -> str:
        return secrets.token_hex(16)

    @staticmethod
    def _minute_slice(ts: datetime) -> int:
        return int(ts.timestamp() // 60)

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

    def _signature(self, pass_id: str, token_seed: str, minute_slice: int) -> str:
        message = f"{pass_id}:{token_seed}:{minute_slice}".encode("utf-8")
        return hmac.new(self.secret, message, hashlib.sha256).hexdigest()[:24]

    def create_payload(self, pass_id: str, token_seed: str, at_time: Optional[datetime] = None) -> dict[str, Any]:
        now = at_time or utcnow()
        minute = self._minute_slice(now)
        signature = self._signature(pass_id=pass_id, token_seed=token_seed, minute_slice=minute)
        token = self._encode({"p": pass_id, "m": minute, "s": signature})
        valid_until = (datetime.fromtimestamp((minute + 1) * 60, tz=timezone.utc)).replace(microsecond=0)

        return {
            "qr_payload": token,
            "generated_at": now,
            "valid_until": valid_until,
            "refresh_seconds": self.refresh_seconds,
        }

    def validate_payload(self, qr_payload: str, pass_id: str, token_seed: str, at_time: Optional[datetime] = None) -> bool:
        now = at_time or utcnow()
        try:
            decoded = self._decode(qr_payload)
            if decoded.get("p") != pass_id:
                return False

            minute = int(decoded.get("m"))
            signature = decoded.get("s")
            expected = self._signature(pass_id=pass_id, token_seed=token_seed, minute_slice=minute)
            if signature != expected:
                return False

            current_minute = self._minute_slice(now)
            return abs(current_minute - minute) <= self.allowed_skew_minutes
        except Exception:
            return False
