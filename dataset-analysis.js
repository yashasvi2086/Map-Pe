/* Counts of the same filtered records used by the map; no model predictions. */
function buildDatasetAnalysis(records, { regions, types, referenceDate, lookbackDays }) {
  const areaCounts = new Map(regions.map(name => [name, 0]));
  const typeCounts = new Map(types.map(name => [name, 0]));
  const end = new Date(referenceDate);
  const start = new Date(end);
  start.setDate(start.getDate() - lookbackDays);
  const weeks = [];
  for (let offset = 0; offset <= lookbackDays; offset += 7) {
    const from = new Date(start);
    from.setDate(from.getDate() + offset);
    const to = new Date(from);
    to.setDate(to.getDate() + Math.min(6, lookbackDays - offset));
    weeks.push({ from, to, count: 0 });
  }
  records.forEach(record => {
    areaCounts.set(record.location_name, (areaCounts.get(record.location_name) || 0) + 1);
    typeCounts.set(record.type, (typeCounts.get(record.type) || 0) + 1);
    const age = Math.floor((new Date(record.timestamp) - start) / 86400000);
    if (age >= 0 && age <= lookbackDays) weeks[Math.floor(age / 7)].count++;
  });
  return {
    total: records.length,
    areas: [...areaCounts].map(([label, count]) => ({ label, count })),
    types: [...typeCounts].map(([label, count]) => ({ label, count })),
    weeks,
    start,
    end
  };
}
if (typeof module !== 'undefined') module.exports = { buildDatasetAnalysis };

