/* UI and replaceable demo adapters. No verified incident feed or ML model. */
const DEMO_PLACES = { medicaps: {lat:22.6213,lng:75.8034,label:'Medicaps University (approximate demo pin)'}, patalpani:{lat:22.5067,lng:75.7931,label:'Patalpani waterfall (approximate demo pin)'} };
// Replace this adapter with validated model output. Values are scenarios, not predictions.
function getAreaForecasts() {
  return [
    {area:'Rau',change:18,level:'Watch closely',reason:'Illustrative scenario: an increase in theft reports.'},
    {area:'Vijay Nagar',change:12,level:'Watch closely',reason:'Illustrative scenario: more incidents than the previous period.'},
    {area:'Bhawarkuan',change:8,level:'Monitor',reason:'Illustrative scenario: a modest increase in reports.'},
    {area:'Palasia',change:0,level:'Stable',reason:'Illustrative scenario: report volume stays similar.'},
    {area:'Rajwada',change:-4,level:'Easing',reason:'Illustrative scenario: a small decline in reports.'},
    {area:'Sudama Nagar',change:-6,level:'Easing',reason:'Illustrative scenario: fewer reports next month.'},
    {area:'MG Road',change:0,level:'Stable',reason:'Illustrative scenario: no change in report volume.'}
  ];
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
let warningLayer, forecastLayer;
let routeWarnings = [], routeAlerted = new Set();

// Local tangent-plane point-to-polyline projection; returns corridor distance
// and distance along the route rather than distance to a route vertex.
function projectToRoute(point, coords) {
  let best = {distance:Infinity,along:0}, cumulative = 0;
  const scaleX = 111320 * Math.cos(point[0]*Math.PI/180), scaleY = 111320;
  for (let i=1;i<coords.length;i++) {
    const a=coords[i-1], b=coords[i];
    const ax=(a[1]-point[1])*scaleX, ay=(a[0]-point[0])*scaleY;
    const dx=(b[1]-a[1])*scaleX, dy=(b[0]-a[0])*scaleY;
    const length=Math.hypot(dx,dy), t=length ? Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(length*length))) : 0;
    const distance=Math.hypot(ax+t*dx,ay+t*dy);
    if(distance<best.distance) best={distance,along:cumulative+t*length};
    cumulative+=length;
  }
  return best;
}
function clearRouteWarnings() {
  warningLayer?.clearLayers(); routeWarnings=[]; routeAlerted.clear();
  document.getElementById('route-warnings').innerHTML='<div class="warning-heading"><h3>Nearby records</h3><b>Sample data</b></div><p class="empty-route">Plan a journey to explore records along the route.</p>';
}
function renderRouteWarnings(coords) {
  warningLayer.clearLayers();
  // Historical source stays independent of analytics filters.
  let records=CRIME_DATA.map(r=>({...r,source:'Historical sample · '+formatDate(r.timestamp)}));
  // Explicit route-relative fixtures demonstrate multiple warnings on any preview;
  // they are never presented as actual events at these locations.
  if(state.demoRoute) {
    [0.2,0.5,0.8].forEach((fraction,i)=>{
      const p=coords[Math.min(coords.length-1,Math.floor((coords.length-1)*fraction))];
      records.push({id:'route-demo-'+i,latitude:p[0],longitude:p[1],type:['Accident','Theft','Road obstruction'][i],severity:['High','Medium','Low'][i],source:'Fictional route example · not a recorded event'});
    });
  }
  routeWarnings=records.map(r=>({...r,...projectToRoute([r.latitude,r.longitude],coords)})).filter(r=>r.distance<=300).sort((a,b)=>a.along-b.along);
  const host=document.getElementById('route-warnings');
  host.innerHTML='<div class="warning-heading"><h3>Nearby records</h3><b>'+routeWarnings.length+' samples</b></div><p class="forecast-foot">Within 300 m · historical / fictional samples, not active reports. Coverage is incomplete; no matches does not mean safe.</p><div class="route-record-list"></div>';
  if(!routeWarnings.length) host.insertAdjacentHTML('beforeend','<p class="empty-route">No sample records near this route. Coverage is incomplete.</p>');
  routeWarnings.forEach((r,i)=>{
    const marker=L.circleMarker([r.latitude,r.longitude],{radius:9,color:'#fff',weight:3,fillColor:SEVERITY_COLOR[r.severity],fillOpacity:1}).addTo(warningLayer).bindPopup(escapeHtml('DEMO · '+r.type+' · '+r.source));
    const button=document.createElement('button'); button.className='warning-card';
    button.innerHTML='<span class="warning-number">'+(i+1)+'</span><span><strong>'+escapeHtml(r.type)+'</strong><small>'+formatDistance(r.along)+' from start · '+Math.round(r.distance)+' m from route</small><small>'+escapeHtml(r.source)+'</small></span><span aria-hidden="true">↗</span>';
    button.onclick=()=>{map.setView(marker.getLatLng(),16);marker.openPopup();}; host.querySelector('.route-record-list').appendChild(button);
  });
  checkRouteProximity();
}
function checkRouteProximity() {
  if(!state.navigating || state.originOverride || state.usingFallbackLocation || !state.userPosition) return;
  routeWarnings.forEach(r=>{
    const distance=distanceMeters(state.userPosition.lat,state.userPosition.lng,r.latitude,r.longitude);
    if(distance<=500 && !routeAlerted.has(r.id)) {
      routeAlerted.add(r.id);
      showLiveToast({...r,blurb:'Historical sample near your route; not an active report',timestamp:r.timestamp},distance);
    }
  });
}
function setWorkspace(view, revealSidebar = true) {
  window.dashboardAnalysis?.setExpanded(false, false);
  document.body.dataset.workspace=view;
  if (revealSidebar) window.dashboardSidebar?.setOpen(true);
  ['forecast','route'].forEach(v=>{const tab=document.getElementById('tab-'+v);tab.classList.toggle('active',v===view);tab.setAttribute('aria-pressed',String(v===view));});
  const route=view==='route';
  document.getElementById('forecast-panel').hidden=route;
  document.getElementById('history-panel').hidden=route;
  document.getElementById('route-panel').hidden=!route;
  document.getElementById('simulation-panel').hidden=!route;
  if(route) {map.removeLayer(forecastLayer);map.removeLayer(clusterLayer);map.removeLayer(heatLayer);}
  renderMap(getFilteredData());
  document.getElementById('map-region-badge').textContent=route?'Driving route · sample warnings':'Indore · illustrative forecasts';
  document.querySelector('.side-scroll').scrollTop=0;
  map.invalidateSize();
}
if (typeof location === 'undefined' || location.protocol !== 'file:') document.addEventListener('DOMContentLoaded',()=>{
  warningLayer=L.layerGroup().addTo(map);forecastLayer=L.layerGroup();
  const scroll=document.querySelector('#sidebar > .side-scroll');
  const history=document.createElement('details');history.id='history-panel';
  history.innerHTML='<summary>Explore historical sample data</summary><p class="forecast-foot">Filters affect historical records only. The score below is a demo metric, not a validated safety measure.</p>';
  [...scroll.children].forEach(el=>{if(el.tagName==='SECTION' && !el.id) history.appendChild(el); else if(el.tagName==='DIV') el.remove();});
  scroll.appendChild(history);
  history.addEventListener('toggle', () => { if (history.open) renderChart(getFilteredData()); });
  getAreaForecasts().forEach(f=>{
    const button=document.createElement('button');button.className='forecast-card';
    button.innerHTML='<span><strong>'+escapeHtml(f.area)+'</strong><small>'+f.level+'</small></span><span class="forecast-change '+(f.change>0?'rising':'')+'">'+(f.change>0?'+':'')+f.change+'%<small>sample change</small></span>';
    const center=NEIGHBORHOOD_CENTERS[f.area];
    const circle=L.circle([center.lat,center.lng],{radius:450,color:f.change>0?'#C1502E':'#2C5C8A',weight:1,fillOpacity:0.14}).addTo(forecastLayer).bindPopup('<b>'+escapeHtml(f.area)+'</b><br>'+escapeHtml(f.reason)+'<br>Demo only · not a model prediction');
    button.onclick=()=>{setMapMode('cluster');document.querySelectorAll('.forecast-card').forEach(c=>c.classList.remove('selected'));button.classList.add('selected');map.setView([center.lat,center.lng],14);circle.openPopup();};
    document.getElementById('forecast-list').appendChild(button);
  });
  document.getElementById('tab-forecast').onclick=()=>setWorkspace('forecast');
  document.getElementById('tab-route').onclick=()=>setWorkspace('route');
  let originSearchVersion=0, originMarker=null;
  function updateOrigin() {
    ++originSearchVersion;
    stopNavigation(); state.demoRoute=false;
    const mode=document.getElementById('origin-mode').value;
    state.originOverride=mode==='medicaps'?DEMO_PLACES.medicaps:null;
    document.getElementById('origin-manual').hidden=mode!=='manual';
    document.getElementById('origin-results').replaceChildren();
    document.getElementById('origin-summary').textContent=state.originOverride?.label || (mode==='gps'?'GPS will be requested when you start navigation.':'Search and select a starting place.');
    document.getElementById('nav-start').textContent=mode==='gps'?'Start navigation':'Preview route';
    if(originMarker){map.removeLayer(originMarker);originMarker=null;}
  }
  document.getElementById('origin-mode').onchange=updateOrigin;
  document.getElementById('place-search-scope').onchange=()=>{
    document.getElementById('origin-input').dispatchEvent(new Event('input'));
    document.getElementById('nav-search-input').dispatchEvent(new Event('input'));
    document.getElementById('origin-results').replaceChildren();
    setNavStatus('Search area changed. Search again to choose a location.');
  };
  document.getElementById('origin-input').oninput=()=>{if(state.originOverride) updateOrigin(); else ++originSearchVersion;};
  document.getElementById('origin-input').onkeydown=e=>{if(e.key==='Enter') document.getElementById('origin-search').click();};
  document.getElementById('origin-search').onclick=async()=>{
    const query=document.getElementById('origin-input').value.trim(); if(!query) return;
    updateOrigin(); const version=originSearchVersion;
    const host=document.getElementById('origin-results');host.textContent='Searching…';
    try {
      const results=await searchPlaces(query);
      if(version!==originSearchVersion) return;
      host.replaceChildren();
      if(!results.length) host.textContent='No match in this area. Add a landmark or choose All India.';
      results.forEach(place=>{
        const button=placeResultButton(place);
        button.onclick=()=>{
          ++originSearchVersion;state.originOverride=place;
          document.getElementById('origin-summary').textContent='Starting point: '+place.label;
          host.replaceChildren();
          originMarker=L.marker([place.lat,place.lng]).addTo(map).bindPopup(escapeHtml('Starting point: '+place.label));
          map.setView([place.lat,place.lng],15);
          setNavStatus('Starting point: '+place.precision+'. Set a destination to continue.');
        };host.appendChild(button);
      });
    } catch {if(version===originSearchVersion) host.textContent='Search failed. Check your connection and retry.';}
  };
  document.getElementById('example-route').onclick=()=>{document.getElementById('origin-mode').value='medicaps';updateOrigin();state.demoRoute=true;const d=DEMO_PLACES.patalpani;setDestination(d.lat,d.lng,d.label);document.getElementById('nav-search-input').value='Patalpani waterfall';startNavigation();};
  document.getElementById('nav-status').setAttribute('role','status');
  document.getElementById('toast-container').setAttribute('aria-live','polite');
  setWorkspace('forecast', false);
});
