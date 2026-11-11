# SiteBrain — Data Sources & Provenance Log

**Dataset:** SiteBrain Bengaluru Retail Micro-Market Dataset
**Version:** 2.0.0 · **Generated:** 2026-11-10 · **Catchment:** 3,000m radial per corridor
**Study corridors:** Indiranagar 100ft Rd · Koramangala 5th Block · HSR Layout Sector 2 & 4 · Whitefield ITPL Main Rd

Every input used by the survey engine is listed below with its license, retrieval
date, and exact role. Where a figure is a SiteBrain estimate rather than a sourced
value, it is labeled as such **in the dataset itself** (`*Source` fields).

---

## 1. OpenStreetMap POI database (competitors, anchors, geometry)

- **What:** Named competitor shops (cafés, QSRs, gyms, clinics), malls, metro
  stations, parks, colleges, and markets inside each corridor's 3km catchment —
  names, lat/lng, OSM way/node references, and haversine distances from the
  survey center.
- **Source:** [OpenStreetMap](https://www.openstreetmap.org) via the
  [Overpass API](https://overpass-api.de/api/interpreter) (mirror:
  `https://overpass.kumi.systems/api/interpreter`).
- **License:** © OpenStreetMap contributors,
  [ODbL 1.0](https://opendatacommons.org/licenses/odbl/).
- **Retrieved:** 2026-11-10 (raw dumps cached in `data/osm/<corridor>.json`;
  865 / 754 / 514 / 665 named POIs for indiranagar / koramangala / hsr / whitefield).
- **Fetch tool:** `data/fetch_osm.py` (Overpass QL, skip-if-cached reload).
- **Curated into:** 47 competitor records (12 / 12 / 12 / 11) and the
  coordinate backbone for 22 footfall anchors.

## 2. BMRCL station-wise ridership, September 2025

- **What:** Per-station average weekday and weekend entries+exits for the
  Purple Line stations anchoring each corridor. Key figures used:
  - Indiranagar — 24,286 (weekday avg)
  - Central Silk Board — 5,247 / Bommanahalli — 4,241
  - Sri Sathya Sai Hospital (Whitefield) — 12,150 weekday vs **1,901 weekend
    (−84% collapse — the Whitefield "capital trap" narrative)**
  - Pattandur Agrahara — 14,603 · Whitefield (Kadugodi) — 9,449 ·
    Kadugodi Tree Park — 13,457 · Kundalahalli — 9,782 · Seetharampalya — 10,497
- **Source:** BMRCL data obtained via RTI, republished by OpenCity —
  [dataset page](https://data.opencity.in/dataset/bmrcl-station-wise-ridership-data),
  CKAN datastore resource `6127e293-0f45-4a36-8f6b-2a3e23ce1c17`.
- **License:** Creative Commons Non-Commercial (Government of India data via RTI).
- **Retrieved:** 2026-11-10 via CKAN `datastore_search` (2,490 rows; weekday =
  date.weekday() ≥ 5).
- **Used for:** Anchor `dailyVolume` strings and the Whitefield
  `weekendWeekdayRatio` (0.28) calibration.

## 3. Cushman & Wakefield — India Bangalore Retail MarketBeat, Q4 2025

- **What:** High-street asking rent benchmarks per micro-market:
  **Indiranagar ₹350/sqft · Koramangala ₹217/sqft · HSR ₹254/sqft**.
  Whitefield has no published high-street figure, so ₹135/sqft is a composite
  of the published mall / grade-A figures (labeled as such in
  `rentSource`).
- **Source:** C&W MarketBeat PDF —
  `https://assets.cushmanwakefield.com/-/media/cw/marketbeat-pdfs/2025/q4/apac-and-gc/india-bangalore-retail-q4-2025---final_.pdf`
- **License:** Published market research (cited).
- **Used for:** `avgRentSqft` per corridor and the rent-linked underwriting
  (deposit = 10 months' rent per Bengaluru norm).

## 4. Cushman & Wakefield — Main Streets Across the World 2025 (Bengaluru)

- **What:** Cross-validation of Indiranagar's high-street positioning and
  rental band.
- **License:** Published market research (cited).

## 5. Lokazen — Indiranagar Commercial Space Guide 2026

- **What:** Street-level rent bands for Indiranagar (12th Main ₹250–360/sqft),
  used to align representative listing templates to realistic corridor pricing.
- **Source:** `https://lokazen.in/blog/indiranagar-commercial-space-guide-2026`
- **License:** Published market guide (cited).

## 6. JLL — Bengaluru Retail Market Update Q4 2025

- **What:** Published retail stock, vacancy, and absorption context for
  Bengaluru (macro validation of corridor selection).
- **License:** Published market research (cited).

## 7. Google Maps public listings

- **What:** Star ratings for well-known brands only (e.g., Starbucks 4.5,
  Third Wave 4.5, Truffles 4.5). Where a competitor is not a widely-known
  brand, the rating is **omitted** and rendered as "not rated" rather than
  invented. Labeled `Google Maps public listing (indicative)`.
- **License:** Publicly displayed values, cited per brand.

## 8. SiteBrain estimates (clearly labeled)

- **What:** `dailyCrowd`, `avgTicket`, `dailyPedestrianCount`, saturation
  composites, and mall/campus/park volumes where no public dataset exists.
  Every such field carries `dailyCrowdSource: "SiteBrain estimate"` or an
  equivalent label in the dataset JSON.
- **License:** SiteBrain model calibration.

---

## What we deliberately did NOT do

- **No invented street addresses** for competitors — addresses were replaced by
  OSM references (`osmRef`) and lat/lng.
- **No fabricated review counts** — the `reviews` field was dropped entirely.
- **No invented capture dates** on Google Maps ratings — labeled "indicative".
- **No listings presented as live inventory** — all 16 are representative
  templates aligned to published bands, with the alignment stated per listing.

## Regeneration

```bash
python data/fetch_osm.py        # refresh raw Overpass dumps (cached)
python data/build.py            # rebuild assets/js/data.js + data/exports/*.csv
```

The canonical dataset is `data/sitebrain-dataset.json`; `assets/js/data.js` and
the CSV exports are generated artifacts — do not edit them by hand.
