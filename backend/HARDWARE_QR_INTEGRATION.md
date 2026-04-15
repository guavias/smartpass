# Hardware Scanner Integration Guide

## Overview
The SmartPass QR code system uses **rotating payloads** - the QR code changes every 60 seconds. Your scanner reads a base64-encoded JSON string, not a simple pass ID.

## What the Scanner Reads

When your scanner reads a QR code, it captures this base64 string:
```
eyJwIjoiZGEzNTI2YTktZWY0Ny00MGZiLTgxN2ItYzg2NmM1Nzk0NDI1IiwibSI6Mjk2MDM4MzksInMiOiIxZDZmZmFmNjg0Nzc4ZmUyYWFmMGU4NiJ9
```

**This is NOT a pass ID.** It's a security payload that changes every 60 seconds.

## Decoding the Payload

When decoded, it contains:
```json
{
  "p": "da3526a9-ef47-40fb-817b-c866c5794425",  // pass_id
  "m": 29603839,                                   // current minute (unix timestamp ÷ 60)
  "s": "1d6ffaf684778fe2aaf0e86"                 // signature (HMAC-SHA256)
}
```

## Two Integration Approaches

### Option 1: Local Validation (Do It Yourself)
Decode locally and validate the signature:

```python
import base64
import json
import hmac
import hashlib
import os
from datetime import datetime, timezone

def decode_qr(qr_payload: str):
    """Decode base64 QR payload"""
    pad = "=" * (-len(qr_payload) % 4)
    raw = base64.urlsafe_b64decode((qr_payload + pad).encode("utf-8"))
    return json.loads(raw)

def validate_qr(qr_payload: str, pass_id: str, token_seed: str):
    """Validate QR signature and expiration"""
    try:
        decoded = decode_qr(qr_payload)
        
        # Extract fields
        payload_pass_id = decoded.get("p")
        payload_minute = decoded.get("m")
        payload_signature = decoded.get("s")
        
        # Check pass_id matches
        if payload_pass_id != pass_id:
            return False, "Pass ID mismatch"
        
        # Recalculate signature
        secret = os.getenv("QR_SIGNING_SECRET", "dev-rotate-secret").encode("utf-8")
        message = f"{pass_id}:{token_seed}:{payload_minute}".encode("utf-8")
        expected_sig = hmac.new(secret, message, hashlib.sha256).hexdigest()[:24]
        
        if payload_signature != expected_sig:
            return False, "Signature invalid"
        
        # Check time (allow 1 minute skew)
        current_minute = int(datetime.now(timezone.utc).timestamp() // 60)
        if abs(current_minute - payload_minute) > 1:
            return False, "QR expired"
        
        return True, "Valid"
    except Exception as e:
        return False, f"Error: {str(e)}"

# Usage
scanner_result = "eyJwIjoiZGEzNTI2YTktZWY0Ny00MGZiLTgxN2ItYzg2NmM1Nzk0NDI1IiwibSI6Mjk2MDM4MzksInMiOiIxZDZmZmFmNjg0Nzc4ZmUyYWFmMGU4NiJ9"
is_valid, message = validate_qr(scanner_result, pass_id="da3526a9-ef47-40fb-817b-c866c5794425", token_seed="<from_db>")
print(f"Valid: {is_valid}, Message: {message}")
```

**Requirements:**
- Access to `QR_SIGNING_SECRET` environment variable
- Access to database to get `token_seed` for each pass
- Python `hmac`, `hashlib`, `base64` libraries

---

### Option 2: Cloud Validation (Recommended)
POST the scanned QR to the backend validation endpoint - it handles everything:

```python
import requests

scanned_qr = "eyJwIjoiZGEzNTI2YTktZWY0Ny00MGZiLTgxN2ItYzg2NmM1Nzk0NDI1IiwibSI6Mjk2MDM4MzksInMiOiIxZDZmZmFmNjg0Nzc4ZmUyYWFmMGU4NiJ9"

response = requests.post(
    "http://smartpass.example.com/api/v1/access/validate",
    json={
        "qr_payload": scanned_qr,
        "gate_location": "main_dock"
    }
)

result = response.json()
print(result)
# {
#   "status": "approved",  # or "invalid", "expired", "revoked"
#   "pass_id": "da3526a9-ef47-40fb-817b-c866c5794425",
#   "user_type": "guest",
#   "access_end": "2026-04-16T11:00:00Z"
# }
```

**Advantages:**
- No need for `QR_SIGNING_SECRET` or database access
- Backend validates everything (signature, expiration, pass status)
- Simpler integration
- Better security (you don't store secrets locally)
- Automatic logging of all scan attempts

---

## Key Concepts

### Why Rotating?
- **Security:** Prevents replay attacks (scanning an old QR code doesn't work)
- **Audit trail:** Each unique QR is logged on specific timestamp
- **Short validity window:** QR only valid for ~60 seconds before a new one generates

### The Base64 Changes Every 60 Seconds Because:
- `m` (minute value) increments: 29603839 → 29603840
- `s` (signature) recalculates based on new minute
- Entire JSON changes → entire base64 changes
- **But `p` (pass_id) always stays the same** - that's what identifies the guest

### What You DON'T Need to Store
- `m` (minute) - generated fresh each lookup
- `s` (signature) - calculated fresh each lookup
- These are ephemeral and only valid for 60 seconds

---

## Database Schema (For Reference)

If using Option 1, you'll need these fields from the `passes` collection:

```python
{
    "_id": "ObjectId(...)",
    "id": "da3526a9-ef47-40fb-817b-c866c5794425",  # pass_id  
    "token_seed": "a3f8b2e9c1d4f7a0b3e8c1d4f7a0b3e",  # SECRET for signing
    "portal_token": "portal_abc123...",
    "status": "active",  # "active", "expired", "revoked"
    "access_start": "2026-04-15T15:00:00Z",
    "access_end": "2026-04-16T11:00:00Z",
    "name": "John Doe",
    "user_type": "guest"
}
```

---

## Testing

### Test Valid QR
```bash
curl -X POST http://localhost:8000/api/v1/access/validate \
  -H "Content-Type: application/json" \
  -d '{
    "qr_payload": "eyJwIjoiZGEzNTI2YTktZWY0Ny00MGZiLTgxN2ItYzg2NmM1Nzk0NDI1IiwibSI6Mjk2MDM4MzksInMiOiIxZDZmZmFmNjg0Nzc4ZmUyYWFmMGU4NiJ9",
    "gate_location": "main_dock"
  }'
```

Expected response:
```json
{
  "status": "approved",
  "pass_id": "da3526a9-ef47-40fb-817b-c866c5794425",
  "user_type": "guest",
  "access_end": "2026-04-16T11:00:00Z"
}
```

### Test Invalid QR
Try scanning an old QR code (>2 minutes old) or a corrupted string:
```bash
curl -X POST http://localhost:8000/api/v1/access/validate \
  -H "Content-Type: application/json" \
  -d '{
    "qr_payload": "invalid_base64_here",
    "gate_location": "main_dock"
  }'
```

Expected response:
```json
{
  "status": "invalid",
  "pass_id": null,
  "user_type": null,
  "access_end": null
}
```

---

## Environment Setup

If using Option 1 (local validation):

```bash
# .env (backend)
QR_SIGNING_SECRET=<long_random_secret>
MONGODB_URL=mongodb+srv://...
```

If using Option 2 (cloud validation):
- No special setup needed
- Scanner just needs HTTP/HTTPS access to backend

---

## Support

For questions:
- Check `/api/v1/access/validate` endpoint details in main API docs
- See `backend/rotating_qr.py` for implementation details
- For database access, contact backend team
