import os
import json
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

load_dotenv()

SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",   # create/update events
    "https://www.googleapis.com/auth/calendar.readonly",  # list all calendars + read all
]
TOKEN_FILE = "token.json"
CREDENTIALS_FILE = "client_secret_100317843416-i7t8hbs1uutdv1aruhmcbg2v4s2a946m.apps.googleusercontent.com.json"

OUTDOOR_KEYWORDS = ["run", "walk", "hike", "cycle", "bike", "park", "outdoor", "garden", "market", "bbq", "picnic", "sport", "yoga", "match", "race", "beach", "swim"]
PHYSICAL_KEYWORDS = ["run", "walk", "hike", "cycle", "bike", "gym", "workout", "yoga", "swim", "sport", "match", "race", "training"]


def _classify_event(title: str) -> dict:
    title_lower = title.lower()
    return {
        "setting": "outdoor" if any(k in title_lower for k in OUTDOOR_KEYWORDS) else "indoor",
        "activity": "physical" if any(k in title_lower for k in PHYSICAL_KEYWORDS) else "sedentary",
    }


def _get_credentials(token_file: str | None = None):
    effective_token = token_file or TOKEN_FILE

    # On Railway: bootstrap default token from env var if file missing
    if not token_file:
        token_env = os.getenv("GOOGLE_TOKEN_JSON")
        if token_env and not os.path.exists(TOKEN_FILE):
            from pathlib import Path
            Path(TOKEN_FILE).write_text(token_env, encoding="utf-8")

        secret_env = os.getenv("GOOGLE_CLIENT_SECRET_JSON")
        if secret_env and not os.path.exists(CREDENTIALS_FILE):
            from pathlib import Path
            Path(CREDENTIALS_FILE).write_text(secret_env, encoding="utf-8")

    creds = None
    if os.path.exists(effective_token):
        creds = Credentials.from_authorized_user_file(effective_token, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(effective_token, "w") as f:
                f.write(creds.to_json())
        else:
            if not os.path.exists(CREDENTIALS_FILE):
                raise FileNotFoundError(
                    "No credentials found. Set GOOGLE_TOKEN_JSON and "
                    "GOOGLE_CLIENT_SECRET_JSON env vars on Railway."
                )
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=8080)
            with open(effective_token, "w") as f:
                f.write(creds.to_json())

    return creds


def _upcoming_week() -> tuple[datetime, datetime]:
    """Returns the upcoming Mon–Sun week (7 full days).
    If today is Sunday, the week starts tomorrow (Monday).
    If today is Monday, the week starts today.
    """
    today = datetime.now(timezone.utc).date()
    # weekday(): Mon=0 … Sat=5, Sun=6
    # (7 - weekday) % 7 → 0 on Monday (start today), 1 on Sunday (start tomorrow), etc.
    days_to_monday = (7 - today.weekday()) % 7
    week_start = today + timedelta(days=days_to_monday)
    week_end   = week_start + timedelta(days=6)
    start = datetime(week_start.year, week_start.month, week_start.day, 0, 0, 0, tzinfo=timezone.utc)
    end   = datetime(week_end.year,   week_end.month,   week_end.day,   23, 59, 59, tzinfo=timezone.utc)
    return start, end


def get_weekly_events(token_file: str | None = None) -> list[dict]:
    """Fetch events for the upcoming Mon–Sun week from ALL calendars."""
    creds = _get_credentials(token_file=token_file)
    service = build("calendar", "v3", credentials=creds)

    week_start, week_end = _upcoming_week()

    # Collect all calendar IDs the user has access to
    cal_list = service.calendarList().list().execute()
    calendar_ids = [cal["id"] for cal in cal_list.get("items", [])]
    if not calendar_ids:
        calendar_ids = ["primary"]

    seen_ids: set[str] = set()
    events: list[dict] = []

    for cal_id in calendar_ids:
        try:
            result = service.events().list(
                calendarId=cal_id,
                timeMin=week_start.isoformat(),
                timeMax=week_end.isoformat(),
                singleEvents=True,
                orderBy="startTime",
            ).execute()
        except Exception:
            continue

        for item in result.get("items", []):
            event_id = item.get("id", "")
            if event_id in seen_ids:
                continue
            seen_ids.add(event_id)

            title = item.get("summary", "Untitled")
            start_info = item.get("start", {})
            time = start_info.get("dateTime") or start_info.get("date")
            location = item.get("location", None)
            classification = _classify_event(title)

            events.append({
                "title": title,
                "time": time,
                "location": location,
                "setting": classification["setting"],
                "activity": classification["activity"],
            })

    events.sort(key=lambda e: e["time"] or "")
    return events


def create_google_calendar_event(title: str, time_str: str, location: str | None = None) -> str | None:
    """Create an event in the user's primary Google Calendar. Returns the new event ID or None."""
    try:
        creds = _get_credentials()
        service = build("calendar", "v3", credentials=creds)

        start_dt = datetime.fromisoformat(time_str)
        end_dt = start_dt + timedelta(hours=1)

        body = {
            "summary": title,
            "start": {"dateTime": start_dt.isoformat(), "timeZone": "Europe/Madrid"},
            "end":   {"dateTime": end_dt.isoformat(),   "timeZone": "Europe/Madrid"},
        }
        if location:
            body["location"] = location

        result = service.events().insert(calendarId="primary", body=body).execute()
        print(f"[calendar] Created event '{title}' → {result.get('id')}")
        return result.get("id")
    except Exception as e:
        print(f"[calendar] Failed to create event: {e}")
        return None


if __name__ == "__main__":
    events = get_weekly_events()
    print(json.dumps(events, indent=2))
