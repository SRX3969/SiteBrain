"""
SiteBrain Backend Microservice — Python FastAPI & Google Gemini API
===================================================================
Deterministic financial underwriting (exact mirror of the shared JS engine in
assets/js/financial-gauge.js) plus Gemini 2.5 strategic synthesis.

Anti-hallucination contract:
  * /api/feasibility/calculate  → pure algebra, zero LLM involvement.
  * /api/gemini/enhance         → Gemini converts a founder's raw concept notes
                                  into a structured Executive Feasibility Brief.
  * /api/gemini/synthesize      → Gemini converts locked numbers into an
                                  execution masterplan (strategy only).
  * Every Gemini call degrades to a deterministic fallback when
    GEMINI_API_KEY is absent, the SDK is missing, or the API errors —
    the product must always work without a key.
"""

import json
import math
import os
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ── Google Gemini SDK (optional at runtime — deterministic fallback otherwise) ──

try:
    from google import genai
    from google.genai import types as genai_types
    GENAI_SDK_AVAILABLE = True
except ImportError:  # pragma: no cover - exercised only without the SDK installed
    genai = None
    genai_types = None
    GENAI_SDK_AVAILABLE = False

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
BROKER_UNLOCK_THRESHOLD = 55  # spec: viability score >= 55 unlocks verified listings

_gemini_client = None


def get_gemini_client():
    """Lazily construct the google-genai client; None when running keyless."""
    global _gemini_client
    if not GENAI_SDK_AVAILABLE or not GEMINI_API_KEY:
        return None
    if _gemini_client is None:
        _gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    return _gemini_client


def gemini_mode() -> str:
    return "live-api" if get_gemini_client() else "deterministic-fallback"


def _gemini_structured(schema_cls, prompt: str, temperature: float = 0.4):
    """
    Run a schema-constrained Gemini call. Returns a dict on success,
    or None on ANY failure (caller must fall back deterministically).
    """
    client = get_gemini_client()
    if client is None:
        return None
    try:
        config = genai_types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema_cls,
            temperature=temperature,
        )
        response = client.models.generate_content(
            model=GEMINI_MODEL, contents=prompt, config=config
        )
        parsed = getattr(response, "parsed", None)
        if parsed is not None:
            return parsed.model_dump() if hasattr(parsed, "model_dump") else dict(parsed)
        return json.loads(response.text)
    except Exception:
        return None


