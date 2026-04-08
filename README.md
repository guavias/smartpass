# SmartPass
Hi-Line Resort SmartPass Senior Design Project.

## Current Scope
ELLO GUYS!! This backend folder currently has:

- Day visitor pass creation (including card payment path via Square Sandbox)
- Overnight guest pass creation/refresh by reservation window
- Portal-based rotating QR access flow
- QR validation and access logging

## Repository Layout
- `backend/` - FastAPI backend services and routes
- `frontend/` - Frontend workspace (tentative complete version)
- `hardware/` - Hardware integration workspace (in progress by Joel)

## Backend Quick Start
From `backend/`:

1. Copy `.env.example` to `.env` and fill real credentials (ask backend team members for keys).
2. Install dependencies:

```bash
py -3.12 -m pip install --user -r requirements.txt
```

Or use a virtual environment and run:

```bash
pip install -r requirements.txt
```

3. Run API:

```bash
py -3.12 main.py
```

Or:

```bash
python main.py
```

## Testing
- Postman collection: `backend/postman/SmartPass.postman_collection.json`
- Endpoint index: `backend/endpoints.txt`
- Setup and smoke tests: `backend/SETUP_AND_TEST.md`

## Postman Workflow (Visitor + Overnight Guest)
Set collection variable:

- `baseUrl = http://127.0.0.1:8000`

### A) Visitor (Day Pass) Test Flow
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

### B) Overnight Guest Test Flow
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

### Validate QR Body
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

## Frontend
This is the tentative complete frontend.

## Deploy To Render
This branch includes a Render Blueprint at `render.yaml` and a production Dockerfile at `Dockerfile`.

### 1) Create service from Blueprint
1. Push this branch to GitHub.
2. In Render, create a new Blueprint and point it to this repository.
3. Render will create one web service named `smartpass-web`.

### 2) Set required environment variables in Render
Set these values on the `smartpass-web` service:

- `MONGODB_URL`
- `QR_SIGNING_SECRET`
- `SQUARE_ACCESS_TOKEN`
- `SQUARE_LOCATION_ID`
- `RESEND_API_KEY`
- `VITE_SQUARE_APP_ID`
- `VITE_SQUARE_LOCATION_ID`

Then set both of these to your deployed Render URL (example: `https://smartpass-web.onrender.com`):

- `BASE_URL`
- `PORTAL_BASE_URL`

### 3) Verify
- Health endpoint: `/health`
- API endpoint example: `/api/v1/access/portal/{portal_token}`
- Frontend root: `/`

The backend serves the built frontend in production, so one Render web service hosts both API and UI.

### Frontend Quick Start
1. `cd frontend`
2. `npm install`
3. `npm run dev`

Use the port shown by Vite in your terminal (example: `http://localhost:5173`).

Admin pages are not navigable from the public site. Access them directly by appending to your Vite port:
- `/admin/login`
- `/admin/dashboard`

Examples:
- `http://localhost:5173/admin/login`
- `http://localhost:5173/admin/dashboard`

### Frontend Architecture/Layout
- `frontend/src/main.tsx`: React entry point
- `frontend/src/app/App.tsx`: Top-level app composition
- `frontend/src/app/Shell.tsx`: Shared shell/layout wrapper around routed pages
- `frontend/src/app/routes.tsx`: Route definitions
- `frontend/src/api/`: API helpers and service modules (`client.ts`, `pricing.ts`, `reservations.ts`).
- `frontend/src/components/`: Reusable UI components
- `frontend/src/pages/HeroPage/`: Landing page with date/guest selection
- `frontend/src/pages/BookPassPage/`: Visitor details and purchase flow
- `frontend/src/pages/BookingConfirmationPage/`: Confirmation and QR/access entry point
- `frontend/src/pages/ReservationFindPage/`: Reservation lookup
- `frontend/src/pages/ReservationDetailPage/`: Reservation details and pass access
- `frontend/src/pages/Admin/Login.tsx`: Admin login page
- `frontend/src/pages/Admin/Dashboard/`: Guest directory and access log views

