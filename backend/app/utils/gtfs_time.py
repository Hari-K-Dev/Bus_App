"""
GTFS Time Handling Utilities

GTFS times can exceed 24:00:00 to represent trips that span midnight.
For example, 25:30:00 represents 1:30 AM on the following day.

The service day in GTFS typically starts around 4 AM, meaning times
like 01:00:00 to 03:59:59 might actually belong to the previous
calendar day's service.
"""

from datetime import datetime, timedelta, timezone
from typing import Tuple


def parse_gtfs_time(gtfs_time: str) -> Tuple[int, int, int]:
    """
    Parse GTFS time string (HH:MM:SS) where hours can exceed 24.

    Args:
        gtfs_time: Time string in format "HH:MM:SS" (e.g., "25:30:00")

    Returns:
        Tuple of (hours, minutes, seconds)
    """
    parts = gtfs_time.strip().split(":")
    return int(parts[0]), int(parts[1]), int(parts[2])


def gtfs_time_to_seconds(gtfs_time: str) -> int:
    """
    Convert GTFS time string to seconds since midnight.

    Args:
        gtfs_time: Time string in format "HH:MM:SS"

    Returns:
        Total seconds since midnight (can exceed 86400 for times > 24:00:00)
    """
    hours, minutes, seconds = parse_gtfs_time(gtfs_time)
    return hours * 3600 + minutes * 60 + seconds


def get_current_service_date() -> datetime:
    """
    Get the current GTFS service date.

    GTFS service days typically run from ~4 AM to ~4 AM the next day.
    Times between midnight and 4 AM belong to the previous day's service.

    Returns:
        The service date as a datetime (date only, time set to midnight)
    """
    now = datetime.now(timezone.utc)
    # If before 4 AM, use previous day as service date
    if now.hour < 4:
        return (now - timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def gtfs_time_to_datetime(gtfs_time: str, service_date: datetime | None = None) -> datetime:
    """
    Convert GTFS time to actual datetime.

    Handles times > 24:00:00 by rolling to the next calendar day.
    Example: 25:30:00 on 2024-01-15 -> 2024-01-16 01:30:00 UTC

    Args:
        gtfs_time: Time string in format "HH:MM:SS"
        service_date: The GTFS service date. If None, uses current service date.

    Returns:
        datetime in UTC
    """
    if service_date is None:
        service_date = get_current_service_date()

    hours, minutes, seconds = parse_gtfs_time(gtfs_time)

    # Calculate days offset for times >= 24:00:00
    days_offset = hours // 24
    actual_hours = hours % 24

    base_date = service_date.replace(
        hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc
    )

    return base_date + timedelta(
        days=days_offset,
        hours=actual_hours,
        minutes=minutes,
        seconds=seconds,
    )


def calculate_eta_datetime(
    scheduled_time: str,
    delay_seconds: int,
    service_date: datetime | None = None,
) -> datetime:
    """
    Calculate ETA from scheduled time and delay.

    Args:
        scheduled_time: GTFS scheduled arrival time
        delay_seconds: Delay in seconds (positive = late, negative = early)
        service_date: The GTFS service date. If None, uses current service date.

    Returns:
        Estimated arrival datetime in UTC
    """
    scheduled_dt = gtfs_time_to_datetime(scheduled_time, service_date)
    # Clamp delay to reasonable range (-30 min to +2 hours)
    clamped_delay = max(-1800, min(7200, delay_seconds))
    return scheduled_dt + timedelta(seconds=clamped_delay)
