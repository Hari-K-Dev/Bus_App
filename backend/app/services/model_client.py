"""
Model Client Service

HTTP client for the ML model prediction service.
"""

import httpx
from typing import Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime, timezone

from app.config import get_settings

settings = get_settings()


class PredictionResponse(BaseModel):
    predicted_delay_s: int
    model_version: Optional[str] = None


class ModelClient:
    def __init__(self):
        self.base_url = settings.model_url
        self.timeout = 5.0

    async def predict(self, features: Dict[str, Any]) -> Optional[PredictionResponse]:
        """
        Call ML model service for delay prediction.

        Args:
            features: Feature dict from bus_weather_merged (excluding arrival_delay, id, geom)
                Required keys if present:
                - trip_id, route_id, vehicle_id, stop_id, stop_sequence
                - latitude, longitude, speed, bearing, is_late
                - temperature, humidity, wind_speed, precipitation
                - temperature_category, weather_severity
                - vehicle_timestamp, weather_timestamp, processing_timestamp

        Returns:
            PredictionResponse or None if model is unavailable
        """
        # Convert timestamps to ISO8601 strings
        payload_features = {}
        for key, value in features.items():
            if isinstance(value, datetime):
                payload_features[key] = value.isoformat()
            elif value is not None:
                payload_features[key] = value

        payload = {"items": [{"features": payload_features}]}

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/predict",
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()

                if "items" in data and len(data["items"]) > 0:
                    item = data["items"][0]
                    return PredictionResponse(
                        predicted_delay_s=item.get("predicted_delay_s", 0),
                        model_version=item.get("model_version"),
                    )
                return None

        except httpx.HTTPError as e:
            # Log error and return None to trigger fallback
            print(f"Model prediction failed: {e}")
            return None
        except Exception as e:
            print(f"Unexpected error calling model: {e}")
            return None

    async def health_check(self) -> bool:
        """Check if model service is healthy."""
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.get(f"{self.base_url}/health")
                return response.status_code == 200
        except Exception:
            return False


# Singleton instance
model_client = ModelClient()
