import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from routes import visitor, guest, admin

# Load .env file from the backend directory
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

app = FastAPI(title="Smart Pass API")

# Mount static files for QR codes
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/qr", StaticFiles(directory=str(static_dir / "qr-codes")), name="qr-codes")

app.include_router(visitor.router, prefix="/api/v1/visitors", tags=["Visitors"])
app.include_router(guest.router, prefix="/api/v1/guests", tags=["Guests"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])

@app.get("/")
def health_check():
    return {"status": "online", "system": "Smart Pass Backend"}