if (location.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(location.hostname)) {
  const stopButton = document.getElementById('stop-local-server');
  fetch('/__dashboard__/health').then(r => r.ok ? r.json() : null).then(health => {
    if (!health || health.version !== 2) return;
    stopButton.hidden = false;
    stopButton.onclick = async () => {
      stopButton.disabled = true;
      try {
        const response = await fetch('/__dashboard__/stop', {
          method: 'POST', headers: {'X-Dashboard-Token': health.token}
        });
        if (!response.ok) throw new Error('Stop failed');
        if (typeof stopNavigation === 'function') stopNavigation();
        if (typeof stopLiveTracking === 'function') stopLiveTracking();
        document.body.innerHTML = '<main class="server-stopped"><h1>Dashboard stopped</h1><p>You can close this tab. Double-click <strong>Start Dashboard.vbs</strong> to open it again.</p></main>';
      } catch {
        stopButton.disabled = false;
        stopButton.textContent = 'Use Stop Dashboard.vbs';
      }
    };
  }).catch(() => {});
}
