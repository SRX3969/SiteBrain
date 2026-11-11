/**
 * ═══════════════════════════════════════════════════════════════════
 * SITEBRAIN — DATA ROOM RENDERER (DATASETS.JS)
 * Renders window.SITEBRAIN_DATA with full source attribution.
 * Zero-build: plain DOM, no framework, works over file://
 * ═══════════════════════════════════════════════════════════════════
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const u = () => window.SiteBrainUtils;
  const D = window.SITEBRAIN_DATA;
  if (!D) return;
  const esc = s => u().escapeHtml(s);
  const locs = Object.values(D.locations);
  const cats = D.categories;

  const counts = {
    competitors: locs.reduce((s, l) => s + l.competitors.length, 0),
    anchors: locs.reduce((s, l) => s + l.anchors.length, 0),
    listings: locs.reduce((s, l) => s + (l.properties || []).length, 0)
  };

  /* ── 1. Hero stat chips ── */
  const genEl = u().el('dsGenerated');
  if (genEl) genEl.textContent = D.meta.generated;
  const verEl = u().el('dsVersion');
  if (verEl) verEl.textContent = 'v' + D.meta.version;
  const heroStats = u().el('dsHeroStats');
  if (heroStats) {
    heroStats.innerHTML = [
      [counts.competitors, 'OSM-verified competitors'],
      [counts.anchors, 'footfall anchors'],
      [counts.listings, 'corridor listings'],
      [D.meta.studyCorridors.length, 'study corridors'],
      [D.meta.sources.length, 'cited sources']
    ].map(([n, label]) => `
      <div class="glass-panel-strong rounded-2xl px-5 py-4 border border-black/[0.06] shadow-2xs text-center">
        <div class="text-2xl font-semibold font-mono text-apple-title">${n}</div>
        <div class="text-[11px] text-apple-muted mt-0.5">${label}</div>
      </div>`).join('');
  }

  /* ── 2. Source registry (dark band) ── */
  const srcTable = u().el('dsSourceTable');
  if (srcTable) {
    srcTable.innerHTML = D.meta.sources.map(s => `
      <div class="dark-glass rounded-2xl p-5 reveal">
        <div class="flex items-start justify-between gap-3 mb-2">
          <div>
            <div class="text-sm font-semibold text-white">${esc(s.name)}</div>
            <div class="text-[10px] font-mono text-white/45 mt-1">LICENSE: ${esc(s.license)} · RETRIEVED: ${esc(s.retrieved)}</div>
          </div>
          <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"
             class="text-[10px] font-mono px-2.5 py-1 rounded-full bg-white/[0.07] text-[#7EB3F5] border border-white/15 hover:bg-white/[0.12] transition-colors whitespace-nowrap">Open Source ↗</a>
        </div>
        <p class="text-xs text-white/55 leading-relaxed">${esc(s.usedFor)}</p>
      </div>`).join('');
  }

  /* ── 3. Corridor economics cards ── */
  const riskDot = { low: 'bg-risk-low', medium: 'bg-risk-medium', high: 'bg-risk-high' };
  const corridorCards = u().el('dsCorridorCards');
  if (corridorCards) {
    corridorCards.innerHTML = locs.map(loc => `
      <div class="glass-panel-strong rounded-3xl p-6 border border-black/[0.06] shadow-sm reveal">
        <div class="flex items-start justify-between mb-1">
          <div>
            <h3 class="text-base font-semibold text-apple-title">${esc(loc.name)}</h3>
            <div class="text-[11px] text-apple-muted">${esc(loc.corridor)}</div>
          </div>
          <span class="w-2.5 h-2.5 rounded-full ${riskDot[loc.riskClassification] || 'bg-apple-muted'} mt-1.5 flex-shrink-0"></span>
        </div>
        <div class="text-[10px] font-mono font-semibold text-apple-muted uppercase tracking-wider mt-3 mb-2">${esc(loc.riskLabel)}</div>
        <div class="space-y-1.5 mb-4">
          ${[
            ['Asking rent', '₹' + loc.avgRentSqft + '/sq.ft', true],
            ['Base viability', loc.baseViabilityScore + '/100', false],
            ['Foot-traffic index', loc.footTrafficIndex + '/10', false],
            ['Weekend : weekday ratio', loc.weekendWeekdayRatio.toFixed(2), false],
            ['Saturation composite', loc.saturationIndex.toFixed(2), false],
            ['Daily pedestrians (est.)', loc.dailyPedestrianCount.toLocaleString('en-IN'), false]
          ].map(([k, v, strong]) => `
            <div class="flex justify-between items-center text-[11px] px-2.5 py-1.5 rounded-xl bg-apple-surface">
              <span class="text-apple-muted">${k}</span>
              <span class="font-mono font-semibold ${strong ? 'text-brand' : 'text-apple-title'}">${v}</span>
            </div>`).join('')}
        </div>
        <p class="text-[10px] text-apple-muted leading-relaxed border-t border-black/[0.05] pt-3">
          <strong class="text-apple-title">Rent source:</strong> ${esc(loc.rentSource)}<br/>
          <strong class="text-apple-title">Demand composite:</strong> ${esc(loc.demandCompositeSource)}
        </p>
      </div>`).join('');
  }

  /* ── 4. Competitor registry tables ── */
  const compWrap = u().el('dsCompetitorRegistry');
  if (compWrap) {
    compWrap.innerHTML = locs.map(loc => `
      <div class="mb-8 reveal">
        <div class="flex items-center justify-between mb-2.5">
          <h3 class="text-sm font-semibold text-apple-title">${esc(loc.name)} — ${loc.competitors.length} scanned competitors</h3>
          <span class="text-[10px] font-mono text-apple-muted">3km radial catchment</span>
        </div>
        <div class="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white shadow-2xs">
          <table class="w-full text-[11px]">
            <thead>
              <tr class="bg-apple-surface text-left text-[10px] font-mono uppercase tracking-wider text-apple-muted">
                <th class="px-4 py-2.5 font-semibold">Competitor</th>
                <th class="px-4 py-2.5 font-semibold">Category</th>
                <th class="px-4 py-2.5 font-semibold">Rating</th>
                <th class="px-4 py-2.5 font-semibold">Distance</th>
                <th class="px-4 py-2.5 font-semibold">OSM Ref</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-black/[0.04]">
              ${loc.competitors.map(c => `
                <tr class="hover:bg-apple-surface/60 transition-colors">
                  <td class="px-4 py-2.5 font-medium text-apple-title whitespace-nowrap">${esc(c.name)}</td>
                  <td class="px-4 py-2.5 text-apple-body">${esc(cats[c.category] ? cats[c.category].name : c.category)}</td>
                  <td class="px-4 py-2.5 font-mono ${typeof c.rating === 'number' ? 'text-apple-title' : 'text-apple-muted'}">${typeof c.rating === 'number' ? '★ ' + c.rating.toFixed(1) : 'not rated'}</td>
                  <td class="px-4 py-2.5 font-mono text-apple-body">${c.distanceMeters}m</td>
                  <td class="px-4 py-2.5 font-mono text-apple-muted">${esc(c.osmRef)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="text-[10px] text-apple-muted mt-2">Ratings are indicative Google Maps public listings; crowd and ticket figures are SiteBrain estimates clearly labeled in the full dataset. Geometry © OpenStreetMap contributors (ODbL).</p>
      </div>`).join('');
  }

  /* ── 5. Footfall anchor tables ── */
  const anchorWrap = u().el('dsAnchorRegistry');
  if (anchorWrap) {
    anchorWrap.innerHTML = locs.map(loc => `
      <div class="mb-8 reveal">
        <div class="flex items-center justify-between mb-2.5">
          <h3 class="text-sm font-semibold text-apple-title">${esc(loc.name)} — ${loc.anchors.length} footfall anchors</h3>
        </div>
        <div class="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white shadow-2xs">
          <table class="w-full text-[11px]">
            <thead>
              <tr class="bg-apple-surface text-left text-[10px] font-mono uppercase tracking-wider text-apple-muted">
                <th class="px-4 py-2.5 font-semibold">Anchor</th>
                <th class="px-4 py-2.5 font-semibold">Type</th>
                <th class="px-4 py-2.5 font-semibold">Daily Volume</th>
                <th class="px-4 py-2.5 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-black/[0.04]">
              ${loc.anchors.map(a => `
                <tr class="hover:bg-apple-surface/60 transition-colors">
                  <td class="px-4 py-2.5 font-medium text-apple-title">${esc(a.name)}</td>
                  <td class="px-4 py-2.5 text-apple-body">${esc(a.type)}</td>
                  <td class="px-4 py-2.5 font-mono text-apple-title whitespace-nowrap">${esc(a.dailyVolume)}</td>
                  <td class="px-4 py-2.5 text-apple-muted">${esc(a.volumeSource)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`).join('');
  }

  /* ── 6. Listing tables ── */
  const propWrap = u().el('dsListingRegistry');
  if (propWrap) {
    propWrap.innerHTML = locs.map(loc => `
      <div class="mb-8 reveal">
        <div class="flex items-center justify-between mb-2.5">
          <h3 class="text-sm font-semibold text-apple-title">${esc(loc.name)} — ${(loc.properties || []).length} listings</h3>
        </div>
        <div class="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white shadow-2xs">
          <table class="w-full text-[11px]">
            <thead>
              <tr class="bg-apple-surface text-left text-[10px] font-mono uppercase tracking-wider text-apple-muted">
                <th class="px-4 py-2.5 font-semibold">Listing</th>
                <th class="px-4 py-2.5 font-semibold">Deal Type</th>
                <th class="px-4 py-2.5 font-semibold">Area</th>
                <th class="px-4 py-2.5 font-semibold">Rate</th>
                <th class="px-4 py-2.5 font-semibold">Monthly</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-black/[0.04]">
              ${(loc.properties || []).map(p => `
                <tr class="hover:bg-apple-surface/60 transition-colors">
                  <td class="px-4 py-2.5 font-medium text-apple-title">${esc(p.name)}</td>
                  <td class="px-4 py-2.5 text-apple-body">${esc(p.dealTypeLabel)}</td>
                  <td class="px-4 py-2.5 font-mono text-apple-body">${p.sqft.toLocaleString('en-IN')} sq.ft</td>
                  <td class="px-4 py-2.5 font-mono text-apple-body">₹${p.askingRentPerSqft}/sq.ft</td>
                  <td class="px-4 py-2.5 font-mono font-semibold text-apple-title whitespace-nowrap">${esc(p.priceDisplay)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="text-[10px] text-apple-muted mt-2">Representative listing templates aligned to published corridor rent bands — see per-listing source strings in the dataset.</p>
      </div>`).join('');
  }

  /* ── Scroll reveals ── */
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -25px 0px' });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
  }
});
