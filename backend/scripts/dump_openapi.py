import sys
import os
import json

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set dummy ENV vars to avoid startup errors
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///../q_method.db"
os.environ["SECRET_KEY"] = "dummy"

from app.main import app

openapi_path = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "..",
    "frontend",
    "openapi.json",
)

print(f"Dumping OpenAPI schema to {openapi_path}...")
with open(openapi_path, "w") as f:
    json.dump(app.openapi(), f, indent=2)
print("Done.")
