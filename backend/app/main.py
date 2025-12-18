from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import submissions

app = FastAPI()

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

@app.get("/")
def read_root():
    return {"Hello": "World"}
