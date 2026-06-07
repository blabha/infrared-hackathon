import json
import os
import threading
import traceback
import urllib.request
import urllib.parse
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

BASE_DIR          = Path(__file__).parent
# On Railway: set OUTPUT_DIR and DATA_DIR env vars pointing at the mounted volume
OUTPUT_DIR        = Path(os.getenv("OUTPUT_DIR", str(BASE_DIR / "output")))
DATA_DIR          = Path(os.getenv("DATA_DIR",   str(BASE_DIR / "data")))
STATIC_DIR        = BASE_DIR / "static"
PLAN_FILE         = OUTPUT_DIR / "weekly_plan.json"
USER_PROFILE_FILE = DATA_DIR / "user_profile.json"

OUTPUT_DIR.mkdir(exist_ok=True)
(OUTPUT_DIR / "utci").mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Climate & Metabolic Planner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/output", StaticFiles(directory=str(OUTPUT_DIR)), name="output")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


class EventUpdate(BaseModel):
    title: str | None = None
    time:  str | None = None


class UserProfile(BaseModel):
    name:               str  | None = None
    age:                int  | None = None
    gender:             str  | None = None
    health_connected:   bool | None = None
    calendar_connected: bool | None = None


class NewEvent(BaseModel):
    title:    str
    time:     str
    location: str | None = None


class HealthProfile(BaseModel):
    gender:           str   | None = None
    cycle_day:        int   | None = None
    cycle_phase:      str   | None = None
    recent_activity:  str   | None = None
    avg_sleep_hrs:    float | None = None
    resting_hr_bpm:   int   | None = None
    notes:            str   | None = None


@app.get("/")
def index():
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/api/health-check")
def health_check():
    return {"status": "ok"}


BACKUP_FILE = OUTPUT_DIR / "weekly_plan.backup.json"


def _read_plan() -> list:
    for f in [PLAN_FILE, BACKUP_FILE]:
        try:
            if not f.exists():
                continue
            raw = f.read_bytes().decode("utf-8", errors="replace").strip()
            if not raw:
                continue
            data = json.loads(raw)
            if isinstance(data, list) and data:
                return data
        except Exception:
            continue
    return []


def _write_plan(data: list):
    if not data:
        return
    text = json.dumps(data, indent=2, ensure_ascii=False)
    PLAN_FILE.write_text(text, encoding='utf-8')
    BACKUP_FILE.write_text(text, encoding='utf-8')


@app.get("/api/events")
def get_events():
    return JSONResponse(_read_plan())


@app.delete("/api/events/{idx}")
def delete_event(idx: int):
    events = _read_plan()
    if idx >= len(events):
        raise HTTPException(status_code=404, detail="Event not found")
    removed = events.pop(idx)
    _write_plan(events)
    return JSONResponse({"status": "deleted", "title": removed.get("title")})


@app.put("/api/events/{idx}")
def update_event(idx: int, body: EventUpdate):
    events = _read_plan()
    if idx >= len(events):
        raise HTTPException(status_code=404, detail="Event not found")
    if body.title is not None:
        events[idx]["title"] = body.title
    if body.time is not None:
        events[idx]["time"] = body.time
    _write_plan(events)
    return JSONResponse(events[idx])


@app.post("/api/health-profile")
def save_health_profile(profile: HealthProfile):
    """Receive health data from the mobile app (HealthKit)."""
    profile_file = DATA_DIR / "health_profile.json"
    profile_file.write_text(
        json.dumps(profile.model_dump(exclude_none=True), indent=2, ensure_ascii=False)
    )
    return {"status": "saved"}


@app.get("/api/health-profile")
def get_health_profile():
    profile_file = DATA_DIR / "health_profile.json"
    if not profile_file.exists():
        return JSONResponse({})
    return JSONResponse(json.loads(profile_file.read_text(encoding="utf-8")))


HEALTH_LOGS_FILE = DATA_DIR / "health_logs.json"


class WorkoutLog(BaseModel):
    type: str
    duration_min: int
    logged_at: str | None = None


class PeriodLog(BaseModel):
    event: str  # "start" or "end"
    date: str


