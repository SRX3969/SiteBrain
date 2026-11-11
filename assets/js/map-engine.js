/**
 * ═══════════════════════════════════════════════════════════════════
 * SITEBRAIN — GEOSPATIAL MAP ENGINE (LEAFLET.JS)
 * CartoDB Positron light tiles, 3km radial catchment, staggered pin
 * scanner, per-category layer groups with independent toggles.
 * ═══════════════════════════════════════════════════════════════════
 */

window.mapEngine = (function () {
  'use strict';

  let map = null;
  let currentLocId = 'indiranagar';
  let scanToken = 0; // invalidates stale scheduled pins on re-scan

  const layerState = {
    isochrone: true,
    competitors: true,
    anchors: true,
    properties: true,
    heatmap: false
  };

  const groups = {
    isochrone: null,
    competitors: null,
    anchors: null,
    properties: null,
    heatmap: null
  };

  // Deal-type badges for property listing pins
  const DEAL_BADGES = {
    rent:  { label: 'FOR RENT',  color: '#34C759', bg: '#EBF9EE', icon: '⌂' },
    buy:   { label: 'FOR SALE',  color: '#5856D6', bg: '#EEECFB', icon: '▣' },
    lease: { label: 'BTS LEASE', color: '#FF9500', bg: '#FFF8EB', icon: '▦' }
  };

  /* ── Pin factories ────────────────────────────────────────────── */

  function createMapPin(color, size) {
    return L.divIcon({
      className: '',
      html: `
        <div class="animate-pin-drop" style="position:relative;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;">
          <div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.25;transform:scale(1.5);"></div>
          <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #FFFFFF;box-shadow:0 3px 12px rgba(0,0,0,0.24);display:flex;align-items:center;justify-content:center;">
            <div style="width:${size / 3}px;height:${size / 3}px;border-radius:50%;background:#FFFFFF;"></div>
          </div>
        </div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }

  function createPropertyPin(dealType) {
    const badge = DEAL_BADGES[dealType] || DEAL_BADGES.rent;
    return L.divIcon({
      className: '',
      html: `
        <div class="animate-pin-drop" style="position:relative;display:flex;align-items:center;justify-content:center;width:26px;height:26px;">
          <div style="position:absolute;inset:-2px;border-radius:6px;background:${badge.color};opacity:0.2;transform:rotate(45deg) scale(1.3);"></div>
          <div style="width:22px;height:22px;border-radius:6px;background:${badge.color};border:2px solid #FFFFFF;box-shadow:0 3px 12px rgba(0,0,0,0.28);transform:rotate(45deg);display:flex;align-items:center;justify-content:center;">
            <span style="transform:rotate(-45deg);font-size:11px;line-height:1;color:#FFFFFF;font-weight:700;">${badge.icon}</span>
          </div>
        </div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
  }

  function createCenterPin(color) {
    return L.divIcon({
      className: '',
      html: `
        <div style="position:relative;width:18px;height:18px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;inset:-7px;border-radius:50%;border:2px solid ${color};opacity:0.5;" class="pin-halo"></div>
          <div style="width:12px;height:12px;border-radius:50%;background:${color};border:2.5px solid #FFFFFF;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>
        </div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
  }

  /* ── Initialization ───────────────────────────────────────────── */

  function init(containerId, initialLocId) {
    currentLocId = initialLocId || 'indiranagar';
    const loc = window.SITEBRAIN_DATA.locations[currentLocId];

    if (map) map.remove();

    map = L.map(containerId, {
      zoomControl: true,
      scrollWheelZoom: true,
      attributionControl: true
    }).setView(loc.center, loc.zoom);

    // CartoDB Positron — light, minimal-label vector aesthetic
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);

    setTimeout(() => { if (map) map.invalidateSize(); }, 150);
    setTimeout(() => { if (map) map.invalidateSize(); }, 500);
    window.addEventListener('resize', () => { if (map) map.invalidateSize(); });

    scanLocation(currentLocId, false);
  }

  function clearGroups() {
    Object.keys(groups).forEach(k => {
      if (groups[k]) { map.removeLayer(groups[k]); groups[k] = null; }
    });
  }

  /* ── Animated scan sequence ────────────────────────────────────── */

  /**
   * @param {string} locId
   * @param {boolean} animateScan  stagger pin drops
   * @param {function} onComplete  invoked when the full scan finishes
   */
  function scanLocation(locId, animateScan, onComplete) {
    if (!map || !window.SITEBRAIN_DATA.locations[locId]) return;
    currentLocId = locId;
    const loc = window.SITEBRAIN_DATA.locations[locId];
    const token = ++scanToken;

    map.invalidateSize();
    clearGroups();

    groups.isochrone = L.layerGroup();
    groups.competitors = L.layerGroup();
    groups.anchors = L.layerGroup();
    groups.properties = L.layerGroup();
    groups.heatmap = L.layerGroup();

    map.flyTo(loc.center, loc.zoom, { duration: animateScan ? 1.4 : 0.4, easeLinearity: 0.25 });

    const coordBadge = document.getElementById('map-coord-display');
    if (coordBadge) {
      coordBadge.textContent = `${loc.center[0].toFixed(4)}° N, ${loc.center[1].toFixed(4)}° E • 3km Catchment`;
    }

    // 1. Pulsing 3km catchment + survey center pin
    const circleColor = loc.riskClassification === 'high' ? '#FF3B30'
      : (loc.riskClassification === 'medium' ? '#FF9500' : '#0071E3');
    L.circle(loc.center, {
      radius: 3000, color: circleColor, fillColor: circleColor,
      fillOpacity: 0.07, weight: 2, opacity: 0.65,
      dashArray: '8 6', className: 'pulse-zone'
    }).addTo(groups.isochrone);
    L.marker(loc.center, { icon: createCenterPin(circleColor) })
      .bindPopup(`<div style="font-family:-apple-system,sans-serif;padding:3px 2px;">
        <div style="font-size:13px;font-weight:600;color:#1D1D1F;">${loc.name}</div>
        <div style="font-size:11px;color:#86868B;">Survey center • 3,000m radial catchment</div>
      </div>`, { closeButton: false }).addTo(groups.isochrone);

    // 2. Footfall anchors (cobalt)
    loc.anchors.forEach((a, idx) => {
      schedule(() => {
        L.marker([a.lat, a.lng], { icon: createMapPin('#0071E3', 18) })
          .bindPopup(`
            <div style="font-family:-apple-system,sans-serif;padding:3px 2px;">
              <div style="font-size:13px;font-weight:600;color:#1D1D1F;margin-bottom:2px;">${a.name}</div>
              <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#0071E3;font-weight:500;">
                <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#0071E3;"></span>
                <span>${a.type} • ${a.dailyVolume}</span>
              </div>
            </div>`, { closeButton: false })
          .addTo(groups.anchors);
      }, 300 + idx * 120);
    });

    // 3. Competitor shops (crimson)
    loc.competitors.forEach((c, idx) => {
      schedule(() => {
        L.marker([c.lat, c.lng], { icon: createMapPin('#FF3B30', 16) })
          .bindPopup(`
            <div style="font-family:-apple-system,sans-serif;padding:3px 2px;min-width:180px;">
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
                <span style="font-size:13px;font-weight:600;color:#1D1D1F;">${c.name}</span>
                <span style="font-size:11px;font-weight:600;color:#FF9500;">${typeof c.rating === 'number' ? '★ ' + c.rating : ''}</span>
              </div>
              <div style="font-size:11px;color:#86868B;margin-bottom:6px;">${c.address || 'OSM ' + c.osmRef} (${c.distanceMeters}m away)</div>
              <div style="display:grid;grid-cols:2;gap:4px;background:#F5F5F7;padding:6px;border-radius:8px;font-size:10px;">
                <div>Est. Daily Crowd: <strong style="color:#1D1D1F;">${c.dailyCrowd}</strong></div>
                <div>Avg. Ticket Size: <strong style="color:#1D1D1F;">₹${c.avgTicket}</strong></div>
              </div>
            </div>`, { closeButton: false })
          .addTo(groups.competitors);
      }, 550 + idx * 140);
    });

    // 4. Commercial property listings (deal-typed diamonds)
    (loc.properties || []).forEach((p, idx) => {
      const badge = DEAL_BADGES[p.dealType] || DEAL_BADGES.rent;
      schedule(() => {
        L.marker([p.lat, p.lng], { icon: createPropertyPin(p.dealType) })
          .bindPopup(`
            <div style="font-family:-apple-system,sans-serif;padding:3px 2px;min-width:230px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span style="font-size:13px;font-weight:600;color:#1D1D1F;">${p.name}</span>
                <span style="font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${badge.color};background:${badge.bg};padding:2px 6px;border-radius:6px;border:1px solid ${badge.color}30;">${badge.label}</span>
              </div>
              <div style="font-size:11px;color:#86868B;margin-bottom:2px;">${p.address}</div>
              <div style="font-size:11px;color:#34C759;font-weight:600;margin-bottom:6px;">✓ ${p.verifiedStatus}</div>
              <div style="background:#F5F5F7;padding:8px;border-radius:10px;margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
                  <span style="color:#86868B;">Area & Floor</span>
                  <span style="color:#1D1D1F;font-weight:500;">${p.sqft} sq.ft (${p.floor})</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
                  <span style="color:#86868B;">Rate</span>
                  <span style="color:#1D1D1F;font-weight:500;">${p.rateDisplay}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;">
                  <span style="color:#0071E3;">Price</span>
                  <span style="color:#0071E3;">${p.priceDisplay}</span>
                </div>
                <div style="font-size:10px;color:#86868B;margin-top:3px;">${p.termsDisplay}</div>
              </div>
              <div style="font-size:10px;color:#86868B;margin-bottom:6px;">Listed by: ${p.brokerName}</div>
              <button onclick="window.geminiSurvey.openTermSheetModal('${p.id}')" style="width:100%;background:#0071E3;color:#ffffff;border:none;border-radius:8px;padding:7px 10px;font-size:11px;font-weight:600;cursor:pointer;">
                Request Term Sheet →
              </button>
            </div>`, { closeButton: false, maxWidth: 280 })
          .addTo(groups.properties);
      }, 800 + idx * 160);
    });

    // 5. Pedestrian footfall heatmap intensity circles
    loc.anchors.forEach(a => {
      L.circle([a.lat, a.lng], {
        radius: 450, color: '#0071E3', fillColor: '#0071E3',
        fillOpacity: 0.18, weight: 0, interactive: false
      }).addTo(groups.heatmap);
    });
    loc.competitors.forEach(c => {
      L.circle([c.lat, c.lng], {
        radius: 250, color: '#FF3B30', fillColor: '#FF3B30',
        fillOpacity: 0.12, weight: 0, interactive: false
      }).addTo(groups.heatmap);
    });

    // Update count badges
    setText('map-comp-count', loc.competitors.length);
    setText('map-anchor-count', loc.anchors.length);
    setText('map-prop-count', (loc.properties || []).length);

    // Actually add the populated layer groups to the map (pins, catchment, anchors, listings)
    applyLayerState();

    // Signal completion after the longest staggered drop
    const totalDelay = animateScan ? 1600 : 60;
    schedule(() => { if (token === scanToken && typeof onComplete === 'function') onComplete(); }, totalDelay);

    function schedule(fn, delay) {
      if (!animateScan || delay <= 0) { if (token === scanToken) fn(); return; }
      setTimeout(() => { if (token === scanToken) fn(); }, delay);
    }
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  /* ── Layer toggles (independent add/remove, no re-scan) ────────── */

  function applyLayerState() {
    if (!map) return;
    Object.keys(groups).forEach(k => {
      if (!groups[k]) return;
      if (layerState[k] && !map.hasLayer(groups[k])) map.addLayer(groups[k]);
      if (!layerState[k] && map.hasLayer(groups[k])) map.removeLayer(groups[k]);
    });
  }

  function toggleLayer(layerName) {
    if (Object.prototype.hasOwnProperty.call(layerState, layerName)) {
      layerState[layerName] = !layerState[layerName];
      applyLayerState();
    }
  }

  function resize() {
    if (map) map.invalidateSize();
  }

  function getCurrentLocId() {
    return currentLocId;
  }

  let isFullScreen = false;
  let panelCollapsed = false;
  let dividerStartX = 0;
  let dividerStartMapW = 0;

  function toggleFullScreen() {
    isFullScreen = !isFullScreen;
    document.body.classList.toggle('map-fullscreen', isFullScreen);
    resize();
  }

  function togglePanelCollapse() {
    panelCollapsed = !panelCollapsed;
    const panel = document.getElementById('diagPanel');
    const mapSection = document.getElementById('mapSection');
    const btn = document.getElementById('mapCollapseBtn');
    if (panel) panel.classList.toggle('panel-collapsed', panelCollapsed);
    if (mapSection) mapSection.classList.toggle('panel-expanded', panelCollapsed);
    if (btn) {
      const icon = btn.querySelector('svg');
      if (icon) {
        icon.setAttribute('d', panelCollapsed
          ? 'M4 12h16M12 4l4 4-4 4'
          : 'M20 12H4M12 20l-4-4 4-4');
      }
    }
    resize();
  }

  function setupDividerDrag() {
    const divider = document.getElementById('mapDivider');
    const panel = document.getElementById('diagPanel');
    const mapSection = document.getElementById('mapSection');
    if (!divider || !panel || !mapSection) return;

    divider.addEventListener('mousedown', e => {
      dividerStartX = e.clientX;
      const rect = mapSection.getBoundingClientRect();
      dividerStartMapW = rect.width;
      document.addEventListener('mousemove', onDrag);
      document.addEventListener('mouseup', stopDrag);
    });

    function onDrag(e) {
      const dx = e.clientX - dividerStartX;
      const mapW = dividerStartMapW + dx;
      const panelW = panel.parentElement.getBoundingClientRect().width - mapW;
      if (mapW > 300 && panelW > 200) {
        mapSection.style.width = mapW + 'px';
        panel.style.width = panelW + 'px';
        panelCollapsed = false;
        panel.classList.remove('panel-collapsed');
        mapSection.classList.remove('panel-expanded');
        resize();
      }
    }

    function stopDrag() {
      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('mouseup', stopDrag);
    }
  }

  // Esc exits full-screen
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isFullScreen) {
      toggleFullScreen();
    }
  });

  return {
    init,
    scanLocation,
    toggleLayer,
    toggleFullScreen,
    togglePanelCollapse,
    resize,
    getCurrentLocId,
    setupDividerDrag
  };
})();
