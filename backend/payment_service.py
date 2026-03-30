import os
import uuid
from typing import Any

import httpx


class PaymentService:
    """Square payment helper with sandbox support."""

    @staticmethod
    async def process_square_payment(
        amount_usd: float,
        source_id: str,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        access_token = os.getenv("SQUARE_ACCESS_TOKEN")
        location_id = os.getenv("SQUARE_LOCATION_ID")
        environment = os.getenv("SQUARE_ENV", "sandbox").lower()

        if not access_token or not location_id:
            return {
                "success": False,
                "status": "not_configured",
                "error": "Square credentials are missing",
            }

        if not source_id:
            return {
                "success": False,
                "status": "invalid_request",
                "error": "payment_source_id is required for card payments",
            }

        endpoint = "https://connect.squareupsandbox.com/v2/payments"
        if environment == "production":
            endpoint = "https://connect.squareup.com/v2/payments"

        payload = {
            "idempotency_key": idempotency_key or str(uuid.uuid4()),
            "amount_money": {
                "amount": int(round(amount_usd * 100)),
                "currency": "USD",
            },
            "source_id": source_id,
            "location_id": location_id,
            "autocomplete": True,
        }

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Square-Version": os.getenv("SQUARE_API_VERSION", "2024-10-17"),
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(endpoint, headers=headers, json=payload)

            data = response.json()
            if response.status_code >= 400:
                return {
                    "success": False,
                    "status": "failed",
                    "error": data.get("errors", [{"detail": "Square payment failed"}])[0].get("detail"),
                }

            payment = data.get("payment", {})
            payment_status = payment.get("status", "UNKNOWN")
            if payment_status != "COMPLETED":
                return {
                    "success": False,
                    "status": payment_status.lower(),
                    "error": f"Payment status: {payment_status}",
                }

            return {
                "success": True,
                "status": "completed",
                "transaction_id": payment.get("id"),
                "receipt_url": payment.get("receipt_url"),
                "card_details": payment.get("card_details", {}),
            }
        except Exception as exc:
            return {
                "success": False,
                "status": "exception",
                "error": str(exc),
            }
