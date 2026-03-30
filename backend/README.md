# SmartPass

Hi-Line Resort SmartPass Senior Design Project.

## Current Scope

ELLO GUYS!! This backend folder currently has

- Day visitor pass creation (including card payment path via Square Sandbox)
- Overnight guest pass creation/refresh by reservation window
- Portal-based rotating QR access flow
- QR validation and access logging

## Repository Layout

- `backend/` - FastAPI backend services and routes
- `frontend/` - Frontend workspace (*not merged yet)
- `hardware/` - Hardware integration workspace (in progress by Joel)

## Backend Quick Start

From `backend/`:

1. Copy `.env.example` to `.env` and fill real credentials (ask backend team members for keys)
2. Install dependencies:
	- `py -3.12 -m pip install --user -r requirements.txt`
	- or use a virtual environment and run `pip install -r requirements.txt`
3. Run API:
	- `py -3.12 main.py`
	- or `python main.py` if your active interpreter has dependencies installed.

## Testing

- Postman collection: `backend/postman/SmartPass.postman_collection.json`
- Endpoint index: `backend/endpoints.txt`
- Setup and smoke tests: `backend/SETUP_AND_TEST.md`

### Postman Workflow (Visitor + Overnight Guest)

Set collection variable:

- `baseUrl = http://127.0.0.1:8000`

#### A) Visitor (Day Pass) Test Flow

1. `POST /api/v1/visitors/`
2. `GET /api/v1/access/portal/{portal_token}`
3. `GET /api/v1/access/portal/{portal_token}/qr` (returns rotating `qr_payload` token JSON)
4. `GET /api/v1/access/portal/{portal_token}/qr-image` (returns PNG QR image)
5. `POST /api/v1/access/validate`

Sample visitor create body:

```json
{
	"name": "Postman Test Visitor",
	"email": "postman.visitor@example.com",
	"phone": "555-555-1212",
	"vehicle_info": "ABC-123",
	"payment_amount": 1.0,
	"payment_method": "card",
	"num_days": 1,
	"payment_source_id": "cnon:card-nonce-ok",
	"idempotency_key": "postman-visitor-001"
}
```

#### B) Overnight Guest Test Flow

1. `POST /api/v1/guests/`
2. `POST /api/v1/guests/find`
3. `GET /api/v1/access/portal/{portal_token}`
4. `GET /api/v1/access/portal/{portal_token}/qr` (returns rotating `qr_payload` token JSON)
5. `GET /api/v1/access/portal/{portal_token}/qr-image` (returns PNG QR image)
6. `POST /api/v1/access/validate`

Sample overnight guest create body:

```json
{
	"name": "Overnight Guest One",
	"email": "overnight@example.com",
	"phone": "555-999-0000",
	"reservation_id": "RES-1001",
	"check_in": "2026-04-01T15:00:00Z",
	"check_out": "2026-04-04T11:00:00Z"
}
```

#### Validate QR Body

Use the `qr_payload` value returned by `/qr`:

```json
{
	"qr_payload": "<paste_qr_payload_here>",
	"gate_location": "main_gate"
}
```

## Notes

- Do not commit real secrets from `.env`.
- Use sandbox credentials for test payments.