class WeightLog(BaseModel):
    weight_kg: float
    logged_at: str | None = None


def _read_logs() -> dict:
    if not HEALTH_LOGS_FILE.exists():
        return {"workouts": [], "period": [], "weight": []}
    return json.loads(HEALTH_LOGS_FILE.read_text(encoding="utf-8"))


def _write_logs(data: dict):
    HEALTH_LOGS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))


@app.get("/api/health/logs")
def get_health_logs():
    return JSONResponse(_read_logs())


@app.post("/api/health/log-workout")
def log_workout(entry: WorkoutLog):
    from datetime import datetime, timezone
    logs = _read_logs()
    logs["workouts"].append({
        **entry.model_dump(exclude_none=True),
        "logged_at": entry.logged_at or datetime.now(timezone.utc).isoformat(),
    })
    _write_logs(logs)
    return {"status": "logged"}


@app.post("/api/health/log-period")
def log_period(entry: PeriodLog):
    logs = _read_logs()
    logs["period"].append(entry.model_dump())
    _write_logs(logs)
    return {"status": "logged"}


@app.post("/api/health/log-weight")
def log_weight(entry: WeightLog):
    from datetime import datetime, timezone
    logs = _read_logs()
    logs["weight"].append({
        **entry.model_dump(exclude_none=True),
        "logged_at": entry.logged_at or datetime.now(timezone.utc).isoformat(),
    })
    _write_logs(logs)
    return {"status": "logged"}


@app.get("/api/user-profile")
def get_user_profile():
    if not USER_PROFILE_FILE.exists():
        return JSONResponse({})
    return JSONResponse(json.loads(USER_PROFILE_FILE.read_text(encoding="utf-8")))


@app.post("/api/user-profile")
def save_user_profile(profile: UserProfile):
    USER_PROFILE_FILE.write_text(
        json.dumps(profile.model_dump(exclude_none=True), indent=2, ensure_ascii=False)
    )
    return {"status": "saved"}


@app.get("/api/calendar/status")
def calendar_status():
    return {"connected": os.path.exists("token.json")}


@app.get("/api/geocode")
def geocode_address(address: str):
    from modules.geocoder import geocode
    result = geocode(address)
    if result:
        return {"lat": result["lat"], "lng": result["lon"], "display_name": result["display_name"]}
    return {"lat": None, "lng": None, "display_name": ""}


def _enrich_event_async(idx: int):
    """Background thread: runs Infrared + weather + Claude for one event by index."""
    try:
        from modules.infrared_client import get_climate_for_events
        from modules.weather_client import get_weather_for_events
        from modules.claude_planner import get_weekly_suggestions

        events = _read_plan()
        if idx >= len(events):
            return

        single = [events[idx]]
        single = get_climate_for_events(single)
        single = get_weather_for_events(single)
        events[idx] = single[0]
        _write_plan(events)

        # Re-run Claude suggestions across all events so context is consistent
        final = get_weekly_suggestions(events)
        if final:
            _write_plan(final)
        print(f"[enrich] Event {idx} enrichment complete")
    except Exception:
        traceback.print_exc()


@app.post("/api/events")
def create_event(body: NewEvent):
    from modules.geocoder import geocode

    _INDOOR_KEYWORDS = {"eada", "meeting", "office", "class", "lecture", "seminar",
                        "conference", "school", "university", "interview", "workshop",
                        "indoor", "studio", "gym", "clinic", "hospital"}
    title_lower = body.title.lower()
    is_indoor = any(kw in title_lower for kw in _INDOOR_KEYWORDS)

    # Resolve address to coordinates before saving — UTCI only fires on confirmed coords
    confirmed_lat, confirmed_lon = None, None
    if body.location and not is_indoor:
        coords = geocode(body.location)
        if coords:
            confirmed_lat = coords["lat"]
            confirmed_lon = coords["lon"]
            print(f"[create_event] Address confirmed: {body.location} -> ({confirmed_lat}, {confirmed_lon})")
        else:
            print(f"[create_event] Could not resolve address '{body.location}' — UTCI skipped")

    new_event = {
        "title": body.title,
        "time": body.time,
        "location": body.location,
        "setting": "indoor" if is_indoor else "outdoor",
        "activity": "sedentary",
    }
    # Store confirmed coordinates so enrichment never needs to geocode again
    if confirmed_lat is not None:
        new_event["lat"] = confirmed_lat
        new_event["lon"] = confirmed_lon

    events = _read_plan()
    events.append(new_event)
    _write_plan(events)

    # UTCI enrichment only starts when we have verified coordinates
    if confirmed_lat is not None:
        idx = len(events) - 1
        threading.Thread(target=_enrich_event_async, args=(idx,), daemon=True).start()

    try:
        from modules.calendar_client import create_google_calendar_event
        create_google_calendar_event(body.title, body.time, body.location)
    except Exception:
        traceback.print_exc()

    return JSONResponse(new_event)


