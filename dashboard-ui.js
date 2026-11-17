/* Dashboard help, verified contact directory, and responsive sidebar controls. */
(() => {
  if (location.protocol === 'file:') return;
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebar-toggle');
  const backdrop = document.getElementById('sidebar-backdrop');
  const mobile = matchMedia('(max-width: 1023px)');
  const preferenceKey = 'dashboard.sidebar.open';
  let desktopOpen = true;
  try { desktopOpen = localStorage.getItem(preferenceKey) !== 'false'; } catch {}
  function resizeMap() {
    if (!document.querySelector('main').hidden && typeof map !== 'undefined' && map) map.invalidateSize({ pan: false });
  }
  function setOpen(open, remember = true) {
    if (!open) window.dashboardAnalysis?.setExpanded(false, false);
    if (!open && sidebar.contains(document.activeElement)) toggle.focus();
    sidebar.dataset.open = String(open);
    sidebar.inert = !open;
    sidebar.setAttribute('aria-hidden', String(!open));
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Hide sidebar' : 'Show sidebar');
    toggle.title = open ? 'Hide sidebar' : 'Show sidebar';
    backdrop.hidden = !mobile.matches || !open || document.body.dataset.analysis === 'expanded';
    if (remember && !mobile.matches) {
      desktopOpen = open;
      try { localStorage.setItem(preferenceKey, String(open)); } catch {}
    }
    requestAnimationFrame(resizeMap);
  }
  window.dashboardSidebar = { setOpen };
  toggle.addEventListener('click', () => setOpen(sidebar.dataset.open !== 'true'));
  backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && mobile.matches && sidebar.dataset.open === 'true' && !document.querySelector('dialog[open]')) setOpen(false);
  });
  sidebar.addEventListener('transitionend', resizeMap);
  // Resize throughout the slide so tiles and map controls follow the available space.
  new ResizeObserver(resizeMap).observe(document.querySelector('main'));
  mobile.addEventListener('change', () => setOpen(document.body.dataset.analysis === 'expanded' ? true : mobile.matches ? false : desktopOpen, false));
  backdrop.classList.remove('hidden');
  setOpen(mobile.matches ? false : desktopOpen, false);

  function helpDialog(id, kicker, title, content) {
    const dialog = document.createElement('dialog');
    dialog.id = id;
    dialog.className = 'help-dialog';
    dialog.setAttribute('aria-labelledby', id + '-title');
    dialog.innerHTML = '<div class="help-dialog-heading"><div><p class="help-kicker">' + kicker + '</p><h2 id="' + id + '-title">' + title + '</h2></div><form method="dialog"><button class="help-close" aria-label="Close ' + title + '" autofocus>×</button></form></div>' + content;
    dialog.addEventListener('click', event => {
      const r = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) dialog.close();
    });
    document.body.append(dialog);
    return dialog;
  }
  const questions = [
    ['What is this website for?', 'This dashboard lets you explore illustrative crime trends around Indore, view historical sample records, and plan driving routes with nearby sample warnings. It is a demonstration and awareness tool.'],
    ['Are the forecasts real predictions?', 'No. Area forecasts, percentages, and labels are fixed examples, not results from a trained prediction model. The displayed scenario dates describe the sample, not a live forecast. They should not be used to judge how safe an area is.'],
    ['What do the map markers, heatmap, and safety score mean?', 'Markers show the sample records available in the dashboard. The heatmap shows their concentration. The safety score is a demo calculation, not a validated rating. Sparse markers or an empty map do not mean a place is safe.'],
    ['How do I plan a route?', 'Open Route alerts, choose your starting point, then search for a destination or place a destination pin on the map. Select the matching result and use the route action. The Medicaps to Patalpani example lets you explore a sample journey.'],
    ['Do route warnings show live incidents or guarantee a safe route?', 'No. Nearby warnings use historical or fictional samples within 300 metres of the route. Coverage is incomplete, and the route is not a verified safest route. Follow road conditions and official advice.'],
    ['Why is a place missing or in the wrong location?', 'Search uses OpenStreetMap place data and starts with Indore and its surroundings. Choose All India for places farther away, add a landmark, or adjust the destination pin. Area centres, street names, and PIN codes may be incomplete or incorrect; confirm the map location.'],
    ['Why does the site ask for my location?', 'GPS features need browser permission to locate you or follow your journey. You can choose a manual starting point instead. You can stop tracking with the route controls and revoke location permission in your browser settings.'],
    ['Are travel times and traffic live?', 'Standard route estimates exclude live traffic. Live traffic requires a configured TomTom connection in Traffic connection. If it is unavailable, the map and route estimate should not be read as current traffic conditions.'],
    ['What are simulated reports?', 'Simulation tools generate demonstration events so you can see how the interface responds. These are not reports from the police or the public, and they do not notify emergency services.'],
    ['How do I hide or reopen the sidebar?', 'Use the menu button at the top left. On desktop, the map expands when the panel closes and your preference is remembered in this browser. Choosing Area forecasts or Route alerts reopens the panel. On a smaller screen, tap outside the panel or press Escape to close it.'],
    ['How do I update my profile or sign out?', 'Open Profile beside Emergency. Signed-in users can edit and save their display name. Sign out is at the bottom of Profile and returns you to the login page. Guest sessions can sign out there too.'],
    ['Are my dashboard settings saved to my account?', 'Your display name is saved through Firebase Authentication. Filters and selected areas are not saved to a cloud database. The sidebar preference is stored locally in this browser.'],
    ['Why will the map or search not load?', 'Map tiles, place searches, and routes need an internet connection. Check your connection and try again. On a local copy, launch the website with Start Dashboard.vbs rather than opening the HTML file directly.'],
    ['Can I report a crime or request emergency help here?', 'This site does not file police reports, monitor emergencies, or dispatch help. Open Emergency for phone numbers or to start a local beeping alarm. The alarm only plays through your device and does not contact anyone. For urgent police, fire, or medical assistance in India, call 112 directly.']
  ];
  const faq = helpDialog('faq-dialog', 'GET TO KNOW THE DASHBOARD', 'Frequently asked questions', '<p class="help-intro">How to use the website, understand its data, and find help.</p><div class="faq-list"></div><button type="button" class="help-emergency-link">View Emergency</button>');
  for (const [question, answer] of questions) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const paragraph = document.createElement('p');
    summary.textContent = question;
    paragraph.textContent = answer;
    details.append(summary, paragraph);
    faq.querySelector('.faq-list').append(details);
  }
  const contacts = [
    ['All emergencies', '112'],
    ['Police', '100'],
    ['Ambulance', '108'],
    ['Fire & rescue', '101'],
    ['Women’s helpline', '1091'],
    ['Child helpline', '1098'],
    ['Cyber financial fraud', '1930'],
    ['Senior citizens · Indore', '0731-2510308']
  ];
  const emergency = helpDialog('emergency-dialog', 'INDIA · INDORE', 'Emergency', '<p class="help-intro">Call a helpline directly, or sound an alarm on this device.</p><section class="alarm-controls" aria-label="Local alarm"><button type="button" id="alarm-toggle" aria-pressed="false">Start loud beeping</button><p id="alarm-status" role="status">Uses your device volume. Does not contact emergency services.</p></section><ul class="contact-list"></ul><p class="contact-note">Select a number to open your calling app. Local contacts apply to Indore.</p><details class="contact-sources"><summary>Official sources · checked 6 October 2026</summary><a href="https://112.gov.in/" target="_blank" rel="noopener noreferrer">National emergency service</a><a href="https://indore.nic.in/en/helpline/" target="_blank" rel="noopener noreferrer">Indore district helplines</a><a href="https://www.cybercrime.gov.in/Accept.aspx" target="_blank" rel="noopener noreferrer">National Cybercrime Reporting Portal</a></details>');
  for (const [name, number] of contacts) {
    const row = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = name;
    const link = document.createElement('a');
    link.href = 'tel:' + number.replace(/-/g, '');
    link.textContent = number;
    link.setAttribute('aria-label', 'Call ' + name + ' on ' + number);
    row.append(label, link);
    emergency.querySelector('.contact-list').append(row);
  }
  const alarmButton = emergency.querySelector('#alarm-toggle');
  const alarmStatus = emergency.querySelector('#alarm-status');
  let audioContext = null;
  let alarmTimer = null;
  let alarmGeneration = 0;
  function stopAlarm() {
    ++alarmGeneration;
    clearInterval(alarmTimer);
    alarmTimer = null;
    const previous = audioContext;
    audioContext = null;
    if (previous && previous.state !== 'closed') previous.close().catch(() => {});
    alarmButton.textContent = 'Start loud beeping';
    alarmButton.setAttribute('aria-pressed', 'false');
    alarmStatus.textContent = 'Alarm stopped. Uses your device volume.';
  }
  async function startAlarm() {
    const generation = ++alarmGeneration;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) {
      alarmStatus.textContent = 'Audio is unavailable in this browser. Call a helpline below.';
      return;
    }
    try {
      const context = new Audio();
      audioContext = context;
      alarmButton.textContent = 'Stop beeping';
      alarmButton.setAttribute('aria-pressed', 'true');
      await context.resume();
      if (generation !== alarmGeneration) return;
      if (context.state !== 'running') throw new Error('Audio unavailable');
      const beep = () => {
        if (context.state !== 'running') return;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const now = context.currentTime;
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(880, now);
        oscillator.frequency.setValueAtTime(1100, now + 0.18);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.45, now + 0.01);
        gain.gain.setValueAtTime(0.45, now + 0.32);
        gain.gain.linearRampToValueAtTime(0, now + 0.35);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(now);
        oscillator.stop(now + 0.36);
      };
      beep();
      alarmTimer = setInterval(beep, 550);
      alarmStatus.textContent = 'Beeping is on. Press Stop beeping or close Emergency to stop.';
    } catch {
      if (generation !== alarmGeneration) return;
      stopAlarm();
      alarmStatus.textContent = 'Could not play audio. Check your browser sound settings and try again.';
    }
  }
  alarmButton.onclick = () => audioContext ? stopAlarm() : startAlarm();
  emergency.addEventListener('close', stopAlarm);
  window.addEventListener('pagehide', stopAlarm);
  document.addEventListener('visibilitychange', () => { if (document.hidden && audioContext) stopAlarm(); });
  document.getElementById('faq-button').onclick = () => faq.showModal();
  document.getElementById('emergency-button').onclick = () => emergency.showModal();
  faq.querySelector('.help-emergency-link').onclick = () => { faq.close(); emergency.showModal(); };
})();
