# Climate and Metabolic Based Planner — Implementation Plan

## Problem Statement

Planners, climate, and health apps operate in individual silos. In reality, they are interrelated and directly affect daily performance and functionality. This planner unifies them into a single intelligent weekly recommendation system.

---

## Architecture Overview

```
Google Calendar (OAuth)  ──┐
Infrared City API        ──┤
Local Health Tracker     ──┼──► Claude API ──► Weekly Suggestions
Open-Meteo Weather API   ──┘
```

---

## Step-by-Step Implementation Plan

### Phase 1 — Project Setup

- [ ] Create a Python project with a virtual environment (`.venv`)
- [ ] Install dependencies:
  - `anthropic` — Claude API
  - `google-auth`, `google-auth-oauthlib`, `google-api-python-client` — Google Calendar
  - `infrared-sdk` — Infrared City microclimate data
  - `openmeteo-requests`, `requests-cache`, `retry-requests` — Open-Meteo weather
  - `fastapi` + `uvicorn` — optional backend API layer
- [ ] Create a `.env` file for secrets: `ANTHROPIC_API_KEY`, Google OAuth credentials, Infrared API key

---

### Phase 2 — Google Calendar Integration

**Goal:** Extract upcoming weekly events with location, time, and type.

- [ ] Set up Google Cloud OAuth 2.0 credentials (Desktop or Web app)
- [ ] Implement OAuth flow to obtain a token (`token.json` for reuse)
- [ ] Query the Calendar API for events in the next 7 days
- [ ] Extract per-event: `summary` (type), `start.dateTime`, `location`
- [ ] Classify event type: outdoor/indoor, physical/sedentary, social/work

**Output schema:**
```json
[
  { "title": "Morning Run", "time": "2026-05-30T07:00", "location": "Hyde Park, London", "type": "outdoor_physical" }
]
```

---

### Phase 3 — Infrared City API Integration

**Goal:** Get site-specific solar radiation and wind data for each event location for the coming week.

- [ ] Install `infrared-sdk` (`pip install infrared-sdk`)
- [ ] Authenticate with the Infrared API key
- [ ] For each unique location from the calendar, geocode to lat/lon
- [ ] Run solar radiation and wind comfort simulations for that location
- [ ] Aggregate daily/hourly solar intensity and wind speed forecasts

**Output schema:**
```json
{
  "Hyde Park, London": {
    "solar_radiation_wm2": [320, 410, 280, ...],
    "wind_speed_ms": [3.2, 4.1, 2.8, ...],
    "dates": ["2026-05-30", "2026-05-31", ...]
  }
}
```

---

### Phase 4 — Open-Meteo Weather Integration

**Goal:** Retrieve ambient weather (rain, temperature, humidity) for each event location.

- [ ] Use Open-Meteo free API (no key required)
- [ ] For each location, fetch 7-day hourly forecast:
  - `precipitation` (mm) — rain
  - `temperature_2m` (°C)
  - `relative_humidity_2m` (%)
  - `apparent_temperature` (°C) — feels-like

**Output schema:**
```json
{
  "Hyde Park, London": {
    "rain_mm": [0, 2.4, 0, ...],
    "temp_c": [18, 15, 20, ...],
    "humidity_pct": [60, 75, 55, ...]
  }
}
```

---

### Phase 5 — Health Tracker Integration

**Goal:** Ingest personal health and activity data, with cycle phase support for women.

- [ ] Define a local health data schema (JSON or SQLite)
- [ ] For **all users:** capture recent activity logs (steps, workouts, sleep, HRV/resting HR)
- [ ] For **women:** capture current menstrual cycle phase:
  - Menstrual (Day 1–5): low energy, high fatigue
  - Follicular (Day 6–13): rising energy
  - Ovulatory (Day 14): peak energy
  - Luteal (Day 15–28): declining energy, heat sensitivity
- [ ] Expose a simple local API or file-read function to retrieve this data

**Output schema:**
```json
{
  "gender": "female",
  "cycle_phase": "luteal",
  "cycle_day": 20,
  "recent_activity": "moderate",
  "avg_sleep_hrs": 6.5,
  "resting_hr_bpm": 72
}
```

---

### Phase 6 — Claude API Integration

**Goal:** Synthesize all data sources into actionable weekly suggestions.

- [ ] Construct a structured prompt that includes:
  - Calendar events (location, time, type)
  - Solar radiation and wind forecast per location
  - Rain and temperature forecast per location
  - User health profile and cycle phase (if applicable)
- [ ] Call the Claude API (`claude-sonnet-4-6` or `claude-opus-4-8`)
- [ ] Enable **prompt caching** for the weather/climate data block (static per session)
- [ ] Parse the Claude response into structured recommendations

**Prompt structure:**
```
You are a personal climate and health planner. Given the following data for the upcoming week, provide specific, practical suggestions.

[CALENDAR EVENTS]
...

[CLIMATE DATA per location]
...

[HEALTH PROFILE]
...

Respond with:
1. Clothing recommendations per event
2. Better-suited time slots for outdoor activities (with alternatives if conditions are poor)
3. Hydration reminders tied to heat/solar load and cycle phase
```

**Output schema:**
```json
{
  "clothing": ["Wear UV-protective light fabric for the Monday run — UV index 7"],
  "activity_timing": ["Reschedule Tuesday run to 7am — afternoon wind speeds 6 m/s + rain forecast"],
  "hydration": ["Increase water intake Thursday–Friday: luteal phase + 32°C apparent temp"]
}
```

---

### Phase 7 — Output and Delivery

- [ ] Render suggestions in a readable weekly summary (Markdown or HTML)
- [ ] Optional: write suggestions back to Google Calendar as event notes/reminders
- [ ] Optional: send a weekly digest via email or push notification

---

### Phase 8 — Testing and Validation

- [ ] Unit test each integration module independently with mock data
- [ ] Integration test the full pipeline with a real Google Calendar test account
- [ ] Validate Claude output quality with edge cases:
  - All-indoor week (no solar/wind impact)
  - Extreme heat week
  - Ovulatory phase + high solar exposure
- [ ] Confirm prompt caching is reducing token costs on repeated runs

---

## File Structure

```
infrared-hackathon/
├── .env                      # API keys and secrets
├── PLAN.md                   # This file
├── main.py                   # Entry point — orchestrates full pipeline
├── modules/
│   ├── calendar_client.py    # Google Calendar OAuth + event fetch
│   ├── infrared_client.py    # Infrared City solar/wind simulation
│   ├── weather_client.py     # Open-Meteo rain/temp fetch
│   ├── health_profile.py     # Local health data reader
│   └── claude_planner.py     # Claude API prompt + response parser
├── data/
│   └── health_profile.json   # Local health and cycle data
├── output/
│   └── weekly_plan.md        # Generated weekly suggestions
└── requirements.txt
```

---

## Key APIs and SDKs

| Service | Library / API | Auth |
|---|---|---|
| Google Calendar | `google-api-python-client` | OAuth 2.0 |
| Infrared City | `infrared-sdk` | API Key |
| Open-Meteo | `openmeteo-requests` | None (free) |
| Claude | `anthropic` | API Key |

---

## Priority Build Order

1. Claude API + prompt structure (core output engine)
2. Open-Meteo weather (easiest, no auth)
3. Infrared City (microclimate differentiation — hackathon centerpiece)
4. Google Calendar OAuth (event context)
5. Health profile reader (personalization layer)
6. Full pipeline integration + output formatting
