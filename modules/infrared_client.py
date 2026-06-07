import hashlib
import json
import math
import os
import re
import numpy as np
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from PIL import Image
from infrared_sdk import InfraredClient
from infrared_sdk.analyses.types import (
    WindModelRequest, AnalysesName,
    SolarRadiationModelRequest, BaseAnalysisPayload,
    UtciModelRequest, UtciModelBaseRequest,
)
from infrared_sdk.models import TimePeriod, Location

# Load .env from project root (one level up from this file)
load_dotenv(Path(__file__).parent.parent / ".env")

api_key = os.getenv("INFRARED_API_KEY")
if not api_key:
    raise EnvironmentError("INFRARED_API_KEY is not set — add it to your .env file")

_RADIUS_M = 250  # circular analysis radius in metres, centred on the event location

# UTCI thermal comfort colour bands (standard classification)
_UTCI_BANDS = [
    (9,   (0,   0,   180, 140)),   # extreme cold
    (18,  (70,  130, 255, 140)),   # cold stress
    (26,  (0,   200, 80,  140)),   # comfortable
    (32,  (255, 220, 0,   140)),   # moderate heat
    (38,  (255, 100, 0,   140)),   # strong heat
    (999, (200, 0,   0,   140)),   # extreme heat
]


def _save_utci_overlay(result, location: str) -> dict:
    """Colourize a UTCI grid and save it as a transparent PNG for map overlay."""
    out_dir = Path(__file__).parent.parent / "output" / "utci"
    out_dir.mkdir(parents=True, exist_ok=True)

    slug = hashlib.md5(location.encode()).hexdigest()[:10]
    png_path = out_dir / f"{slug}.png"

    grid = result.merged_grid
    rgba = np.zeros((*grid.shape, 4), dtype=np.uint8)
    valid = ~np.isnan(grid)
    prev = -999
    for threshold, colour in _UTCI_BANDS:
        mask = valid & (grid > prev) & (grid <= threshold)
        rgba[mask] = colour
        prev = threshold

    # North at top — flip vertically so row-0 of the grid maps to the top of the image
    Image.fromarray(np.flipud(rgba), mode="RGBA").save(str(png_path))

    # Use result.bounds for accurate geo-registration (includes context margin)
    # SDK returns (west, south, east, north) — convert to Leaflet [[south,west],[north,east]]
    try:
        b = result.bounds          # (west, south, east, north)
        bounds = [[b[1], b[0]], [b[3], b[2]]]
    except Exception:
        return {"png_url": f"/output/utci/{slug}.png", "bounds": None}

    return {"png_url": f"/output/utci/{slug}.png", "bounds": bounds}


def _geocode(location: str) -> tuple[float, float] | None:
    """Geocode via shared geocoder so pin and overlay always use the same coordinates."""
    from modules.geocoder import geocode
    result = geocode(location)
    if result:
        return result["lat"], result["lon"]
    return None


def _make_polygon(lat: float, lon: float, n_points: int = 36) -> dict:
    """Approximate a circle centred on (lat, lon) with radius _RADIUS_M metres."""
    lat_r = _RADIUS_M / 111320
    lon_r = _RADIUS_M / (111320 * math.cos(math.radians(lat)))
    coords = [
        [lon + lon_r * math.cos(2 * math.pi * i / n_points),
         lat + lat_r * math.sin(2 * math.pi * i / n_points)]
        for i in range(n_points)
    ]
    coords.append(coords[0])  # close the ring
    return {"type": "Polygon", "coordinates": [coords]}


def _parse_event_time(time_str: str) -> tuple[int, int, int]:
    """
    Parse an ISO 8601 event time string and return (month, start_hour, end_hour).
    Uses a ±3 hour window centred on the event, clamped to 6–20 (daylight only).
    Solar radiation needs a wide enough window to produce valid data points.
    """
    dt = datetime.fromisoformat(time_str)
    month = dt.month
    start_hour = max(dt.hour - 3, 6)
    end_hour = min(dt.hour + 3, 20)
    # Ensure at least a 4-hour window for solar to have enough data points
    if end_hour - start_hour < 4:
        start_hour = max(6, end_hour - 4)
    return month, start_hour, end_hour


