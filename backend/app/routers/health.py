"""
Health Router

GET /v1/health - Health check endpoint
"""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.db import get_db
from app.services.model_client import model_client
from app.config import get_settings

router = APIRouter(prefix="/v1/health", tags=["health"])
settings = get_settings()


class HealthResponse(BaseModel):
    status: str
    db: str
    model: str
    version: str


@router.get("", response_model=HealthResponse)
async def health_check(db: AsyncSession = Depends(get_db)):
    """
    Health check endpoint.

    Returns status of database and model service connections.
    """
    # Check database
    db_status = "error"
    try:
        await db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        pass

    # Check model service
    model_status = "ok" if await model_client.health_check() else "error"

    # Overall status
    overall = "ok" if db_status == "ok" else "degraded"

    return HealthResponse(
        status=overall,
        db=db_status,
        model=model_status,
        version=settings.app_version,
    )