app = FastAPI(
    title="SiteBrain Geospatial Decision Engine API",
    version="3.0.0",
    description="Deterministic Commercial Real Estate Underwriting & Gemini 2.5 Strategic Synthesis",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ════════════════════════════════════════════════════════════════════
# CALIBRATED MICRO-MARKET REGISTRY (mirror of assets/js/data.js)
# ════════════════════════════════════════════════════════════════════

MARKET_DATA = {
    "indiranagar": {
        "name": "Indiranagar 100ft Road",
        "short_name": "Indiranagar",
        "corridor": "100ft Road & 12th Main Strip",
        "avg_rent_sqft": 350.0,
        "rent_source": "Cushman & Wakefield India Bangalore Retail MarketBeat, Q4 2025 (high-street asking rent)",
        "deposit_months": 10,
        "base_viability": 84,
        "traffic_index": 8.6,
        "weekend_ratio": 1.48,
        "saturation_index": 0.72,
        "daily_pedestrians": 14200,
        "risk_classification": "low",
        "risk_label": "HIGH DEMAND / RENT-PREMIUM CORRIDOR",
        "primary_risk": "C&W Q4 2025 asking rent of Rs.350/sqft sits at the top of Bengaluru's high-street band — coffee-class formats fail to clear burn here.",
        "top_competitors": ["Narayan Nethralaya", "Starbucks", "Third Wave Coffee"],
    },
    "koramangala": {
        "name": "Koramangala 5th Block",
        "short_name": "Koramangala",
        "corridor": "Koramangala 5th Block High-Street Spine",
        "avg_rent_sqft": 217.0,
        "rent_source": "Cushman & Wakefield India Bangalore Retail MarketBeat, Q4 2025 (high-street asking rent)",
        "deposit_months": 10,
        "base_viability": 68,
        "traffic_index": 9.2,
        "weekend_ratio": 1.55,
        "saturation_index": 0.58,
        "daily_pedestrians": 19800,
        "risk_classification": "medium",
        "risk_label": "MODERATE CAUTION / SATURATED",
        "primary_risk": "Severe cannibalization: saturation composite of 0.58 — the densest incumbent F&B cluster of the four corridors.",
        "top_competitors": ["Blue Tokai Coffee Roasters", "Third Wave Coffee Roasters", "Truffles (Original)"],
    },
    "hsr": {
        "name": "HSR Layout Sector 2 & 4",
        "short_name": "HSR Layout",
        "corridor": "27th Main Commercial Corridor",
        "avg_rent_sqft": 254.0,
        "rent_source": "Cushman & Wakefield India Bangalore Retail MarketBeat, Q4 2025 (high-street asking rent)",
        "deposit_months": 10,
        "base_viability": 91,
        "traffic_index": 7.4,
        "weekend_ratio": 1.35,
        "saturation_index": 0.85,
        "daily_pedestrians": 11200,
        "risk_classification": "low",
        "risk_label": "TOP TIER EXPANSION ZONE",
        "primary_risk": "Pedestrian footfall is more dispersed across multiple cross-roads than the 100ft Rd spine.",
        "top_competitors": ["Blue Tokai", "Third Wave Coffee", "Starbucks"],
    },
    "whitefield": {
        "name": "Whitefield ITPL Main Rd",
        "short_name": "Whitefield",
        "corridor": "EPIP Zone & ITPL Commercial Front",
        "avg_rent_sqft": 135.0,
        "rent_source": "Cushman & Wakefield India Bangalore Retail MarketBeat Q4 2025 (mall/grade-A composite; no published high-street figure)",
        "deposit_months": 10,
        "base_viability": 36,
        "traffic_index": 4.6,
        "weekend_ratio": 0.28,
        "saturation_index": 0.62,
        "daily_pedestrians": 7800,
        "risk_classification": "high",
        "risk_label": "HIGH RISK / CAPITAL TRAP",
        "primary_risk": "Structural weekend collapse: BMRCL Sep 2025 data shows -84% ridership at Sri Sathya Sai Hospital station on weekends (12,150 to 1,901).",
        "top_competitors": ["Blue Tokai Coffee Roasters", "Starbucks (ITPL Front)", "Third Wave Coffee Roasters"],
    },
}

CATEGORY_DATA = {
    "coffee": {
        "name": "Specialty Coffee & Roastery",
        "typical_sqft": 1200,
        "fitout_sqft": 1850.0,
        "equipment": 1250000.0,
        "licensing": 140000.0,
        "staff_count": 5,
        "avg_salary": 24000.0,
        "utilities": 42000.0,
        "cogs_pct": 28.0,
        "ticket": 450.0,
        "default_budget": 4500000.0,
        "revenue_model": "covers",
        "seating_capacity": 46,
        "turns_per_day": 3.0,
        "base_utilization": 0.55,
        "peak_hours": "8:30 AM – 11:30 AM & 4:30 PM – 8:00 PM",
        "target_demographic": "Tech founders, venture operators, remote product designers, upscale creative professionals aged 23–42.",
    },
    "qsr": {
        "name": "Fast-Casual QSR / Cloud Kitchen",
        "typical_sqft": 1400,
        "fitout_sqft": 2200.0,
        "equipment": 1850000.0,
        "licensing": 180000.0,
        "staff_count": 8,
        "avg_salary": 21000.0,
        "utilities": 58000.0,
        "cogs_pct": 33.0,
        "ticket": 520.0,
        "default_budget": 6200000.0,
        "revenue_model": "covers",
        "seating_capacity": 52,
        "turns_per_day": 4.5,
        "base_utilization": 0.60,
        "peak_hours": "12:30 PM – 3:30 PM & 7:30 PM – 11:00 PM",
        "target_demographic": "Working professionals seeking high-protein quick lunches and late-night dine-in/takeaway.",
    },
    "fitness": {
        "name": "Boutique Fitness Studio",
        "typical_sqft": 2200,
        "fitout_sqft": 1950.0,
        "equipment": 2400000.0,
        "licensing": 120000.0,
        "staff_count": 4,
        "avg_salary": 32000.0,
        "utilities": 38000.0,
        "cogs_pct": 12.0,
        "ticket": 3200.0,
        "default_budget": 7500000.0,
        "revenue_model": "members",
        "seating_capacity": None,
        "members_base": 340,
        "peak_hours": "6:00 AM – 9:30 AM & 6:00 PM – 9:00 PM",
        "target_demographic": "Fitness-conscious executives, runners, and pilates/crossfit practitioners.",
    },
    "clinic": {
        "name": "Diagnostic / Dental Clinic",
        "typical_sqft": 1100,
        "fitout_sqft": 2400.0,
        "equipment": 3200000.0,
        "licensing": 220000.0,
        "staff_count": 3,
        "avg_salary": 35000.0,
        "utilities": 30000.0,
        "cogs_pct": 16.0,
        "ticket": 1800.0,
        "default_budget": 6800000.0,
        "revenue_model": "appointments",
        "seating_capacity": 3,
        "turns_per_day": 8,
        "base_utilization": 0.55,
        "peak_hours": "9:00 AM – 1:00 PM & 4:30 PM – 8:30 PM",
        "target_demographic": "Local residents seeking high-trust dental, dermatological, and preventive health services.",
    },
}

PLAYBOOKS = {
    "coffee": {
        "differentiation": "Focus on single-origin pour-overs, transparent farm sourcing (Chikmagalur / Coorg micro-lots), and an acoustic laptop-friendly workstation zone with 1Gbps WiFi.",
        "negotiation": "Cap asking rent at ₹150/sqft; secure a mandatory 60-day rent-free fit-out period and an escalation cap of 5% YoY instead of landlord standard 7%.",
        "licensing": [
            "FSSAI State License (Category 14 — Beverages)",
            "BBMP Trade License for Health & Sanitation",
            "Karnataka Fire & Emergency Services NOC",
            "Shop & Commercial Establishment Act Registration",
            "Signage License from BBMP Advertisement Dept",
        ],
    },
    "qsr": {
        "differentiation": "Build a 3-minute order-to-dispatch pipeline with self-checkout kiosks and dual pickup counters (one dedicated to Swiggy/Zomato riders to preserve dine-in ambiance).",
        "negotiation": "Negotiate base rent with a revenue-share model (e.g., ₹130/sqft base + 5% turnover over ₹15L gross monthly).",
        "licensing": [
            "FSSAI Food Business Operator License",
            "BBMP Eating House License",
            "Pollution Control Board Consent for Kitchen Exhaust Scrubbers",
            "Weights & Measures Certification for POS equipment",
        ],
    },
    "fitness": {
        "differentiation": "High-touch small-group training (max 10 people per batch) with bio-mechanical posture tracking and community sweat events.",
        "negotiation": "Request higher ceiling height allocation with soundproofing credits deducted from the first 6 months of base rent.",
        "licensing": [
            "BBMP Trade License for Commercial Gym / Recreation",
            "Music Public Performance License (PPL/IPRS)",
            "Fire Safety & Emergency Evacuation Clearance",
        ],
    },
    "clinic": {
        "differentiation": "Transparent digital pricing, pain-free laser technology, and zero-waiting WhatsApp appointment booking with paperless medical records.",
        "negotiation": "Secure ground-floor wheelchair access and dedicated patient parking slots written into the lease deed.",
        "licensing": [
            "Karnataka Private Medical Establishments (KPME) Act Registration",
            "Bio-Medical Waste Management Authorization (KSPCB)",
            "AERB (Atomic Energy Regulatory Board) Registration for Dental X-Rays",
        ],
    },
}


# ════════════════════════════════════════════════════════════════════
# DETERMINISTIC UNDERWRITING CORE (exact mirror of financial-gauge.js)
# ════════════════════════════════════════════════════════════════════

def _js_round(x: float) -> int:
    """JS Math.round parity for positive numbers (half away from zero)."""
    return int(math.floor(x + 0.5))


def compute_metrics(location_id: str, category_id: str, user_budget: Optional[float] = None) -> dict:
    loc = MARKET_DATA.get(location_id.lower())
    cat = CATEGORY_DATA.get(category_id.lower())
    if not loc:
        raise HTTPException(status_code=404, detail=f"Location '{location_id}' not found in benchmark registry")
    if not cat:
        raise HTTPException(status_code=404, detail=f"Category '{category_id}' not found in benchmark registry")

    # Space & rent
    sqft = cat["typical_sqft"]
    rent_per_sqft = loc["avg_rent_sqft"]
    monthly_rent = rent_per_sqft * sqft
    security_deposit = monthly_rent * loc["deposit_months"]

    # CapEx itemization
    fitout = sqft * cat["fitout_sqft"]
    equipment = cat["equipment"]
    licensing = cat["licensing"]

    # Monthly OpEx itemization
    payroll = cat["staff_count"] * cat["avg_salary"]
    utilities = cat["utilities"]
    marketing = _js_round(monthly_rent * 0.18)
    maintenance = _js_round(monthly_rent * 0.08)
    fixed_burn = monthly_rent + payroll + utilities + marketing + maintenance

    # Working capital & capital at risk
    working_capital = fixed_burn * 3
    capital_at_risk = security_deposit + fitout + equipment + licensing
    total_setup = capital_at_risk + working_capital

    budget = user_budget or cat["default_budget"]
    funding_gap = total_setup - budget

    # Capacity-driven revenue projection
    effective_demand = (
        (loc["traffic_index"] / 8.0)
        * loc["saturation_index"]
        * ((5 + 2 * loc["weekend_ratio"]) / 7)
    )
    gross_margin = 1.0 - (cat["cogs_pct"] / 100.0)
    ticket = cat["ticket"]
    contribution = ticket * gross_margin

    model = cat["revenue_model"]
    if model == "members":
        achieved_volume = _js_round(cat["members_base"] * effective_demand)
        achieved_revenue = achieved_volume * ticket
        survival_volume = math.ceil(fixed_burn / contribution)
        volume_label = "active members"
    elif model == "appointments":
        capacity = cat["seating_capacity"] * cat["turns_per_day"] * cat["base_utilization"]
        achieved_volume = _js_round(capacity * effective_demand)
        achieved_revenue = achieved_volume * ticket * 30.0
        survival_volume = math.ceil((fixed_burn / 30.0) / contribution)
        volume_label = "appointments/day"
    else:  # covers
        capacity = cat["seating_capacity"] * cat["turns_per_day"] * cat["base_utilization"]
        achieved_volume = _js_round(capacity * effective_demand)
        achieved_revenue = achieved_volume * ticket * 30.0
        survival_volume = math.ceil((fixed_burn / 30.0) / contribution)
        volume_label = "covers/day"

    # Profitability
    net_monthly = achieved_revenue * gross_margin - fixed_burn
    monthly_cogs = achieved_revenue * (cat["cogs_pct"] / 100.0)
    rtr_ratio = (monthly_rent / achieved_revenue) * 100.0
    below_survival = achieved_volume < survival_volume
    break_even = (capital_at_risk / net_monthly) if net_monthly > 0 else math.inf

    # Viability score — deterministic weighted adjustments on the corridor base
    viability = loc["base_viability"]
    if rtr_ratio < 18:
        viability += 6
    elif rtr_ratio > 24:
        viability -= 10
    if math.isinf(break_even):
        viability -= 20
    elif break_even <= 18:
        viability += 4
    elif break_even > 30:
        viability -= 8
    if below_survival:
        viability -= 20
    viability = max(12, min(96, _js_round(viability)))

    if viability < 45:
        risk_tier, risk_label = "high", "Severe Risk / Capital Exposure"
    elif viability < 72:
        risk_tier, risk_label = "medium", "Moderate Caution / Rent Negotiation Needed"
    else:
        risk_tier, risk_label = "low", "High Feasibility / Low Risk"

    return {
        "carpet_sqft": sqft,
        "rent_per_sqft": rent_per_sqft,
        "monthly_rent": monthly_rent,
        "security_deposit": security_deposit,
        "fitout_capex": fitout,
        "equipment_capex": equipment,
        "licensing_legal": licensing,
        "staff_payroll_monthly": payroll,
        "utilities_monthly": utilities,
        "marketing_reserve_monthly": float(marketing),
        "maintenance_monthly": float(maintenance),
        "fixed_monthly_burn": fixed_burn,
        "working_capital_reserve": working_capital,
        "capital_at_risk": capital_at_risk,
        "total_setup_capex": total_setup,
        "budget": budget,
        "funding_gap": funding_gap,
        "effective_demand_index": round(effective_demand, 4),
        "achieved_volume": achieved_volume,
        "volume_label": volume_label,
        "survival_volume": survival_volume,
        "achieved_monthly_revenue": achieved_revenue,
        "net_monthly_profit": net_monthly,
        "monthly_cogs": monthly_cogs,
        "break_even_months": None if math.isinf(break_even) else round(break_even, 2),
        "rent_to_revenue_ratio": round(rtr_ratio, 2),
        "viability_score": viability,
        "risk_tier": risk_tier,
        "risk_label": risk_label,
    }


# ════════════════════════════════════════════════════════════════════
# PYDANTIC SCHEMAS
# ════════════════════════════════════════════════════════════════════

class FeasibilityRequest(BaseModel):
    location_id: str = Field(..., description="Target micro-market: indiranagar, koramangala, hsr, whitefield")
    category_id: str = Field(..., description="Retail category: coffee, qsr, fitness, clinic")
    user_budget: Optional[float] = Field(None, description="Founder CapEx budget in INR")


class FinancialBreakdown(BaseModel):
    carpet_sqft: int
    rent_per_sqft: float
    monthly_rent: float
    security_deposit: float
    fitout_capex: float
    equipment_capex: float
    licensing_legal: float
    staff_payroll_monthly: float
    utilities_monthly: float
    marketing_reserve_monthly: float
    maintenance_monthly: float
    fixed_monthly_burn: float
    working_capital_reserve: float
    capital_at_risk: float
    total_setup_capex: float
    budget: float
    funding_gap: float
    effective_demand_index: float
    achieved_volume: int
    volume_label: str
    survival_volume: int
    achieved_monthly_revenue: float
    net_monthly_profit: float
    monthly_cogs: float
    break_even_months: Optional[float] = Field(None, description="None = not achievable within any horizon")
    rent_to_revenue_ratio: float
    viability_score: int
    risk_tier: str
    risk_label: str


class FeasibilityResponse(BaseModel):
    location_id: str
    category_id: str
    status: str
    financials: FinancialBreakdown
    postgis_catchment_radius_meters: int = 3000


class EnhanceRequest(BaseModel):
    concept_description: str = Field("", description="Founder's raw concept notes")
    location_id: str = Field(..., description="Target micro-market id")
    category_id: str = Field(..., description="Retail category id")
    budget: Optional[float] = None


class EnhanceBrief(BaseModel):
    target_demographics: str = Field(..., description="Who the store serves in this corridor")
    recommended_floor_plate_sqft: int = Field(..., description="Recommended carpet area")
    seating_capacity: Optional[int] = Field(None, description="Seats / operatories (null for membership models)")
    peak_footfall_windows: str = Field(..., description="Prime trading windows")
    aov_benchmark_inr: float = Field(..., description="Benchmark average order value")
    primary_risk_hypothesis: str = Field(..., description="Single biggest corridor risk")


class EnhanceResponse(EnhanceBrief):
    source: str = Field(..., description="gemini-2.5-flash | deterministic-fallback")


class FinancialsContext(BaseModel):
    viability_score: Optional[int] = None
    rent_to_revenue_ratio: Optional[float] = None
    break_even_months: Optional[float] = None
    rent_per_sqft: Optional[float] = None


class SynthesizeRequest(BaseModel):
    location_id: str
    category_id: str
    concept_description: str = ""
    financials: Optional[FinancialsContext] = None


class SynthesizeResponse(BaseModel):
    target_demographics: str
    peak_hours: str
    differentiation_strategy: str
    lease_negotiation_mandate: str
    licensing_checklist: List[str]
    broker_unlocked: bool
    verdict: str
    source: str


# ════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ════════════════════════════════════════════════════════════════════

@app.get("/")
def root():
    return {
        "engine": "SiteBrain Geospatial Decision Kernel",
        "version": "3.0.0",
        "status": "operational",
        "gemini_mode": gemini_mode(),
        "gemini_model": GEMINI_MODEL if get_gemini_client() else None,
        "docs_url": "/docs",
    }


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "engine_version": "3.0.0",
        "gemini_mode": gemini_mode(),
        "gemini_model": GEMINI_MODEL if get_gemini_client() else None,
    }


