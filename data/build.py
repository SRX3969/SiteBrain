#!/usr/bin/env python3
"""
SiteBrain dataset build step.

Reads the canonical dataset (data/sitebrain-dataset.json) and emits:
  1. assets/js/data.js            — window.SITEBRAIN_DATA payload for the zero-build frontend
  2. data/exports/*.csv           — flat CSV exports for the Data Room / judges

Run:  python data/build.py
"""

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / "data" / "sitebrain-dataset.json"
DATAJS = ROOT / "assets" / "js" / "data.js"
EXPORTS = ROOT / "data" / "exports"


def write_data_js(payload: dict) -> None:
    header = (
        "/**\n"
        " * ═══════════════════════════════════════════════════════════════════\n"
        " * SITEBRAIN — BENGALURU COMMERCIAL REAL ESTATE GEOSPATIAL DATASET\n"
        f" * Version {payload['meta']['version']} · generated {payload['meta']['generated']}\n"
        " * Sources: OpenStreetMap (ODbL) · BMRCL ridership via OpenCity (RTI) ·\n"
        " *           Cushman & Wakefield MarketBeat Q4 2025 · Lokazen 2026 guide ·\n"
        " *           JLL Q4 2025 · Google Maps public listings · SiteBrain estimates\n"
        " * GENERATED FILE — do not edit by hand; run `python data/build.py`\n"
        " * ═══════════════════════════════════════════════════════════════════\n"
        " */\n\n"
    )
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    DATAJS.write_text(header + "window.SITEBRAIN_DATA = " + body + ";\n", encoding="utf-8", newline="\n")


def write_csv(path: Path, fieldnames: list, rows: list) -> None:
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def export_csvs(payload: dict) -> None:
    EXPORTS.mkdir(parents=True, exist_ok=True)

    # 1. Corridor economics
    loc_fields = [
        "id", "name", "corridor", "avgRentSqft", "rentSource", "depositNormMonths",
        "footTrafficIndex", "weekendWeekdayRatio", "dailyPedestrianCount",
        "demandCompositeSource", "saturationIndex", "baseViabilityScore",
        "riskClassification", "riskLabel", "statusPill",
    ]
    rows = [{k: loc.get(k, "") for k in loc_fields} for loc in payload["locations"].values()]
    write_csv(EXPORTS / "corridor-economics.csv", loc_fields, rows)

    # 2. Competitors
    comp_fields = ["locationId", "id", "name", "category", "rating", "ratingSource",
                   "distanceMeters", "avgTicket", "dailyCrowd", "dailyCrowdSource",
                   "osmRef", "lat", "lng", "source"]
    rows = []
    for loc_id, loc in payload["locations"].items():
        for c in loc["competitors"]:
            row = {"locationId": loc_id}
            row.update({k: c.get(k, "") for k in comp_fields if k != "locationId"})
            rows.append(row)
    write_csv(EXPORTS / "competitors.csv", comp_fields, rows)

    # 3. Footfall anchors
    anchor_fields = ["locationId", "name", "type", "dailyVolume", "volumeSource", "osmRef", "lat", "lng"]
    rows = []
    for loc_id, loc in payload["locations"].items():
        for a in loc["anchors"]:
            row = {"locationId": loc_id}
            row.update({k: a.get(k, "") for k in anchor_fields if k != "locationId"})
            rows.append(row)
    write_csv(EXPORTS / "anchors.csv", anchor_fields, rows)

    # 4. Property listings
    prop_fields = ["locationId", "id", "dealType", "dealTypeLabel", "name", "floor", "sqft",
                   "askingRentPerSqft", "monthlyRent", "securityDeposit", "frontageFeet",
                   "powerSanctionedKva", "brokerName", "brokerPhone", "verifiedStatus",
                   "zoning", "badgeColor", "lat", "lng", "source"]
    rows = []
    for loc_id, loc in payload["locations"].items():
        for p in loc["properties"]:
            row = {"locationId": loc_id}
            row.update({k: p.get(k, "") for k in prop_fields if k != "locationId"})
            rows.append(row)
    write_csv(EXPORTS / "listings.csv", prop_fields, rows)

    # 5. Category economics
    cat_fields = ["id", "name", "typicalSqft", "fitoutCostSqft", "equipmentBudget", "licensingLegal",
                  "staffCount", "avgStaffSalary", "monthlyUtilities", "cogsPercent", "defaultTicket",
                  "minTicket", "maxTicket", "defaultBudget", "revenueModel", "seatingCapacity",
                  "capacityLabel", "turnsPerDay", "baseUtilization", "peakHours", "targetDemographic"]
    rows = [{k: cat.get(k, "") for k in cat_fields} for cat in payload["categories"].values()]
    write_csv(EXPORTS / "category-economics.csv", cat_fields, rows)


def main() -> int:
    payload = json.loads(DATASET.read_text(encoding="utf-8"))

    write_data_js(payload)
    export_csvs(payload)

    locs = payload["locations"]
    print("Build OK")
    print(f"  data.js        -> {DATAJS.relative_to(ROOT)}  (v{payload['meta']['version']}, {len(locs)} corridors)")
    print(f"  competitors    -> {sum(len(l['competitors']) for l in locs.values())}")
    print(f"  anchors        -> {sum(len(l['anchors']) for l in locs.values())}")
    print(f"  listings       -> {sum(len(l['properties']) for l in locs.values())}")
    print(f"  categories     -> {len(payload['categories'])}")
    print(f"  playbooks      -> {len(payload['playbooks'])}")
    print(f"  sources cited  -> {len(payload['meta']['sources'])}")
    for f in sorted(EXPORTS.glob('*.csv')):
        print(f"  export         -> {f.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