def get_site_climate(
    location: str,
    month: int,
    start_hour: int,
    end_hour: int,
    wind_direction: int = 270,
    wind_speed: int = 5,
    utci_only: bool = False,
    lat: float | None = None,
    lon: float | None = None,
) -> dict | None:
    # Use pre-confirmed coordinates if provided — address is already finalised
    if lat is None or lon is None:
        coords = _geocode(location)
        if coords is None:
            print(f"[infrared] Could not geocode: {location}")
            return None
        lat, lon = coords

    polygon = _make_polygon(lat, lon)

    tp = TimePeriod(
        start_month=month, start_day=1, start_hour=start_hour,
        end_month=month, end_day=28, end_hour=end_hour,
    )

    with InfraredClient() as client:
        area = client.buildings.get_area(polygon)

        stations = client.weather.get_weather_file_from_location(lat=lat, lon=lon, radius=100)
        if not stations:
            print(f"[infrared] No weather station found near: {location}")
            return None

        weather_data = client.weather.filter_weather_data(
            identifier=stations[0]["uuid"],
            time_period=tp,
        )

        utci_payload = UtciModelRequest.from_weatherfile_payload(
            payload=UtciModelBaseRequest(analysis_type=AnalysesName.thermal_comfort_index),
            location=Location(latitude=lat, longitude=lon),
            time_period=tp,
            weather_data=weather_data,
        )
        utci_result = client.run_area_and_wait(utci_payload, polygon, buildings=area.buildings)

        if not utci_only:
            solar_payload = SolarRadiationModelRequest.from_weatherfile_payload(
                payload=BaseAnalysisPayload(analysis_type=AnalysesName.solar_radiation),
                location=Location(latitude=lat, longitude=lon),
                time_period=tp,
                weather_data=weather_data,
            )
            solar_result = client.run_area_and_wait(solar_payload, polygon, buildings=area.buildings)

            wind_payload = WindModelRequest(
                analysis_type=AnalysesName.wind_speed,
                wind_speed=wind_speed,
                wind_direction=wind_direction,
            )
            wind_result = client.run_area_and_wait(wind_payload, polygon, buildings=area.buildings)

    utci_grid    = utci_result.merged_grid
    utci_overlay = _save_utci_overlay(utci_result, location)

    result = {
        "location": location,
        "lat": lat,
        "lon": lon,
        "month": month,
        "hour_window": f"{start_hour:02d}:00-{end_hour:02d}:00",
        "thermal_comfort_utci_c": {
            "mean": round(float(np.nanmean(utci_grid)), 1),
            "max": round(float(np.nanmax(utci_grid)), 1),
            "min_legend": utci_result.min_legend,
            "max_legend": utci_result.max_legend,
        },
        "utci_overlay": utci_overlay,
    }
    if not utci_only:
        solar_grid = solar_result.merged_grid
        wind_grid  = wind_result.merged_grid
        result["solar_radiation_wm2"] = {
            "mean": round(float(np.nanmean(solar_grid)), 1),
            "max": round(float(np.nanmax(solar_grid)), 1),
            "min_legend": solar_result.min_legend,
            "max_legend": solar_result.max_legend,
        }
        result["wind_speed_ms"] = {
            "mean": round(float(np.nanmean(wind_grid)), 2),
            "max": round(float(np.nanmax(wind_grid)), 2),
            "direction_deg": wind_direction,
            "min_legend": wind_result.min_legend,
            "max_legend": wind_result.max_legend,
        }
    return result


def get_climate_for_events(events: list[dict]) -> list[dict]:
    """
    Run Infrared simulations for each calendar event that has a location.
    Each event dict should have: title, time (ISO 8601), location.
    Returns a list of events enriched with a 'climate' key.
    """
    enriched = []
    for event in events:
        location = event.get("location")
        time_str = event.get("time")

        if not location or not time_str:
            print(f"[infrared] Skipping '{event.get('title')}' — no location or time")
            enriched.append({**event, "climate": None})
            continue

        # Use pre-confirmed coordinates stored at event creation — no repeat geocoding
        pre_lat = event.get("lat")
        pre_lon = event.get("lon")
        if pre_lat and pre_lon:
            print(f"[infrared] '{event.get('title')}' — using confirmed coords ({pre_lat}, {pre_lon})")
        else:
            print(f"[infrared] Processing '{event.get('title')}' at {location}")
        try:
            month, start_hour, end_hour = _parse_event_time(time_str)
            climate = get_site_climate(
                location, month, start_hour, end_hour,
                utci_only=True, lat=pre_lat, lon=pre_lon,
            )
        except Exception as e:
            print(f"[infrared] Failed for '{event.get('title')}': {e}")
            climate = None

        enriched.append({**event, "climate": climate})

    return enriched


if __name__ == "__main__":
    # Quick single-location test — run main.py for the full pipeline
    test = get_site_climate("Hyde Park, London", month=6, start_hour=9, end_hour=13)
    print(json.dumps(test, indent=2))
