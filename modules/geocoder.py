"""Shared geocoding — Nominatim with Barcelona bias + Photon fallback + LRU cache."""
import json
import math
import urllib.parse
import urllib.request
from functools import lru_cache

_BCN_LAT     = 41.3851
_BCN_LON     = 2.1734
# Nominatim viewbox: lon_west,lat_south,lon_east,lat_north
_BCN_VIEWBOX = "1.95,41.32,2.27,41.47"
# Generous region bounds (includes suburbs/airport)
_BCN_BOUNDS  = (41.20, 41.55, 1.85, 2.40)   # lat_min, lat_max, lon_min, lon_max
_UA          = "ClimateApp/1.0"
_TIMEOUT     = 10


def _dist_to_bcn(lat: float, lon: float) -> float:
    return math.hypot(lat - _BCN_LAT, lon - _BCN_LON)


def _in_region(lat: float, lon: float) -> bool:
    lat_min, lat_max, lon_min, lon_max = _BCN_BOUNDS
    return lat_min <= lat <= lat_max and lon_min <= lon <= lon_max


def _get(url: str) -> list:
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            return json.loads(resp.read())
    except Exception:
        return []


def _nominatim_free(query: str) -> list[dict]:
    """Free-text Nominatim search, Spain only, Barcelona viewbox bias."""
    params = urllib.parse.urlencode({
        "q": query, "format": "json", "limit": 3,
        "countrycodes": "es",
        "viewbox": _BCN_VIEWBOX, "bounded": 0,
    })
    return _get(f"https://nominatim.openstreetmap.org/search?{params}")


def _nominatim_structured(street: str, city: str = "Barcelona") -> list[dict]:
    """Structured Nominatim search — better when building name confuses free-text."""
    params = urllib.parse.urlencode({
        "street": street, "city": city, "country": "Spain",
        "format": "json", "limit": 3, "countrycodes": "es",
    })
    return _get(f"https://nominatim.openstreetmap.org/search?{params}")


def _photon(query: str) -> list[dict]:
    """Photon (Komoot) — separate OSM geocoding engine, proximity-biased to Barcelona."""
    params = urllib.parse.urlencode({
        "q": query, "limit": 3, "lang": "en",
        "lat": _BCN_LAT, "lon": _BCN_LON,
    })
    raw = _get(f"https://photon.komoot.io/api/?{params}")
    out = []
    for feat in raw.get("features", []) if isinstance(raw, dict) else []:
        props  = feat.get("properties", {})
        coords = feat.get("geometry", {}).get("coordinates", [])
        if len(coords) == 2:
            name_parts = [props.get("name"), props.get("street"),
                          props.get("housenumber"), props.get("city"),
                          props.get("country")]
            out.append({
                "lat": str(coords[1]), "lon": str(coords[0]),
                "display_name": ", ".join(p for p in name_parts if p),
            })
    return out


def _pick_best(results: list[dict]) -> dict | None:
    """Select result closest to Barcelona; penalise anything outside the region."""
    if not results:
        return None
    def _score(r):
        lat, lon = float(r["lat"]), float(r["lon"])
        d = _dist_to_bcn(lat, lon)
        return d if _in_region(lat, lon) else d + 10   # out-of-region penalty
    return min(results, key=_score)


@lru_cache(maxsize=512)
def geocode(address: str) -> dict | None:
    """
    Geocode an address string, strongly biased toward Barcelona.
    Returns {"lat": float, "lon": float, "display_name": str} or None.

    Six strategies attempted in order; stops as soon as a Barcelona-region
    hit is found. All candidates are pooled and ranked by proximity so a
    later strategy can still beat an earlier out-of-region result.

    1. Nominatim free-text  "<address>, Barcelona"   (countrycodes=es + viewbox)
    2. Nominatim free-text  "<address>"              (countrycodes=es + viewbox)
    3. Nominatim structured  street=<first parts>, city=Barcelona
    4. Nominatim structured  street=<second part>,  city=Barcelona
    5. Photon               "<address>, Barcelona"
    6. Photon               first address part alone
    """
    parts = [p.strip() for p in address.split(",") if p.strip()]

    strategies = [
        lambda: _nominatim_free(f"{address}, Barcelona"),
        lambda: _nominatim_free(address),
        lambda: _nominatim_structured(parts[0]) if parts else [],
        lambda: _nominatim_structured(parts[1]) if len(parts) > 1 else [],
        lambda: _photon(f"{address}, Barcelona"),
        lambda: _photon(parts[0]) if parts else [],
    ]

    all_results: list[dict] = []
    for strategy in strategies:
        all_results.extend(strategy())
        best = _pick_best(all_results)
        if best and _in_region(float(best["lat"]), float(best["lon"])):
            print(f"[geocode] '{address}' -> {best['lat']}, {best['lon']}")
            return {
                "lat": float(best["lat"]),
                "lon": float(best["lon"]),
                "display_name": best.get("display_name", ""),
            }

    # No Barcelona hit — return best of everything collected
    best = _pick_best(all_results)
    if best:
        print(f"[geocode] '{address}' -> {best['lat']}, {best['lon']} (outside region)")
        return {
            "lat": float(best["lat"]),
            "lon": float(best["lon"]),
            "display_name": best.get("display_name", ""),
        }

    print(f"[geocode] No result for: '{address}'")
    return None
