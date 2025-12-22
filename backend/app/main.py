# Open-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import submissions

app = FastAPI()

# Rate Limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.limiter import limiter

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Security Headers Middleware
from starlette.middleware.base import BaseHTTPMiddleware

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:;"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# CORS configuration
# In production, this should be restricted to the frontend domain.
# We use an environment variable or default to localhost for dev.
import os
origins_raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:4173,http://0.0.0.0:5173")
origins = [o.strip() for o in origins_raw.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"], # Restrict methods
    allow_headers=["*"],
)

app.include_router(submissions.router, prefix="/api", tags=["submissions"])

@app.get("/health")
def health_check():
    return {"status": "ok"}

# Serve Frontend in Production
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Correct path relative to where uvicorn is run (backend dir)
# We assume uvicorn is run from 'backend/' so we go up one level to 'frontend/dist'
# OR if we use absolute paths based on __file__
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # backend/
ROOT_DIR = os.path.dirname(BASE_DIR) # root/
FRONTEND_DIST = os.path.join(ROOT_DIR, "frontend", "dist")

if os.path.exists(FRONTEND_DIST):
    # Mount assets (JS/CSS)
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")
    
    # Catch-all for SPA
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Check if a specific file is requested (e.g., favicon.ico, manifest.json)
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if os.path.isfile(file_path):
             return FileResponse(file_path)
        # Otherwise serve index.html
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
else:
    @app.get("/")
    def read_root():
        return {"Hello": "Frontend build not found. API is running."}
