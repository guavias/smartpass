import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
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

# Mount static files
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/qr", StaticFiles(directory=str(static_dir / "qr-codes")), name="qr-codes")
    images_dir = static_dir / "images"
    if images_dir.exists():
        app.mount("/images", StaticFiles(directory=str(images_dir)), name="images")

app.include_router(visitor.router, prefix="/api/v1/visitors", tags=["Visitors"])
app.include_router(guest.router, prefix="/api/v1/guests", tags=["Guests"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
app.include_router(access.router, prefix="/api/v1/access", tags=["Access"])

@app.get("/health")
def health_check():
    return {"status": "online", "system": "Smart Pass Backend"}


frontend_dist = Path(__file__).resolve().parent.parent / "frontend_dist"
frontend_index = frontend_dist / "index.html"

if frontend_dist.exists() and frontend_index.exists():
    if (frontend_dist / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="frontend-assets")

    @app.get("/", include_in_schema=False)
    async def serve_frontend_root():
        return FileResponse(frontend_index)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("qr/"):
            raise HTTPException(status_code=404, detail="Not found")

        requested = frontend_dist / full_path
        if requested.exists() and requested.is_file():
            return FileResponse(requested)

        return FileResponse(frontend_index)
else:
    @app.get("/")
    def root_status():
        return {"status": "online", "system": "Smart Pass Backend"}


if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    reload_enabled = os.getenv("UVICORN_RELOAD", "true").lower() == "true"
    uvicorn.run("main:app", host=host, port=port, reload=reload_enabled)