"""Run UTCI-only simulation for two Barcelona event locations and print results."""
import os, json, numpy as np
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from infrared_sdk import InfraredClient
from infrared_sdk.analyses.types import UtciModelRequest, UtciModelBaseRequest, AnalysesName
from infrared_sdk.models import TimePeriod, Location
import requests as _req

HALF = 0.002  # ~222 m half-side

def geocode(location: str):
    for q in [f"{location}, Barcelona", location]:
        r = _req.get("https://nominatim.openstreetmap.org/search",
                     params={"q": q, "format": "json", "limit": 1},
                     headers={"User-Agent": "climate-planner/1.0"}, timeout=10)
        d = r.json()
        if d:
            print(f"  geocoded '{q}' -> {d[0]['lat']}, {d[0]['lon']}")
            return float(d[0]["lat"]), float(d[0]["lon"])
    return None

def polygon(lat, lon):
    d = HALF
    return {"type": "Polygon", "coordinates": [[
        [lon-d, lat-d], [lon+d, lat-d], [lon+d, lat+d], [lon-d, lat+d], [lon-d, lat-d]
    ]]}

LOCATIONS = [
    ("EADA Business School, Arago 204, Eixample, Barcelona", 6, 14, 18),
    ("Nova Icaria Beach, Barcelona",                          6, 14, 18),
]

for loc, month, sh, eh in LOCATIONS:
    print(f"\n=== {loc} ===")
    coords = geocode(loc)
    if not coords:
        print("  FAILED to geocode"); continue
    lat, lon = coords
    poly = polygon(lat, lon)
    tp = TimePeriod(start_month=month, start_day=1, start_hour=sh,
                    end_month=month, end_day=28, end_hour=eh)
    with InfraredClient() as client:
        print("  getting area...")
        area = client.buildings.get_area(poly)
        print("  getting weather station...")
        stations = client.weather.get_weather_file_from_location(lat=lat, lon=lon, radius=100)
        if not stations:
            print("  no weather station found"); continue
        print(f"  using station {stations[0]['uuid']}")
        weather = client.weather.filter_weather_data(identifier=stations[0]["uuid"], time_period=tp)
        payload = UtciModelRequest.from_weatherfile_payload(
            payload=UtciModelBaseRequest(analysis_type=AnalysesName.thermal_comfort_index),
            location=Location(latitude=lat, longitude=lon),
            time_period=tp,
            weather_data=weather,
        )
        print("  running UTCI simulation...")
        result = client.run_area_and_wait(payload, poly, buildings=area.buildings)
        grid = result.merged_grid
        mean = round(float(np.nanmean(grid)), 1)
        mx   = round(float(np.nanmax(grid)), 1)
        print(f"  UTCI mean={mean} max={mx}")