### API Checklist (By Page)
Use this as the integration handoff checklist between frontend and backend.

#### Hero Page (`/`)
- No required backend call for pricing right now.
- Frontend keeps current day/adult/child selection logic.

#### Book Pass Page (`/book`)
- Backend call: `POST /api/v1/visitors/`
- Request fields:
	- `name`
	- `email`
	- `phone`
	- `vehicle_info`
	- `num_days`
	- `payment_amount`
	- `payment_method`
	- `payment_source_id`
	- `idempotency_key`
- Response fields:
	- `pass_id`
	- `reservation_id`
	- `portal_token`
	- `start_at`
	- `end_at`
	- `status`

#### Booking Confirmation Page (`/confirmation`)
- Backend calls:
	- `GET /api/v1/passes/{pass_id}` or `GET /api/v1/access/portal/{portal_token}`
	- `GET /api/v1/access/portal/{portal_token}/qr`
- Fields used:
	- `pass_id`, `reservation_id`, `guest_name`, `email`, `phone`
	- `start_at`, `end_at`, `adults`, `children`, `vehicle_info`, `status`
	- `qr_payload`, `expires_at`, `refresh_after_seconds`

#### Reservation Find Page (`/reservation/find`)
- Backend call: `POST /api/v1/guests/find`
- Request fields:
	- `reservation_id`
	- `email` (or `last_name` depending on what we choose)
- Response fields:
	- `found`
	- `reservation_id`
	- `pass_id`
	- `portal_token`
	- `guest_name`
	- `check_in`
	- `check_out`
	- `status`

#### Reservation Detail Page (`/reservation/:id` or portal flow)
- Backend calls:
	- `GET /api/v1/passes/{pass_id}` or `GET /api/v1/access/portal/{portal_token}`
	- `GET /api/v1/access/portal/{portal_token}/qr`
- Fields used:
	- `pass_id`, `reservation_id`, `guest_name`, `email`, `phone`
	- `check_in`, `check_out`, `adults`, `children`, `vehicle_info`, `status`
	- `qr_payload`, `expires_at`

#### Admin Login Page (`/admin/login`)
- Backend call: `POST /api/v1/admin/login`
- Request fields:
	- `email`
	- `password`
- Response fields:
	- `access_token`
	- `token_type`
	- `expires_in`
	- `admin_id`
	- `role`
	- `name`

#### Admin Dashboard (Guest Directory)
- Backend calls:
	- `GET /api/v1/admin/passes`
	- `GET /api/v1/admin/passes/{pass_id}`
	- `PATCH /api/v1/admin/passes/{pass_id}` (if editing remains enabled)
- Query params:
	- `search`, `status`, `pass_type`, `start_date`, `end_date`, `page`, `page_size`
- Response fields:
	- `pass_id`, `reservation_id`, `guest_name`, `email`, `phone`
	- `pass_type`, `status`, `start_at`, `end_at`
	- `adults`, `children`, `vehicle_info`, `created_at`, `updated_at`

#### Admin Dashboard (Access Logs)
- Backend call: `GET /api/v1/admin/access-logs`
- Query params:
	- `search`, `result`, `location`, `start_date`, `end_date`, `page`, `page_size`
- Response fields:
	- `event_id`, `timestamp`, `pass_id`, `reservation_id`, `guest_name`
	- `location`, `result`, `reason`, `scanner_id`

#### Scanner Validation Flow
- Backend call: `POST /api/v1/access/validate`
- Request fields:
	- `qr_payload`
	- `gate_location`
	- `scanner_id` (recommended)
- Response fields:
	- `allowed`
	- `result`
	- `reason`
	- `pass_id`
	- `reservation_id`
	- `guest_name`
	- `expires_at`
	- `logged_event_id`

### Pricing and Payment Integration Note
Frontend currently calculates total price and tax using the existing frontend logic.

Current implementation expectation:
- Keep frontend pricing logic the same.
- Pass the final computed total (`payment_amount`) to backend.
- Backend uses that amount for Square payment processing.

## To Be Added Later
- Auth for admin login.
- 2FA for reservation lookup to reduce credential sharing for portal access.
