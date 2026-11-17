/* Browser-only prototype: key stays in memory, never in project files or storage. */
let trafficKey = '', trafficTiles = null, trafficMarkers = null;
let trafficCoords = [], trafficReports = [], trafficSeen = new Set();
let incidentController = null, lastIncidentAttempt = 0, trafficGeneration = 0;
function trafficStatus(message) { document.getElementById('traffic-status').textContent=message; }
async function trafficJson(url, signal) {
  const response=await fetch(url,{signal});
  if(!response.ok) throw new Error(response.status===401||response.status===403?'Key rejected or API not enabled':response.status===429?'Traffic allowance reached':'Traffic service unavailable');
  return response.json();
}
function normalizeTomTom(data) {
  const r=data.routes?.[0];
  if(!r || !Number.isFinite(r.summary?.travelTimeInSeconds) || !r.legs?.length) throw new Error('Invalid route response');
  const coordinates=r.legs.flatMap(l=>l.points.map(p=>[p.longitude,p.latitude]));
  if(coordinates.length<2) throw new Error('No route geometry');
  const instructions=r.guidance?.instructions || [];
  return {distance:r.summary.lengthInMeters,duration:r.summary.travelTimeInSeconds,geometry:{coordinates},
    legs:[{steps:instructions.map((s,i)=>({instruction:s.message || 'Continue on route',distance:Math.max(0,(instructions[i+1]?.routeOffsetInMeters ?? r.summary.lengthInMeters)-s.routeOffsetInMeters)}))}],
    provider:'TomTom',delay:r.summary.trafficDelayInSeconds || 0,updatedAt:Date.now()};
}
async function getDrivingRoute(origin,destination,signal) {
  let fallbackReason='';
  if(trafficKey) {
    const timeout=new AbortController();
    const abort=()=>timeout.abort(); signal.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,8000);
    try {
      const query=new URLSearchParams({key:trafficKey,traffic:'true',departAt:'now',travelMode:'car',instructionsType:'text',language:'en-GB',computeTravelTimeFor:'all'});
      return normalizeTomTom(await trafficJson('https://api.tomtom.com/routing/1/calculateRoute/'+origin.lat+','+origin.lng+':'+destination.lat+','+destination.lng+'/json?'+query,timeout.signal));
    } catch(error) {
      if(signal.aborted) throw error;
      fallbackReason=error.name==='AbortError'?'Traffic request timed out':error.message;
    } finally { clearTimeout(timer);signal.removeEventListener('abort',abort); }
  }
  const url='https://router.project-osrm.org/route/v1/driving/'+origin.lng+','+origin.lat+';'+destination.lng+','+destination.lat+'?overview=full&geometries=geojson&steps=true';
  const data=await trafficJson(url,signal);
  if(!data.routes?.length) throw new Error('No route found');
  return {...data.routes[0],provider:'OSRM',fallbackReason};
}
function clearTrafficRoute() {
  ++trafficGeneration;incidentController?.abort();incidentController=null;
  trafficCoords=[];trafficReports=[];trafficSeen.clear();trafficMarkers?.clearLayers();
  const list=document.getElementById('traffic-incidents');if(list) list.replaceChildren();
}
function trafficRouteReady(route,coords) {
  trafficCoords=coords;
  const live=route.provider==='TomTom';
  document.getElementById('eta-provider').textContent=live?'TomTom · traffic-aware driving estimate':'OSRM · estimate without live traffic';
  document.getElementById('eta-detail').textContent=live?'Traffic delay: '+formatDuration(route.delay)+'. Calculated '+new Date(route.updatedAt).toLocaleTimeString()+'. Stops excluded; conditions can change.':(route.fallbackReason?route.fallbackReason+'. Using fallback. ':'')+'Road-speed assumptions only. Traffic and stops can change journey time.';
  if(trafficKey) refreshTrafficIncidents();
}
function incidentPoint(incident,coords) {
  const g=incident.geometry;
  const points=g?.type==='Point'?[g.coordinates]:g?.type==='LineString'?g.coordinates:[];
  let best=null;
  for(const p of points) {
    if(!Array.isArray(p)||!p.every(Number.isFinite)) continue;
    const projection=projectToRoute([p[1],p[0]],coords);
    if(!best || projection.distance<best.distance) best={...projection,lat:p[1],lng:p[0]};
  }
  return best;
}
async function refreshTrafficIncidents() {
  if(!trafficKey || !state.navigating || !trafficCoords.length || incidentController || Date.now()-lastIncidentAttempt<180000) return;
  lastIncidentAttempt=Date.now();
  const generation=trafficGeneration, controller=new AbortController();incidentController=controller;
  const timer=setTimeout(()=>controller.abort(),10000);
  const origin=state.originOverride || state.userPosition;
  // Bounded local window avoids country-wide requests on long journeys.
  const dx=0.15/Math.cos(origin.lat*Math.PI/180);
  const bbox=[origin.lng-dx,origin.lat-0.15,origin.lng+dx,origin.lat+0.15].join(',');
  const query=new URLSearchParams({key:trafficKey,bbox,timeValidityFilter:'present',language:'en-GB',fields:'{incidents{geometry{type,coordinates},properties{id,iconCategory,events{description},endTime}}}'});
  try {
    const data=await trafficJson('https://api.tomtom.com/traffic/services/5/incidentDetails?'+query,controller.signal);
    if(generation!==trafficGeneration) return;
    trafficReports=(data.incidents || []).map(r=>({...r,match:incidentPoint(r,trafficCoords)})).filter(r=>r.match && r.match.distance<=300).sort((a,b)=>a.match.along-b.match.along);
    trafficMarkers.clearLayers();
    const host=document.getElementById('traffic-incidents');host.replaceChildren();
    trafficReports.forEach(r=>{
      const description=r.properties.events?.map(e=>e.description).join('; ') || 'Traffic incident';
      const marker=L.circleMarker([r.match.lat,r.match.lng],{radius:9,color:'#fff',weight:2,fillColor:'#d34725',fillOpacity:1}).addTo(trafficMarkers).bindPopup(escapeHtml('TomTom: '+description));
      const button=document.createElement('button');button.className='warning-card';button.textContent=description+' · '+formatDistance(r.match.along)+' along route';
      button.onclick=()=>{map.setView(marker.getLatLng(),16);marker.openPopup();};host.appendChild(button);
    });
    trafficStatus('TomTom checked '+new Date().toLocaleTimeString()+': '+trafficReports.length+' nearby route reports. Checked roughly 17 km around the starting/current position, not the entire journey. Reports may be incomplete.');
    checkTrafficProximity();
  } catch {if(generation===trafficGeneration){trafficReports=[];trafficMarkers.clearLayers();document.getElementById('traffic-incidents').replaceChildren();trafficStatus('Incident refresh failed. Live reports unavailable; retry in 3 minutes.');}}
  finally {clearTimeout(timer);if(incidentController===controller) incidentController=null;}
}
function checkTrafficProximity() {
  if(Date.now()-lastIncidentAttempt>190000) return;
  if(!state.navigating||state.originOverride||state.usingFallbackLocation||!state.userPosition) return;
  trafficReports.forEach(r=>{
    if(r.properties.endTime && Date.parse(r.properties.endTime)<Date.now()) return;
    const id=r.properties.id;if(!id || trafficSeen.has(id)) return;
    const d=distanceMeters(state.userPosition.lat,state.userPosition.lng,r.match.lat,r.match.lng);
    if(d>500) return;
    trafficSeen.add(id);
    const toast=document.createElement('div');toast.className='live-toast';toast.setAttribute('role','status');
    toast.textContent='TomTom traffic ahead: '+(r.properties.events?.[0]?.description || 'Incident')+' · '+formatDistance(d)+' away';
    document.getElementById('toast-container').appendChild(toast);setTimeout(()=>toast.remove(),9000);
  });
}
if (typeof location === 'undefined' || location.protocol !== 'file:') document.addEventListener('DOMContentLoaded',()=>{
  trafficMarkers=L.layerGroup().addTo(map);
  const panel=document.createElement('section');panel.id='traffic-panel';
  panel.innerHTML='<details><summary>Traffic connection</summary><p class="forecast-foot">Add your TomTom browser API key to enable traffic-aware routes. The key is used only for this page session and is sent to TomTom.</p><label for="traffic-key">TomTom API key</label><input id="traffic-key" type="password" autocomplete="off" class="border rounded-lg p-2 w-full"><button id="traffic-connect" class="example-route">Connect traffic</button><button id="traffic-disconnect" class="example-route">Disconnect</button><label class="field-label"><input id="traffic-overlay" type="checkbox" disabled> Show traffic on map</label><p class="forecast-foot">Traffic colors: green = flowing, orange = slower, red = congested. Roads without a color may have no coverage.</p><p id="traffic-status" class="forecast-foot" role="status">Not connected. Routes use OSRM without live traffic.</p></details><div id="traffic-incidents"></div>';
  document.getElementById('route-panel').appendChild(panel);
  document.getElementById('traffic-connect').onclick=()=>{
    const key=document.getElementById('traffic-key').value.trim();if(!key){trafficStatus('Enter your TomTom key first.');return;}
    stopNavigation();trafficTiles?.remove();trafficTiles=null;trafficKey=key;
    document.getElementById('traffic-key').value='';document.getElementById('traffic-overlay').disabled=false;document.getElementById('traffic-overlay').checked=false;
    trafficStatus('Key configured, not yet verified. Start a route to check the connection.');
  };
  document.getElementById('traffic-disconnect').onclick=()=>{
    stopNavigation();trafficKey='';trafficTiles?.remove();trafficTiles=null;
    document.getElementById('traffic-overlay').checked=false;document.getElementById('traffic-overlay').disabled=true;trafficStatus('Disconnected. Routes use OSRM without live traffic.');
  };
  document.getElementById('traffic-overlay').onchange=e=>{
    if(!e.target.checked){trafficTiles?.remove();return;}
    if(!trafficTiles) {
      trafficTiles=L.tileLayer('https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key='+encodeURIComponent(trafficKey),{opacity:0.75,maxNativeZoom:18,maxZoom:19,attribution:'Traffic &copy; <a href="https://www.tomtom.com/">TomTom</a>'});
      trafficTiles.on('tileerror',()=>{trafficTiles.remove();document.getElementById('traffic-overlay').checked=false;trafficStatus('Traffic overlay unavailable. Check the key, API access and quota.');});
    } trafficTiles.addTo(map);
  };
  setInterval(()=>{
    if(document.hidden || !state.navigating) return;
    refreshTrafficIncidents();checkTrafficProximity();
    if(trafficKey && Date.now()-state.lastRouteFetchAt>=180000) fetchRoute().catch(()=>setNavStatus('Route refresh failed; displayed estimate may be outdated.'));
  },15000);
});