if (typeof document !== 'undefined' && location.protocol !== 'file:') document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const scroll = sidebar.querySelector('.side-scroll');
  const mapWorkspace = document.querySelector('main');
  const openButton = document.getElementById('open-analysis');
  const panel = document.createElement('section');
  panel.id = 'dataset-analysis';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'analysis-title');
  panel.innerHTML = `
    <div class="analysis-heading">
      <div><p class="eyebrow">AREA FORECASTS / DATASET ANALYSIS</p><h2 id="analysis-title" tabindex="-1">Understand the data behind the map.</h2><p class="analysis-intro">Compare places, follow the timeline, and explore the mix of incidents.</p></div>
      <button class="analysis-map-button" id="analysis-to-map" type="button">View on map ↗</button>
    </div>
    <p class="analysis-demo-note">Sample incident data · Descriptive counts, not ML predictions. Actual training data is not connected yet.</p>
    <div class="analysis-filter-panel">
      <div class="analysis-filter-row">
        <label>Neighborhood<select id="analysis-region"><option value="all">All neighborhoods</option></select></label>
        <label class="analysis-time-label">Timeframe <span id="analysis-days-label"></span><input id="analysis-days" type="range" min="7" max="90" step="1" value="90"></label>
        <button id="analysis-reset" type="button">Reset filters</button>
      </div>
      <fieldset><legend>Crime types <span>· select one or more</span></legend><div id="analysis-types"></div></fieldset>
    </div>
    <div class="analysis-stats" aria-live="polite">
      <div><span>Matching records</span><strong id="analysis-total">0</strong></div>
      <div><span>Neighborhoods represented</span><strong id="analysis-areas">0</strong></div>
      <div><span>Most common type</span><strong id="analysis-top-type">—</strong></div>
      <div><span>Selected period</span><strong id="analysis-period"></strong></div>
    </div>
    <p id="analysis-empty" class="analysis-demo-note" hidden>No records match these filters. Select more crime types, widen the timeframe, or reset the filters.</p>
    <p class="analysis-chart-hint">Select a bar or pie slice to focus the data. Then choose View on map to see the same selection geographically.</p>
    <div class="analysis-chart-grid">
      <article class="analysis-chart-card"><div class="analysis-chart-title"><span>01 / WHERE</span><h3>Incidents by neighborhood</h3><p>Record counts, not population-adjusted crime rates.</p></div><div class="analysis-canvas"><canvas id="analysis-bar" role="img" aria-label="Bar chart of incident counts by neighborhood. Values and selection buttons are in the table below."></canvas></div><details><summary>View counts / select a neighborhood</summary><div id="analysis-bar-table"></div></details></article>
      <article class="analysis-chart-card"><div class="analysis-chart-title"><span>02 / WHEN</span><h3>Incidents over time</h3><p>Weekly totals; the final period can be shorter than seven days.</p></div><div class="analysis-canvas"><canvas id="analysis-line" role="img" aria-label="Line chart of weekly incident totals. Values are in the table below."></canvas></div><details><summary>View weekly counts</summary><div id="analysis-line-table"></div></details></article>
      <article class="analysis-chart-card analysis-pie-card"><div class="analysis-chart-title"><span>03 / WHAT</span><h3>Crime type breakdown</h3><p>Share of the currently selected records.</p></div><div class="analysis-pie-layout"><div class="analysis-canvas"><canvas id="analysis-pie" role="img" aria-label="Pie chart of crime types. Counts, percentages and selection buttons are listed alongside."></canvas></div><div id="analysis-pie-table"></div></div></article>
    </div>
    <p class="analysis-footer">Charts and map share the same neighborhood, crime-type and timeframe filters. Forecast percentage cards remain separate illustrative scenarios.</p><button class="analysis-map-button" id="analysis-bottom-map" type="button">View selection on map ↗</button>`;
  scroll.append(panel);
  const regionSelect = panel.querySelector('#analysis-region');
  const daysInput = panel.querySelector('#analysis-days');
  NEIGHBORHOODS.forEach(region => {
    const option = document.createElement('option');
    option.value = option.textContent = region;
    regionSelect.append(option);
  });
  const typeHost = panel.querySelector('#analysis-types');
  CRIME_TYPES.forEach(type => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = type;
    button.dataset.type = type;
    button.onclick = () => {
      if (state.activeTypes.has(type)) state.activeTypes.delete(type);
      else state.activeTypes.add(type);
      applyFilters();
    };
    typeHost.append(button);
  });
  let expanded = false;
  let sidebarScroll = 0;
  let mapReturnTimer = null;
  let latest;
  const charts = {};
  const palette = ['#2C5C8A', '#4C7FA8', '#E8A33D', '#C1502E', '#7A1F2B', '#6B7C8F'];
  const dateLabel = date => date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const dateFull = date => date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  function applyFilters() {
    document.getElementById('region-select').value = state.region;
    document.getElementById('lookback-range').value = state.lookbackDays;
    updateLookbackLabel();
    renderTypeChips();
    updateAll();
  }
  regionSelect.onchange = () => { state.region = regionSelect.value; applyFilters(); };
  daysInput.oninput = () => { state.lookbackDays = Number(daysInput.value); applyFilters(); };
  panel.querySelector('#analysis-reset').onclick = () => {
    state.region = 'all';
    state.activeTypes = new Set(CRIME_TYPES);
    state.lookbackDays = 90;
    applyFilters();
  };
  function chooseArea(area) { state.region = area; applyFilters(); }
  function chooseType(type) { state.activeTypes = new Set([type]); applyFilters(); }
  function table(host, rows, heading, action, shares = false) {
    host.replaceChildren();
    const tableElement = document.createElement('table');
    tableElement.innerHTML = '<thead><tr><th scope="col">' + heading + '</th><th scope="col">Records</th>' + (shares ? '<th scope="col">Share</th>' : '') + '</tr></thead>';
    const body = document.createElement('tbody');
    rows.forEach(row => {
      const tr = document.createElement('tr');
      const name = document.createElement('th');
      name.scope = 'row';
      if (action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = row.label;
        if (shares) {
          const swatch = document.createElement('span');
          swatch.className = 'analysis-type-swatch';
          swatch.style.background = palette[CRIME_TYPES.indexOf(row.label) % palette.length] || '#6B7C8F';
          swatch.setAttribute('aria-hidden', 'true');
          button.prepend(swatch);
        }
        button.onclick = () => action(row.label);
        name.append(button);
      } else name.textContent = row.label;
      const count = document.createElement('td');
      count.textContent = row.count;
      tr.append(name, count);
      if (shares) {
        const share = document.createElement('td');
        share.textContent = latest.total ? (100 * row.count / latest.total).toFixed(1) + '%' : '—';
        tr.append(share);
      }
      body.append(tr);
    });
    tableElement.append(body);
    host.append(tableElement);
  }
  function drawChart(key, type, labels, values, extra, select) {
    if (charts[key]) {
      charts[key].data.labels = labels;
      charts[key].data.datasets[0].data = values;
      Object.assign(charts[key].data.datasets[0], extra);
      charts[key].update('none');
      return;
    }
    charts[key] = new Chart(panel.querySelector('#analysis-' + key), {
      type,
      data: { labels, datasets: [{ label: 'Records', data: values, ...extra }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        onClick: select ? (event, items, chart) => { if (items.length) select(chart.data.labels[items[0].index]); } : undefined,
        onHover: select ? (event, items) => { event.native.target.style.cursor = items.length ? 'pointer' : 'default'; } : undefined,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => {
          const count = type === 'pie' ? context.parsed : context.parsed.y;
          return count + ' records' + (type === 'pie' && latest.total ? ' · ' + (100 * count / latest.total).toFixed(1) + '%' : '');
        } } } },
        scales: type === 'pie' ? {} : {
          x: { grid: { display: false }, ticks: { color: '#526476', font: { size: 11 }, maxRotation: 35 } },
          y: { beginAtZero: true, ticks: { precision: 0, color: '#526476' }, title: { display: true, text: 'Records' }, grid: { color: '#edf1f5' } }
        }
      }
    });
  }
  function draw() {
    if (!expanded || !latest) return;
    drawChart('bar', 'bar', latest.areas.map(row => row.label), latest.areas.map(row => row.count), { backgroundColor: '#2C5C8A', borderRadius: 4, maxBarThickness: 48 }, chooseArea);
    drawChart('line', 'line', latest.weeks.map(week => dateLabel(week.from)), latest.weeks.map(week => week.count), { borderColor: '#2C5C8A', backgroundColor: '#2C5C8A18', fill: true, tension: 0, pointRadius: 3, borderWidth: 2 });
    const slices = latest.types.filter(row => row.count > 0);
    drawChart('pie', 'pie', slices.map(row => row.label), slices.map(row => row.count), { backgroundColor: slices.map(row => palette[CRIME_TYPES.indexOf(row.label) % palette.length] || '#6B7C8F'), borderColor: '#fff', borderWidth: 3 }, chooseType);
    table(panel.querySelector('#analysis-bar-table'), latest.areas, 'Neighborhood', chooseArea);
    table(panel.querySelector('#analysis-line-table'), latest.weeks.map(week => ({ label: dateLabel(week.from) + ' – ' + dateFull(week.to), count: week.count })), 'Period');
    table(panel.querySelector('#analysis-pie-table'), latest.types, 'Crime type', chooseType, true);
    panel.querySelector('#analysis-empty').hidden = latest.total !== 0;
  }
  function render(data) {
    latest = buildDatasetAnalysis(data, { regions: NEIGHBORHOODS, types: CRIME_TYPES, referenceDate: TODAY, lookbackDays: state.lookbackDays });
    regionSelect.value = state.region;
    daysInput.value = state.lookbackDays;
    panel.querySelector('#analysis-days-label').textContent = '· ' + state.lookbackDays + ' days';
    [...typeHost.children].forEach(button => button.setAttribute('aria-pressed', String(state.activeTypes.has(button.dataset.type))));
    panel.querySelector('#analysis-total').textContent = latest.total;
    panel.querySelector('#analysis-areas').textContent = latest.areas.filter(row => row.count > 0).length;
    const highest = Math.max(0, ...latest.types.map(row => row.count));
    const leaders = latest.types.filter(row => row.count === highest && highest > 0);
    panel.querySelector('#analysis-top-type').textContent = leaders.length > 1 ? 'Tied (' + leaders.length + ' types)' : leaders[0]?.label || '—';
    panel.querySelector('#analysis-period').textContent = dateLabel(latest.start) + ' – ' + dateFull(latest.end);
    document.getElementById('analysis-preview').textContent = latest.total + ' matching sample records · ' + (state.region === 'all' ? 'All neighborhoods' : state.region);
    if (document.body.dataset.workspace === 'forecast') document.getElementById('map-region-badge').textContent = (state.region === 'all' ? 'Indore' : state.region) + ' · ' + latest.total + ' sample records';
    draw();
  }
  function setExpanded(value, focus = true) {
    if (value === expanded) return;
    if (value && document.body.dataset.workspace !== 'forecast') return;
    clearTimeout(mapReturnTimer);
    expanded = value;
    if (value) {
      sidebarScroll = scroll.scrollTop;
      // Suspend geographic overlays while their container has no visible size.
      map.removeLayer(heatLayer);
      map.removeLayer(clusterLayer);
      map.removeLayer(forecastLayer);
    }
    document.body.dataset.analysis = value ? 'expanded' : 'map';
    panel.hidden = !value;
    mapWorkspace.hidden = value;
    document.getElementById('forecast-panel').hidden = value;
    document.getElementById('history-panel').hidden = value;
    openButton.setAttribute('aria-expanded', String(value));
    if (value) {
      window.dashboardSidebar.setOpen(true);
      document.getElementById('sidebar-backdrop').hidden = true;
      scroll.scrollTop = 0;
      render(getFilteredData());
      requestAnimationFrame(() => {
        Object.values(charts).forEach(chart => chart.resize());
        if (focus) panel.querySelector('#analysis-title').focus({ preventScroll: true });
      });
    } else {
      scroll.scrollTop = sidebarScroll;
      // On phones, show the map unobscured when returning from full analysis.
      if (matchMedia('(max-width: 1023px)').matches) window.dashboardSidebar.setOpen(false, false);
      mapReturnTimer = setTimeout(() => {
        map.invalidateSize({ pan: false });
        renderMap(getFilteredData());
        if (focus) {
          if (sidebar.dataset.open === 'true') openButton.focus({ preventScroll: true });
          else document.getElementById('sidebar-toggle').focus();
          const records = getFilteredData();
          if (records.length) map.fitBounds(L.latLngBounds(records.map(record => [record.latitude, record.longitude])), { padding: [50, 50], maxZoom: 15, animate: false });
        }
      }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260);
    }
  }
  window.dashboardAnalysis = { render, setExpanded };
  openButton.onclick = () => setExpanded(true);
  panel.querySelector('#analysis-to-map').onclick = () => setExpanded(false);
  panel.querySelector('#analysis-bottom-map').onclick = () => setExpanded(false);
  render(getFilteredData());
});
