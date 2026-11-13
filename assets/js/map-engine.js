/**
 * SITEBRAIN - GEOSPATIAL MAP ENGINE (Leaflet)
 * World map (OSM/Carto tiles) with Bengaluru-focused surveys.
 * Supports preset corridors or custom point+radius scans.
 * Fetches real nearby POIs via Overpass (ODbL) with graceful fallback to curated dataset.
 */
window.mapEngine = (function () {
  'use strict';

  let map = null;
  let currentLocId = 'indiranagar';
  let currentCenter = null;
  let currentRadiusM = 3000;
  let scanToken = 0;

  const layerState = { isochrone: true, competitors: true, anchors: true, properties: true, heatmap: false };
  const groups = { isochrone: null, competitors: null, anchors: null, properties: null, heatmap: null };

  const DEAL_BADGES = {
    rent:  { label: 'FOR RENT',  color: '#34C759', bg: '#EBF9EE', icon: 'R' },
    buy:   { label: 'FOR SALE',  color: '#5856D6', bg: '#EEECFB', icon: 'S' },
    lease: { label: 'BTS LEASE', color: '#FF9500', bg: '#FFF8EB', icon: 'L' }
  };

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000, toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
  }

  function createMapPin(color, size) {
    return L.divIcon({
      className: '',
      html: `<div class="animate-pin-drop" style="position:relative;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;">
        <div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.25;transform:scale(1.5);"></div>
        <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #FFF;box-shadow:0 3px 12px rgba(0,0,0,0.24);display:flex;align-items:center;justify-content:center;">
          <div style="width:${size/3}px;height:${size/3}px;border-radius:50%;background:#FFF;"></div>
        </div></div>`,
      iconSize: [size, size], iconAnchor: [size/2, size/2]
    });
  }
  function createPropertyPin(dealType) {
    const badge = DEAL_BADGES[dealType] || DEAL_BADGES.rent;
    return L.divIcon({
      className: '',
      html: `<div class="animate-pin-drop" style="position:relative;display:flex;align-items:center;justify-content:center;width:26px;height:26px;">
        <div style="position:absolute;inset:-2px;border-radius:6px;background:${badge.color};opacity:0.2;transform:rotate(45deg) scale(1.3);"></div>
        <div style="width:22px;height:22px;border-radius:6px;background:${badge.color};border:2px solid #FFF;box-shadow:0 3px 12px rgba(0,0,0,0.28);transform:rotate(45deg);display:flex;align-items:center;justify-content:center;">
          <span style="transform:rotate(-45deg);font-size:10px;line-height:1;color:#FFF;font-weight:700;">${badge.icon}</span>
        </div></div>`,
      iconSize: [26,26], iconAnchor: [13,13]
    });
  }
  function createCenterPin(color) {
    return L.divIcon({
      className: '',
      html: `<div style="position:relative;width:18px;height:18px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;inset:-7px;border-radius:50%;border:2px solid ${color};opacity:0.5;" class="pin-halo"></div>
        <div style="width:12px;height:12px;border-radius:50%;background:${color};border:2.5px solid #FFF;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>
      </div>`,
      iconSize: [18,18], iconAnchor: [9,9]
    });
  }

  function init(containerId, initialLocId) {
    currentLocId = initialLocId || 'indiranagar';
    const loc = window.SITEBRAIN_DATA.locations[currentLocId];
    currentCenter = loc ? loc.center.slice() : [12.9716, 77.5946];
    currentRadiusM = 3000;
    if (map) map.remove();
    map = L.map(containerId, { zoomControl: true, scrollWheelZoom: true, attributionControl: true, worldCopyJump: true })
      .setView(currentCenter, loc ? loc.zoom : 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd', attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);
    setTimeout(() => { if (map) map.invalidateSize(); }, 150);
    setTimeout(() => { if (map) map.invalidateSize(); }, 500);
    window.addEventListener('resize', () => { if (map) map.invalidateSize(); });
  }

  function getMap() { return map; }
  function getCurrentCenter() { return currentCenter ? currentCenter.slice() : null; }
  function getCurrentRadiusM() { return currentRadiusM; }

  function clearGroups() {
    Object.keys(groups).forEach(k => { if (groups[k]) { map.removeLayer(groups[k]); groups[k] = null; } });
  }

  function buildOverpassQuery(lat, lng, radiusM) {
    return `[out:json][timeout:20];(`+
      `node["amenity"~"cafe|restaurant|fast_food|bar|pub|food_court|ice_cream"](around:${radiusM},${lat},${lng});`+
      `way["amenity"~"cafe|restaurant|fast_food|bar|pub|food_court|ice_cream"](around:${radiusM},${lat},${lng});`+
      `node["shop"~"bakery|convenience|supermarket"](around:${radiusM},${lat},${lng});`+
      `node["leisure"~"fitness_centre|sports_centre"](around:${radiusM},${lat},${lng});`+
      `node["amenity"~"clinic|dentist|hospital|pharmacy"](around:${radiusM},${lat},${lng});`+
      `node["railway"="station"](around:${Math.max(radiusM,1500)},${lat},${lng});`+
      `node["station"="subway"](around:${Math.max(radiusM,1500)},${lat},${lng});`+
      `node["amenity"="college"](around:${Math.max(radiusM,2000)},${lat},${lng});`+
      `node["amenity"="university"](around:${Math.max(radiusM,2000)},${lat},${lng});`+
      `way["shop"="mall"](around:${Math.max(radiusM,2000)},${lat},${lng});`+
      `node["shop"="mall"](around:${Math.max(radiusM,2000)},${lat},${lng});`+
      `way["leisure"="park"](around:${Math.max(radiusM,1500)},${lat},${lng});`+
    `);out center 60;`;
  }

  function classifyOverpass(el, center) {
    const tags = el.tags || {};
    const lat = el.lat || (el.center && el.center.lat);
    const lng = el.lon || (el.center && el.center.lon);
    if (!lat || !lng) return null;
    const name = tags.name || tags.brand || 'Unnamed POI';
    const dist = haversine(center[0], center[1], lat, lng);
    const amenity = tags.amenity || '', shop = tags.shop || '', leisure = tags.leisure || '', railway = tags.railway || '';
    let kind = null, type = 'poi';
    if (railway === 'station' || tags.station === 'subway' || tags.public_transport === 'station') { kind='anchor'; type='Transit'; }
    else if (shop === 'mall') { kind='anchor'; type='Mall'; }
    else if (amenity === 'college' || amenity === 'university') { kind='anchor'; type='Campus'; }
    else if (leisure === 'park') { kind='anchor'; type='Park'; }
    else if (/cafe|coffee/i.test(name+amenity)) { kind='competitor'; type='coffee'; }
    else if (/fast_food|restaurant|food_court|ice_cream|bar|pub/.test(amenity)) { kind='competitor'; type='qsr'; }
    else if (/fitness|sports_centre|gym/i.test(leisure+name)) { kind='competitor'; type='fitness'; }
    else if (/clinic|dentist|hospital|pharmacy/.test(amenity)) { kind='competitor'; type='clinic'; }
    else if (/bakery|convenience|supermarket/.test(shop)) { kind='competitor'; type='qsr'; }
    if (!kind) return null;
    if (kind === 'competitor') {
      const estCrowd = type === 'qsr' ? 550 : type === 'fitness' ? 200 : type === 'clinic' ? 130 : 380;
      const estTicket = type === 'qsr' ? 320 : type === 'fitness' ? 1800 : type === 'clinic' ? 900 : 280;
      return { kind, data: { id: 'osm-'+el.id, name, category: type, rating: null, distanceMeters: dist, avgTicket: estTicket, dailyCrowd: estCrowd, dailyCrowdSource: 'SiteBrain estimate (modelled)', lat, lng, osmRef: (el.type||'node')+'/'+el.id, source: 'OpenStreetMap (ODbL, live)' } };
    } else {
      const vol = type==='Transit' ? '8k-25k/day (typical)' : type==='Mall' ? '10k+/day (est.)' : type==='Campus' ? '3k+/day (est.)' : '2k+/day (est.)';
      return { kind, data: { id: 'osm-a-'+el.id, name, type, dailyVolume: vol, dailyVolumeSource: type==='Transit'?'BMRCL/typical':'SiteBrain estimate', lat, lng, osmRef: (el.type||'node')+'/'+el.id, source: 'OpenStreetMap (ODbL, live)' } };
    }
  }

  async function fetchOverpassPOIs(center, radiusM) {
    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter'
    ];
    const body = 'data=' + encodeURIComponent(buildOverpassQuery(center[0], center[1], radiusM));
    let json = null;
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
        if (res.ok) { json = await res.json(); break; }
      } catch (e) {}
    }
    if (!json) throw new Error('overpass unavailable');
    const comps = [], anchors = [], seen = new Set();
    (json.elements || []).forEach(el => {
      const c = classifyOverpass(el, center);
      if (!c) return;
      const key = c.data.name.toLowerCase()+'|'+Math.round(c.data.lat*1000)+'|'+Math.round(c.data.lng*1000);
      if (seen.has(key)) return; seen.add(key);
      if (c.kind === 'competitor') comps.push(c.data); else anchors.push(c.data);
    });
    comps.sort((a,b)=>a.distanceMeters-b.distanceMeters);
    anchors.sort((a,b)=>a.distanceMeters-b.distanceMeters);
    return { competitors: comps.slice(0, 40), anchors: anchors.slice(0, 20), source: 'OpenStreetMap Overpass (live, ODbL)' };
  }

  function nearestPreset(center) {
    let best = null, bestD = Infinity;
    Object.values(window.SITEBRAIN_DATA.locations).forEach(l => {
      const d = haversine(center[0], center[1], l.center[0], l.center[1]);
      if (d < bestD) { bestD = d; best = l; }
    });
    return { loc: best, distance: bestD };
  }

  function collectPropertiesWithin(center, radiusM) {
    const props = [];
    Object.values(window.SITEBRAIN_DATA.locations).forEach(loc => {
      (loc.properties || []).forEach(p => {
        const d = haversine(center[0], center[1], p.lat, p.lng);
        if (d <= radiusM * 1.5) props.push(Object.assign({}, p, { distanceMeters: d, corridorName: loc.shortName, corridorId: loc.id }));
      });
    });
    props.sort((a,b)=>a.distanceMeters-b.distanceMeters);
    return props;
  }

  function setText(id, v) { const n = document.getElementById(id); if (n) n.textContent = v; }

  async function scanLocation(locIdOrOpts, animateScan, onComplete) {
    const opts = (locIdOrOpts && typeof locIdOrOpts === 'object') ? locIdOrOpts : { locId: locIdOrOpts };
    const useCustom = !!opts.center;
    const locId = opts.locId || currentLocId || 'indiranagar';
    const preset = window.SITEBRAIN_DATA.locations[locId] || window.SITEBRAIN_DATA.locations.indiranagar;
    const center = useCustom ? opts.center.slice() : preset.center.slice();
    const radiusM = Math.max(500, Math.min(5000, opts.radiusM || 3000));
    const placeName = opts.placeName || (useCustom ? 'Selected point' : preset.name);
    currentLocId = locId; currentCenter = center.slice(); currentRadiusM = radiusM;
    const token = ++scanToken;

    if (!map) return null;
    map.invalidateSize();
    clearGroups();
    groups.isochrone = L.layerGroup(); groups.competitors = L.layerGroup(); groups.anchors = L.layerGroup(); groups.properties = L.layerGroup(); groups.heatmap = L.layerGroup();

    const zoom = radiusM <= 1000 ? 16 : radiusM <= 2000 ? 15 : radiusM <= 3500 ? 14 : 13;
    map.flyTo(center, zoom, { duration: animateScan ? 1.2 : 0.3, easeLinearity: 0.25 });

    const km = (radiusM/1000).toFixed(1);
    const coordBadge = document.getElementById('map-coord-display');
    if (coordBadge) coordBadge.textContent = `${center[0].toFixed(4)}° N, ${center[1].toFixed(4)}° E • ${km} km catchment`;
    const lr = document.getElementById('layerRadiusLabel'); if (lr) lr.textContent = `${km} km Catchment`;

    const near = nearestPreset(center);
    const proxy = near.loc || preset;
    let competitors = [], anchors = [], properties = [], poiSource = 'curated dataset';

    if (useCustom) {
      try {
        const poi = await fetchOverpassPOIs(center, radiusM);
        competitors = poi.competitors; anchors = poi.anchors; poiSource = poi.source;
      } catch (e) {
        competitors = (proxy.competitors||[]).map(c=>Object.assign({},c,{distanceMeters:haversine(center[0],center[1],c.lat,c.lng)})).filter(c=>c.distanceMeters<=radiusM).sort((a,b)=>a.distanceMeters-b.distanceMeters);
        anchors = (proxy.anchors||[]).map(a=>Object.assign({},a,{distanceMeters:haversine(center[0],center[1],a.lat,a.lng)})).filter(a=>a.distanceMeters<=Math.max(radiusM,1500)).sort((a,b)=>a.distanceMeters-b.distanceMeters);
        poiSource = 'curated dataset fallback (Overpass unavailable)';
      }
      properties = collectPropertiesWithin(center, radiusM);
    } else {
      competitors = (preset.competitors||[]).slice();
      anchors = (preset.anchors||[]).slice();
      properties = (preset.properties||[]).map(p=>Object.assign({},p,{distanceMeters:haversine(center[0],center[1],p.lat,p.lng), corridorName:preset.shortName, corridorId:preset.id}));
      poiSource = 'curated Bengaluru dataset (OSM-sourced)';
    }

    // saturation: more competitors in radius => lower headroom
    const satFromCount = Math.max(0.35, Math.min(0.95, 1 - Math.min(competitors.length, 35) / 45));
    const saturation = useCustom ? satFromCount : preset.saturationIndex;
    const scanLoc = Object.assign({}, proxy, {
      id: useCustom ? ('custom_'+token) : preset.id,
      name: placeName,
      shortName: placeName.split(',')[0].slice(0,40),
      corridor: useCustom ? `Custom ${km} km catchment • rent/footfall proxy: ${proxy.shortName} (${Math.round(near.distance/100)/10} km away)` : preset.corridor,
      center: center,
      competitors, anchors, properties,
      saturationIndex: saturation,
      avgRentSqft: proxy.avgRentSqft,
      rentSource: proxy.rentSource + (useCustom ? ' • nearest-corridor proxy (labeled estimate)' : ''),
      footTrafficIndex: proxy.footTrafficIndex,
      weekendWeekdayRatio: proxy.weekendWeekdayRatio,
      dailyPedestrianCount: proxy.dailyPedestrianCount,
      demandCompositeSource: (proxy.demandCompositeSource||'') + (useCustom ? '; point-level = proxy estimate' : ''),
      baseViabilityScore: proxy.baseViabilityScore,
      riskClassification: proxy.riskClassification,
      riskLabel: proxy.riskLabel,
      riskFactors: proxy.riskFactors ? proxy.riskFactors.slice() : [],
      rewardDrivers: proxy.rewardDrivers ? proxy.rewardDrivers.slice() : [],
      poiSource, isCustom: !!useCustom, radiusKm: parseFloat(km)
    });

    const circleColor = scanLoc.riskClassification === 'high' ? '#FF3B30' : (scanLoc.riskClassification === 'medium' ? '#FF9500' : '#0071E3');
    L.circle(center, { radius: radiusM, color: circleColor, fillColor: circleColor, fillOpacity: 0.07, weight: 2, opacity: 0.65, dashArray: '8 6', className: 'pulse-zone' }).addTo(groups.isochrone);
    L.marker(center, { icon: createCenterPin(circleColor) }).bindPopup(`<div style="font-family:-apple-system,sans-serif;padding:3px 2px;"><div style="font-size:13px;font-weight:600;color:#1D1D1F;">${scanLoc.name}</div><div style="font-size:11px;color:#86868B;">Survey center • ${km} km • ${competitors.length} competitors, ${anchors.length} anchors</div></div>`, { closeButton: false }).addTo(groups.isochrone);

    const compToShow = competitors.slice(0, 30);
    compToShow.forEach((c, idx) => { schedule(() => {
      L.marker([c.lat,c.lng], { icon: createMapPin('#FF3B30', 16) }).bindPopup(
        `<div style="font-family:-apple-system,sans-serif;padding:3px 2px;min-width:180px;"><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;"><span style="font-size:13px;font-weight:600;color:#1D1D1F;">${c.name}</span><span style="font-size:11px;font-weight:600;color:#FF9500;">${typeof c.rating==='number'?'★ '+c.rating:''}</span></div><div style="font-size:11px;color:#86868B;margin-bottom:4px;">${c.distanceMeters}m • ${c.category||'retail'}</div><div style="font-size:10px;color:#424245;">Est. crowd: <b>${c.dailyCrowd||'-'}</b>/day • Avg ticket: <b>₹${c.avgTicket||'-'}</b> <span style="color:#86868B">(est.)</span></div><div style="font-size:10px;color:#86868B;margin-top:3px;">${c.source||''}</div></div>`, { closeButton:false }).addTo(groups.competitors);
    }, 300 + idx*50); });

    anchors.slice(0, 15).forEach((a, idx) => { schedule(() => {
      L.marker([a.lat,a.lng], { icon: createMapPin('#0071E3', 18) }).bindPopup(`<div style="font-family:-apple-system,sans-serif;padding:3px 2px;"><div style="font-size:13px;font-weight:600;color:#1D1D1F;margin-bottom:2px;">${a.name}</div><div style="font-size:11px;color:#0071E3;font-weight:500;">${a.type} • ${a.dailyVolume}</div><div style="font-size:10px;color:#86868B;">${a.source||''}</div></div>`, { closeButton:false }).addTo(groups.anchors);
    }, 220 + idx*70); });

    const propsToShow = properties.slice(0, 20);
    propsToShow.forEach((p, idx) => { const badge = DEAL_BADGES[p.dealType] || DEAL_BADGES.rent; schedule(() => {
      L.marker([p.lat,p.lng], { icon: createPropertyPin(p.dealType) }).bindPopup(`<div style="font-family:-apple-system,sans-serif;padding:3px 2px;min-width:220px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;"><span style="font-size:13px;font-weight:600;color:#1D1D1F;">${p.name}</span><span style="font-size:9px;font-weight:700;color:${badge.color};background:${badge.bg};padding:2px 6px;border-radius:6px;border:1px solid ${badge.color}30;">${badge.label}</span></div><div style="font-size:11px;color:#86868B;margin-bottom:2px;">${p.address||''}</div><div style="font-size:11px;color:#34C759;font-weight:600;margin-bottom:4px;">${Math.round(p.distanceMeters)}m away • ${p.corridorName||''}</div><div style="background:#F5F5F7;padding:8px;border-radius:10px;margin-bottom:6px;font-size:11px;"><div><b>${p.sqft}</b> sq.ft • ${p.rateDisplay||('₹'+(p.askingRentPerSqft||0)+'/sqft')}</div><div style="color:#0071E3;font-weight:700;">${p.priceDisplay||('₹'+(p.monthlyRent||0).toLocaleString('en-IN')+'/mo')}</div><div style="font-size:10px;color:#86868B;">${p.termsDisplay||''} • ${p.verifiedStatus||'sourced listing'}</div></div><button onclick="window.geminiSurvey.openTermSheetModal('${p.id}')" style="width:100%;background:#0071E3;color:#fff;border:none;border-radius:8px;padding:7px 10px;font-size:11px;font-weight:600;cursor:pointer;">View details →</button></div>`, { closeButton:false, maxWidth:280 }).addTo(groups.properties);
    }, 450 + idx*70); });

    anchors.slice(0,10).forEach(a => { L.circle([a.lat,a.lng], { radius: 350, color:'#0071E3', fillColor:'#0071E3', fillOpacity:0.15, weight:0, interactive:false }).addTo(groups.heatmap); });
    compToShow.slice(0,15).forEach(c => { L.circle([c.lat,c.lng], { radius: 220, color:'#FF3B30', fillColor:'#FF3B30', fillOpacity:0.10, weight:0, interactive:false }).addTo(groups.heatmap); });

    setText('map-comp-count', competitors.length);
    setText('map-anchor-count', anchors.length);
    setText('map-prop-count', properties.length);
    applyLayerState();

    const totalDelay = animateScan ? 1400 : 40;
    schedule(() => {
      if (token !== scanToken) return;
      window.__lastScanContext = scanLoc;
      if (typeof onComplete === 'function') onComplete(scanLoc);
    }, totalDelay);

    function schedule(fn, delay) {
      if (!animateScan || delay <= 0) { if (token === scanToken) fn(); return; }
      setTimeout(() => { if (token === scanToken) fn(); }, delay);
    }
    return scanLoc;
  }

  function applyLayerState() {
    if (!map) return;
    Object.keys(groups).forEach(k => {
      if (!groups[k]) return;
      if (layerState[k] && !map.hasLayer(groups[k])) map.addLayer(groups[k]);
      if (!layerState[k] && map.hasLayer(groups[k])) map.removeLayer(groups[k]);
    });
  }
  function toggleLayer(layerName) {
    if (Object.prototype.hasOwnProperty.call(layerState, layerName)) { layerState[layerName] = !layerState[layerName]; applyLayerState(); }
  }
  function resize() { if (map) map.invalidateSize(); }
  function getCurrentLocId() { return currentLocId; }

  let isFullScreen = false, panelCollapsed = false, dividerStartX = 0, dividerStartMapW = 0;
  function toggleFullScreen() { isFullScreen = !isFullScreen; document.body.classList.toggle('map-fullscreen', isFullScreen); resize(); }
  function togglePanelCollapse() {
    panelCollapsed = !panelCollapsed;
    const panel = document.getElementById('diagPanel');
    const mapSection = document.getElementById('mapSection');
    if (panel) panel.classList.toggle('panel-collapsed', panelCollapsed);
    if (mapSection) mapSection.classList.toggle('panel-expanded', panelCollapsed);
    resize();
  }
  function setupDividerDrag() {
    const divider = document.getElementById('mapDivider');
    const panel = document.getElementById('diagPanel');
    const mapSection = document.getElementById('mapSection');
    if (!divider || !panel || !mapSection) return;
    divider.addEventListener('mousedown', e => {
      dividerStartX = e.clientX; dividerStartMapW = mapSection.getBoundingClientRect().width;
      document.addEventListener('mousemove', onDrag); document.addEventListener('mouseup', stopDrag);
    });
    function onDrag(e) {
      const mapW = dividerStartMapW + (e.clientX - dividerStartX);
      const panelW = panel.parentElement.getBoundingClientRect().width - mapW;
      if (mapW > 300 && panelW > 200) { mapSection.style.width = mapW + 'px'; panel.style.width = panelW + 'px'; panelCollapsed = false; panel.classList.remove('panel-collapsed'); mapSection.classList.remove('panel-expanded'); resize(); }
    }
    function stopDrag() { document.removeEventListener('mousemove', onDrag); document.removeEventListener('mouseup', stopDrag); }
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isFullScreen) toggleFullScreen(); });

  return { init, scanLocation, toggleLayer, toggleFullScreen, togglePanelCollapse, resize, getCurrentLocId, getMap, getCurrentCenter, getCurrentRadiusM, haversine, setupDividerDrag };
})();
