"""
SITEBRAIN — OpenStreetMap POI Fetcher
======================================
Pulls real businesses and landmarks inside each survey corridor's 3km
catchment via the Overpass API (OpenStreetMap, ODbL license).

Usage:  python data/fetch_osm.py
Output: data/osm/<corridor>.json  (raw Overpass dump, verifiable)
        + a printed curation summary for manual dataset review

Sources:
  * Overpass API endpoints (overpass-api.de, kumi.systems mirror)
  * Data © OpenStreetMap contributors, ODbL 1.0 — https://osm.org/copyright
"""

import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "osm")

CORRIDORS = {
    "indiranagar": (12.9784, 77.6408, "Indiranagar 100ft Road"),
    "koramangala": (12.9352, 77.6245, "Koramangala 5th Block"),
    "hsr": (12.9121, 77.6446, "HSR Layout Sector 2 & 4"),
    "whitefield": (12.9780, 77.7280, "Whitefield ITPL Main Rd"),
}

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

QUERY_TEMPLATE = """[out:json][timeout:120];
(
  nwr(around:3000,{lat},{lon})["amenity"~"^(cafe|fast_food|restaurant)$"];
  nwr(around:3000,{lat},{lon})["leisure"="fitness_centre"];
  nwr(around:3000,{lat},{lon})["amenity"~"^(clinic|dentist|doctors)$"];
  nwr(around:3000,{lat},{lon})["railway"="station"];
  nwr(around:3000,{lat},{lon})["shop"="mall"];
  nwr(around:3000,{lat},{lon})["amenity"~"^(college|university)$"];
  nwr(around:3000,{lat},{lon})["leisure"="park"];
  nwr(around:3000,{lat},{lon})["amenity"="marketplace"];
);
out center 900;"""


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def overpass(query):
    data = urllib.parse.urlencode({"data": query}).encode()
    last_err = None
    for endpoint in ENDPOINTS:
        for attempt in range(3):
            try:
                req = urllib.request.Request(
                    endpoint, data=data,
                    headers={"User-Agent": "SiteBrain-DataFetcher/1.0 (research; contact: team@sitebrain.app)"},
                )
                with urllib.request.urlopen(req, timeout=180) as res:
                    return json.loads(res.read().decode("utf-8"))
            except Exception as err:  # noqa: BLE001 — retry across endpoints
                last_err = err
                print(f"    [{endpoint} attempt {attempt + 1}] {err} — retrying in 5s", flush=True)
                time.sleep(5)
    raise RuntimeError(f"All Overpass endpoints failed: {last_err}")


def coords_of(el):
    if el.get("type") == "node":
        return el.get("lat"), el.get("lon")
    center = el.get("center")
    if center:
        return center.get("lat"), center.get("lon")
    return None, None


def classify(tags):
    amenity = tags.get("amenity", "")
    if tags.get("leisure") == "fitness_centre":
        return "fitness"
    if tags.get("railway") == "station":
        return "metro_station"
    if tags.get("shop") == "mall":
        return "mall"
    if amenity in ("college", "university"):
        return "college"
    if tags.get("leisure") == "park":
        return "park"
    if amenity == "marketplace":
        return "marketplace"
    if amenity == "cafe":
        return "cafe"
    if amenity == "fast_food":
        return "fast_food"
    if amenity == "restaurant":
        return "restaurant"
    if amenity in ("clinic", "dentist", "doctors"):
        return "clinic"
    return "other"


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    os.makedirs(OUT_DIR, exist_ok=True)
    summary = {}

    for corr, (lat, lon, label) in CORRIDORS.items():
        print(f"\n{'=' * 70}\n{corr.upper()} — {label} (center {lat}, {lon})", flush=True)
        out_path = os.path.join(OUT_DIR, f"{corr}.json")
        if os.path.exists(out_path):
            with open(out_path, encoding="utf-8") as fh:
                cached = json.load(fh)
            records = cached["elements"]
            print(f"  cached {os.path.relpath(out_path)} ({len(records)} named POIs)")
            summary[corr] = records
            continue
        result = overpass(QUERY_TEMPLATE.format(lat=lat, lon=lon))
        elements = result.get("elements", [])
        print(f"  Overpass returned {len(elements)} named+unnamed elements")

        records = []
        for el in elements:
            tags = el.get("tags") or {}
            name = tags.get("name")
            if not name:
                continue
            plat, plon = coords_of(el)
            if plat is None:
                continue
            rec = {
                "osm_type": el.get("type"),
                "osm_id": el.get("id"),
                "name": name,
                "kind": classify(tags),
                "lat": round(plat, 6),
                "lon": round(plon, 6),
                "distance_m": round(haversine_m(lat, lon, plat, plon)),
                "cuisine": tags.get("cuisine", ""),
                "opening_hours": tags.get("opening_hours", ""),
                "brand": tags.get("brand", ""),
                "website": tags.get("website", tags.get("contact:website", "")),
            }
            records.append(rec)

        records.sort(key=lambda r: r["distance_m"])

        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(
                {
                    "corridor": corr,
                    "center": [lat, lon],
                    "radius_m": 3000,
                    "source": "OpenStreetMap via Overpass API (ODbL)",
                    "retrieved": time.strftime("%Y-%m-%d"),
                    "element_count": len(records),
                    "elements": records,
                },
                fh, indent=2, ensure_ascii=False,
            )
        print(f"  wrote {os.path.relpath(out_path)} ({len(records)} named POIs)")

        summary[corr] = records

    # ── Curation summary for manual review ──
    print("\n" + "=" * 70 + "\nCURATION SUMMARY (candidates for the dataset)\n" + "=" * 70)
    for corr, records in summary.items():
        print(f"\n### {corr.upper()}")
        for kind in ("cafe", "fast_food", "restaurant", "fitness", "clinic",
                     "metro_station", "mall", "college", "park", "marketplace"):
            subset = [r for r in records if r["kind"] == kind][:40]
            if not subset:
                continue
            print(f"\n  -- {kind} ({len([r for r in records if r['kind'] == kind])} total, showing {len(subset)}) --")
            for r in subset:
                extra = f" [{r['cuisine']}]" if r["cuisine"] and kind in ("cafe", "restaurant", "fast_food") else ""
                print(f"   {r['distance_m']:>5}m  {r['name']}{extra}  ({r['lat']},{r['lon']}) osm:{r['osm_type']}/{r['osm_id']}")


if __name__ == "__main__":
    sys.exit(main())
