# SiteBrain — AI Geospatial Commercial Real Estate Decision Intelligence Platform

> **Google Cloud & Gemini API Powered | Startup Buildathon India 2026**  
> *Determine store profitability. Before you sign the lease.*

---

## 1. Project Overview & Zero-Build Modular Architecture

SiteBrain is a zero-build (no bundler, no framework toolchain) multi-page application with strict separation of concerns: presentation, geospatial mapping, deterministic financial mathematics, backend API integration, and Gemini AI orchestration. Every module degrades gracefully — the product works fully offline of its backend and of Gemini.

```
SiteBrain/
├── index.html                  # Page 1: Apple-grade product marketing site (split hero, pipeline, ROI simulator)
├── survey.html                 # Page 2: Full-screen split workbench — map scan left, staged diagnostics right
├── datasets.html               # Page 3: Data Room — sources, licenses, registries, CSV exports
├── assets/
│   ├── css/
│   │   ├── main.css            # Design tokens, frosted glassmorphism, app-window chrome, mock-map, dark navy band
│   │   └── components.css      # Speedometer zones, stepper, pin drops, sliders, modals, shimmer, reduced-motion
│   └── js/
│       ├── tailwind-config.js  # Shared Tailwind CDN tokens (brand / risk / apple / ink palettes, shadow-2xs)
│       ├── data.js             # GENERATED — Bengaluru dataset: 4 corridors × (competitors, anchors, listings) + 4 category economics
│       ├── utils.js            # SiteBrainUtils: INR formatters, DOM helpers, count-up animation, concept keyword extraction
│       ├── api.js              # SiteBrainAPI: fail-soft FastAPI client (AbortController timeouts, local fallback)
│       ├── financial-gauge.js  # Deterministic underwriting engine + viability speedometer (single source of truth)
│       ├── map-engine.js       # Leaflet + CartoDB Positron, per-category layer groups, animated 3km scan with callbacks
│       ├── gemini-survey.js    # Survey orchestrator: setup modal, brief enhancement, 5-step stepper, masterplan
│       ├── landing.js          # Landing interactivity: nav states, hotspot deep links, ROI simulator, reveals
│       └── datasets.js         # Data Room renderer (sources, corridor economics, registries)
├── data/
│   ├── sitebrain-dataset.json  # CANONICAL dataset v2.0.0 (hand-edited source of truth)
│   ├── build.py                # Emits assets/js/data.js + data/exports/*.csv from the canonical JSON
│   ├── fetch_osm.py            # Overpass API dumps per corridor (cached in data/osm/)
│   ├── SOURCES.md              # Full provenance log: licenses, retrieval dates, what-we-did-not-do
│   ├── osm/                    # Raw Overpass dumps + curation summary
│   └── exports/               # CSV exports (corridor-economics, competitors, anchors, listings, category-economics)
├── backend/
│   ├── app.py                  # FastAPI microservice: mirrored math core + real google-genai integration
│   └── requirements.txt         # fastapi, uvicorn, pydantic, google-genai
├── server.py                   # Zero-dependency local static server (port 3000)
└── README.md
```

**Script load order** (dependency-verified):
- `index.html`: `tailwind-config.js` → `utils.js` → `financial-gauge.js` → `landing.js`
- `survey.html`: `tailwind-config.js` → Leaflet CDN → `data.js` → `utils.js` → `api.js` → `financial-gauge.js` → `map-engine.js` → `gemini-survey.js`
- `datasets.html`: `tailwind-config.js` → `data.js` → `utils.js` → `datasets.js`

---

## 2. The Deterministic Underwriting Model (Anti-Hallucination Contract)

All financial figures are computed upstream with explicit algebra — **Gemini never does arithmetic**. The canonical model lives in `assets/js/financial-gauge.js` and is mirrored **exactly** in `backend/app.py` (`compute_metrics`), so both engines provably agree.

```
effectiveDemand = (footTrafficIndex / 8.0) × saturationIndex × ((5 + 2·weekendRatio) / 7)

Revenue (capacity-driven, category-specific):
  covers       → dailyCovers   = seats × turnsPerDay × baseUtilization × effectiveDemand
  members      → activeMembers = membersBase × effectiveDemand
  appointments → dailyAppts    = operatories × apptsPerDay × baseUtilization × effectiveDemand

monthlyOpEx  = rent × (1 + 0.18 marketing + 0.08 maintenance) + payroll + utilities
netMonthly   = achievedRevenue × (1 − COGS%) − monthlyOpEx
survivalVol  = monthlyOpEx / contributionMargin            (break-even volume)
capitalAtRisk= deposit + fit-out + equipment + licensing
breakEven    = capitalAtRisk / netMonthly                   (∞ if net ≤ 0)
```

