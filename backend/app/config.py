from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "tfi"
    postgres_user: str = "tfi_user"
    postgres_password: str = "secret"
    database_url: str = "postgresql+asyncpg://tfi_user:secret@localhost:5432/tfi"

    # Model service
    model_url: str = "http://localhost:8082"

    # Kafka
    kafka_brokers: str = "localhost:9092"
    kafka_topic_vehicle_positions: str = "vehicle_positions"
    kafka_topic_vehicle_demand_ctrl: str = "vehicle_demand_ctrl"

    # App
    app_version: str = "1.0.0"
    debug: bool = False

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