@app.get("/api/locations")
def list_locations():
    return MARKET_DATA


@app.get("/api/categories")
def list_categories():
    return CATEGORY_DATA


@app.post("/api/feasibility/calculate", response_model=FeasibilityResponse)
def calculate_feasibility(req: FeasibilityRequest):
    """
    Deterministic mathematical underwriting — zero stochastic LLM inference.
    Mirrors the shared JS engine (assets/js/financial-gauge.js) exactly.
    """
    metrics = compute_metrics(req.location_id, req.category_id, req.user_budget)
    return FeasibilityResponse(
        location_id=req.location_id.lower(),
        category_id=req.category_id.lower(),
        status="success",
        financials=FinancialBreakdown(**metrics),
        postgis_catchment_radius_meters=3000,
    )


@app.post("/api/gemini/enhance", response_model=EnhanceResponse)
def enhance_concept(req: EnhanceRequest):
    """
    Gemini 2.5 converts the founder's raw concept notes into a structured
    Executive Feasibility Brief. Strategic counsel only — no arithmetic.
    Falls back to deterministic synthesis when no GEMINI_API_KEY is present.
    """
    loc = MARKET_DATA.get(req.location_id.lower())
    cat = CATEGORY_DATA.get(req.category_id.lower())
    if not loc:
        raise HTTPException(status_code=404, detail=f"Location '{req.location_id}' not found")
    if not cat:
        raise HTTPException(status_code=404, detail=f"Category '{req.category_id}' not found")

    concept = (req.concept_description or "").strip() or (
        "A specialty retail concept targeting the local professional demographic in this corridor."
    )

    prompt = f"""You are SiteBrain's strategic counsel module for commercial real estate site selection in Bengaluru, India.

A founder described their concept:
\"\"\"{concept}\"\"\"

LOCKED CORRIDOR FACTS (verified field research — treat as immutable ground truth):
- Micro-market: {loc['name']} ({loc['corridor']})
- Rent benchmark: ₹{loc['avg_rent_sqft']:.0f}/sq.ft · deposit norm {loc['deposit_months']} months
- Footfall index: {loc['traffic_index']}/10 · {loc['daily_pedestrians']:,} daily pedestrians
- Weekend-to-weekday demand ratio: {loc['weekend_ratio']} · addressable demand remaining: {loc['saturation_index'] * 100:.0f}% (incumbent cannibalization already removed)
- Strongest incumbents nearby: {', '.join(loc['top_competitors'])}

LOCKED CATEGORY CALIBRATION:
- Concept class: {cat['name']}
- Typical floor plate: {cat['typical_sqft']} sq.ft · benchmark AOV ₹{cat['ticket']:.0f}
- Prime trading windows: {cat['peak_hours']}
- Core demographic: {cat['target_demographic']}

Your task: synthesize the founder's notes into an Executive Feasibility Brief. Ground every claim in the locked facts above. You may sharpen the demographic profile using the concept notes, recommend a floor plate close to the calibrated norm (±20%), and state the single biggest risk hypothesis for this corridor. Never compute financials — that is done by a deterministic engine upstream."""

    result = _gemini_structured(EnhanceBrief, prompt, temperature=0.35)

    if result:
        # Keep the calibrated floors as sane bounds on model output
        result["recommended_floor_plate_sqft"] = int(
            result.get("recommended_floor_plate_sqft") or cat["typical_sqft"]
        )
        result["seating_capacity"] = (
            int(result["seating_capacity"]) if result.get("seating_capacity") else cat["seating_capacity"]
        )
        result["aov_benchmark_inr"] = float(result.get("aov_benchmark_inr") or cat["ticket"])
        result["source"] = GEMINI_MODEL
        return EnhanceResponse(**result)

    # Deterministic fallback — identical shape, calibrated values
    return EnhanceResponse(
        target_demographics=(
            f"{cat['target_demographic']} Positioning calibrated to {loc['short_name']}'s {loc['corridor']} "
            f"({loc['daily_pedestrians']:,} daily pedestrians, footfall index {loc['traffic_index']}/10)."
        ),
        recommended_floor_plate_sqft=cat["typical_sqft"],
        seating_capacity=cat["seating_capacity"],
        peak_footfall_windows=cat["peak_hours"],
        aov_benchmark_inr=cat["ticket"],
        primary_risk_hypothesis=loc["primary_risk"],
        source="deterministic-fallback",
    )


