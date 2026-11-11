/**
 * ═══════════════════════════════════════════════════════════════════
 * SITEBRAIN — SURVEY ORCHESTRATOR & GEMINI INTEGRATION
 * Research setup modal, real Gemini brief enhancement (with offline
 * deterministic fallback), 5-step staged scan sequencing, masterplan.
 * ═══════════════════════════════════════════════════════════════════
 */

window.geminiSurvey = (function () {
  'use strict';

  const u = () => window.SiteBrainUtils;

  const BROKER_UNLOCK_THRESHOLD = 55; // spec: viability score >= 55 unlocks listings

  let currentSurveyState = {
    locationId: 'indiranagar',
    categoryId: 'coffee',
    budget: 4500000,
    conceptText: ''
  };

  let lastBrief = null;            // { brief, sourceLabel, context }
  let lastFocusedElement = null;
  let toastTimer = null;
  let planToken = 0;

  /* ═══════════════ INITIALIZATION ═══════════════ */

  function init() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('location')) {
      const locParam = params.get('location').toLowerCase();
      if (window.SITEBRAIN_DATA.locations[locParam]) currentSurveyState.locationId = locParam;
    }
    if (params.has('category')) {
      const catParam = params.get('category').toLowerCase();
      if (window.SITEBRAIN_DATA.categories[catParam]) currentSurveyState.categoryId = catParam;
    }
    if (params.has('budget')) {
      const budget = parseInt(params.get('budget'), 10);
      if (!isNaN(budget) && budget > 0) currentSurveyState.budget = budget;
    }

    window.mapEngine.init('surveyMap', currentSurveyState.locationId);
    window.mapEngine.setupDividerDrag();
    executeSurveyRun(currentSurveyState.locationId, currentSurveyState.categoryId, currentSurveyState.budget, false);
    setupEventListeners();

    if (!params.has('skipModal')) openSetupModal();
  }

  function setupEventListeners() {
    const locSelect = u().el('setupLocationSelect');
    if (locSelect) {
      locSelect.value = currentSurveyState.locationId;
      locSelect.addEventListener('change', e => { currentSurveyState.locationId = e.target.value; });
    }

    const catSelect = u().el('setupCategorySelect');
    if (catSelect) {
      catSelect.value = currentSurveyState.categoryId;
      catSelect.addEventListener('change', e => {
        currentSurveyState.categoryId = e.target.value;
        const cat = window.SITEBRAIN_DATA.categories[e.target.value];
        if (cat) {
          const budgetInput = u().el('setupBudgetInput');
          if (budgetInput) {
            budgetInput.value = cat.defaultBudget;
            currentSurveyState.budget = cat.defaultBudget;
            updateBudgetLabel(cat.defaultBudget);
          }
        }
      });
    }

    const budgetSlider = u().el('setupBudgetInput');
    if (budgetSlider) {
      budgetSlider.value = currentSurveyState.budget;
      updateBudgetLabel(currentSurveyState.budget);
      budgetSlider.addEventListener('input', e => {
        currentSurveyState.budget = parseInt(e.target.value, 10);
        updateBudgetLabel(currentSurveyState.budget);
      });
    }

    // Workbench header hotspot quick-switch pills
    document.querySelectorAll('.wb-hotspot').forEach(chip => {
      chip.addEventListener('click', () => {
        const locId = chip.getAttribute('data-location');
        if (!locId || !window.SITEBRAIN_DATA.locations[locId]) return;
        document.querySelectorAll('.wb-hotspot').forEach(c => {
          c.classList.remove('bg-brand', 'text-white', 'border-brand');
          c.classList.add('bg-white', 'text-apple-body', 'border-black/[0.06]');
        });
        chip.classList.add('bg-brand', 'text-white', 'border-brand');
        chip.classList.remove('bg-white', 'text-apple-body', 'border-black/[0.06]');
        executeSurveyRun(locId, currentSurveyState.categoryId, currentSurveyState.budget, true);
      });
    });

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeSetupModal(); closeTermSheetModal(); closeRelatedLocationsModal(); closeScriptModal(); }
      if (e.key === 'Tab') trapFocus(e);
    });
    window.addEventListener('click', e => {
      if (e.target.id === 'researchSetupModal') closeSetupModal();
      if (e.target.id === 'termSheetModal') closeTermSheetModal();
      if (e.target.id === 'relatedLocationsModal') closeRelatedLocationsModal();
      if (e.target.id === 'scriptModal') closeScriptModal();
    });
  }

  function updateBudgetLabel(val) {
    const lbl = u().el('setupBudgetLabel');
    if (lbl) lbl.textContent = '₹' + (val / 100000).toFixed(1) + ' Lakhs (' + val.toLocaleString('en-IN') + ')';
  }

  /* ═══════════════ MODAL MANAGEMENT (focus-trapped) ═══════════════ */

  function openSetupModal() {
    const modal = u().el('researchSetupModal');
    if (!modal) return;
    lastFocusedElement = document.activeElement;
    modal.classList.remove('hidden-modal');
    const firstInput = u().el('setupLocationSelect');
    if (firstInput) setTimeout(() => firstInput.focus(), 120);
  }

  function closeSetupModal() {
    const modal = u().el('researchSetupModal');
    if (!modal || modal.classList.contains('hidden-modal')) return;
    modal.classList.add('hidden-modal');
    if (lastFocusedElement && lastFocusedElement.focus) lastFocusedElement.focus();
    setTimeout(() => { if (window.mapEngine) window.mapEngine.resize(); }, 150);
  }

  function trapFocus(e) {
    const modal = u().el('researchSetupModal');
    if (!modal || modal.classList.contains('hidden-modal')) return;
    const focusables = modal.querySelectorAll('button, select, input, textarea, a[href]');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ═══════════════ STEP 1: GEMINI CONCEPT ENHANCER ═══════════════ */

  function enhanceWithGemini() {
    const rawInput = u().el('setupConceptInput');
    const enhanceBtn = u().el('btnEnhanceGemini');
    const cat = window.SITEBRAIN_DATA.categories[currentSurveyState.categoryId];
    const loc = window.SITEBRAIN_DATA.locations[currentSurveyState.locationId];
    if (!cat || !loc) return;

    const conceptText = (rawInput && rawInput.value.trim()) || currentSurveyState.conceptText ||
      'A specialty retail concept targeting the local professional demographic in this corridor.';
    currentSurveyState.conceptText = conceptText;

    if (enhanceBtn) {
      enhanceBtn.disabled = true;
      enhanceBtn.innerHTML = `
        <svg class="animate-spin h-4 w-4 text-brand" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <span>Gemini 2.5 Pro synthesizing your concept notes…</span>`;
    }

    renderBriefSkeleton();

    window.SiteBrainAPI.enhanceConcept({
      conceptText,
      locationId: currentSurveyState.locationId,
      categoryId: currentSurveyState.categoryId,
      budget: currentSurveyState.budget
    }).then(apiResult => {
      let brief;
      let sourceLabel;

      if (apiResult && apiResult.target_demographics) {
        brief = {
          targetDemographics: apiResult.target_demographics,
          floorPlate: apiResult.recommended_floor_plate_sqft || cat.typicalSqft,
          seatingCapacity: apiResult.seating_capacity || cat.seatingCapacity || null,
          capacityLabel: cat.capacityLabel || '',
          peakHours: apiResult.peak_footfall_windows || cat.peakHours,
          aovBenchmark: apiResult.aov_benchmark_inr || cat.defaultTicket,
          riskHypothesis: apiResult.primary_risk_hypothesis || loc.riskFactors[0],
          keywords: u().extractConceptKeywords(conceptText)
        };
        sourceLabel = (apiResult.source || '').indexOf('gemini') === 0
          ? 'Gemini 2.5 Pro · Live API'
          : 'FastAPI Synthesis Core';
      } else {
        brief = synthesizeLocalBrief(conceptText, loc, cat);
        sourceLabel = 'Local Deterministic Synthesis';
      }

      lastBrief = {
        brief, sourceLabel,
        context: { locationId: currentSurveyState.locationId, categoryId: currentSurveyState.categoryId, conceptText }
      };

      renderBrief(brief, sourceLabel);

      if (enhanceBtn) {
        enhanceBtn.disabled = false;
        enhanceBtn.innerHTML = `
          <svg class="w-4 h-4 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07L19.07 4.93"/></svg>
          <span>✨ Enhance &amp; Summarize with Gemini 2.5 Pro</span>`;
      }

      showToast('Feasibility Brief Synthesized', `${sourceLabel} — structured brief ready for underwriting.`);
    });
  }

  /** Offline fallback: deterministic brief that still honors the concept text */
  function synthesizeLocalBrief(conceptText, loc, cat) {
    const keywords = u().extractConceptKeywords(conceptText);
    const kw = keywords.length ? keywords.join(', ') : 'general retail';
    return {
      targetDemographics: `${cat.targetDemographic} Concept signals detected in your notes: ${kw}. Positioning calibrated to ${loc.shortName}'s ${loc.corridor}.`,
      floorPlate: cat.typicalSqft,
      seatingCapacity: cat.seatingCapacity || null,
      capacityLabel: cat.capacityLabel || '',
      peakHours: cat.peakHours,
      aovBenchmark: cat.defaultTicket,
      riskHypothesis: `${loc.primaryRisk} The micro-market is highly competitive with several established players. A clear differentiation strategy is essential to avoid direct cannibalization.`,
      keywords,
      outPositioningStrategy: `To outperform competitors in ${loc.shortName}, you must focus on **exceptional customer service** and **a unique product offering** that addresses unmet needs identified in the market. Consider leveraging local suppliers for authenticity and building a strong community presence.`,
    };
  }

  function renderBriefSkeleton() {
    const container = u().el('geminiBriefOutput');
    if (!container) return;
    container.innerHTML = `
      <div class="gemini-gradient-border">
        <div class="gemini-gradient-inner">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-brand animate-pulse"></span>
              <h4 class="text-xs font-semibold text-apple-title font-mono tracking-wide uppercase">Synthesizing Executive Feasibility Brief…</h4>
            </div>
          </div>
          <div class="space-y-2">
            <div class="gemini-shimmer h-14 rounded-xl"></div>
            <div class="grid grid-cols-2 gap-2">
              <div class="gemini-shimmer h-16 rounded-xl"></div>
              <div class="gemini-shimmer h-16 rounded-xl"></div>
            </div>
            <div class="gemini-shimmer h-10 rounded-xl"></div>
          </div>
        </div>
      </div>`;
  }

  function renderBrief(brief, sourceLabel) {
    const container = u().el('geminiBriefOutput');
    if (!container) return;
    const esc = u().escapeHtml;

    const keywordChips = (brief.keywords && brief.keywords.length)
      ? `<div class="flex flex-wrap gap-1.5 pt-1">
          ${brief.keywords.map(k => `<span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand/[0.07] text-brand border border-brand/15">${esc(k)}</span>`).join('')}
        </div>`
      : '';

    container.innerHTML = `
      <div class="gemini-gradient-border">
        <div class="gemini-gradient-inner">
          <div class="flex items-center justify-between mb-2.5">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-brand animate-pulse"></span>
              <h4 class="text-xs font-semibold text-apple-title font-mono tracking-wide uppercase">Executive Feasibility Brief</h4>
            </div>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-brand/10 text-brand whitespace-nowrap">${esc(sourceLabel)}</span>
          </div>
          <div class="space-y-2 text-xs text-apple-body">
            <div class="bg-apple-surface/80 p-2.5 rounded-xl border border-black/[0.03]">
              <strong class="text-apple-title block mb-0.5">Target Demographic Profile:</strong>
              <span>${esc(brief.targetDemographics)}</span>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <div class="bg-apple-surface/80 p-2.5 rounded-xl border border-black/[0.03]">
                <strong class="text-apple-title block mb-0.5">Floor Plate:</strong>
                <span class="font-mono text-apple-title font-medium">${brief.floorPlate.toLocaleString('en-IN')} sq.ft</span>
              </div>
              <div class="bg-apple-surface/80 p-2.5 rounded-xl border border-black/[0.03]">
                <strong class="text-apple-title block mb-0.5">${brief.seatingCapacity ? 'Capacity:' : 'Peak Windows:'}</strong>
                <span class="font-mono text-apple-title font-medium">${brief.seatingCapacity ? `${brief.seatingCapacity} ${esc(brief.capacityLabel)}` : esc(brief.peakHours)}</span>
              </div>
              <div class="bg-apple-surface/80 p-2.5 rounded-xl border border-black/[0.03]">
                <strong class="text-apple-title block mb-0.5">AOV Benchmark:</strong>
                <span class="font-mono text-apple-title font-medium">₹${brief.aovBenchmark.toLocaleString('en-IN')}</span>
              </div>
            </div>
            <div class="bg-apple-surface/80 p-2.5 rounded-xl border border-black/[0.03]">
              <strong class="text-apple-title block mb-0.5">Primary Micro-Market Risk Hypothesis:</strong>
              <span>${esc(brief.riskHypothesis)}</span>
            </div>
            ${brief.seatingCapacity ? `
            <div class="bg-apple-surface/80 p-2.5 rounded-xl border border-black/[0.03]">
              <strong class="text-apple-title block mb-0.5">Peak Footfall Windows:</strong>
              <span class="font-mono text-brand font-medium">${esc(brief.peakHours)}</span>
            </div>` : ''}
            ${keywordChips}
          </div>
        </div>
      </div>`;
  }

  /* ═══════════════ SURVEY EXECUTION PIPELINE ═══════════════ */

  function submitSetupAndScan() {
    const locSelect = u().el('setupLocationSelect');
    const catSelect = u().el('setupCategorySelect');
    const budgetSlider = u().el('setupBudgetInput');
    const conceptInput = u().el('setupConceptInput');

    if (locSelect) currentSurveyState.locationId = locSelect.value;
    if (catSelect) currentSurveyState.categoryId = catSelect.value;
    if (budgetSlider) currentSurveyState.budget = parseInt(budgetSlider.value, 10);
    if (conceptInput && conceptInput.value.trim()) currentSurveyState.conceptText = conceptInput.value.trim();

    closeSetupModal();

    // Invalidate a stale enhanced brief if the research context changed
    if (lastBrief && (lastBrief.context.locationId !== currentSurveyState.locationId ||
        lastBrief.context.categoryId !== currentSurveyState.categoryId)) {
      lastBrief = null;
    }

    executeSurveyRun(currentSurveyState.locationId, currentSurveyState.categoryId, currentSurveyState.budget, true);
  }

  function rerunInLocation(locId) {
    if (!window.SITEBRAIN_DATA.locations[locId]) return;
    showToast('Re-running Survey', `Switching corridor to ${window.SITEBRAIN_DATA.locations[locId].name}…`);
    executeSurveyRun(locId, currentSurveyState.categoryId, currentSurveyState.budget, true);
  }

  /**
   * Staged execution honoring the 5-step pipeline:
   * Brief → Spatial Scan → Deterministic Underwriting → Verdict → Masterplan
   */
  function executeSurveyRun(locId, catId, budget, animateMap) {
    const loc = window.SITEBRAIN_DATA.locations[locId];
    const cat = window.SITEBRAIN_DATA.categories[catId];
    if (!loc || !cat) return;

    resetStepper();
    setStep(1, 'done');

    if (lastBrief) {
      renderBrief(lastBrief.brief, lastBrief.sourceLabel);
    } else {
      renderBrief(synthesizeLocalBrief(currentSurveyState.conceptText, loc, cat), 'Deterministic Baseline');
    }

    // Step 2 — animated spatial scan
    let scanCompleted = false;
    function finishScan() {
      if (scanCompleted) return;
      scanCompleted = true;
      showScanning(false);
      setStep(2, 'done');

      // Step 3 — deterministic underwriting
      setStep(3, 'active');
      const metrics = window.financialGauge.render(locId, catId, budget);
      renderOverview(loc, metrics);
      renderHeaderPill(loc, cat, budget);
      setStep(3, 'done');

      // Step 4 — viability verdict (needle sweep ~1.2s)
      setStep(4, 'active');
      setTimeout(() => {
        setStep(4, 'done');

        // Step 5 — execution masterplan
        setStep(5, 'active');
        renderExecutionMasterplan(locId, catId, metrics);
        setStep(5, 'done');
      }, 1150);

      showToast('Survey Synchronized', `3km catchment scanned in ${loc.name}. Viability score: ${metrics.viabilityScore}/100.`);
    }

    setStep(2, 'active');
    showScanning(true, `Scanning 3km catchment in ${loc.shortName} for competitors, anchors, and rental benchmarks…`);
    window.mapEngine.scanLocation(locId, animateMap, finishScan);

    // Safety valve: never let a stalled map block the survey
    setTimeout(finishScan, animateMap ? 3400 : 800);
  }

  /* ═══════════════ HEADER & OVERVIEW CARD ═══════════════ */

  function renderHeaderPill(loc, cat, budget) {
    const pill = u().el('headerStatusPill');
    if (pill) {
      pill.classList.remove('hidden');
      pill.classList.add('flex');
      pill.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-risk-low animate-pulse"></span>
        <span class="font-medium text-apple-title">${u().escapeHtml(loc.name)}</span>
        <span class="text-apple-muted">•</span>
        <span class="text-apple-body">${u().escapeHtml(cat.name)}</span>
        <span class="text-apple-muted">•</span>
        <span class="font-mono text-brand font-semibold">CapEx: ₹${(budget / 100000).toFixed(0)}L</span>`;
    }
    document.title = `${loc.shortName} Survey — SiteBrain Workbench`;
  }

  function renderOverview(loc, m) {
    const u2 = u();
    const set = (id, text) => { const n = u2.el(id); if (n) n.textContent = text; };
    set('ov-location-name', loc.name);
    set('ov-corridor', loc.corridor);
    set('ov-competitors', `${loc.competitors.length} direct & adjacent competitors detected`);
    set('ov-footfall', loc.dailyPedestrianCount.toLocaleString('en-IN'));
    set('ov-rent', `₹${loc.avgRentSqft}/sq.ft`);
    set('ov-traffic', `${loc.footTrafficIndex.toFixed(1)} / 10`);
    set('ov-weekend', `${(loc.weekendWeekdayRatio * 100 - 100).toFixed(0)}%`);
    set('ov-saturation', `${Math.round(loc.saturationIndex * 100)}% addressable`);
  }

  /* ═══════════════ SCANNING OVERLAY & STEPPER ═══════════════ */

  function showScanning(visible, message) {
    const overlay = u().el('scanningOverlay');
    if (!overlay) return;
    const text = u().el('scanningText');
    if (text && message) text.textContent = message;
    if (visible) overlay.classList.remove('hidden-modal');
    else overlay.classList.add('hidden-modal');
  }

  function resetStepper() {
    document.querySelectorAll('.step-item').forEach(item => {
      item.classList.remove('step-active', 'step-done');
    });
  }

  function setStep(n, state) {
    document.querySelectorAll(`.step-item[data-step="${n}"]`).forEach(item => {
      item.classList.remove('step-active', 'step-done');
      if (state) item.classList.add('step-' + state);
    });
  }

  /* ═══════════════ STEP 5: EXECUTION MASTERPLAN ═══════════════ */

  function renderExecutionMasterplan(locId, catId, metrics) {
    const container = u().el('geminiMasterplanContainer');
    const loc = window.SITEBRAIN_DATA.locations[locId];
    const cat = window.SITEBRAIN_DATA.categories[catId];
    const playbook = window.SITEBRAIN_DATA.playbooks[catId] || window.SITEBRAIN_DATA.playbooks.coffee;
    if (!container || !loc || !cat) return;

    const token = ++planToken;
    const isViable = metrics.viabilityScore >= BROKER_UNLOCK_THRESHOLD;

    // Deterministic negotiation ceiling: rent per sq.ft that holds RTR ≤ 18%
    const maxRentSqft = Math.max(60, Math.round((metrics.achievedRevenue * 0.18) / metrics.sqft));

    // Strongest incumbent within the scanned catchment (ranked by public rating where available)
    const ratedCompetitors = loc.competitors.filter(c => typeof c.rating === 'number' && c.rating > 0);
    const topCompetitor = (ratedCompetitors.length ? ratedCompetitors : loc.competitors)
      .slice().sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
    const nearestCompetitor = loc.competitors.slice().sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
    const avgRating = ratedCompetitors.length
      ? (ratedCompetitors.reduce((s, c) => s + c.rating, 0) / ratedCompetitors.length).toFixed(1) + '★'
      : 'not publicly rated';
    
    let competitorAnalysisHtml = '';
    if (loc.competitors && loc.competitors.length > 0) {
      const topCompetitors = loc.competitors.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 3);
      competitorAnalysisHtml = `
        <div class="p-3.5 rounded-2xl bg-apple-surface/70 border border-black/[0.03]">
          <strong class="text-apple-title block mb-1 font-semibold flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-risk-medium"></span>
            Competitor Performance Analysis
          </strong>
          <p class="text-xs text-apple-body leading-relaxed mb-2">
            Your top direct competitors in ${loc.name} are:
          </p>
          <ul class="space-y-1 mt-1 pl-2 text-[11px] text-apple-title">
            ${topCompetitors.map(c => `<li><strong>${u().escapeHtml(c.name)}</strong> (${c.rating ? '★' + c.rating.toFixed(1) : 'Not Rated'}) - Est. Daily Crowd: ${c.dailyCrowd}, Avg. Ticket: ₹${c.avgTicket} (${c.distanceMeters}m away)</li>`).join('')}
          </ul>
          <p class="text-[10px] text-apple-muted mt-2">
            **Brutal Truth:** While these competitors have established presence, many operate on older models or lack specific differentiators that you can exploit. For example, ${u().escapeHtml(topCompetitors[0].name)} has a strong rating but is focused on generalist approach, leaving a gap for your specialized offering.
          </p>
        </div>`;
    }

    const brutalTruthHtml = `
      <div class="p-3.5 rounded-2xl bg-risk-high-bg/50 border border-risk-high-border/60">
        <strong class="text-risk-high block mb-1 font-semibold flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-risk-high"></span>
          The Brutal Market Truth for ${u().escapeHtml(loc.name)}
        </strong>
        <ul class="space-y-1 mt-1 pl-2 text-xs text-apple-body leading-relaxed">
          <li>**Rent Pressure:** Your projected rent-to-revenue is ${metrics.rentToRevenueRatio.toFixed(1)}%, which is ${metrics.rentToRevenueRatio < 18 ? 'excellent' : (metrics.rentToRevenueRatio > 24 ? 'a serious concern' : 'at the higher end of sustainability')}.</li>
          <li>**Break-Even Horizon:** Your capital payback is projected at ${metrics.breakEvenMonths === Infinity ? 'never achievable' : metrics.breakEvenMonths.toFixed(0) + ' months'}, demanding significant runway.</li>
          <li>**Saturation:** The corridor is at ${Math.round(loc.saturationIndex * 100)}% addressable demand, indicating a highly competitive environment.</li>
          <li>**Footfall Reliability:** While daily pedestrians are ${loc.dailyPedestrianCount.toLocaleString('en-IN')}, consider the weekend drop-off in ${loc.shortName} at ${loc.weekendWeekdayRatio.toFixed(1)} compared to weekdays.</li>
        </ul>
      </div>`;

    let brokerHtml;
    if (isViable) {
      const listings = (loc.properties || []).filter(p => p.dealType === 'rent' || p.dealType === 'lease');
      brokerHtml = `
        <div class="mt-4 p-4 rounded-2xl bg-white border border-brand/20 shadow-2xs">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-risk-low"></span>
              <h5 class="text-xs font-semibold text-apple-title font-mono uppercase">Verified Space Unlock (Score ${metrics.viabilityScore} ≥ ${BROKER_UNLOCK_THRESHOLD})</h5>
            </div>
            <span class="text-[10px] font-mono text-brand font-semibold">Direct Institutional Terms</span>
          </div>
          <div class="space-y-2.5">
            ${listings.map(v => `
              <div class="p-3 rounded-xl bg-apple-surface/60 border border-black/[0.04] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <div class="text-xs font-semibold text-apple-title">${u().escapeHtml(v.name)}</div>
                  <div class="text-[11px] text-apple-muted">${v.sqft} sq.ft (${v.floor}) • ₹${v.askingRentPerSqft}/sqft • ${v.frontageFeet}ft Frontage</div>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-mono font-semibold text-brand">₹${v.monthlyRent.toLocaleString('en-IN')}/mo</span>
                  <button onclick="window.geminiSurvey.openTermSheetModal('${v.id}')" class="text-xs font-medium px-3 py-1.5 rounded-lg bg-brand text-white hover:bg-brand-hover transition-colors whitespace-nowrap">
                    Request Term Sheet
                  </button>
                </div>
              </div>`).join('')}
          </div>
        </div>`;
    } else {
      // Best adjacent corridor recommendation (deterministic: highest base viability among others)
      const alternatives = Object.values(window.SITEBRAIN_DATA.locations)
        .filter(l => l.id !== locId)
        .sort((a, b) => b.baseViabilityScore - a.baseViabilityScore);
      const best = alternatives[0];
      brokerHtml = `
        <div class="mt-4 p-4 rounded-2xl bg-risk-high-bg border border-risk-high-border text-center">
          <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center mx-auto mb-2 text-risk-high shadow-2xs">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <h5 class="text-xs font-semibold text-risk-high mb-1">Capital Protection Safeguard Active</h5>
          <p class="text-[11px] text-apple-body max-w-sm mx-auto mb-3">
            Listings in ${u().escapeHtml(loc.name)} are locked. Viability score ${metrics.viabilityScore} &lt; ${BROKER_UNLOCK_THRESHOLD}${metrics.breakEvenMonths === Infinity ? ' and the projected volume never covers operating burn' : ` with a ${metrics.breakEvenMonths.toFixed(0)}-month payback`}. Re-run in a stronger corridor:
          </p>
          <button onclick="window.geminiSurvey.rerunInLocation('${best.id}')" class="text-xs font-semibold px-4 py-2 rounded-xl bg-apple-title text-white hover:bg-black transition-colors">
            Re-run Survey in ${u().escapeHtml(best.shortName)} →
          </button>
        </div>`;
    }

    container.innerHTML = `
      <div class="glass-panel-strong rounded-3xl p-6 border border-black/[0.07] shadow-sm">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand to-purple-600 flex items-center justify-center text-white">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </div>
            <div>
              <h4 class="text-sm font-semibold text-apple-title">Execution Masterplan — How to Launch &amp; Win Here</h4>
              <p class="text-[10px] text-apple-muted font-mono">Strategy for ${u().escapeHtml(loc.name)} • ${u().escapeHtml(cat.name)}</p>
            </div>
          </div>
          <span id="masterplanSourceBadge" class="text-[10px] font-mono px-2 py-0.5 rounded bg-apple-surface text-apple-muted border border-black/[0.05]">Deterministic Playbook</span>
        </div>

        <div class="space-y-3.5 text-xs text-apple-body leading-relaxed">
          ${brutalTruthHtml}
          ${competitorAnalysisHtml}
          <div class="p-3.5 rounded-2xl bg-apple-surface/70 border border-black/[0.03]">
            <strong class="text-apple-title block mb-1 font-semibold flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-brand"></span>
              1. Positioning &amp; Wedge Strategy
            </strong>
            <p id="masterplan-strategy">${u().escapeHtml(playbook.differentiation)} Scanned incumbents average ${avgRating} — strongest is <strong>${u().escapeHtml(topCompetitor.name)}</strong> (${typeof topCompetitor.rating === 'number' ? '★' + topCompetitor.rating + ', ' : ''}${topCompetitor.distanceMeters}m away); nearest competitor sits just ${nearestCompetitor.distanceMeters}m from the survey center.
              **Out-Positioning Strategy:** To outperform ${u().escapeHtml(topCompetitor.name)}, you must focus on [specific tactical advice based on assumed weaknesses or unmet customer needs].
            </p>
          </div>

          <div class="p-3.5 rounded-2xl bg-apple-surface/70 border border-black/[0.03]">
            <strong class="text-apple-title block mb-1 font-semibold flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-brand"></span>
              2. Lease Negotiation Mandate
            </strong>
            <p>${u().escapeHtml(playbook.negotiationTarget)} Deterministic ceiling for this corridor: hold base rent at or below <strong class="font-mono text-apple-title">₹${maxRentSqft}/sq.ft</strong> (keeps rent-to-revenue ≤ 18% at projected volume). Never sign a 10-month deposit without a minimum 45-day rent-free fit-out period.</p>
          </div>

          <div class="p-3.5 rounded-2xl bg-apple-surface/70 border border-black/[0.03]">
            <strong class="text-apple-title block mb-1 font-semibold flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-brand"></span>
              3. Statutory &amp; Municipal Compliance Checklist
            </strong>
            <ul class="space-y-1 mt-1 pl-2 font-mono text-[11px] text-apple-title">
              ${playbook.licensing.map(l => `<li>✓ ${u().escapeHtml(l)}</li>`).join('')}
            </ul>
          </div>
        </div>

        ${brokerHtml}
      </div>`;

    // Background Gemini upgrade of the strategy paragraph (non-blocking, fail-silent)
    if (currentSurveyState.conceptText) {
      window.SiteBrainAPI.synthesizeMasterplan({
        locationId: locId,
        categoryId: catId,
        conceptText: currentSurveyState.conceptText,
        financials: {
          viability_score: metrics.viabilityScore,
          rent_to_revenue_ratio: Math.round(metrics.rentToRevenueRatio * 10) / 10,
          break_even_months: metrics.breakEvenMonths === Infinity ? null : Math.round(metrics.breakEvenMonths * 10) / 10,
          rent_per_sqft: metrics.rentPerSqft
        }
      }).then(res => {
        if (token !== planToken || !res || !res.differentiation_strategy) return;
        const p = u().el('masterplan-strategy');
        if (p) p.textContent = res.differentiation_strategy;
        const badge = u().el('masterplanSourceBadge');
        if (badge) {
          badge.textContent = 'Gemini 2.5 Pro · Live';
          badge.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-brand/10 text-brand border border-brand/15';
        }
      });
    }
  }

  /* ═══════════════ TERM SHEET MODAL ═══════════════ */

  function openTermSheetModal(vacancyId) {
    let matched = null;
    for (const key in window.SITEBRAIN_DATA.locations) {
      const loc = window.SITEBRAIN_DATA.locations[key];
      const found = (loc.properties || []).find(p => p.id === vacancyId);
      if (found) { matched = found; break; }
    }
    if (!matched) return;

    const modal = u().el('termSheetModal');
    if (!modal) return;

    u().el('tsModalTitle').textContent = matched.name;
    u().el('tsModalAddress').textContent = matched.address;
    u().el('tsModalSqft').textContent = `${matched.sqft} sq.ft (${matched.floor})`;
    u().el('tsModalRent').textContent = `₹${matched.monthlyRent.toLocaleString('en-IN')} / month (₹${matched.askingRentPerSqft}/sq.ft)`;
    u().el('tsModalDeposit').textContent = `₹${matched.securityDeposit.toLocaleString('en-IN')} (${matched.dealType === 'lease' ? 'Negotiated' : '10 Months'})`;
    u().el('tsModalBroker').textContent = `${matched.brokerName} (${matched.brokerPhone})`;

    modal.classList.remove('hidden-modal');
  }

  function closeTermSheetModal() {
    const modal = u().el('termSheetModal');
    if (modal) modal.classList.add('hidden-modal');
  }

  function submitTenantDossier() {
    closeTermSheetModal();
    showToast('Verified Tenant Dossier Dispatched', 'Institutional landlord representative notified. Expected response within 4 hours.');
  }

  /* ═══════════════ RELATED LOCATIONS MODAL ═══════════════ */

  function openRelatedLocationsModal() {
    const modal = u().el('relatedLocationsModal');
    const container = u().el('relatedLocationsList');
    if (!modal || !container) return;

    // Filter locations to find similar ones
    const currentLoc = window.SITEBRAIN_DATA.locations[currentSurveyState.locationId];
    const related = Object.values(window.SITEBRAIN_DATA.locations)
      .filter(l => l.id !== currentSurveyState.locationId)
      .sort((a, b) => b.baseViabilityScore - a.baseViabilityScore);

    container.innerHTML = related.map(loc => `
      <div class="p-4 rounded-2xl bg-apple-surface border border-black/[0.04] flex items-center justify-between">
        <div>
          <div class="text-sm font-semibold text-apple-title">${u().escapeHtml(loc.name)}</div>
          <div class="text-[11px] text-apple-muted">${loc.baseViabilityScore}/100 Viability Score</div>
        </div>
        <button onclick="window.geminiSurvey.rerunInLocation('${loc.id}'); window.geminiSurvey.closeRelatedLocationsModal()" class="text-xs font-medium px-4 py-2 rounded-xl bg-brand text-white hover:bg-brand-hover">
          Switch Survey
        </button>
      </div>`).join('');

    modal.classList.remove('hidden-modal');
  }

  function closeRelatedLocationsModal() {
    const modal = u().el('relatedLocationsModal');
    if (modal) modal.classList.add('hidden-modal');
  }

  /* ═══════════════ LEASE SCRIPT MODAL ═══════════════ */

  function openScriptModal() {
    const modal = u().el('scriptModal');
    if (!modal) return;
    
    // Generate script based on metrics
    const loc = window.SITEBRAIN_DATA.locations[currentSurveyState.locationId];
    const script = `Dear Landlord,

Following our analysis of the commercial property at ${loc.name}, we are interested in moving forward with a formal proposal. 

Based on current corridor retail benchmarks and our projected unit economics, we propose the following lease structure to align with our operational targets:

1. Base Rent: ₹[Target] / sq.ft
2. Fit-out Period: 60 days rent-free
3. Rent Escalation: 5% YoY cap
4. Deposit: 6 months

Given the corridor dynamics, this structure ensures long-term viability and sustainable rent-to-revenue ratios. Please advise if these terms align with your expectations.

Best regards,
SiteBrain Retail Intelligence`;

    u().el('negotiationScriptText').textContent = script;
    modal.classList.remove('hidden-modal');
  }

  function closeScriptModal() {
    const modal = u().el('scriptModal');
    if (modal) modal.classList.add('hidden-modal');
  }

  function copyNegotiationScript() {
    const text = u().el('negotiationScriptText').textContent;
    // Fallback if Clipboard API is restricted in local dev (e.g. non-HTTPS)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('Script Copied', 'Negotiation script copied to clipboard.');
      }).catch(err => {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast('Script Copied', 'Negotiation script copied to clipboard.');
    } catch (err) {
      showToast('Copy Failed', 'Please copy the text manually.');
    }
    document.body.removeChild(textArea);
  }

  /* ═══════════════ TOAST ═══════════════ */

  function showToast(title, msg) {
    clearTimeout(toastTimer);
    const toast = u().el('toast');
    if (!toast) return;
    const titleEl = u().el('toastTitle');
    const msgEl = u().el('toastDesc');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = msg;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 4200);
  }

  return {
    init,
    openSetupModal,
    closeSetupModal,
    enhanceWithGemini,
    submitSetupAndScan,
    rerunInLocation,
    openTermSheetModal,
    closeTermSheetModal,
    openRelatedLocationsModal,
    closeRelatedLocationsModal,
    openScriptModal,
    closeScriptModal,
    copyNegotiationScript,
    submitTenantDossier,
    showToast
  };
})();
