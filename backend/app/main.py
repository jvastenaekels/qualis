import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import submissions, logs
from app.middleware.security import SecurityHeadersMiddleware
from app.middleware.errors import global_exception_handler
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from app.limiter import limiter

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Production Readiness Checks
    if os.getenv("DATABASE_URL", "").startswith("postgre"):
        salt = os.getenv("IP_HASH_SALT")
        if not salt or salt == "default-salt-allow-override-in-prod":
            logger.warning("CRITICAL SECURITY WARNING: IP_HASH_SALT is missing or using default value in production!")
        
        logger.info("Production environment detected. Security checks completed.")
    else:
        logger.info("Development environment detected.")
    
    yield

app = FastAPI(title="Open-Q API", lifespan=lifespan)

# Rate Limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_exception_handler(Exception, global_exception_handler)

# Security Headers (Pure ASGI)
app.add_middleware(SecurityHeadersMiddleware)

# CORS configuration
origins_raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:4173,http://0.0.0.0:5173")
origins = [o.strip() for o in origins_raw.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(submissions.router, prefix="/api", tags=["submissions"])
app.include_router(logs.router, prefix="/api", tags=["logs"])

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
    # Mount assets (JS/CSS) - These are immutable and can be served efficiently
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")
    
    # Catch-all for SPA: Try static files first, then fallback to index.html
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # 1. Check if it's a specific static file (e.g. favicon.ico, manifest.json) in the root
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(file_path):
             return FileResponse(file_path)
        
        # 2. Otherwise serve index.html for CSR navigation
        index_path = os.path.join(FRONTEND_DIST, "index.html")
        return FileResponse(index_path)
else:
    @app.get("/")
    def read_root():
        return {"Hello": "Frontend build not found. API is running."}
