import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from modules.calendar_client import get_weekly_events
from modules.infrared_client import get_climate_for_events
from modules.weather_client import get_weather_for_events
from modules.claude_planner import get_weekly_suggestions

OUTPUT_FILE = Path("output/enriched_events.json")
SUGGESTIONS_FILE = Path("output/weekly_plan.json")


def run_pipeline():
    # Phase 2 — fetch Monday–Friday calendar events
    print("=== Phase 2: Google Calendar ===")
    events = get_weekly_events()
    print(f"Found {len(events)} events\n")

    # Phase 3 — enrich each event with Infrared climate data
    print("=== Phase 3: Infrared City ===")
    enriched = get_climate_for_events(events)

    # Phase 4 — add precipitation and humidity from Open-Meteo
    print("\n=== Phase 4: Open-Meteo Weather ===")
    enriched = get_weather_for_events(enriched)

    # Save intermediate result
    OUTPUT_FILE.parent.mkdir(exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(enriched, indent=2, ensure_ascii=False))
    print(f"\nSaved enriched events -> {OUTPUT_FILE}")

    # Phase 6 — Claude generates clothing and wellness suggestions
    print("\n=== Phase 6: Claude Suggestions ===")
    final = get_weekly_suggestions(enriched)
    SUGGESTIONS_FILE.write_text(json.dumps(final, indent=2, ensure_ascii=False))
    print(f"Saved weekly plan -> {SUGGESTIONS_FILE}")

    return final


if __name__ == "__main__":
    results = run_pipeline()
    print("\n--- Weekly Plan ---")
    for event in results:
        print(f"\n{event['title']} ({event.get('time', '')})")
        s = event.get("suggestions", {})
        print(f"  Clothing : {s.get('clothing', '')}")
        print(f"  Wellness : {s.get('wellness', '')}")