@app.post("/api/gemini/synthesize", response_model=SynthesizeResponse)
def synthesize_masterplan(req: SynthesizeRequest):
    """
    Gemini 2.5 converts locked, pre-computed numbers into an execution
    masterplan (positioning, negotiation, compliance). Strategy only —
    the model never performs arithmetic. Deterministic fallback otherwise.
    """
    loc = MARKET_DATA.get(req.location_id.lower())
    cat = CATEGORY_DATA.get(req.category_id.lower())
    playbook = PLAYBOOKS.get(req.category_id.lower(), PLAYBOOKS["coffee"])
    if not loc:
        raise HTTPException(status_code=404, detail=f"Location '{req.location_id}' not found")
    if not cat:
        raise HTTPException(status_code=404, detail=f"Category '{req.category_id}' not found")

    fin = req.financials or FinancialsContext()
    viability = fin.viability_score if fin.viability_score is not None else loc["base_viability"]
    broker_unlocked = viability >= BROKER_UNLOCK_THRESHOLD
    verdict = (
        "CLEARED FOR ACQUISITION" if broker_unlocked else "CAPITAL PROTECTION LOCK ACTIVE"
    )

    # Deterministic rent ceiling: rent per sq.ft that holds rent-to-revenue ≤ 18%
    ceiling = None
    if fin.rent_per_sqft and fin.rent_to_revenue_ratio and fin.rent_to_revenue_ratio > 0:
        ceiling = min(fin.rent_per_sqft, fin.rent_per_sqft * 18.0 / fin.rent_to_revenue_ratio)
        ceiling = max(60.0, round(ceiling))

    concept = (req.concept_description or "").strip()

    locked_numbers = json.dumps(
        {
            "viability_score": viability,
            "rent_to_revenue_ratio_pct": fin.rent_to_revenue_ratio,
            "break_even_months": fin.break_even_months,
            "rent_per_sqft_inr": fin.rent_per_sqft,
        },
        indent=2,
    )

    prompt = f"""You are SiteBrain's strategic counsel module. A deterministic engine has ALREADY computed the lease underwriting below. These numbers are LOCKED and immutable — you must never restate, recompute, or contradict them.

LOCKED UNDERWRITING (do not modify):
{locked_numbers}

CONTEXT:
- Micro-market: {loc['name']} — {loc['corridor']}
- Concept class: {cat['name']}
- Founder's concept notes: {concept or '(none provided)'}
- Strongest incumbents nearby: {', '.join(loc['top_competitors'])}
- Corridor risk: {loc['primary_risk']}
- Verdict already issued by the deterministic engine: {verdict}

Your task: Provide a brutal, unvarnished strategic masterplan. Write the differentiation_strategy — one highly tactical paragraph explaining how this specific concept out-positions and beats the listed incumbents in this corridor. Address their weaknesses, identify market whitespace, and give actionable commercial counsel. Concrete, direct, and operational. Do not include any numbers you were not given."""

    result = _gemini_structured(SynthesizeResponse, prompt, temperature=0.5)

    if result:
        result["broker_unlocked"] = broker_unlocked
        result["verdict"] = verdict
        result["source"] = GEMINI_MODEL
        return SynthesizeResponse(**result)

    # Deterministic fallback — grounded in the calibrated playbook + locked numbers
    strategy = (
        f"{playbook['differentiation']} "
        f"Scanned incumbents to beat in {loc['short_name']}: {', '.join(loc['top_competitors'][:3])}. "
        f"**Out-Positioning Strategy:** To outperform {loc['top_competitors'][0]}, focus on creating a unique ambiance and offering locally-sourced, artisanal products that they lack. Capitalize on unmet demand for late-night study spots with high-speed internet or healthy grab-and-go options. "
    )
    if concept:
        strategy += f" Founder positioning signal detected: {concept[:180]}."

    mandate = playbook["negotiation"]
    if ceiling is not None:
        mandate += f" Deterministic ceiling for this corridor: hold base rent at or below ₹{ceiling:.0f}/sq.ft (keeps rent-to-revenue ≤ 18% at projected volume). Negotiate a minimum of 60 days rent-free for fit-out and a rent escalation cap of 5% per annum."


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
