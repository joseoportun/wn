(function () {
  const body = document.body;
  const CONFIG = {
    title: body.dataset.title,
    subtitle: body.dataset.subtitle,
    event: body.dataset.event,
    mapTitle: body.dataset.mapTitle,
    mapSubtitle: body.dataset.mapSubtitle,
    storageKey: body.dataset.storageKey,
    mapCenter: JSON.parse(body.dataset.mapCenter || '[39.5,-98.35]'),
    mapZoom: Number(body.dataset.mapZoom || 4),
    cityLayerName: body.dataset.cityLayerName || 'City labels'
  };

  const CITY_MARKERS = [
    ['New York', 40.7128, -74.0060], ['Los Angeles', 34.0522, -118.2437], ['Chicago', 41.8781, -87.6298],
    ['Houston', 29.7604, -95.3698], ['Phoenix', 33.4484, -112.0740], ['Philadelphia', 39.9526, -75.1652],
    ['San Antonio', 29.4241, -98.4936], ['San Diego', 32.7157, -117.1611], ['Dallas', 32.7767, -96.7970],
    ['San Jose', 37.3382, -121.8863], ['Austin', 30.2672, -97.7431], ['Jacksonville', 30.3322, -81.6557],
    ['Fort Worth', 32.7555, -97.3308], ['Columbus', 39.9612, -82.9988], ['Charlotte', 35.2271, -80.8431],
    ['San Francisco', 37.7749, -122.4194], ['Seattle', 47.6062, -122.3321], ['Denver', 39.7392, -104.9903],
    ['Washington, DC', 38.9072, -77.0369], ['Miami', 25.7617, -80.1918], ['Atlanta', 33.7490, -84.3880],
    ['Boston', 42.3601, -71.0589], ['Detroit', 42.3314, -83.0458], ['Minneapolis', 44.9778, -93.2650],
    ['Kansas City', 39.0997, -94.5786], ['St. Louis', 38.6270, -90.1994], ['Oklahoma City', 35.4676, -97.5164],
    ['New Orleans', 29.9511, -90.0715], ['Tampa', 27.9506, -82.4572], ['Orlando', 28.5383, -81.3792],
    ['Las Vegas', 36.1699, -115.1398], ['Salt Lake City', 40.7608, -111.8910], ['Portland', 45.5152, -122.6784],
    ['Nashville', 36.1627, -86.7816], ['Indianapolis', 39.7684, -86.1581], ['Cleveland', 41.4993, -81.6944],
    ['Pittsburgh', 40.4406, -79.9959], ['Raleigh', 35.7796, -78.6382], ['Charleston', 32.7765, -79.9311]
  ];

  const DEFAULTS = {
    pollSeconds: 45,
    repeatMinutes: 0,
    soundVolume: 0.35,
    soundLength: 1.2,
    enableNotifications: true,
    enableSound: true,
    autoExpandNew: true,
    hideAck: false,
    nearMeOnly: false,
    reduceMotion: false,
    showCities: true,
    filterText: ''
  };

  const state = {
    settings: loadSettings(),
    alerts: [],
    acknowledged: new Set(),
    collapsed: new Set(),
    history: [],
    seenIds: new Set(),
    lastFetchAt: null,
    nextPollAt: null,
    location: null,
    map: null,
    alertLayer: null,
    cityLayer: null,
    userLayer: null,
    markers: [],
    layersById: new Map(),
    syncTimer: null,
    pollTimer: null,
    audioContext: null,
    repeatUntil: 0,
    lastSoundAt: 0,
    notificationPermission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  };

  const el = {
    title: document.getElementById('pageTitle'),
    subtitle: document.getElementById('pageSubtitle'),
    statusBadge: document.getElementById('statusBadge'),
    statusText: document.getElementById('statusText'),
    alertsCount: document.getElementById('alertsCount'),
    citiesCount: document.getElementById('citiesCount'),
    locationText: document.getElementById('locationText'),
    lastChecked: document.getElementById('lastChecked'),
    nextRefresh: document.getElementById('nextRefresh'),
    notificationState: document.getElementById('notificationState'),
    cacheState: document.getElementById('cacheState'),
    mapTitle: document.getElementById('mapTitle'),
    mapSubtitle: document.getElementById('mapSubtitle'),
    alertsList: document.getElementById('alertsList'),
    historyList: document.getElementById('historyList'),
    filterText: document.getElementById('filterText'),
    pollSeconds: document.getElementById('pollSeconds'),
    repeatMinutes: document.getElementById('repeatMinutes'),
    soundVolume: document.getElementById('soundVolume'),
    soundLength: document.getElementById('soundLength'),
    enableNotifications: document.getElementById('enableNotifications'),
    enableSound: document.getElementById('enableSound'),
    autoExpandNew: document.getElementById('autoExpandNew'),
    hideAck: document.getElementById('hideAck'),
    nearMeOnly: document.getElementById('nearMeOnly'),
    reduceMotion: document.getElementById('reduceMotion'),
    showCities: document.getElementById('showCities'),
    expandAllBtn: document.getElementById('expandAllBtn'),
    collapseAllBtn: document.getElementById('collapseAllBtn'),
    ackAllVisibleBtn: document.getElementById('ackAllVisibleBtn'),
    unackAllVisibleBtn: document.getElementById('unackAllVisibleBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    copyAllBtn: document.getElementById('copyAllBtn'),
    useLocationBtn: document.getElementById('useLocationBtn'),
    clearLocationBtn: document.getElementById('clearLocationBtn'),
    exportSettingsBtn: document.getElementById('exportSettingsBtn'),
    importSettingsBtn: document.getElementById('importSettingsBtn'),
    importSettingsFile: document.getElementById('importSettingsFile'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn'),
    testNotificationBtn: document.getElementById('testNotificationBtn'),
    testSoundBtn: document.getElementById('testSoundBtn'),
    testFeedBtn: document.getElementById('testFeedBtn'),
    testMapBtn: document.getElementById('testMapBtn'),
    testLocationBtn: document.getElementById('testLocationBtn'),
    runAllTestsBtn: document.getElementById('runAllTestsBtn'),
    cityLabelState: document.getElementById('cityLabelState')
  };

  init();

  function init() {
    el.title.textContent = CONFIG.title;
    el.subtitle.textContent = CONFIG.subtitle;
    el.mapTitle.textContent = CONFIG.mapTitle;
    el.mapSubtitle.textContent = CONFIG.mapSubtitle;
    el.citiesCount.textContent = CITY_MARKERS.length.toString();
    applySettingsToInputs();
    bindEvents();
    initMap();
    updateNotificationBadge();
    updateLocationBadge();
    updateCacheState('Preparing live tracker…');
    registerServiceWorker();
    refreshAlerts(true);
    schedulePolling();
    setInterval(tickClock, 1000);
    setInterval(renderStatus, 2000);
    log('Ready. Polling weather.gov for ' + CONFIG.event.toLowerCase() + 's.');
    if (location.protocol === 'file:') {
      log('Tip: notifications and service workers work best over https or localhost.');
    }
  }

  function loadSettings() {
    try {
      return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(CONFIG.storageKey) || '{}')) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveSettings() {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.settings));
  }

  function applySettingsToInputs() {
    const s = state.settings;
    el.pollSeconds.value = s.pollSeconds;
    el.repeatMinutes.value = s.repeatMinutes;
    el.soundVolume.value = s.soundVolume;
    el.soundLength.value = s.soundLength;
    el.enableNotifications.checked = !!s.enableNotifications;
    el.enableSound.checked = !!s.enableSound;
    el.autoExpandNew.checked = !!s.autoExpandNew;
    el.hideAck.checked = !!s.hideAck;
    el.nearMeOnly.checked = !!s.nearMeOnly;
    el.reduceMotion.checked = !!s.reduceMotion;
    el.showCities.checked = !!s.showCities;
    el.filterText.value = s.filterText || '';
  }

  function bindEvents() {
    const onChange = (key, value) => { state.settings[key] = value; saveSettings(); renderAlerts(); renderStatus(); schedulePolling(true); };

    el.pollSeconds.addEventListener('change', () => onChange('pollSeconds', clampNumber(el.pollSeconds.value, 20, 600, DEFAULTS.pollSeconds)));
    el.repeatMinutes.addEventListener('change', () => onChange('repeatMinutes', clampNumber(el.repeatMinutes.value, 0, 240, DEFAULTS.repeatMinutes)));
    el.soundVolume.addEventListener('change', () => onChange('soundVolume', clampNumber(el.soundVolume.value, 0, 1, DEFAULTS.soundVolume)));
    el.soundLength.addEventListener('change', () => onChange('soundLength', clampNumber(el.soundLength.value, 0.2, 4, DEFAULTS.soundLength)));
    el.enableNotifications.addEventListener('change', () => onChange('enableNotifications', el.enableNotifications.checked));
    el.enableSound.addEventListener('change', () => onChange('enableSound', el.enableSound.checked));
    el.autoExpandNew.addEventListener('change', () => onChange('autoExpandNew', el.autoExpandNew.checked));
    el.hideAck.addEventListener('change', () => onChange('hideAck', el.hideAck.checked));
    el.nearMeOnly.addEventListener('change', () => onChange('nearMeOnly', el.nearMeOnly.checked));
    el.reduceMotion.addEventListener('change', () => onChange('reduceMotion', el.reduceMotion.checked));
    el.showCities.addEventListener('change', () => { state.settings.showCities = el.showCities.checked; saveSettings(); toggleCities(); renderStatus(); });
    el.filterText.addEventListener('input', () => { state.settings.filterText = el.filterText.value; saveSettings(); renderAlerts(); });

    el.expandAllBtn.addEventListener('click', () => {
      state.alerts.forEach(alert => state.collapsed.delete(alert.id));
      renderAlerts();
    });
    el.collapseAllBtn.addEventListener('click', () => {
      state.alerts.forEach(alert => state.collapsed.add(alert.id));
      renderAlerts();
    });
    el.ackAllVisibleBtn.addEventListener('click', () => markVisible(true));
    el.unackAllVisibleBtn.addEventListener('click', () => markVisible(false));
    el.refreshBtn.addEventListener('click', () => refreshAlerts(true));
    el.copyAllBtn.addEventListener('click', copyVisibleAlerts);
    el.useLocationBtn.addEventListener('click', useLocation);
    el.clearLocationBtn.addEventListener('click', () => { state.location = null; saveLocation(); updateLocationLayer(); updateLocationBadge(); renderAlerts(); log('Location cleared.'); });
    el.exportSettingsBtn.addEventListener('click', exportSettings);
    el.importSettingsBtn.addEventListener('click', () => el.importSettingsFile.click());
    el.importSettingsFile.addEventListener('change', importSettings);
    el.clearHistoryBtn.addEventListener('click', () => { state.history = []; renderHistory(); saveHistory(); log('History cleared.'); });
    el.testNotificationBtn.addEventListener('click', testNotification);
    el.testSoundBtn.addEventListener('click', () => playTone('alarm'));
    el.testFeedBtn.addEventListener('click', () => refreshAlerts(true));
    el.testMapBtn.addEventListener('click', () => focusMapOnAlerts(true));
    el.testLocationBtn.addEventListener('click', useLocation);
    el.runAllTestsBtn.addEventListener('click', runAllTests);

    document.addEventListener('keydown', event => {
      if (event.target.matches('input, textarea, select')) return;
      const key = event.key.toLowerCase();
      if (key === 'r') refreshAlerts(true);
      if (key === 'e') state.alerts.forEach(alert => state.collapsed.delete(alert.id)) || renderAlerts();
      if (key === 'm') state.alerts.forEach(alert => state.collapsed.add(alert.id)) || renderAlerts();
      if (key === 'l') useLocation();
      if (key === '?') log('Shortcuts: R refresh, E expand, M collapse, L use location.');
    });
  }

  function initMap() {
    state.map = L.map('map', { zoomControl: true, scrollWheelZoom: true }).setView(CONFIG.mapCenter, CONFIG.mapZoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.map);

    state.cityLayer = L.layerGroup().addTo(state.map);
    state.alertLayer = L.layerGroup().addTo(state.map);
    state.userLayer = L.layerGroup().addTo(state.map);

    CITY_MARKERS.forEach(([name, lat, lon]) => {
      const marker = L.circleMarker([lat, lon], {
        radius: 5,
        color: '#60a5fa',
        weight: 1,
        opacity: 0.95,
        fillColor: '#93c5fd',
        fillOpacity: 0.85
      });
      marker.bindTooltip(name, {
        permanent: true,
        direction: 'top',
        className: 'city-label',
        offset: [0, -2]
      });
      marker.addTo(state.cityLayer);
    });

    toggleCities();
  }

  function toggleCities() {
    if (!state.map || !state.cityLayer) return;
    if (state.settings.showCities) {
      if (!state.map.hasLayer(state.cityLayer)) state.cityLayer.addTo(state.map);
      el.cityLabelState.textContent = 'City labels on';
    } else {
      state.map.removeLayer(state.cityLayer);
      el.cityLabelState.textContent = 'City labels off';
    }
  }

  function updateLocationLayer() {
    if (!state.map) return;
    state.userLayer.clearLayers();
    if (!state.location) return;
    L.circleMarker([state.location.lat, state.location.lon], {
      radius: 8,
      color: '#34d399',
      weight: 2,
      fillColor: '#34d399',
      fillOpacity: 0.9
    }).addTo(state.userLayer).bindPopup('Your saved location');
  }

  function saveLocation() {
    if (state.location) {
      localStorage.setItem(CONFIG.storageKey + ':location', JSON.stringify(state.location));
    } else {
      localStorage.removeItem(CONFIG.storageKey + ':location');
    }
  }

  function loadLocation() {
    try {
      const value = localStorage.getItem(CONFIG.storageKey + ':location');
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  state.location = loadLocation();
  updateLocationLayer();

  async function refreshAlerts(manual = false) {
    const url = 'https://api.weather.gov/alerts/active?event=' + encodeURIComponent(CONFIG.event);
    setHeader('Loading latest alerts…', 'warn');
    try {
      const response = await fetch(url, { headers: { Accept: 'application/geo+json' } });
      if (!response.ok) throw new Error('Weather API returned ' + response.status);
      const json = await response.json();
      const alerts = (json.features || []).map(feature => normalizeAlert(feature)).filter(Boolean);
      state.lastFetchAt = new Date();
      state.nextPollAt = new Date(Date.now() + Number(state.settings.pollSeconds) * 1000);
      const newIds = alerts.filter(alert => !state.seenIds.has(alert.id));
      alerts.forEach(alert => state.seenIds.add(alert.id));
      state.alerts = alerts;
      renderAlerts();
      renderMap();
      renderStatus();
      renderHistoryEntry(`${alerts.length} active ${CONFIG.event.toLowerCase()}${alerts.length === 1 ? '' : 's'}${newIds.length ? `, ${newIds.length} new` : ''}`);
      if (newIds.length && state.settings.enableNotifications) {
        notifyNewAlerts(newIds);
      }
      if (newIds.length && state.settings.enableSound) {
        alertTone(newIds.length);
      }
      setHeader(alerts.length ? `${alerts.length} active ${CONFIG.event.toLowerCase()}${alerts.length === 1 ? '' : 's'} found.` : `No active ${CONFIG.event.toLowerCase()}s right now.`, alerts.length ? 'bad' : 'good');
      if (manual) log('Feed refreshed manually.');
    } catch (error) {
      log('Feed refresh failed: ' + error.message);
      setHeader('Live feed unavailable. Retrying soon.', 'warn');
      renderStatus();
    } finally {
      schedulePolling(true);
    }
  }

  function normalizeAlert(feature) {
    const p = feature.properties || {};
    const geometry = feature.geometry || null;
    if (!p.id) return null;
    const area = p.areaDesc || '';
    const expires = p.expires ? new Date(p.expires) : null;
    const tags = extractCities(feature);
    return {
      id: p.id,
      event: p.event || CONFIG.event,
      headline: p.headline || p.event || CONFIG.event,
      area,
      severity: p.severity || 'Unknown',
      certainty: p.certainty || 'Unknown',
      urgency: p.urgency || 'Unknown',
      description: p.description || '',
      instruction: p.instruction || '',
      effective: p.effective || null,
      expires: expires,
      sent: p.sent || null,
      status: p.status || 'Unknown',
      sender: p.senderName || p.sender || '',
      tags,
      geometry,
      summary: buildSummary(p, tags),
      raw: feature
    };
  }

  function buildSummary(props, tags) {
    const parts = [];
    if (props.headline) parts.push(props.headline);
    if (props.areaDesc) parts.push(props.areaDesc);
    if (tags.length) parts.push('Nearby cities: ' + tags.slice(0, 6).join(', '));
    return parts.join(' • ');
  }

  function extractCities(feature) {
    const matching = [];
    const geo = feature.geometry;
    if (!geo) return matching;
    const polygons = geo.type === 'Polygon' ? [geo.coordinates] : geo.type === 'MultiPolygon' ? geo.coordinates : [];
    for (const [name, lat, lon] of CITY_MARKERS) {
      for (const polygon of polygons) {
        if (pointInPolygon([lon, lat], polygon)) {
          matching.push(name);
          break;
        }
      }
    }
    return matching;
  }

  function pointInPolygon(point, polygon) {
    if (!polygon || !polygon.length) return false;
    const ring = polygon[0];
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > point[1]) !== (yj > point[1])) &&
        (point[0] < (xj - xi) * (point[1] - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function renderMap() {
    if (!state.map) return;
    state.alertLayer.clearLayers();
    state.layersById.clear();
    const bounds = [];
    state.markers = [];
    state.alerts.forEach((alert, idx) => {
      const layer = geometryToLayer(alert.geometry, idx);
      if (layer) {
        layer.addTo(state.alertLayer);
        const layerBounds = layer.getBounds ? layer.getBounds() : null;
        if (layerBounds && layerBounds.isValid()) bounds.push(layerBounds);
        state.markers.push(layer);
        state.layersById.set(alert.id, layer);
      }
    });
    if (state.location) {
      bounds.push(L.latLngBounds([[state.location.lat, state.location.lon], [state.location.lat, state.location.lon]]));
    }
    if (bounds.length) {
      const fit = bounds.reduce((acc, bound) => acc.extend(bound), L.latLngBounds(bounds[0]));
      if (fit.isValid()) state.map.fitBounds(fit.pad(0.15), { animate: !state.settings.reduceMotion });
    }
    updateLocationLayer();
    toggleCities();
  }

  function geometryToLayer(geometry, index) {
    if (!geometry) return null;
    const style = {
      color: '#fb7185',
      weight: 2.5,
      opacity: 0.9,
      fillColor: '#fb7185',
      fillOpacity: 0.18
    };
    if (geometry.type === 'Polygon') {
      return L.polygon(latLngs(geometry.coordinates), style).bindPopup(`Alert area ${index + 1}`);
    }
    if (geometry.type === 'MultiPolygon') {
      return L.multiPolygon(geometry.coordinates.map(latLngs), style).bindPopup(`Alert area ${index + 1}`);
    }
    return null;
  }

  function latLngs(coords) {
    return coords.map(ring => ring.map(([lon, lat]) => [lat, lon]));
  }

  function renderAlerts() {
    const filter = (state.settings.filterText || '').toLowerCase().trim();
    const visible = state.alerts.filter(alert => {
      if (state.settings.hideAck && state.acknowledged.has(alert.id)) return false;
      if (state.settings.nearMeOnly && state.location) {
        const near = alert.tags.includes(closestCityName(state.location.lat, state.location.lon));
        if (!near && !alert.tags.length) return true;
        if (!near) return false;
      }
      if (!filter) return true;
      const haystack = [alert.headline, alert.area, alert.summary, alert.description, alert.instruction, alert.id, alert.tags.join(' ')].join(' ').toLowerCase();
      return haystack.includes(filter);
    });

    el.alertsCount.textContent = visible.length.toString();
    if (!visible.length) {
      el.alertsList.innerHTML = `
        <div class="alert-card">
          <div class="mini">No alerts match the current filters.</div>
          <div class="alert-summary" style="margin-top:8px;">Try clearing the search box or turning off “near me only”. Humanity does love hiding the thing it wants.</div>
        </div>`;
      return;
    }

    el.alertsList.innerHTML = visible.map(alert => renderAlertCard(alert)).join('');
    visible.forEach(alert => {
      const card = document.querySelector(`[data-alert-id="${cssEscape(alert.id)}"]`);
      if (!card) return;
      card.querySelector('[data-action="toggle"]').addEventListener('click', () => {
        if (state.collapsed.has(alert.id)) state.collapsed.delete(alert.id); else state.collapsed.add(alert.id);
        renderAlerts();
      });
      card.querySelector('[data-action="ack"]').addEventListener('click', () => {
        toggleAck(alert.id, true);
        renderAlerts();
      });
      card.querySelector('[data-action="unack"]').addEventListener('click', () => {
        toggleAck(alert.id, false);
        renderAlerts();
      });
      card.querySelector('[data-action="copy"]').addEventListener('click', () => copyAlert(alert));
      card.querySelector('[data-action="focus"]').addEventListener('click', () => focusAlert(alert));
    });
  }

  function renderAlertCard(alert) {
    const acknowledged = state.acknowledged.has(alert.id);
    const collapsed = state.collapsed.has(alert.id);
    const cities = alert.tags.slice(0, 6);
    const expiry = alert.expires ? formatDate(alert.expires) : 'No expiration listed';
    const when = alert.effective ? formatDate(new Date(alert.effective)) : 'Effective now';
    return `
      <article class="alert-card ${acknowledged ? 'acknowledged' : ''} ${collapsed ? 'expanded' : ''}" data-alert-id="${escapeHtml(alert.id)}">
        <div class="alert-head">
          <div>
            <h4 class="alert-title">${escapeHtml(alert.headline)}</h4>
            <div class="alert-meta">${escapeHtml(alert.area || 'Area not listed')} · ${escapeHtml(alert.severity)} severity · ${escapeHtml(alert.urgency)} urgency</div>
          </div>
          <div class="chip ${acknowledged ? 'good' : 'warn'}"><span class="dot ${acknowledged ? 'good' : 'warn'}"></span><strong>${acknowledged ? 'Checked' : 'Live'}</strong></div>
        </div>
        <div class="alert-body">
          <div class="alert-summary">${escapeHtml(alert.summary || alert.description || 'No summary available.')}</div>
          <div class="alert-tags">
            <span class="tag">Effective: ${escapeHtml(when)}</span>
            <span class="tag">Expires: ${escapeHtml(expiry)}</span>
            <span class="tag">ID: ${escapeHtml(alert.id.split('/').pop() || alert.id)}</span>
            ${cities.length ? `<span class="tag">Cities: ${escapeHtml(cities.join(', '))}</span>` : ''}
          </div>
          <div class="alert-actions">
            <button class="btn small" data-action="toggle">${collapsed ? 'Expand details' : 'Minimize'}</button>
            <button class="btn small primary" data-action="ack">Check acknowledged</button>
            <button class="btn small" data-action="unack">Uncheck acknowledged</button>
            <button class="btn small" data-action="copy">Copy visible</button>
            <button class="btn small" data-action="focus">Focus map</button>
          </div>
          <div class="alert-expanded">${escapeHtml(alert.description || 'No description provided.')}

${escapeHtml(alert.instruction || 'No instruction provided.')}</div>
        </div>
      </article>`;
  }

  function renderHistory() {
    const items = state.history.slice(0, 8).map(item => `<li>${escapeHtml(item)}</li>`).join('');
    el.historyList.innerHTML = items || '<li class="muted">No history yet.</li>';
  }

  function renderHistoryEntry(text) {
    state.history.unshift(`${formatClock(new Date())} · ${text}`);
    state.history = state.history.slice(0, 20);
    saveHistory();
    renderHistory();
  }

  function saveHistory() {
    localStorage.setItem(CONFIG.storageKey + ':history', JSON.stringify(state.history));
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.storageKey + ':history') || '[]');
    } catch {
      return [];
    }
  }

  state.history = loadHistory();
  renderHistory();

  function toggleAck(id, value) {
    if (value) state.acknowledged.add(id); else state.acknowledged.delete(id);
    saveAck();
  }

  function saveAck() {
    localStorage.setItem(CONFIG.storageKey + ':ack', JSON.stringify([...state.acknowledged]));
  }

  function loadAck() {
    try {
      return new Set(JSON.parse(localStorage.getItem(CONFIG.storageKey + ':ack') || '[]'));
    } catch {
      return new Set();
    }
  }

  state.acknowledged = loadAck();

  function markVisible(value) {
    const ids = visibleAlertIds();
    ids.forEach(id => {
      if (value) state.acknowledged.add(id); else state.acknowledged.delete(id);
    });
    saveAck();
    renderAlerts();
  }

  function visibleAlertIds() {
    const filter = (state.settings.filterText || '').toLowerCase().trim();
    return state.alerts.filter(alert => {
      if (state.settings.hideAck && state.acknowledged.has(alert.id)) return false;
      if (!filter) return true;
      const haystack = [alert.headline, alert.area, alert.summary, alert.description, alert.instruction, alert.id, alert.tags.join(' ')].join(' ').toLowerCase();
      return haystack.includes(filter);
    }).map(a => a.id);
  }

  function copyVisibleAlerts() {
    const text = state.alerts.map(alert => `${alert.headline}\n${alert.area}\n${alert.description}\n${alert.instruction}`.trim()).join('\n\n---\n\n');
    navigator.clipboard?.writeText(text).then(() => log('Copied visible alerts.')).catch(() => log('Copy failed.'));
  }

  function copyAlert(alert) {
    const text = `${alert.headline}\n${alert.area}\n${alert.description}\n${alert.instruction}`.trim();
    navigator.clipboard?.writeText(text).then(() => log(`Copied ${alert.id}.`)).catch(() => log('Copy failed.'));
  }

  function focusAlert(alert) {
    if (!state.map) return;
    const layer = state.layersById.get(alert.id);
    if (layer && layer.getBounds && layer.getBounds().isValid()) {
      state.map.fitBounds(layer.getBounds().pad(0.2), { animate: !state.settings.reduceMotion });
      return;
    }
    log('No geometry available for that alert.');
  }

  function focusMapOnAlerts(force = false) {
    if (!state.map) return;
    const layers = [];
    state.alerts.forEach(alert => {
      if (alert.geometry) {
        const layer = geometryToLayer(alert.geometry, 0);
        if (layer && layer.getBounds && layer.getBounds().isValid()) layers.push(layer.getBounds());
      }
    });
    if (state.location) layers.push(L.latLngBounds([[state.location.lat, state.location.lon], [state.location.lat, state.location.lon]]));
    if (!layers.length) {
      if (!force) log('Nothing to focus yet.');
      return;
    }
    const combined = layers.reduce((acc, item) => acc.extend(item), L.latLngBounds(layers[0]));
    state.map.fitBounds(combined.pad(0.15), { animate: !state.settings.reduceMotion });
  }

  function closestCityName(lat, lon) {
    let best = CITY_MARKERS[0][0];
    let bestDist = Infinity;
    CITY_MARKERS.forEach(([name, clat, clon]) => {
      const d = Math.hypot((lat - clat), (lon - clon) * Math.cos((lat + clat) * Math.PI / 360));
      if (d < bestDist) {
        best = name;
        bestDist = d;
      }
    });
    return best;
  }

  function useLocation() {
    if (!navigator.geolocation) {
      log('Geolocation is not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(position => {
      state.location = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy
      };
      saveLocation();
      updateLocationLayer();
      updateLocationBadge();
      renderAlerts();
      focusMapOnAlerts(true);
      log(`Saved location at ${state.location.lat.toFixed(3)}, ${state.location.lon.toFixed(3)}.`);
    }, error => log('Location failed: ' + error.message), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  function updateLocationBadge() {
    if (!state.location) {
      el.locationText.textContent = 'Location not set';
      return;
    }
    el.locationText.textContent = `${state.location.lat.toFixed(3)}, ${state.location.lon.toFixed(3)}`;
  }

  function exportSettings() {
    const payload = {
      settings: state.settings,
      location: state.location,
      acknowledged: [...state.acknowledged],
      history: state.history
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = CONFIG.storageKey + '-backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importSettings(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.settings) state.settings = { ...DEFAULTS, ...data.settings };
        if (data.location) state.location = data.location;
        if (Array.isArray(data.acknowledged)) state.acknowledged = new Set(data.acknowledged);
        if (Array.isArray(data.history)) state.history = data.history;
        saveSettings(); saveLocation(); saveAck(); saveHistory();
        applySettingsToInputs();
        updateLocationLayer();
        toggleCities();
        renderAlerts();
        renderHistory();
        renderStatus();
        log('Settings imported.');
      } catch (error) {
        log('Import failed: ' + error.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  async function testNotification() {
    if (typeof Notification === 'undefined') {
      log('Notifications are not supported here.');
      return;
    }
    const permission = await Notification.requestPermission();
    state.notificationPermission = permission;
    updateNotificationBadge();
    if (permission === 'granted') new Notification(CONFIG.title, { body: 'Notification test successful.' });
  }

  function notifyNewAlerts(alerts) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    alerts.slice(0, 3).forEach(alert => {
      new Notification(CONFIG.title, { body: alert.headline + ' · ' + alert.area });
    });
  }

  function alertTone(count) {
    const now = Date.now();
    state.repeatUntil = state.settings.repeatMinutes ? now + state.settings.repeatMinutes * 60 * 1000 : 0;
    if (now - state.lastSoundAt < 5000) return;
    state.lastSoundAt = now;
    playTone(count > 1 ? 'alarm' : 'alert');
  }

  function playTone(preset = 'alert') {
    if (!state.settings.enableSound) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!state.audioContext) state.audioContext = new AudioCtx();
    const ctx = state.audioContext;
    const vol = Number(state.settings.soundVolume) || 0.3;
    const len = Number(state.settings.soundLength) || 1;
    const freqs = preset === 'alarm' ? [880, 660, 880] : preset === 'clear' ? [660, 880] : [880, 740];
    const step = len / freqs.length;
    freqs.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = preset === 'clear' ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      gain.gain.value = vol / 3;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + index * step);
      osc.stop(ctx.currentTime + (index + 1) * step);
    });
  }

  async function runAllTests() {
    await testNotification();
    playTone('alarm');
    focusMapOnAlerts(true);
    if (!state.location) useLocation();
    refreshAlerts(true);
  }

  function renderStatus() {
    const count = state.alerts.length;
    const live = count ? `${count} live ${CONFIG.event.toLowerCase()}${count === 1 ? '' : 's'}` : `No active ${CONFIG.event.toLowerCase()}s`;
    el.statusText.textContent = live;
    el.statusBadge.textContent = count ? 'Live' : 'Clear';
    el.statusBadge.className = 'chip ' + (count ? 'warn' : 'good');
    el.lastChecked.textContent = state.lastFetchAt ? `Last checked: ${formatClock(state.lastFetchAt)}` : 'Last checked: never';
    el.nextRefresh.textContent = state.nextPollAt ? `Next refresh: ${formatClock(state.nextPollAt)}` : 'Next refresh: --';
    updateNotificationBadge();
    updateLocationBadge();
    el.cacheState.textContent = 'Offline cache ' + (navigator.serviceWorker ? 'enabled' : 'unavailable');
  }

  function updateNotificationBadge() {
    const value = typeof Notification === 'undefined' ? 'Unsupported' : Notification.permission;
    el.notificationState.textContent = 'Notifications: ' + value;
  }

  function setHeader(text, tone) {
    el.statusText.textContent = text;
    el.statusBadge.textContent = tone === 'good' ? 'Calm' : tone === 'bad' ? 'Alert' : 'Watch';
    el.statusBadge.className = 'chip ' + (tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : 'warn');
  }

  function updateCacheState(text) {
    el.cacheState.textContent = text;
  }

  function schedulePolling(immediate = false) {
    clearTimeout(state.pollTimer);
    const delay = Math.max(20, Number(state.settings.pollSeconds) || DEFAULTS.pollSeconds) * 1000;
    state.nextPollAt = new Date(Date.now() + delay);
    if (immediate) {
      state.pollTimer = setTimeout(() => refreshAlerts(false), delay);
    } else {
      state.pollTimer = setTimeout(() => refreshAlerts(false), delay);
    }
  }

  function tickClock() {
    if (!state.nextPollAt) return;
    const remaining = Math.max(0, Math.round((state.nextPollAt - new Date()) / 1000));
    el.nextRefresh.textContent = remaining ? `Next refresh: in ${remaining}s` : 'Next refresh: soon';
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('../sw.js').then(() => {
      updateCacheState('Offline cache ready');
    }).catch(() => {
      updateCacheState('Offline cache unavailable');
    });
  }

  function log(message) {
    renderHistoryEntry(message);
  }

  function formatClock(date) {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(date);
  }

  function cssEscape(value) {
    return String(value).replace(/"/g, '\\"');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (Number.isNaN(num)) return fallback;
    return Math.min(max, Math.max(min, num));
  }
})();