**Viability score** = corridor base ± deterministic adjustments: RTR < 18% → +6, RTR > 24% → −10; break-even ∞ → −20, ≤ 18 mo → +4, > 30 mo → −8; below survival volume → −20; clamped 12–96. Tiers: < 45 high risk, < 72 moderate, ≥ 72 low.

**Calibration targets (verified in both engines — 16/16 corridor×category combos pass parity):**

| Corridor | Rent (C&W Q4 2025) | Coffee viability | Coffee break-even | QSR viability | Corridor risk |
|---|---|---|---|---|---|
| Indiranagar | ₹350/sqft | 34 — locked | not achievable (net −₹39,960/mo) | 74 — unlocks | low |
| HSR Layout | ₹254/sqft | 73 — unlocks | Month 69.7 | 95 — unlocks | low |
| Koramangala | ₹217/sqft | 50 — locked | Month 74.5 | 72 — unlocks | medium |
| Whitefield | ₹135/sqft (composite) | 12 — locked | not achievable | 12 — locked | high |

The default survey story: Indiranagar coffee → **34, capital-protected** → one-click
re-run in HSR (highest adjacent base viability, 91) → coffee **73, broker unlock**.

**Broker unlock threshold: viability ≥ 55.** Locked corridors show a *Capital Protection Safeguard* with a one-click "Re-run Survey in [best adjacent corridor]" action.

---

## 3. Real Data Sources (v2.0.0 dataset)

The product runs on trusted, source-attributed data — not hand-invented demo numbers. Full provenance: `data/SOURCES.md` and the in-app [Data Room](datasets.html).

| Source | License | Used for |
|---|---|---|
| OpenStreetMap (Overpass API) | ODbL 1.0 | 47 competitor shops + anchor geometry across 4 corridors (names, coords, OSM refs, distances) |
| BMRCL station-wise ridership, Sep 2025 (RTI, via OpenCity) | CC Non-Commercial | Anchor daily volumes (Indiranagar 24,286; Sri Sathya Sai Hospital 12,150 → 1,901 weekend −84%) |
| Cushman & Wakefield Bangalore Retail MarketBeat Q4 2025 | Published research (cited) | Corridor rents: Indiranagar ₹350 / HSR ₹254 / Koramangala ₹217 /sqft |
| C&W Main Streets Across the World 2025 | Published research (cited) | Indiranagar high-street cross-validation |
| Lokazen Indiranagar Guide 2026 | Published guide (cited) | Listing template rent bands (12th Main ₹250–360/sqft) |
| JLL Bengaluru Retail Update Q4 2025 | Published research (cited) | Macro retail context |
| Google Maps public listings | Publicly displayed (cited) | Ratings for well-known brands only, labeled "indicative" |
| SiteBrain estimates | Labeled in-dataset | Crowd volumes, AOV, saturation composites — every estimate carries a `*Source` label |

Regenerate everything from the canonical JSON: `python data/build.py` (emits `assets/js/data.js` + `data/exports/*.csv`).

---

## 4. Page Walkthrough

### `index.html` — Product Marketing Site
- Floating capsule navbar (scroll-intensifying glass) + mobile drawer.
- Split hero: headline left, live-looking product mock right (mock map, catchment radius, viability gauge, weekly volume bars, floating annotation chips).
- Hotspot quick-launch bar → `survey.html?location=X&category=Y` deep links (Indiranagar→QSR unlock story; others coffee).
- Trust strip (Google Cloud, Gemini 2.5 Pro, FastAPI, PostGIS, Leaflet, OpenStreetMap) with real dataset counts and problem stat band (₹42L locked capital / 6–12 competitors / 18-month window).
- Dark navy **Anti-Hallucination Pipeline** band: PostGIS query → deterministic math core → locked JSON handoff → Gemini strategic verdict.
- Workbench showcase (5 answer tiles), two-sided marketplace section, founding team, CTA band, multi-column footer with Data Room link.
- **Interactive ROI simulator** in an app-window frame running the *same* `simulateQuick` engine as the survey (drag sliders → live break-even, covers/day, rent stress, lease-stress tier).

