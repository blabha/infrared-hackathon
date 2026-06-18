# Climate Planner

A personal outdoor intelligence system that connects your Google Calendar events to real microclimate data — and layers in women's hormonal cycle awareness to give you thermal comfort guidance and wellness feedback that's actually relevant to what you're doing and when.

---

## What it does

Add an event to your calendar. The system geocodes its location, runs a UTCI (Universal Thermal Climate Index) simulation through the Infrared City API, pulls live weather data, and passes everything through Claude to generate:

- **Thermal comfort rating** for the event location and time window
- **Clothing suggestions** tuned to solar load, wind, and precipitation
- **Wellness feedback** — and for women, cycle-phase-aware advice that accounts for how progesterone and oestrogen affect heat tolerance, fatigue, and nutrition needs on that specific day
- **Food recommendations** tailored to both the cycle phase and the type of activity (outdoor run vs. office meeting vs. beach)

---

## Architecture

```
Google Calendar (OAuth)   ──┐
Infrared City SDK         ──┤  FastAPI backend (Railway)  ──►  Claude API  ──►  weekly_plan.json
Open-Meteo Weather API    ──┘
         │
         ▼
   React Native app (Expo / EAS)
   ├── Map tab       — Leaflet heatmap overlays + UTCI-coloured pins per event
   ├── Calendar tab  — Monthly grid, day view, event cards with thermal + cycle tips
   └── Health tab    — Period tracking, workout/weight logging, cycle phase badge
```

---

## Stack

| Layer | Tech |
|---|---|
| Mobile app | React Native (Expo Router), EAS builds |
| Backend API | FastAPI + Uvicorn, deployed on Railway |
| Microclimate | Infrared City SDK (`infrared-sdk`) |
| Weather | Open-Meteo (`openmeteo-requests`) |
| Calendar | Google Calendar API v3 (OAuth 2.0, backend-mediated) |
| Map | React Native WebView + Leaflet.js |
| AI suggestions | Anthropic Claude (`claude-sonnet-4-6`) |
| Geocoding | Nominatim (OpenStreetMap) |

---

## Mobile App — Screens

### Map
- Interactive Leaflet map rendered in a WebView
- UTCI colour-coded pins per event (blue → green → yellow → orange → red)
- Semi-transparent heatmap overlay per event location
- UTCI legend (bottom-left)
- Day-of-week filter strip
- **↺ Refresh** button to pull latest enriched data
- **+ Add** button to create a new event
- Tap a pin to open an edit popup

### Calendar
- Monthly calendar grid with event dots coloured by UTCI
- Tap a day to see its events
- Expand an event card to reveal:
  - Solar radiation, wind speed, rain, humidity
  - **Clothing** — Claude's suggestion
  - **Wellness** — Claude's suggestion
  - **Cycle & Thermal** — Phase-aware tip (female users only), adapts to activity type and whether UTCI is above 32°C
  - **Consider Eating** — Nutrition recommendation for the phase and activity
  - **Delete event** button
- **Sync** button fetches your Google Calendars, shows a picker so you can choose which ones to import, then runs the full enrichment pipeline
- Add new events with location autofill (Nominatim resolves short names to full addresses)

### Health
- Gender, cycle day and phase badge (Menstrual / Follicular / Ovulatory / Luteal)
- Log workout (type, duration)
- Log weight (kg or lbs)
- Period tracking — log start and end dates
- **Thermal Wellness card** — shows how your current cycle phase affects outdoor heat tolerance

---

## Backend — Key Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/events` | Return enriched event list (scoped by `user_id`) |
| `POST` | `/api/events` | Add a new event (auto-enriches if outdoor) |
| `PUT` | `/api/events/{idx}` | Edit event title / time / location |
| `DELETE` | `/api/events/{idx}` | Delete event |
| `POST` | `/api/enrich` | Enrich specific event indices with UTCI |
| `POST` | `/api/enrich-pending` | Enrich all events with location but no UTCI |
| `POST` | `/api/run` | Full pipeline: Calendar → Infrared → Weather → Claude |
| `GET` | `/api/calendars` | List the user's Google Calendars (id, name, colour) |
| `GET` | `/api/geocode?address=` | Geocode an address (returns lat, lng, display_name) |
| `GET` | `/api/auth/google/start` | Kick off backend-mediated Google OAuth |
| `GET` | `/api/auth/google/callback` | OAuth callback — exchanges code, redirects back to app |
| `GET` | `/api/health-profile` | Get user health/cycle profile |
| `POST` | `/api/health-profile` | Update health profile |
| `POST` | `/api/health/log-period` | Log period start or end |
| `GET` | `/api/health/logs` | All health logs |

