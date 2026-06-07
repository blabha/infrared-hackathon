# Project Structure

## Overview

Two codebases work together: a **Python FastAPI backend** (this folder) that runs the data pipeline and serves a REST API, and a **React Native mobile app** (`../ClimateApp`) that consumes it.

---

## Backend — `infrared hackathon/`

```
infrared hackathon/
│
├── app.py                          # FastAPI server — all REST endpoints
├── main.py                         # CLI entry point — runs full pipeline once
├── run_utci.py                     # Standalone script — UTCI-only test run
├── Procfile                        # Deployment process definition
├── requirements.txt                # Python dependencies
│
├── .env                            # Secrets (API keys, OAuth credentials) — not committed
├── token.json                      # Google OAuth token — auto-generated after first login
├── client_secret_*.json            # Google OAuth client credentials — downloaded from GCP
│
├── modules/
│   ├── calendar_client.py          # Google Calendar OAuth + event fetch + write-back
│   ├── infrared_client.py          # Infrared City SDK — geocode, UTCI simulation, PNG overlay
│   ├── weather_client.py           # Open-Meteo — precipitation + humidity per event
│   └── claude_planner.py           # Anthropic API — clothing + wellness suggestions
│
├── data/
│   ├── user_profile.json           # Name, age, gender, connected services
│   ├── health_profile.json         # Gender, cycle day/phase, sleep, resting HR
│   └── health_logs.json            # Period start/end, workout, weight log entries
│
├── output/
│   ├── weekly_plan.json            # Source of truth for the mobile app — enriched events
│   ├── weekly_plan.backup.json     # Auto-backup written on every save
│   └── utci/
│       └── *.png                   # UTCI heatmap overlay tiles — one PNG per event location
│
└── static/
    └── index.html                  # Minimal web UI (unused in mobile-first flow)
```

### `app.py` — API surface

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/events` | Return full enriched event list |
| `POST` | `/api/events` | Create event, auto-enrich if outdoor |
| `PUT` | `/api/events/{idx}` | Edit event title or time |
| `DELETE` | `/api/events/{idx}` | Remove event |
| `POST` | `/api/enrich` | UTCI-only enrichment for specific indices |
| `POST` | `/api/enrich-pending` | Enrich all events with location but no climate data |
| `POST` | `/api/run` | Full pipeline: Calendar → Infrared → Weather → Claude |
| `GET` | `/api/geocode` | Nominatim geocode — returns lat, lng, display_name |
| `GET` | `/api/health-profile` | Read health/cycle profile |
| `POST` | `/api/health-profile` | Update health/cycle profile |
| `POST` | `/api/user-profile` | Update user profile |
| `POST` | `/api/health/log-workout` | Log a workout entry |
| `POST` | `/api/health/log-weight` | Log a weight entry |
| `POST` | `/api/health/log-period` | Log period start or end |
| `GET` | `/api/health/logs` | Return all health log entries |
| `GET` | `/api/calendar/status` | Check if Google Calendar is connected |

### `modules/` — Pipeline stages

```
Google Calendar ──► calendar_client.py ──► events list
                                               │
                          infrared_client.py ◄─┤  geocode → UTCI simulation → PNG overlay
                                               │
                           weather_client.py ◄─┤  Open-Meteo precipitation + humidity
                                               │
                           claude_planner.py ◄─┘  Anthropic API → clothing + wellness text
                                               │
                                    app.py writes weekly_plan.json
```

---

## Mobile App — `ClimateApp/`

```
ClimateApp/
│
├── app.json                        # Expo config — app name, icons, scheme
├── index.ts                        # Entry point
├── metro.config.js                 # Metro bundler config
├── tsconfig.json                   # TypeScript config
│
├── constants/
│   └── api.ts                      # API_BASE — server URL (update to your LAN IP)
│
├── assets/                         # App icons and splash screen images
│
└── app/                            # Expo Router file-based navigation
    ├── _layout.tsx                 # Root layout — StatusBar, Stack navigator
    ├── index.tsx                   # Entry redirect — onboarding or tabs
    ├── onboarding.tsx              # First-run screen — name, age, gender, connect services
    │
    └── (tabs)/
        ├── _layout.tsx             # Tab bar — Map, Calendar, Health
        ├── index.tsx               # MAP TAB — UTCI pins, heatmap overlays, UTCI legend
        ├── events.tsx              # CALENDAR TAB — month grid, event cards, cycle tips
        └── health.tsx              # HEALTH TAB — period tracking, workouts, phase badge
```

### Screen responsibilities

**`(tabs)/index.tsx` — Map**
- Fetches events from `/api/events` on focus and on manual refresh
- Shows a coloured UTCI pin per event (grey `?` if not yet enriched)
- Renders semi-transparent UTCI heatmap PNG overlay per location
- UTCI legend panel (bottom-left)
- Day-of-week filter, + Add event, ↺ Refresh

**`(tabs)/events.tsx` — Calendar**
- Month calendar grid with coloured event dots
- Tap a day → event list; tap an event → expanded card
- Expanded card shows: solar/wind/rain metrics, Claude's clothing + wellness tips, cycle & thermal tip, food recommendation, delete button
- Cycle tips generated client-side by `getCyclePhaseNote()` — no API call
- Activity type detected from event title (run / yoga / meeting / beach / EADA etc.)
- Add event modal with location autofill via `/api/geocode`

**`app/onboarding.tsx` — Onboarding**
- Collects name, age, gender
- Connects Apple Health (simulated) and Google Calendar
- Writes profile to `/api/user-profile` and `/api/health-profile`

**`(tabs)/health.tsx` — Health**
- Phase badge (Menstrual / Follicular / Ovulatory / Luteal · Day N)
- Log workout, log weight, period start/end tracking
- Thermal Wellness card — updates live as period end date is typed

---

## Data flow — adding a new event

```
User types location "EADA" in the app
        │
        ▼
onBlur → GET /api/geocode?address=EADA
  → Nominatim: "EADA, Barcelona" → lat=41.387, lon=2.159, display_name=...
  → Location field autofills with resolved address
        │
        ▼
Tap Add → POST /api/events { title, time, location }
  → Saved immediately to weekly_plan.json
  → If title contains indoor keyword (EADA, meeting, office…) → skip enrichment
  → Otherwise → background thread: Infrared UTCI → weather → Claude → write plan
  → If Google Calendar connected → event written to Google Calendar
        │
        ▼
Map tab (focus or ↺ refresh)
  → GET /api/events
  → Events without climate.lat → geocodeFallback() → pin appears
  → Events with climate data → coloured UTCI pin + heatmap overlay
```

---

## Tip generation — where each tip comes from

| Tip | Source | When |
|---|---|---|
| 👕 Clothing | Claude Opus 4.8 via Anthropic API | After enrichment pipeline completes |
| 💧 Wellness | Claude Opus 4.8 via Anthropic API | After enrichment pipeline completes |
| 🌸 Cycle & Thermal | Client-side (`getCyclePhaseNote` in events.tsx) | Instantly, on every event expand |
| 🥗 Consider Eating | Client-side (`getCyclePhaseNote` in events.tsx) | Instantly, on every event expand |

Cycle tips adapt to: **cycle phase × activity type × UTCI heat stress**. Activity type is inferred from the event title (outdoor run, indoor gym, work/meeting, outdoor leisure).