### `survey.html` — Survey Workbench
Split screen: Leaflet map (CartoDB Positron, 4 independent layer toggles, scanning overlay, coordinates badge) + staged right panel:

1. **Brief** — Research setup modal (location, category, budget slider, concept textarea) with *"Enhance & Summarize with Gemini 2.5 Pro"* → real `/api/gemini/enhance` call with deterministic local fallback.
2. **Scan** — animated 3km catchment + staggered pin drops (competitors / anchors / listings), each pin with a live dossier popup (competitor addresses resolve to OSM references; ODbL attribution enabled).
3. **Underwriting** — full itemized CapEx (deposit, fit-out, equipment, licensing, working capital) and OpEx (payroll, utilities, COGS, marketing+maintenance), break-even, survival volume bar, rent-to-revenue.
4. **Verdict** — graded-zone speedometer (crimson 0–40 / amber 41–69 / emerald 70–100), risk factors vs. reward drivers.
5. **Masterplan** — differentiation strategy (upgraded in the background by `/api/gemini/synthesize` when concept text exists), negotiation mandate with deterministic rent ceiling, licensing checklist, and broker unlock / capital-protection state.

Header hotspot pills allow instant corridor re-runs; term-sheet modal serves verified listings.

### `datasets.html` — Data Room
Full provenance page rendered from the same `window.SITEBRAIN_DATA` payload as the survey engine (zero drift): source registry with licenses and retrieval dates, corridor economics cards, competitor / anchor / listing registries, and CSV exports.

---

## 5. Backend Microservice (`backend/app.py`)

FastAPI service that **mirrors the frontend math exactly** and provides real Gemini integration:

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Status + gemini mode (`live-api` / `deterministic-fallback`) |
| `GET /api/locations`, `GET /api/categories` | Calibrated registries |
| `POST /api/feasibility/calculate` | Deterministic underwriting (pure algebra, Pydantic v2 schemas) |
| `POST /api/gemini/enhance` | Founder concept notes → structured Executive Feasibility Brief (demographics, floor plate, capacity, peak windows, AOV, risk hypothesis) |
| `POST /api/gemini/synthesize` | Locked numbers + concept → execution masterplan (strategy, negotiation mandate, licensing, verdict) |

**Gemini integration model:** when `GEMINI_API_KEY` is set, calls run through the `google-genai` SDK with schema-constrained JSON output (`gemini-2.5-flash` by default; override with `GEMINI_MODEL`). Without a key — or on any SDK/API failure — every endpoint degrades to deterministic synthesis, so the product is always fully functional. The frontend client (`assets/js/api.js`) additionally fails soft to local engines when the backend itself is unreachable.

```bash
pip install -r backend/requirements.txt

# Mock mode (no key needed — fully functional):
python backend/app.py                  # serves on http://localhost:8000

# Live Gemini mode:
set GEMINI_API_KEY=your_key_here       # (Windows) or export on macOS/Linux
python backend/app.py
```

API documentation: `http://localhost:8000/docs`.

---

## 6. Quick Start

```bash
python server.py    # static frontend on http://localhost:3000
```

- **Marketing site**: [http://localhost:3000/index.html](http://localhost:3000/index.html)
- **Survey workbench**: [http://localhost:3000/survey.html](http://localhost:3000/survey.html)
- **Data Room**: [http://localhost:3000/datasets.html](http://localhost:3000/datasets.html)

Optionally run the backend (Section 5) on port 8000 to enable live Gemini synthesis; the frontend auto-detects it (`window.SITEBRAIN_API_BASE` overrides the default).

---

## 7. Founding Team & Hackathon Credentials

- **Shreeram Prakasan PK** — Team Lead & Full-Stack / AI Integrator  
  *CS & AI Engineering, CHRIST (Deemed to be University), Bengaluru*  
  PostGIS spatial indexing, Python FastAPI math engine, and Gemini API orchestration.

- **Abhinav Jadhav** — Co-Founder & UI/UX Frontend Lead  
  *CSE IoT, CHRIST (Deemed to be University), Bengaluru*  
  Component architecture, Leaflet geospatial interface, and Apple-grade design tokens.

---

*© 2026 SiteBrain Intelligence Inc. Built for Google Cloud & Gemini API Startup Buildathon India 2026.*
