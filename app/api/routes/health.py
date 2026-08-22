from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text
from app.db.session import AsyncSessionLocal

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health():
    """Health check endpoint for container healthchecks and monitoring."""
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database unavailable: {e}",
        )

    return {
        "status": "ok",
        "database": "connected",
        "service": "PurifieldWater API",
    }
