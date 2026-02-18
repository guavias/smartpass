from fastapi import FastAPI
from routes import visitor, guest, admin

app = FastAPI(title="Smart Pass API")

# Include routers for different use cases
app.include_router(visitor.router, prefix="/api/v1/visitors", tags=["Visitors"])
app.include_router(guest.router, prefix="/api/v1/guests", tags=["Guests"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])

@app.get("/")
def health_check():
    return {"status": "online", "system": "Smart Pass Backend"}