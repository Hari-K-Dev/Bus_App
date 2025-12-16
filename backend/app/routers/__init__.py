from .stops import router as stops_router
from .arrivals import router as arrivals_router
from .tracking import router as tracking_router
from .eta import router as eta_router
from .routes import router as routes_router
from .health import router as health_router

__all__ = [
    "stops_router",
    "arrivals_router",
    "tracking_router",
    "eta_router",
    "routes_router",
    "health_router",
]
