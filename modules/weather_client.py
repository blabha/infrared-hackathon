import json
from datetime import datetime, timezone
from pathlib import Path

import openmeteo_requests
import requests_cache
from retry_requests import retry

# Cached session — avoids re-fetching the same location within 1 hour
_cache = requests_cache.CachedSession(".cache", expire_after=3600)
_session = retry(_cache, retries=5, backoff_factor=0.2)
_client = openmeteo_requests.Client(session=_session)

URL = "https://api.open-meteo.com/v1/forecast"


def _fetch_weather(lat: float, lon: float) -> dict:
    """Fetch 7-day hourly precipitation and humidity for a lat/lon."""
    responses = _client.weather_api(URL, params={
        "latitude": lat,
        "longitude": lon,
        "hourly": ["precipitation", "relative_humidity_2m"],
        "timezone": "auto",
        "forecast_days": 7,
    })
    hourly = responses[0].Hourly()

    times = [
        datetime.fromtimestamp(
            hourly.Time() + i * hourly.Interval(), tz=timezone.utc
        )
        for i in range(hourly.Variables(0).ValuesAsNumpy().shape[0])
    ]

    return {
        "times": times,
        "precipitation_mm": hourly.Variables(0).ValuesAsNumpy().tolist(),
        "relative_humidity_pct": hourly.Variables(1).ValuesAsNumpy().tolist(),
    }


def _closest_hour(times: list, target: datetime) -> int:
    """Return index of the timestamp closest to the target datetime."""
    if target.tzinfo is None:
        target = target.replace(tzinfo=timezone.utc)
    return min(range(len(times)), key=lambda i: abs((times[i] - target).total_seconds()))


def get_weather_for_events(events: list[dict]) -> list[dict]:
    """
    Enrich each event with precipitation and relative humidity at the event's time.
    Reuses lat/lon from the 'climate' key if already geocoded by infrared_client.
    """
    enriched = []
    location_cache: dict[str, dict] = {}

    for event in events:
        climate = event.get("climate")
        time_str = event.get("time")

        # Get lat/lon — prefer already-geocoded coords from Infrared phase
        if climate and climate.get("lat") and climate.get("lon"):
            lat, lon = climate["lat"], climate["lon"]
        else:
            enriched.append({**event, "weather": None})
            continue

        location_key = f"{lat:.4f},{lon:.4f}"

        if location_key not in location_cache:
            try:
                location_cache[location_key] = _fetch_weather(lat, lon)
                print(f"[weather] Fetched forecast for {event.get('location', location_key)}")
            except Exception as e:
                print(f"[weather] Failed for {location_key}: {e}")
                enriched.append({**event, "weather": None})
                continue

        forecast = location_cache[location_key]
        target_dt = datetime.fromisoformat(time_str)
        idx = _closest_hour(forecast["times"], target_dt)

        enriched.append({
            **event,
            "weather": {
                "precipitation_mm": round(forecast["precipitation_mm"][idx], 2),
                "relative_humidity_pct": round(forecast["relative_humidity_pct"][idx], 1),
                "forecast_time": forecast["times"][idx].isoformat(),
            },
        })

    return enriched


if __name__ == "__main__":
    # Test using saved Phase 3 output
    output_file = Path("output/enriched_events.json")
    if not output_file.exists():
        print("Run main.py first to generate output/enriched_events.json")
    else:
        events = json.loads(output_file.read_text(encoding="utf-8"))
        results = get_weather_for_events(events)
        print(json.dumps(results, indent=2, ensure_ascii=False))