class EnrichRequest(BaseModel):
    indices: list[int]

@app.post("/api/enrich")
def enrich_specific(body: EnrichRequest):
    """Enrich specific event indices."""
    events = _read_plan()
    valid = [i for i in body.indices if i < len(events)]
    if not valid:
        return JSONResponse({"status": "no valid indices"})
    def _run():
        try:
            from modules.infrared_client import get_climate_for_events
            from modules.weather_client import get_weather_for_events
            from modules.claude_planner import get_weekly_suggestions
            evts = _read_plan()
            to_enrich = [evts[i] for i in valid]
            enriched = get_climate_for_events(to_enrich)
            enriched = get_weather_for_events(enriched)
            for pos, i in enumerate(valid):
                evts[i] = enriched[pos]
            _write_plan(evts)
            final = get_weekly_suggestions(evts)
            if final:
                _write_plan(final)
            print(f"[enrich] Done — indices {valid}")
        except Exception:
            traceback.print_exc()
    threading.Thread(target=_run, daemon=True).start()
    return JSONResponse({"status": "enriching", "indices": valid})


@app.post("/api/enrich-pending")
def enrich_pending():
    """Re-run Infrared + weather + Claude for every event that has a location but no climate data."""
    events = _read_plan()
    pending = [i for i, e in enumerate(events) if e.get("location") and not e.get("climate")]
    if not pending:
        return JSONResponse({"status": "nothing to enrich", "pending": []})
    def _run():
        try:
            from modules.infrared_client import get_climate_for_events
            from modules.weather_client import get_weather_for_events
            from modules.claude_planner import get_weekly_suggestions
            evts = _read_plan()
            to_enrich = [evts[i] for i in pending]
            enriched = get_climate_for_events(to_enrich)
            enriched = get_weather_for_events(enriched)
            for pos, i in enumerate(pending):
                evts[i] = enriched[pos]
            _write_plan(evts)
            final = get_weekly_suggestions(evts)
            if final:
                _write_plan(final)
            print(f"[enrich-pending] Done — enriched {len(pending)} events")
        except Exception:
            traceback.print_exc()
    threading.Thread(target=_run, daemon=True).start()
    return JSONResponse({"status": "enriching", "pending": pending})


@app.post("/api/run")
def run_pipeline():
    """Trigger the full pipeline: Calendar -> Infrared -> Weather -> Claude."""
    import traceback as _tb
    step = "import"
    try:
        from modules.calendar_client import get_weekly_events
        from modules.infrared_client import get_climate_for_events
        from modules.weather_client import get_weather_for_events
        from modules.claude_planner import get_weekly_suggestions

        step = "calendar"
        events   = get_weekly_events()
        step = "infrared"
        enriched = get_climate_for_events(events)
        step = "weather"
        enriched = get_weather_for_events(enriched)
        step = "claude"
        final    = get_weekly_suggestions(enriched)

        if final:
            _write_plan(final)
        return JSONResponse({"status": "ok", "events": len(final)})
    except Exception as e:
        detail = f"Pipeline failed at step '{step}': {type(e).__name__}: {e}"
        _tb.print_exc()
        raise HTTPException(status_code=500, detail=detail)
