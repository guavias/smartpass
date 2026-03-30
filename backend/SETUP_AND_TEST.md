# SmartPass Backend Setup and Endpoint Testing

This runbook configures a functional backend with MongoDB Atlas, Square Sandbox, Resend, and Render.

## 1. Environment Variables

Create `backend/.env` with these values:

```env
BASE_URL=http://localhost:8000
PORTAL_BASE_URL=http://localhost:8000

MONGODB_URL=mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority
MONGODB_DB_NAME=smartpass

SQUARE_ENV=sandbox
SQUARE_ACCESS_TOKEN=<square_sandbox_access_token>
SQUARE_LOCATION_ID=<square_location_id>
SQUARE_API_VERSION=2024-10-17

RESEND_API_KEY=<resend_api_key>

QR_SIGNING_SECRET=<long_random_secret>
```

## 2. MongoDB Atlas Setup

1. Create a MongoDB Atlas project and cluster.
2. Create a DB user with read/write access.
3. Add Network Access for your current IP and Render outbound traffic.
4. Copy the connection string into `MONGODB_URL`.

## 3. Square Sandbox Setup

1. Open Square Developer Dashboard.
2. Create an app in Sandbox.
3. Copy Sandbox `Access Token` and `Location ID`.
4. For testing payments, use a valid Square sandbox card nonce from your frontend Web Payments SDK.

Notes:
- Backend endpoint uses `/v2/payments` directly.
- Card purchases require `payment_source_id` in visitor request payload.

## 4. Resend Setup

1. Create a Resend account and API key.
2. Use a verified sender domain (recommended) or allowed sender for testing.
3. Set `RESEND_API_KEY`.

## 5. Local Run

From `smartpass/backend`:

```powershell
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Health check:

```powershell
curl http://localhost:8000/
```

## 6. Core API Endpoints

### Visitor Purchase (multi-day supported)

`POST /api/v1/visitors/`

Example:

```json
{
  "name": "Day Guest One",
  "email": "dayguest@example.com",
  "phone": "555-123-4567",
  "vehicle_info": "ABC123",
  "payment_amount": 45.00,
  "payment_method": "card",
  "num_days": 3,
  "payment_source_id": "cnon:card-nonce-ok"
}
```

Expected response includes:
- `portal_token`
- `portal_url`
- `access_start`
- `access_end`
- `payment_status`

### Create or Refresh Overnight Reservation Portal

`POST /api/v1/guests/`

Example:

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

### Guest Lookup by Reservation + Email

`POST /api/v1/guests/find`

Example:

```json
{
  "email": "overnight@example.com",
  "reservation_id": "RES-1001"
}
```

### Portal Metadata

`GET /api/v1/access/portal/{portal_token}`

### Rotating QR Payload (changes every 60 seconds)

`GET /api/v1/access/portal/{portal_token}/qr`

### WebSocket QR Stream (push updates to React viewer)

`WS /api/v1/access/portal/{portal_token}/ws`

Use this when your QR viewer should auto-update without polling. This does not require blob storage; the frontend renders a QR image directly from each pushed `qr_payload` string.

React example:

```tsx
import { useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";

type QRMessage = {
  type: "qr_update";
  qr_payload: string;
  generated_at: string;
  valid_until: string;
  refresh_seconds: number;
};

export function PortalQrViewer({ portalToken }: { portalToken: string }) {
  const [qrPayload, setQrPayload] = useState<string>("");
  const [statusText, setStatusText] = useState<string>("Connecting...");

  const wsUrl = useMemo(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}/api/v1/access/portal/${portalToken}/ws`;
  }, [portalToken]);

  useEffect(() => {
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setStatusText("Connected");
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "qr_update") {
        const update = message as QRMessage;
        setQrPayload(update.qr_payload);
        setStatusText(`Active until ${new Date(update.valid_until).toLocaleTimeString()}`);
      }
      if (message.type === "error") {
        setStatusText(message.detail ?? "Portal is not active");
      }
    };
    ws.onclose = () => setStatusText("Disconnected");
    ws.onerror = () => setStatusText("Stream error");

    return () => ws.close();
  }, [wsUrl]);

  return (
    <div>
      {qrPayload ? <QRCode value={qrPayload} size={240} /> : null}
      <p>{statusText}</p>
    </div>
  );
}
```

### Validate Rotating QR

`POST /api/v1/access/validate`

Example:

```json
{
  "qr_payload": "<payload_from_qr_endpoint>",
  "gate_location": "main_dock"
}
```

Returns one of:
- `approved`
- `expired`
- `invalid`
- `revoked`

## 7. Render Deployment

1. Push repository changes.
2. Create Render Web Service from repo.
3. Build command:

```bash
cd backend && pip install -r requirements.txt
```

4. Start command:

```bash
cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT
```

5. Add environment variables from `.env`.
6. Set health check path to `/`.
7. Deploy and verify `/docs` and `/`.

## 8. Smoke Test Sequence

1. `POST /api/v1/visitors/` with sandbox card nonce.
2. Open returned `portal_url` and call QR endpoint.
3. Validate payload via `/api/v1/access/validate`.
4. `POST /api/v1/guests/` for reservation.
5. `POST /api/v1/guests/find` and then QR + validate.
6. Confirm email delivery via Resend dashboard.
7. Confirm records in MongoDB (`passes`, `access_logs`).
