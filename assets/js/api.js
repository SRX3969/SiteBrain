/**
 * ═══════════════════════════════════════════════════════════════════
 * SITEBRAIN — BACKEND API CLIENT
 * Talks to the FastAPI service (default http://localhost:8000).
 * Every call fails soft: returns null on any error so the workbench
 * can fall back to the local deterministic engine without disruption.
 * ═══════════════════════════════════════════════════════════════════
 */

window.SiteBrainAPI = (function () {
  'use strict';

  // Default local dev target; override with window.SITEBRAIN_API_BASE before this script loads
  const BASE = window.SITEBRAIN_API_BASE || 'http://localhost:8000';
  const TIMEOUT_MS = 9000;

  async function _fetchJSON(path, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || TIMEOUT_MS);
    try {
      const res = await fetch(BASE + path, Object.assign({}, options, { signal: controller.signal }));
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function _post(path, body) {
    return _fetchJSON(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  /** GET /api/health — probe whether the FastAPI service is reachable */
  async function health() {
    const data = await _fetchJSON('/api/health', { method: 'GET' }, 2500);
    return !!(data && data.status === 'ok');
  }

  /**
   * POST /api/feasibility/calculate
   * Deterministic underwriting numbers from the Python math core.
   * Returns null when the backend is offline (caller uses local engine).
   */
  async function calculateFeasibility(payload) {
    return _post('/api/feasibility/calculate', {
      location_id: payload.locationId,
      category_id: payload.categoryId,
      user_budget: payload.budget || null
    });
  }

  /**
   * POST /api/gemini/enhance
   * Real Gemini 2.5 synthesis of the founder's raw concept notes into a
   * structured Executive Feasibility Brief. Response shape:
   *   { target_demographics, recommended_floor_plate_sqft, seating_capacity,
   *     peak_footfall_windows, aov_benchmark_inr, primary_risk_hypothesis,
   *     source: "gemini-2.5-flash" | "deterministic-fallback" }
   * Returns null when offline (caller uses local synthesis).
   */
  async function enhanceConcept(payload) {
    return _post('/api/gemini/enhance', {
      concept_description: payload.conceptText || '',
      location_id: payload.locationId,
      category_id: payload.categoryId,
      budget: payload.budget || null
    });
  }

  /**
   * POST /api/gemini/synthesize
   * Final execution masterplan synthesis (strategy, negotiation, licensing).
   */
  async function synthesizeMasterplan(payload) {
    return _post('/api/gemini/synthesize', {
      location_id: payload.locationId,
      category_id: payload.categoryId,
      concept_description: payload.conceptText || '',
      financials: payload.financials
    });
  }

  return {
    health,
    calculateFeasibility,
    enhanceConcept,
    synthesizeMasterplan
  };
})();