### `/api/run` body

```json
{
  "access_token":  "ya29...",
  "refresh_token": "1//...",
  "calendar_ids":  ["primary", "work@group.calendar.google.com"]
}
```

All fields are optional. `calendar_ids` defaults to all calendars if omitted.

---

## Auth Flow

The app uses a backend-mediated OAuth flow so Google credentials never need to be bundled in the app:

1. App calls `WebBrowser.openAuthSessionAsync` → opens Railway `/api/auth/google/start`
2. Railway redirects to Google with `redirect_uri` set to the Railway callback URL
3. User authenticates with Google in the in-app browser
4. Google redirects to Railway `/api/auth/google/callback`
5. Railway exchanges the code for tokens, stores them per user, then redirects back to `climateplanner://auth-callback?user_id=...&access_token=...&refresh_token=...`
6. `openAuthSessionAsync` intercepts the deep link — the app stores the tokens in `AsyncStorage`

---

## Cycle & Thermal Intelligence

The system maps the user's menstrual cycle to thermal comfort implications using days since their last period start, modulo 28. For each calendar event it calculates the phase the user will be in **on the day of that event**.

| Phase | Days | Thermal implication |
|---|---|---|
| Menstrual | 1–5 | Low energy, ease into outdoor activity |
| Follicular | 6–13 | Peak heat tolerance — best window for outdoor plans |
| Ovulatory | 14–15 | Basal temp slightly elevated — prefer cooler times of day |
| Luteal | 16–21 | Progesterone raises core temp — reduced heat tolerance |
| Late luteal | 22–28 | Most heat-sensitive — shade, extra hydration, avoid peak hours |

Tips also adapt to:
- **Activity type** — outdoor run, indoor gym, work/meeting, outdoor leisure — detected from event title
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

### Backend (local dev)

```bash
cd "infrared hackathon"
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
```

Create a `.env` file:

```env
ANTHROPIC_API_KEY=...
INFRARED_API_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:8000/api/auth/google/callback
```

Start the server:

```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### Backend (Railway)

Set these environment variables in your Railway service:

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | Your OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Your OAuth client secret |
| `GOOGLE_CALLBACK_URL` | `https://<your-railway-domain>/api/auth/google/callback` |
| `ANTHROPIC_API_KEY` | Your Anthropic key |
| `INFRARED_API_KEY` | Your Infrared City key |

Add `https://<your-railway-domain>/api/auth/google/callback` to **Authorized redirect URIs** in Google Cloud Console.

Railway deploys automatically on every push to `main`.

### Mobile App (Expo Go — local dev)

```bash
cd mobile
npm install
npx expo start
```

Create `mobile/.env.local`:

```env
EXPO_PUBLIC_API_BASE=https://<your-railway-domain>
```

Scan the QR code with Expo Go on your phone. Authentication always goes through the Railway backend even in local dev — Google requires HTTPS redirect URIs.

### Mobile App (EAS build — installable APK)

```bash
cd mobile
eas build --platform android --profile preview
```

The `preview` profile in `eas.json` sets `EXPO_PUBLIC_API_BASE` to the Railway URL automatically and produces an installable `.apk` you can sideload or share via Expo's dashboard.

---

## Notes

- Infrared simulations run in a background thread after event creation. Indoor/work events (meeting, office, class, EADA, gym, etc.) skip the Infrared API automatically.
- Newly created events appear on the map immediately with a grey `?` pin, then gain a UTCI-coloured pin once enrichment completes (~60 seconds).
- New events are written back to the user's primary Google Calendar with a 1-hour default duration.
- All data is scoped per user via a `user_id` query parameter derived from an MD5 hash of the user's Google email.
- The plan file (`output/users/<user_id>/weekly_plan.json`) is the source of truth for the mobile app. It is overwritten each time the full pipeline (`/api/run`) runs.
