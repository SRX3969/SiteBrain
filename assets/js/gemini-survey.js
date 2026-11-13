/**
 * SITEBRAIN - SURVEY ORCHESTRATOR
 * Flow: landing -> world map popup (place, radius, budget, category, concept)
 * Gemini summarizes concept (fail-soft, no key needed). Scan real nearby
 * competition (Overpass/curated Bengaluru data). Deterministic 0-100 underwriting.
 * Competition comparison + how to win. Nearby real-estate options suited to needs.
 */
window.geminiSurvey = (function () {
  'use strict';
  const u = () => window.SiteBrainUtils;
  const BROKER_UNLOCK_THRESHOLD = 55;

  let currentSurveyState = {
    locationId: 'indiranagar', categoryId: 'coffee', budget: 4500000, conceptText: '',
    customCenter: null, customPlaceName: null, radiusKm: 3.0
  };
  let pickOnMapMode = false, pickOnMapMarker = null, lastScanLoc = null;
  let lastBrief = null, lastFocusedElement = null, toastTimer = null, planToken = 0;

  function init() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('location')) { const p = params.get('location').toLowerCase(); if (window.SITEBRAIN_DATA.locations[p]) currentSurveyState.locationId = p; }
    if (params.has('category')) { const p = params.get('category').toLowerCase(); if (window.SITEBRAIN_DATA.categories[p]) currentSurveyState.categoryId = p; }
    if (params.has('budget')) { const b = parseInt(params.get('budget'),10); if (!isNaN(b)&&b>0) currentSurveyState.budget = b; }
    if (params.has('radius')) { const r = parseFloat(params.get('radius')); if (!isNaN(r)) currentSurveyState.radiusKm = Math.max(0.5, Math.min(5,r)); }

    const preset = window.SITEBRAIN_DATA.locations[currentSurveyState.locationId] || window.SITEBRAIN_DATA.locations.indiranagar;
    currentSurveyState.customCenter = preset.center.slice();
    currentSurveyState.customPlaceName = preset.name + ' (preset)';

    window.mapEngine.init('surveyMap', currentSurveyState.locationId);
    window.mapEngine.setupDividerDrag();
    setupEventListeners();
    updateSelectedPlaceUI();
    runSurvey({ locId: currentSurveyState.locationId, center: currentSurveyState.customCenter, radiusM: currentSurveyState.radiusKm*1000, placeName: currentSurveyState.customPlaceName, categoryId: currentSurveyState.categoryId }, false);
    if (!params.has('skipModal')) openSetupModal();
  }

  function setupEventListeners() {
    const catSelect = u().el('setupCategorySelect');
    if (catSelect) {
      catSelect.value = currentSurveyState.categoryId;
      catSelect.addEventListener('change', e => {
        currentSurveyState.categoryId = e.target.value;
        const cat = window.SITEBRAIN_DATA.categories[e.target.value];
        if (cat) { const b = u().el('setupBudgetInput'); if (b){ b.value = cat.defaultBudget; currentSurveyState.budget = cat.defaultBudget; updateBudgetLabel(cat.defaultBudget);} }
      });
    }
    const budgetSlider = u().el('setupBudgetInput');
    if (budgetSlider) { budgetSlider.value = currentSurveyState.budget; updateBudgetLabel(currentSurveyState.budget);
      budgetSlider.addEventListener('input', e => { currentSurveyState.budget = parseInt(e.target.value,10); updateBudgetLabel(currentSurveyState.budget); }); }
    const radiusSlider = u().el('setupRadiusInput');
    if (radiusSlider) { radiusSlider.value = currentSurveyState.radiusKm; syncRadiusLabel();
      radiusSlider.addEventListener('input', e => { currentSurveyState.radiusKm = parseFloat(e.target.value)||3; syncRadiusLabel(); }); }

    document.querySelectorAll('.wb-hotspot').forEach(chip => {
      chip.addEventListener('click', () => {
        const locId = chip.getAttribute('data-location');
        if (!locId || !window.SITEBRAIN_DATA.locations[locId]) return;
        document.querySelectorAll('.wb-hotspot').forEach(c=>{ c.classList.remove('bg-brand','text-white','border-brand'); c.classList.add('bg-white','text-apple-body','border-black/[0.06]'); });
        chip.classList.add('bg-brand','text-white','border-brand'); chip.classList.remove('bg-white','text-apple-body','border-black/[0.06]');
        const loc = window.SITEBRAIN_DATA.locations[locId];
        currentSurveyState.locationId = locId; currentSurveyState.customCenter = loc.center.slice(); currentSurveyState.customPlaceName = loc.name + ' (preset)';
        updateSelectedPlaceUI();
        runSurvey({ locId, center: loc.center.slice(), radiusM: currentSurveyState.radiusKm*1000, placeName: loc.name, categoryId: currentSurveyState.categoryId }, true);
      });
    });
    window.addEventListener('keydown', e => { if (e.key==='Escape'){ closeSetupModal(); closeTermSheetModal(); closeRelatedLocationsModal(); closeScriptModal(); if(pickOnMapMode) cancelPickOnMap(); } if(e.key==='Tab') trapFocus(e); });
    window.addEventListener('click', e => { if(e.target.id==='researchSetupModal') closeSetupModal(); if(e.target.id==='termSheetModal') closeTermSheetModal(); if(e.target.id==='relatedLocationsModal') closeRelatedLocationsModal(); if(e.target.id==='scriptModal') closeScriptModal(); });
  }

  function syncRadiusLabel(){ const l=u().el('setupRadiusLabel'); const lr=document.getElementById('layerRadiusLabel'); if(l) l.textContent=currentSurveyState.radiusKm.toFixed(1)+' km'; if(lr) lr.textContent=currentSurveyState.radiusKm.toFixed(1)+' km Catchment'; }
  function updateBudgetLabel(val){ const lbl=u().el('setupBudgetLabel'); if(lbl) lbl.textContent='₹'+(val/100000).toFixed(1)+' Lakhs'; }
  function updateSelectedPlaceUI(){ const p=u().el('setupSelectedPlace'); const c=u().el('setupSelectedCoords'); if(p) p.textContent=currentSurveyState.customPlaceName||'Selected point'; if(c && currentSurveyState.customCenter) c.textContent=currentSurveyState.customCenter[0].toFixed(4)+', '+currentSurveyState.customCenter[1].toFixed(4); }

  function openSetupModal(){ const modal=u().el('researchSetupModal'); if(!modal) return; lastFocusedElement=document.activeElement; modal.classList.remove('hidden-modal'); setTimeout(()=>{ const f=u().el('setupPlaceInput'); if(f) f.focus(); },120); }
  function closeSetupModal(){ const modal=u().el('researchSetupModal'); if(!modal||modal.classList.contains('hidden-modal')) return; modal.classList.add('hidden-modal'); if(lastFocusedElement&&lastFocusedElement.focus) lastFocusedElement.focus(); setTimeout(()=>{ if(window.mapEngine) window.mapEngine.resize(); },150); }
  function trapFocus(e){ const modal=u().el('researchSetupModal'); if(!modal||modal.classList.contains('hidden-modal')) return; const f=modal.querySelectorAll('button, select, input, textarea, a[href]'); if(!f.length) return; const first=f[0], last=f[f.length-1]; if(e.shiftKey&&document.activeElement===first){e.preventDefault(); last.focus();} else if(!e.shiftKey&&document.activeElement===last){e.preventDefault(); first.focus();} }

  function pickOnMap(){ const map=window.mapEngine.getMap(); if(!map) return; pickOnMapMode=true; closeSetupModal(); showToast('Pick on map','Click anywhere on the map to set survey center (Bengaluru recommended). Esc to cancel.');
    const onClick = (e)=>{ if(!pickOnMapMode) return; pickOnMapMode=false; map.off('click', onClick);
      currentSurveyState.customCenter=[e.latlng.lat,e.latlng.lng]; currentSurveyState.customPlaceName='Dropped pin ('+e.latlng.lat.toFixed(4)+', '+e.latlng.lng.toFixed(4)+')';
      if(pickOnMapMarker) map.removeLayer(pickOnMapMarker);
      pickOnMapMarker=L.marker(currentSurveyState.customCenter,{icon:L.divIcon({className:'',html:'<div style="width:14px;height:14px;border-radius:50%;background:#0071E3;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);"></div>',iconSize:[14,14],iconAnchor:[7,7]})}).addTo(map);
      updateSelectedPlaceUI(); openSetupModal(); showToast('Location set','Survey center updated. Adjust radius/budget and scan.');
    }; map.on('click', onClick);
  }
  function cancelPickOnMap(){ pickOnMapMode=false; }

  async function searchPlace(){ const q=(u().el('setupPlaceInput')&&u().el('setupPlaceInput').value||'').trim(); if(!q) return; showToast('Searching place','Looking up on OpenStreetMap…');
    try{
      const url='https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(q + ', Bengaluru, Karnataka, India');
      const res=await fetch(url,{headers:{'Accept':'application/json'}});
      if(!res.ok) throw new Error('search failed'); const arr=await res.json();
      if(arr&&arr.length){ const r=arr[0]; currentSurveyState.customCenter=[parseFloat(r.lat), parseFloat(r.lon)]; currentSurveyState.customPlaceName=r.display_name.split(',').slice(0,3).join(','); updateSelectedPlaceUI(); const map=window.mapEngine.getMap(); if(map) map.flyTo(currentSurveyState.customCenter,14,{duration:0.8}); showToast('Place found', currentSurveyState.customPlaceName); }
      else { showToast('Not found','Try a more specific Bengaluru place name or pick on map.'); }
    }catch(e){ showToast('Search unavailable','Nominatim unreachable. Use "Pick on map" instead.'); }
  }

  function enhanceWithGemini(){ const raw=u().el('setupConceptInput'); const btn=u().el('btnEnhanceGemini'); const cat=window.SITEBRAIN_DATA.categories[currentSurveyState.categoryId]; const locRef=nearestProxyLoc(); if(!cat||!locRef) return; const conceptText=(raw&&raw.value.trim())||currentSurveyState.conceptText||'A retail concept targeting local professionals.'; currentSurveyState.conceptText=conceptText;
    if(btn){ btn.disabled=true; btn.innerHTML='<span>Gemini 2.5 Pro synthesizing…</span>'; } renderBriefSkeleton();
    window.SiteBrainAPI.enhanceConcept({ conceptText, locationId: locRef.id, categoryId: currentSurveyState.categoryId, budget: currentSurveyState.budget }).then(api=>{
      let brief, sourceLabel;
      if(api && api.target_demographics){ brief={ targetDemographics:api.target_demographics, floorPlate:api.recommended_floor_plate_sqft||cat.typicalSqft, seatingCapacity:api.seating_capacity||cat.seatingCapacity||null, capacityLabel:cat.capacityLabel||'', peakHours:api.peak_footfall_windows||cat.peakHours, aovBenchmark:api.aov_benchmark_inr||cat.defaultTicket, riskHypothesis:api.primary_risk_hypothesis||locRef.primaryRisk, keywords:u().extractConceptKeywords(conceptText)}; sourceLabel=(api.source||'').indexOf('gemini')===0?'Gemini 2.5 Pro • Live API':'FastAPI Synthesis'; }
      else { brief=synthesizeLocalBrief(conceptText, locRef, cat); sourceLabel='Local Deterministic Synthesis'; }
      lastBrief={ brief, sourceLabel, context:{locationId:currentSurveyState.locationId,categoryId:currentSurveyState.categoryId,centerKey:(currentSurveyState.customCenter||[]).join(','),conceptText} };
      renderBrief(brief, sourceLabel); if(btn){ btn.disabled=false; btn.innerHTML='<span>Enhance &amp; summarize with Gemini 2.5 Pro</span>'; } showToast('Brief ready', sourceLabel);
    }).catch(()=>{ const brief=synthesizeLocalBrief(conceptText,locRef,cat); renderBrief(brief,'Local Deterministic Synthesis'); if(btn){ btn.disabled=false; btn.innerHTML='<span>Enhance &amp; summarize with Gemini 2.5 Pro</span>'; } });
  }
  function nearestProxyLoc(){ const c=currentSurveyState.customCenter; if(!c) return window.SITEBRAIN_DATA.locations[currentSurveyState.locationId]; let best=null,bd=Infinity; Object.values(window.SITEBRAIN_DATA.locations).forEach(l=>{ const d=window.mapEngine.haversine(c[0],c[1],l.center[0],l.center[1]); if(d<bd){bd=d;best=l;} }); return best||window.SITEBRAIN_DATA.locations.indiranagar; }
  function synthesizeLocalBrief(conceptText, loc, cat){ const keywords=u().extractConceptKeywords(conceptText); const kw=keywords.length?keywords.join(', '):'general retail'; return { targetDemographics:`${cat.targetDemographic}. Signals: ${kw}. Calibrated to ${loc.shortName} (${loc.corridor}).`, floorPlate:cat.typicalSqft, seatingCapacity:cat.seatingCapacity||null, capacityLabel:cat.capacityLabel||'', peakHours:cat.peakHours, aovBenchmark:cat.defaultTicket, riskHypothesis:`${loc.primaryRisk} Differentiation is essential to avoid cannibalization in this micro-market.`, keywords }; }
  function renderBriefSkeleton(){ const c=u().el('geminiBriefOutput'); if(!c) return; c.innerHTML=`<div class="gemini-gradient-border"><div class="gemini-gradient-inner"><div class="flex items-center justify-between mb-3"><div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-brand animate-pulse"></span><h4 class="text-xs font-semibold text-apple-title font-mono tracking-wide uppercase">Synthesizing Executive Feasibility Brief…</h4></div></div><div class="space-y-2"><div class="gemini-shimmer h-14 rounded-xl"></div><div class="grid grid-cols-2 gap-2"><div class="gemini-shimmer h-16 rounded-xl"></div><div class="gemini-shimmer h-16 rounded-xl"></div></div></div></div></div>`; }
  function renderBrief(brief, sourceLabel){ const container=u().el('geminiBriefOutput'); if(!container) return; const esc=u().escapeHtml; const chips=(brief.keywords&&brief.keywords.length)?`<div class="flex flex-wrap gap-1.5 pt-1">${brief.keywords.map(k=>`<span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand/[0.07] text-brand border border-brand/15">${esc(k)}</span>`).join('')}</div>`:'';
    container.innerHTML=`<div class="gemini-gradient-border"><div class="gemini-gradient-inner"><div class="flex items-center justify-between mb-2.5"><div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-brand animate-pulse"></span><h4 class="text-xs font-semibold text-apple-title font-mono tracking-wide uppercase">Executive Feasibility Brief</h4></div><span class="text-[10px] font-mono px-2 py-0.5 rounded bg-brand/10 text-brand whitespace-nowrap">${esc(sourceLabel)}</span></div><div class="space-y-2 text-xs text-apple-body"><div class="bg-apple-surface/80 p-2.5 rounded-xl border border-black/[0.03]"><strong class="text-apple-title block mb-0.5">Target Demographic:</strong><span>${esc(brief.targetDemographics)}</span></div><div class="grid grid-cols-3 gap-2"><div class="bg-apple-surface/80 p-2.5 rounded-xl border border-black/[0.03]"><strong class="text-apple-title block mb-0.5">Floor Plate:</strong><span class="font-mono text-apple-title font-medium">${brief.floorPlate.toLocaleString('en-IN')} sq.ft</span></div><div class="bg-apple-surface/80 p-2.5 rounded-xl border border-black/[0.03]"><strong class="text-apple-title block mb-0.5">${brief.seatingCapacity?'Capacity':'Peak Windows'}:</strong><span class="font-mono text-apple-title font-medium">${brief.seatingCapacity?`${brief.seatingCapacity} ${esc(brief.capacityLabel)}`:esc(brief.peakHours)}</span></div><div class="bg-apple-surface/80 p-2.5 rounded-xl border border-black/[0.03]"><strong class="text-apple-title block mb-0.5">AOV Benchmark:</strong><span class="font-mono text-apple-title font-medium">₹${brief.aovBenchmark.toLocaleString('en-IN')}</span></div></div><div class="bg-apple-surface/80 p-2.5 rounded-xl border border-black/[0.03]"><strong class="text-apple-title block mb-0.5">Primary Risk Hypothesis:</strong><span>${esc(brief.riskHypothesis)}</span></div>${chips}</div></div></div>`; }

  function submitSetupAndScan(){ const cat=u().el('setupCategorySelect'); const bud=u().el('setupBudgetInput'); const con=u().el('setupConceptInput'); const rad=u().el('setupRadiusInput');
    if(cat) currentSurveyState.categoryId=cat.value; if(bud) currentSurveyState.budget=parseInt(bud.value,10); if(rad) currentSurveyState.radiusKm=parseFloat(rad.value)||3;
    if(con && con.value.trim()) currentSurveyState.conceptText=con.value.trim();
    if(!currentSurveyState.customCenter){ const pr=window.SITEBRAIN_DATA.locations[currentSurveyState.locationId]; currentSurveyState.customCenter=pr.center.slice(); }
    closeSetupModal();
    lastBrief=null;
    runSurvey({ center: currentSurveyState.customCenter.slice(), radiusM: Math.round(currentSurveyState.radiusKm*1000), placeName: currentSurveyState.customPlaceName||'Selected point', locId: currentSurveyState.locationId, categoryId: currentSurveyState.categoryId }, true);
  }

  function rerunInLocation(locId){ const loc=window.SITEBRAIN_DATA.locations[locId]; if(!loc) return; currentSurveyState.locationId=locId; currentSurveyState.customCenter=loc.center.slice(); currentSurveyState.customPlaceName=loc.name+' (preset)'; updateSelectedPlaceUI(); showToast('Re-running',`Switching to ${loc.name}…`); runSurvey({locId, center:loc.center.slice(), radiusM:currentSurveyState.radiusKm*1000, placeName:loc.name, categoryId:currentSurveyState.categoryId}, true); }

  async function runSurvey(opts, animateMap){ const catId=currentSurveyState.categoryId; const budget=currentSurveyState.budget; const cat=window.SITEBRAIN_DATA.categories[catId]; if(!cat) return;
    resetStepper(); setStep(1,'active'); const proxy=nearestProxyLoc(); if(lastBrief) renderBrief(lastBrief.brief,lastBrief.sourceLabel); else renderBrief(synthesizeLocalBrief(currentSurveyState.conceptText,proxy,cat),'Deterministic Baseline'); setStep(1,'done');
    setStep(2,'active'); showScanning(true,`Scanning ${(opts.radiusM/1000).toFixed(1)} km catchment for competitors, anchors & listings…`);
    let scanLoc=null;
    try { scanLoc = await window.mapEngine.scanLocation(Object.assign({},opts,{categoryId:catId}), animateMap, null); } catch(e){ scanLoc = window.__lastScanContext || proxy; }
    if(!scanLoc) scanLoc = proxy;
    lastScanLoc = scanLoc; showScanning(false); setStep(2,'done');
    setStep(3,'active'); const metrics = window.financialGauge.render(scanLoc, catId, budget); renderOverview(scanLoc, metrics); renderHeaderPill(scanLoc, cat, budget, opts.radiusM); setStep(3,'done');
    setStep(4,'active'); setTimeout(()=>{ setStep(4,'done'); setStep(5,'active'); renderCompetitionInsights(scanLoc, metrics, cat, budget); renderSuitedListings(scanLoc, metrics, budget); renderExecutionMasterplan(scanLoc, catId, metrics); setStep(5,'done'); }, 900);
    showToast('Survey complete', `${(scanLoc.competitors||[]).length} competitors • viability ${metrics.viabilityScore}/100`);
  }

  function renderHeaderPill(loc, cat, budget, radiusM){ const pill=u().el('headerStatusPill'); if(pill){ pill.classList.remove('hidden'); pill.classList.add('flex'); const km=radiusM? (radiusM/1000).toFixed(1)+'km':'3km'; pill.innerHTML=`<span class="w-2 h-2 rounded-full bg-risk-low animate-pulse"></span><span class="font-medium text-apple-title">${u().escapeHtml(loc.shortName||loc.name)}</span><span class="text-apple-muted">•</span><span class="text-apple-body">${u().escapeHtml(cat.name)}</span><span class="text-apple-muted">•</span><span class="font-mono text-brand font-semibold">${km} • ₹${(budget/100000).toFixed(0)}L</span>`; } document.title=`${loc.shortName||'Survey'} – SiteBrain Workbench`; }
  function renderOverview(loc, m){ const set=(id,t)=>{const n=u().el(id); if(n) n.textContent=t;};
    set('ov-location-name', loc.name); set('ov-corridor', loc.corridor||'Bengaluru micro-market');
    set('ov-competitors', `${(loc.competitors||[]).length} competitors in catchment`);
    set('ov-footfall', (loc.dailyPedestrianCount||0).toLocaleString('en-IN'));
    set('ov-rent', `₹${loc.avgRentSqft}/sq.ft`); set('ov-traffic', `${(loc.footTrafficIndex||0).toFixed(1)} / 10`);
    set('ov-weekend', `${(((loc.weekendWeekdayRatio||1)*100)-100).toFixed(0)}%`);
    set('ov-saturation', `${Math.round((loc.saturationIndex||0.6)*100)}% addressable`);
  }

  function showScanning(visible,message){ const o=u().el('scanningOverlay'); if(!o) return; const t=u().el('scanningText'); if(t&&message) t.textContent=message; if(visible) o.classList.remove('hidden-modal'); else o.classList.add('hidden-modal'); }
  function resetStepper(){ document.querySelectorAll('.step-item').forEach(i=>i.classList.remove('step-active','step-done')); }
  function setStep(n,state){ document.querySelectorAll(`.step-item[data-step="${n}"]`).forEach(i=>{ i.classList.remove('step-active','step-done'); if(state) i.classList.add('step-'+state); }); }

  function renderCompetitionInsights(loc, metrics, cat, budget){ const c=u().el('competitionInsightsContainer'); if(!c) return; const esc=u().escapeHtml;
    const comps=(loc.competitors||[]).slice().sort((a,b)=> (b.rating||0)-(a.rating||0) || a.distanceMeters-b.distanceMeters);
    const sameCat=comps.filter(x=>x.category===cat.id);
    const top=sameCat.slice(0,5).length? sameCat.slice(0,5): comps.slice(0,5);
    const density = comps.length; const avgTicket = top.length? Math.round(top.reduce((s,x)=>s+(x.avgTicket||0),0)/top.length): cat.defaultTicket;
    const strengths=[], weaknesses=[], actions=[];
    if(metrics.rentToRevenueRatio>24) weaknesses.push(`High rent stress (${metrics.rentToRevenueRatio.toFixed(1)}% RTR) — negotiate or resize`); else strengths.push(`Rent-to-revenue manageable (${metrics.rentToRevenueRatio.toFixed(1)}%)`);
    if(metrics.isBelowSurvival) weaknesses.push(`Projected volume below survival (${metrics.achievedVolume} < ${metrics.survivalVolume} ${metrics.volumeLabel})`); else strengths.push(`Projected volume clears survival threshold`);
    if(density>=12) weaknesses.push(`High saturation: ${density} competitors in catchment`); else strengths.push(`Moderate competition density (${density})`);
    strengths.push(`Demand window fit: ${cat.peakHours}`);
    actions.push(avgTicket>cat.defaultTicket?`Incumbents avg ticket ~₹${avgTicket}; win on sharper value/experience at ~₹${cat.defaultTicket}.`:`Position with premium experience vs local avg ticket ~₹${avgTicket}.`);
    actions.push(`Differentiate on a wedge (speed, niche format, service, loyalty) to avoid direct parity.`);
    actions.push(top[0]?`Outperform "${top[0].name}" (${top[0].distanceMeters}m) by targeting its likely gaps (consistency, wait times, format limits) with a clearer promise.`:`Low peer density — capture mindshare early with consistent quality.`);
    const rows = top.map(x=>{ const gap = x.avgTicket? (x.avgTicket>cat.defaultTicket?'higher-priced (value opportunity)':'lower-priced (premium/experience opportunity)'):'pricing unclear'; const sw = (x.rating&&x.rating>=4.3)?'Strong reputation — compete on differentiation, not parity.':(x.rating? 'Mixed reputation — consistency/service opening.':'Unrated/new — trust moat is low.'); return `<tr class="border-b border-black/[0.04]"><td class="py-2 pr-2 font-medium text-apple-title">${esc(x.name)}</td><td class="py-2 pr-2 font-mono text-[11px]">${x.distanceMeters}m</td><td class="py-2 pr-2 text-[11px]">${x.rating?('★ '+x.rating):'n/a'}</td><td class="py-2 pr-2 text-[11px]">₹${x.avgTicket||'-'} • ${x.dailyCrowd||'-'}/day <span class="text-apple-muted">(est.)</span></td><td class="py-2 text-[11px] text-apple-body">${sw} ${gap}</td></tr>`; }).join('');
    c.innerHTML = `<div class="glass-panel-strong rounded-3xl p-6 border border-black/[0.06] shadow-sm"><div class="flex items-center justify-between mb-3"><div><h4 class="text-sm font-semibold text-apple-title">Nearby Competition — compare & how to win</h4><p class="text-[10px] text-apple-muted font-mono">${comps.length} found • ${sameCat.length} same-category • source: ${esc(loc.poiSource||'dataset')}</p></div></div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3"><div class="p-3 rounded-2xl bg-risk-low-bg/40 border border-risk-low-border/50"><div class="text-[11px] font-semibold text-risk-low mb-1.5">Strengths / advantages</div><ul class="space-y-1">${strengths.map(s=>`<li class="text-[11px] text-apple-body">• ${esc(s)}</li>`).join('')}</ul></div><div class="p-3 rounded-2xl bg-risk-high-bg/40 border border-risk-high-border/50"><div class="text-[11px] font-semibold text-risk-high mb-1.5">Weaknesses / risks to fix</div><ul class="space-y-1">${(weaknesses.length?weaknesses:['No critical structural weakness flagged; execution risk remains.']).map(s=>`<li class="text-[11px] text-apple-body">• ${esc(s)}</li>`).join('')}</ul></div></div>
      <div class="overflow-x-auto mb-3"><table class="w-full text-left"><thead><tr class="text-[10px] uppercase tracking-wider text-apple-muted border-b border-black/[0.06]"><th class="pb-2 pr-2">Competitor</th><th class="pb-2 pr-2">Dist</th><th class="pb-2 pr-2">Rating</th><th class="pb-2 pr-2">Ticket/Crowd</th><th class="pb-2">Weakness/edge & how to win</th></tr></thead><tbody class="text-xs">${rows||'<tr><td colspan="5" class="py-3 text-apple-muted">No direct competitors detected in this radius. Opportunity to define the category — validate demand on-ground.</td></tr>'}</tbody></table></div>
      <div class="p-3.5 rounded-2xl bg-apple-surface/70 border border-black/[0.03]"><strong class="text-apple-title block mb-1 text-xs">How to make it better & win</strong><ul class="space-y-1">${actions.map(a=>`<li class="text-[11px] text-apple-body">→ ${esc(a)}</li>`).join('')}</ul></div>
      <p class="text-[10px] text-apple-muted mt-2">POIs are real (OSM/curated). Crowd, ticket and some ratings are modelled estimates unless sourced — directional, not audited.</p></div>`;
  }

  function renderSuitedListings(loc, metrics, budget){ const c=u().el('suitedListingsContainer'); if(!c) return; const esc=u().escapeHtml; const cat=window.SITEBRAIN_DATA.categories[currentSurveyState.categoryId];
    const props=(loc.properties||[]).slice();
    const maxRentCeil = Math.max(1, (metrics.achievedRevenue||1)*0.2);
    const scored = props.map(p=>{ const d=p.distanceMeters||window.mapEngine.haversine(loc.center[0],loc.center[1],p.lat,p.lng); const rent=p.monthlyRent||(p.askingRentPerSqft*(p.sqft||cat.typicalSqft)); const sizeFit = p.sqft? Math.max(0, 100 - Math.abs(p.sqft - cat.typicalSqft)/cat.typicalSqft*100):50; const budgetFit = (rent*12 + (p.securityDeposit||rent*10)) <= budget*1.2 ? 100 : (budget / ((rent*12)+(p.securityDeposit||rent*10)||1))*100; const rentFit = rent <= maxRentCeil ? 100 : (maxRentCeil/rent)*100; const distFit = Math.max(0, 100 - (d/( (loc.radiusKm||3)*1000 ))*60); const score = Math.round(0.3*budgetFit + 0.25*rentFit + 0.25*sizeFit + 0.2*distFit); let why=[]; if(sizeFit>70) why.push('size fits '+cat.name); if(rent<=maxRentCeil) why.push('rent within revenue ceiling'); else why.push('rent above comfort ceiling'); if(d<=1500) why.push('close to survey center'); return Object.assign({},p,{_dist:Math.round(d),_rent:rent,_score:Math.max(0,Math.min(100,score)),_why:why}); }).sort((a,b)=>b._score-a._score);
    const viable = metrics.viabilityScore >= BROKER_UNLOCK_THRESHOLD;
    const list = scored.slice(0,6).map(p=>{ const badge=p.dealType==='buy'?{l:'SALE',c:'#5856D6'}:p.dealType==='lease'?{l:'BTS',c:'#FF9500'}:{l:'RENT',c:'#34C759'}; return `<div class="p-3 rounded-2xl bg-white border border-black/[0.05] flex flex-col gap-1.5"><div class="flex items-start justify-between gap-2"><div><div class="text-xs font-semibold text-apple-title">${esc(p.name)}</div><div class="text-[11px] text-apple-muted">${esc(p.address||'')} • ${p._dist}m • ${esc(p.corridorName||'')}</div></div><span class="text-[9px] font-bold px-2 py-0.5 rounded" style="color:${badge.c};background:${badge.c}18;border:1px solid ${badge.c}30;">${badge.l}</span></div><div class="text-[11px] text-apple-body"><b>${p.sqft}</b> sq.ft • ₹${(p.askingRentPerSqft||0)}/sqft • <b>₹${(p._rent||0).toLocaleString('en-IN')}/mo</b></div><div class="flex items-center justify-between"><span class="text-[10px] font-mono ${p._score>=60?'text-risk-low':'text-risk-medium'}">Fit score: ${p._score}/100</span><span class="text-[10px] text-apple-muted">${esc((p.verifiedStatus||'sourced').split('•')[0])}</span></div><div class="text-[10px] text-apple-muted">${esc(p._why.join(' • '))}</div><button onclick="window.geminiSurvey.openTermSheetModal('${p.id}')" class="mt-1 text-xs font-medium px-3 py-1.5 rounded-lg ${viable?'bg-brand text-white':'bg-apple-surface text-apple-title border border-black/[0.06]'}">${viable?'Request term sheet':'View details'}</button></div>`; }).join('');
    c.innerHTML = `<div class="glass-panel-strong rounded-3xl p-6 border border-black/[0.06] shadow-sm"><div class="flex items-center justify-between mb-3"><div><h4 class="text-sm font-semibold text-apple-title">Nearby real-estate options (suited to you)</h4><p class="text-[10px] text-apple-muted font-mono">Ranked by fit (budget, rent ceiling, size for ${esc(cat.name)}, distance) • sourced Bengaluru listings</p></div></div>${scored.length?`<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">${list}</div>`:`<div class="p-4 rounded-2xl bg-apple-surface/70 text-xs text-apple-body">No verified/sourced listings found within this catchment in the current dataset. Try a preset corridor (Indiranagar/HSR/Koramangala/Whitefield), increase radius, or add licensed listings. <span class="text-apple-muted">(No fabricated listings.)</span></div>`}<p class="text-[10px] text-apple-muted mt-2">Fit score is deterministic. ${viable?'Viability ≥ '+BROKER_UNLOCK_THRESHOLD+' (stronger case)':'Viability < '+BROKER_UNLOCK_THRESHOLD+' — treat as research; improve terms/format first'}.</p></div>`;
  }

  function renderExecutionMasterplan(loc, catId, metrics){ const container=u().el('geminiMasterplanContainer'); const cat=window.SITEBRAIN_DATA.categories[catId]; const playbook=window.SITEBRAIN_DATA.playbooks[catId]||window.SITEBRAIN_DATA.playbooks.coffee; if(!container||!loc||!cat) return; const token=++planToken; const isViable=metrics.viabilityScore>=BROKER_UNLOCK_THRESHOLD; const esc=u().escapeHtml;
    const maxRentSqft=Math.max(60, Math.round((metrics.achievedRevenue*0.18)/metrics.sqft));
    const rated=(loc.competitors||[]).filter(c=>typeof c.rating==='number'&&c.rating>0);
    const topComp=((rated.length?rated:loc.competitors)||[]).slice().sort((a,b)=>(b.rating||0)-(a.rating||0))[0]||{name:'local incumbents',distanceMeters:0};
    const nearest=((loc.competitors||[]).slice().sort((a,b)=>a.distanceMeters-b.distanceMeters)[0])||topComp;
    const brutal=`<div class="p-3.5 rounded-2xl bg-risk-high-bg/50 border border-risk-high-border/60"><strong class="text-risk-high block mb-1 font-semibold text-xs">Brutal truths & what to take care</strong><ul class="space-y-1 mt-1 pl-2 text-xs text-apple-body"><li>• Rent-to-revenue: <b>${metrics.rentToRevenueRatio.toFixed(1)}%</b> ${metrics.rentToRevenueRatio<18?'(healthy)':metrics.rentToRevenueRatio>24?'(negotiate down/resize)':'(tight — watch closely)'}.</li><li>• Capital payback: <b>${metrics.breakEvenMonths===Infinity?'not achievable at projected volume':metrics.breakEvenMonths.toFixed(0)+' months'}</b> (incl. deposit).</li><li>• Competition: <b>${(loc.competitors||[]).length}</b> in catchment, ${Math.round((loc.saturationIndex||0)*100)}% addressable headroom.</li><li>• Data note: rent/footfall may be <b>${(loc.rentSource||'').indexOf('proxy')>-1?'nearest-corridor proxy (estimate)':'benchmarked/sourced'}</b> for this exact point — validate on-ground.</li></ul></div>`;
    const listings=(loc.properties||[]).filter(p=>p.dealType==='rent'||p.dealType==='lease').slice(0,3);
    let brokerHtml;
    if(isViable && listings.length){ brokerHtml=`<div class="mt-3 p-4 rounded-2xl bg-white border border-brand/20"><div class="flex items-center gap-2 mb-2"><span class="w-2 h-2 rounded-full bg-risk-low"></span><h5 class="text-xs font-semibold text-apple-title">Options unlock (score ${metrics.viabilityScore} ≥ ${BROKER_UNLOCK_THRESHOLD})</h5></div><div class="space-y-2">${listings.map(v=>`<div class="p-3 rounded-xl bg-apple-surface/60 border border-black/[0.04] flex items-center justify-between gap-2"><div><div class="text-xs font-semibold">${esc(v.name)}</div><div class="text-[11px] text-apple-muted">${v.sqft} sq.ft • ₹${v.askingRentPerSqft}/sqft • ${v._dist||v.distanceMeters||''}m</div></div><button onclick="window.geminiSurvey.openTermSheetModal('${v.id}')" class="text-xs font-medium px-3 py-1.5 rounded-lg bg-brand text-white">Details</button></div>`).join('')}</div></div>`; }
    else { const best=Object.values(window.SITEBRAIN_DATA.locations).filter(l=>l.id!==loc.id).sort((a,b)=>b.baseViabilityScore-a.baseViabilityScore)[0]; brokerHtml=`<div class="mt-3 p-4 rounded-2xl ${isViable?'bg-apple-surface border border-black/[0.06]':'bg-risk-high-bg border-risk-high-border'} border text-center"><h5 class="text-xs font-semibold ${isViable?'text-apple-title':'text-risk-high'} mb-1">${isViable?'Limited verified listings in this exact catchment':'Capital protection: improve viability first'}</h5><p class="text-[11px] text-apple-body mb-2">Score ${metrics.viabilityScore}/100. ${isViable?'Expand radius or try a preset corridor for more sourced options.':'Negotiate rent, right-size format, or test a stronger corridor.'}</p>${best?`<button onclick="window.geminiSurvey.rerunInLocation('${best.id}')" class="text-xs font-semibold px-4 py-2 rounded-xl bg-apple-title text-white">Try ${esc(best.shortName)} →</button>`:''}</div>`; }

    container.innerHTML=`<div class="glass-panel-strong rounded-3xl p-6 border border-black/[0.07] shadow-sm"><div class="flex items-center justify-between mb-4"><div><h4 class="text-sm font-semibold text-apple-title">Execution masterplan — launch & win</h4><p class="text-[10px] text-apple-muted font-mono">${esc(loc.shortName||loc.name)} • ${esc(cat.name)} • deterministic math</p></div><span id="masterplanSourceBadge" class="text-[10px] font-mono px-2 py-0.5 rounded bg-apple-surface text-apple-muted border border-black/[0.05]">Deterministic Playbook</span></div>
      <div class="space-y-3 text-xs text-apple-body leading-relaxed">${brutal}
      <div class="p-3.5 rounded-2xl bg-apple-surface/70 border border-black/[0.03]"><strong class="text-apple-title block mb-1">1. Positioning & wedge</strong><p id="masterplan-strategy">${esc(playbook.differentiation)} Strongest nearby: <b>${esc(topComp.name)}</b> (${topComp.distanceMeters}m). Nearest: ${nearest.distanceMeters}m. Win by owning a clear niche, better service/speed, and exploiting timing/format gaps.</p></div>
      <div class="p-3.5 rounded-2xl bg-apple-surface/70 border border-black/[0.03]"><strong class="text-apple-title block mb-1">2. Lease & rent mandate</strong><p>${esc(playbook.negotiationTarget)} Deterministic ceiling: keep base rent ≤ <b class="font-mono">₹${maxRentSqft}/sq.ft</b> (holds RTR ≤ 18% at projected volume). Seek 45-day rent-free fit-out; cap escalation.</p></div>
      <div class="p-3.5 rounded-2xl bg-apple-surface/70 border border-black/[0.03]"><strong class="text-apple-title block mb-1">3. Compliance checklist</strong><ul class="space-y-1 mt-1 pl-2 font-mono text-[11px] text-apple-title">${(playbook.licensing||[]).map(l=>`<li>• ${esc(l)}</li>`).join('')}</ul></div></div>${brokerHtml}</div>`;

    if(currentSurveyState.conceptText){ window.SiteBrainAPI.synthesizeMasterplan({ locationId: (loc.isCustom?'indiranagar':(loc.id||'indiranagar')), categoryId: catId, conceptText: currentSurveyState.conceptText, financials:{ viability_score:metrics.viabilityScore, rent_to_revenue_ratio:Math.round(metrics.rentToRevenueRatio*10)/10, break_even_months:metrics.breakEvenMonths===Infinity?null:Math.round(metrics.breakEvenMonths*10)/10, rent_per_sqft:metrics.rentPerSqft } }).then(res=>{ if(token!==planToken||!res||!res.differentiation_strategy) return; const p=u().el('masterplan-strategy'); if(p) p.textContent=res.differentiation_strategy; const b=u().el('masterplanSourceBadge'); if(b){ b.textContent='Gemini 2.5 • Live'; b.className='text-[10px] font-mono px-2 py-0.5 rounded bg-brand/10 text-brand border border-brand/15'; } }).catch(()=>{}); }
  }

  function openTermSheetModal(vacancyId){ let matched=null; const searchLocs=[lastScanLoc, ...Object.values(window.SITEBRAIN_DATA.locations)].filter(Boolean); for(const loc of searchLocs){ const f=(loc.properties||[]).find(p=>p.id===vacancyId); if(f){matched=f; break;} } if(!matched) return; const modal=u().el('termSheetModal'); if(!modal) return; u().el('tsModalTitle').textContent=matched.name||'Listing'; u().el('tsModalAddress').textContent=matched.address||''; u().el('tsModalSqft').textContent=`${matched.sqft||'-'} sq.ft (${matched.floor||'-'})`; u().el('tsModalRent').textContent=`₹${(matched.monthlyRent||0).toLocaleString('en-IN')} / month (₹${matched.askingRentPerSqft||0}/sq.ft)`; u().el('tsModalDeposit').textContent=`₹${(matched.securityDeposit||0).toLocaleString('en-IN')}`; u().el('tsModalBroker').textContent=`${matched.brokerName||'Listed'} (${matched.brokerPhone||'-'})`; modal.classList.remove('hidden-modal'); }
  function closeTermSheetModal(){ const m=u().el('termSheetModal'); if(m) m.classList.add('hidden-modal'); }
  function submitTenantDossier(){ closeTermSheetModal(); showToast('Dossier noted','Demo: contact logged locally. Integrate broker/CRM when ready.'); }
  function openRelatedLocationsModal(){ const modal=u().el('relatedLocationsModal'); const container=u().el('relatedLocationsList'); if(!modal||!container) return; const related=Object.values(window.SITEBRAIN_DATA.locations).filter(l=>l.id!==currentSurveyState.locationId).sort((a,b)=>b.baseViabilityScore-a.baseViabilityScore); container.innerHTML=related.map(loc=>`<div class="p-4 rounded-2xl bg-apple-surface border border-black/[0.04] flex items-center justify-between"><div><div class="text-sm font-semibold text-apple-title">${u().escapeHtml(loc.name)}</div><div class="text-[11px] text-apple-muted">${loc.baseViabilityScore}/100 base viability • ₹${loc.avgRentSqft}/sqft</div></div><button onclick="window.geminiSurvey.rerunInLocation('${loc.id}'); window.geminiSurvey.closeRelatedLocationsModal()" class="text-xs font-medium px-4 py-2 rounded-xl bg-brand text-white">Switch survey</button></div>`).join(''); modal.classList.remove('hidden-modal'); }
  function closeRelatedLocationsModal(){ const m=u().el('relatedLocationsModal'); if(m) m.classList.add('hidden-modal'); }
  function openScriptModal(){ const modal=u().el('scriptModal'); if(!modal) return; const loc=lastScanLoc||window.SITEBRAIN_DATA.locations[currentSurveyState.locationId]; const script=`Hi,\n\nI’m evaluating a ${window.SITEBRAIN_DATA.categories[currentSurveyState.categoryId].name} at ${loc.name}. Based on deterministic underwriting for a ${(currentSurveyState.radiusKm||3).toFixed(1)} km catchment, I’d like to propose terms aligned to sustainable rent-to-revenue:\n\n1. Base rent: ₹[target]/sq.ft (<= modeled ceiling)\n2. Fit-out: 45-60 days rent-free\n3. Escalation: 5% YoY cap\n4. Deposit: negotiable\n\nCan we discuss a structure that supports long-term occupancy and performance?\n\nThanks`; u().el('negotiationScriptText').textContent=script; modal.classList.remove('hidden-modal'); }
  function closeScriptModal(){ const m=u().el('scriptModal'); if(m) m.classList.add('hidden-modal'); }
  function copyNegotiationScript(){ const text=u().el('negotiationScriptText').textContent; if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(()=>showToast('Copied','Negotiation script copied.')).catch(()=>{}); } else { const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy'); showToast('Copied','Negotiation script copied.');}catch(e){} document.body.removeChild(ta);} }

  function showToast(title,msg){ clearTimeout(toastTimer); const toast=u().el('toast'); if(!toast) return; const t=u().el('toastTitle'); const d=u().el('toastDesc'); if(t) t.textContent=title; if(d) d.textContent=msg; toast.classList.add('show'); toastTimer=setTimeout(()=>toast.classList.remove('show'),4200); }

  return { init, openSetupModal, closeSetupModal, enhanceWithGemini, submitSetupAndScan, rerunInLocation, openTermSheetModal, closeTermSheetModal, openRelatedLocationsModal, closeRelatedLocationsModal, openScriptModal, closeScriptModal, copyNegotiationScript, submitTenantDossier, showToast, searchPlace, pickOnMap };
})();
