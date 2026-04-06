import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import uvicorn
from routes import visitor, guest, admin, access
from database import close_mongo_connection, connect_to_mongo

# Load .env file from the backend directory
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

app = FastAPI(title="Smart Pass API")


@app.on_event("startup")
async def startup_event() -> None:
    await connect_to_mongo()


@app.on_event("shutdown")
async def shutdown_event() -> None:
    await close_mongo_connection()

# Mount static files for QR codes
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/qr", StaticFiles(directory=str(static_dir / "qr-codes")), name="qr-codes")

app.include_router(visitor.router, prefix="/api/v1/visitors", tags=["Visitors"])
app.include_router(guest.router, prefix="/api/v1/guests", tags=["Guests"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
app.include_router(access.router, prefix="/api/v1/access", tags=["Access"])

@app.get("/")
def health_check():
    return {"status": "online", "system": "Smart Pass Backend"}


if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    reload_enabled = os.getenv("UVICORN_RELOAD", "true").lower() == "true"
    uvicorn.run("main:app", host=host, port=port, reload=reload_enabled)