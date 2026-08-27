import pytest

# We assume standard pytest-asyncio fixture 'client' or 'async_client' is available
# or we construct one. Based on typical FastAPI structure:


@pytest.mark.asyncio
async def test_404_error_schema(client):
    """Test that a 404 error returns the standard JSON schema."""
    response = await client.get("/api/non-existent-endpoint-for-testing")

    assert response.status_code == 404
    data = response.json()

    # Check Schema
    assert "code" in data
    assert "message" in data
    assert "details" in data

    # Check Values
    assert data["code"] == "resource_not_found"
    assert data["message"] == "API endpoint not found"


@pytest.mark.asyncio
async def test_validation_error_schema(client):
    """Test that a 422 validation error returns the standard JSON schema."""
    # Sending invalid data to a known endpoint (e.g. login without body)
    # We use a dummy endpoint if available, or try auth login
    response = await client.post("/api/token", data={})

    assert response.status_code == 422
    data = response.json()

    assert data["code"] == "validation_error"
    assert data["message"] == "Validation failed for the request."
    assert isinstance(data["details"], list)
    # Pydantic detail structure check
    assert len(data["details"]) > 0
    assert "msg" in data["details"][0]
