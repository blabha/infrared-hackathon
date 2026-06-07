# Climate Planner

A personal outdoor intelligence system that connects your Google Calendar events to real microclimate data — and layers in women's hormonal cycle awareness to give you thermal comfort guidance and wellness feedback that's actually relevant to what you're doing and when.

---

## What it does

You add an event to the calendar. The system geocodes its location, runs a UTCI (Universal Thermal Climate Index) simulation through the Infrared City API, pulls live weather data, and passes everything through Claude to generate:

- **Thermal comfort rating** for the event location and time window
- **Clothing suggestions** tuned to solar load, wind and precipitation
- **Wellness feedback** — and for women, cycle-phase-aware advice that accounts for how progesterone and oestrogen affect heat tolerance, fatigue and nutrition needs on that specific day
- **Food recommendations** tailored to both the cycle phase and the type of activity (outdoor run vs. office meeting vs. beach)

---

## Architecture

```
Google Calendar (OAuth)   ──┐
Infrared City SDK         ──┤  FastAPI backend  ──►  Claude API  ──►  weekly_plan.json
Open-Meteo Weather API    ──┘
         │
         ▼
   React Native app (Expo)
   ├── Map tab       — UTCI heatmap overlays + coloured pins per event
   ├── Calendar tab  — Day view, event cards with thermal + cycle tips
   └── Health tab    — Period tracking, workout/weight logging, phase badge
```

---

## Stack

| Layer | Tech |
|---|---|
| Mobile app | React Native (Expo Router) |
| Backend API | FastAPI + Uvicorn |
| Microclimate | Infrared City SDK (`infrared-sdk`) |
| Weather | Open-Meteo (`openmeteo-requests`) |
| Calendar | Google Calendar API v3 (OAuth 2.0) |
| AI suggestions | Anthropic Claude (`claude-sonnet-4-6`) |
| Geocoding | Nominatim (OpenStreetMap) |

---

## Mobile App — Screens

### Map
- Interactive map (React Native Maps) centred on Barcelona
- UTCI colour-coded pins per event (blue → green → yellow → orange → red)
- Semi-transparent heatmap overlay per event location
- UTCI legend (bottom-left)
- Day-of-week filter strip
- **↺ Refresh** button to pull latest enriched data
- **+ Add** button to create a new event

### Calendar
- Monthly calendar grid with event dots coloured by UTCI
- Tap a day to see its events
- Expand an event card to reveal:
  - Solar radiation, wind speed, rain, humidity
  - **👕 Clothing** — Claude's suggestion
  - **💧 Wellness** — Claude's suggestion
  - **🌸 Cycle & Thermal** — Phase-aware tip (female users only), adapts to activity type (outdoor run / indoor gym / meeting / beach) and whether UTCI is above 32°C
  - **🥗 Consider Eating** — Nutrition recommendation for the phase and activity
  - **Delete event** button
- Add new events with location autofill (Nominatim resolves short names like "EADA" to full addresses)

### Health
- Gender, cycle day and phase badge (Menstrual / Follicular / Ovulatory / Luteal)
- Log workout (type, duration, time of day)
- Log weight (kg or lbs)
- Period tracking — log start and end dates
- **Thermal Wellness card** — updates live as you type a period end date, shows how your current cycle phase affects outdoor heat tolerance

---

## Backend — Key Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/events` | Return enriched event list |
| `POST` | `/api/events` | Add a new event (auto-enriches if outdoor) |
| `PUT` | `/api/events/{idx}` | Edit event title/time |
| `DELETE` | `/api/events/{idx}` | Delete event |
| `POST` | `/api/enrich` | Enrich specific event indices with UTCI |
| `POST` | `/api/enrich-pending` | Enrich all events with location but no UTCI |
| `POST` | `/api/run` | Full pipeline: Calendar → Infrared → Weather → Claude |
| `GET` | `/api/geocode?address=` | Geocode an address (returns lat, lng, display_name) |
| `GET` | `/api/health-profile` | Get user health/cycle profile |
| `POST` | `/api/health-profile` | Update health profile |
| `POST` | `/api/health/log-period` | Log period start or end |
| `GET` | `/api/health/logs` | All health logs |

---

## Cycle & Thermal Intelligence

The system maps the user's menstrual cycle to thermal comfort implications using the number of days since their last period end, modulo 28. For each calendar event, it calculates what phase the user will be in **on the day of that event** — not just today.

| Phase | Days since period end | Thermal implication |
|---|---|---|
| Transitional | 0–1 | Temp stabilising, ease into outdoor activity |
| Follicular | 1–7 | Peak heat tolerance — best window for outdoor plans |
| Pre-ovulation | 7–11 | High oestrogen, mild temp uptick — hydrate well |
| Ovulation | 11–14 | Basal temp slightly elevated — prefer cooler times |
| Luteal | 14–21 | Progesterone raises core temp 0.3–0.5 degrees — reduced heat tolerance |
| Late luteal (PMS) | 21–28 | Most heat-sensitive — shade, extra hydration, avoid peak hours |

The tip also adapts to:
- **Activity type** — outdoor run, indoor gym, work/meeting, outdoor leisure — detected from the event title
- **UTCI threshold** — if UTCI ≥ 32°C, language escalates to a stronger warning

---

## UTCI Colour Scale

| Colour | Range | Label |
|---|---|---|
| Dark blue | < 9°C | Extreme cold |
| Blue | 9–18°C | Cold stress |
| Green | 18–26°C | Comfortable |
| Yellow | 26–32°C | Moderate heat |
| Orange | 32–38°C | Strong heat |
| Red | > 38°C | Extreme heat |

---

## Setup

### Backend

```bash
cd "infrared hackathon"
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
```

Create a `.env` file:
```
ANTHROPIC_API_KEY=...
INFRARED_API_KEY=...
INFRARED_BASE_URL=...           # if using a non-default endpoint
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=...
```

Run OAuth to connect Google Calendar (required once):
```bash
.venv\Scripts\python -c "from modules.calendar_client import _get_credentials; _get_credentials()"
```

Start the server:
```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### Mobile App

```bash
cd ClimateApp
npm install
npx expo start
```

Update `constants/api.ts` with your server's LAN IP:
```ts
export const API_BASE = 'http://192.168.x.x:8000';
```

---

## Notes

- Infrared simulations run in a background thread after event creation. Indoor/work events (EADA, meeting, office, class, etc.) skip the Infrared API automatically.
- Newly created events appear on the map immediately via geocode fallback (grey `?` pin), then gain a coloured UTCI pin once enrichment completes.
- New events are written back to Google Calendar with a 1-hour default duration.
- The plan file (`output/weekly_plan.json`) is the source of truth for the mobile app. It is overwritten when the full pipeline (`/api/run`) runs.
