import json
import os
from pathlib import Path
from dotenv import load_dotenv
import anthropic

load_dotenv(Path(__file__).parent.parent / ".env")

_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

_SYSTEM_PROMPT = """You are a personal climate and wellness planner. You receive a list of calendar events enriched with site-specific microclimate data (solar radiation, wind speed, thermal comfort UTCI) and real-time weather forecasts (precipitation, humidity).

For each event, provide:
1. **Clothing recommendation** — fabric, layers, sun protection based on solar radiation, UTCI, and rain
2. **Wellness tip** — hydration, UV exposure, wind chill, or comfort advice specific to the conditions at that location and time

Guidelines:
- Be specific and practical — reference the actual values (e.g. "UTCI of 34°C indicates heat stress")
- Keep each recommendation concise (2–3 sentences max)
- If climate data is unavailable for an event, give general advice based on the season and location name
- Format your response as a JSON array matching the input events order"""


def _format_events(events: list[dict]) -> str:
    lines = []
    for i, ev in enumerate(events, 1):
        climate = ev.get("climate") or {}
        weather = ev.get("weather") or {}

        lines.append(f"Event {i}: {ev.get('title', 'Untitled')}")
        lines.append(f"  Time: {ev.get('time', 'unknown')}")
        lines.append(f"  Location: {ev.get('location', 'unknown')}")

        if climate:
            solar = climate.get("solar_radiation_wm2", {})
            utci = climate.get("thermal_comfort_utci_c", {})
            wind = climate.get("wind_speed_ms", {})
            lines.append(f"  Solar radiation: mean {solar.get('mean', 'N/A')} W/m², max {solar.get('max', 'N/A')} W/m²")
            lines.append(f"  Thermal comfort (UTCI): mean {utci.get('mean', 'N/A')}°C, max {utci.get('max', 'N/A')}°C")
            lines.append(f"  Wind speed: mean {wind.get('mean', 'N/A')} m/s, max {wind.get('max', 'N/A')} m/s")

        if weather:
            lines.append(f"  Precipitation: {weather.get('precipitation_mm', 'N/A')} mm")
            lines.append(f"  Relative humidity: {weather.get('relative_humidity_pct', 'N/A')}%")

        lines.append("")

    return "\n".join(lines)


def get_weekly_suggestions(events: list[dict]) -> list[dict]:
    """
    Send enriched events to Claude and return a list of per-event suggestions.
    Each suggestion has 'clothing' and 'wellness' keys.
    """
    events_text = _format_events(events)

    with _client.messages.stream(
        model="claude-opus-4-8",
        max_tokens=4096,
        thinking={"type": "adaptive"},
        system=[
            {
                "type": "text",
                "text": _SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            f"Here are my events for the week with climate and weather data:\n\n"
                            f"{events_text}\n\n"
                            f"Return a JSON array with {len(events)} objects, one per event in order. "
                            f"Each object must have:\n"
                            f'  "title": the event title\n'
                            f'  "clothing": clothing recommendation\n'
                            f'  "wellness": wellness tip\n\n'
                            f"Return only the JSON array, no markdown fences."
                        ),
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
            }
        ],
    ) as stream:
        message = stream.get_final_message()

    raw = next(b.text for b in message.content if b.type == "text").strip()

    # Strip markdown code fences if Claude wrapped the response
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
        raw = raw.rsplit("```", 1)[0].strip()

    try:
        suggestions = json.loads(raw)
    except json.JSONDecodeError:
        suggestions = []

    # Merge suggestions back into the enriched events
    enriched = []
    for i, event in enumerate(events):
        suggestion = suggestions[i] if i < len(suggestions) else {}
        enriched.append({
            **event,
            "suggestions": {
                "clothing": suggestion.get("clothing", ""),
                "wellness": suggestion.get("wellness", ""),
            },
        })

    return enriched


if __name__ == "__main__":
    output_file = Path("output/enriched_events.json")
    if not output_file.exists():
        print("Run main.py first to generate output/enriched_events.json")
    else:
        events = json.loads(output_file.read_text(encoding="utf-8"))
        results = get_weekly_suggestions(events)
        for r in results:
            print(f"\n{r['title']}")
            print(f"  Clothing : {r['suggestions']['clothing']}")
            print(f"  Wellness : {r['suggestions']['wellness']}")
