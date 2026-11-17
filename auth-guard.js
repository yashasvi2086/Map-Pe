/* Local UI gate. Firebase rules must protect any future remote private data. */
(() => {
  if (location.protocol === 'file:') return;
  let identity = null;
  let dialog = null;
  function clearSession() { try { localStorage.removeItem('mappe.guest'); } catch {} }
  function toLogin() { location.assign(window.LOGIN_CONFIG?.loginUrl || './login-story.html'); }
  function renderUser(user) {
    identity?.remove();
    dialog?.remove();
    const guest = !user;
    const displayName = user?.displayName || '';
    const email = user?.email || '';
    const providerText = guest
      ? 'You are exploring without an account.'
      : 'Signed in with ' + (user.providerData?.some(p => p.providerId === 'google.com') ? 'Google' : 'email & password');
    /* Avatar initials */
    const initials = displayName
      ? displayName.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
      : (email ? email[0].toUpperCase() : '?');
    identity = document.createElement('div');
    identity.className = 'auth-identity';
    identity.innerHTML = '<button class="stop-server-button" type="button" aria-haspopup="dialog">Profile</button>';
    document.getElementById('account-actions').append(identity);
    dialog = document.createElement('dialog');
    dialog.className = 'profile-dialog';
    dialog.setAttribute('aria-labelledby', 'profile-title');
    dialog.innerHTML = '<form method="dialog"><button class="profile-close" aria-label="Close profile">×</button></form><p class="profile-kicker">YOUR ACCOUNT</p><h2 id="profile-title">Profile</h2><p class="profile-email"></p><p class="profile-provider"></p><form id="profile-form"><label for="profile-name">Display name</label><input id="profile-name" maxlength="80" autocomplete="name"><button type="submit">Save profile</button></form><p class="profile-status" role="status"></p>';
    dialog.innerHTML = `
      <!-- Header -->
      <div class="profile-header">
        <h2 id="profile-title">Profile</h2>
        <div class="profile-header-actions">
          <button type="button" class="profile-close-new" aria-label="Close profile">×</button>
        </div>
      </div>
      <!-- Avatar + identity hero -->
      <div style="display:flex;flex-direction:column;align-items:center;padding:28px 24px 20px;gap:6px;">
        <div style="width:68px;height:68px;border-radius:50%;background:linear-gradient(135deg,#2c5c8a,#4a90c4);display:grid;place-items:center;color:#fff;font:700 24px/1 var(--font-display);letter-spacing:.5px;box-shadow:0 4px 20px rgba(44,92,138,.3);">${initials}</div>
        <span style="font-weight:700;font-size:17px;margin-top:8px;color:var(--ink);">${displayName || (guest ? 'Guest' : 'User')}</span>
        <span style="font-size:13px;color:var(--ink-soft);">${email || 'No email'}</span>
      </div>
      <!-- Body rows -->
      <div class="profile-body">
        <!-- Provider row -->
        <div class="profile-row">
          <div class="profile-row-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div class="profile-row-content">
            <div class="profile-row-label">Sign-in method</div>
            <div class="profile-row-value">${providerText}</div>
          </div>
        </div>
        <!-- Email row -->
        <div class="profile-row">
          <div class="profile-row-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          </div>
          <div class="profile-row-content">
            <div class="profile-row-label">Email</div>
            <div class="profile-row-value">${email || (guest ? 'Not available' : 'Not set')}</div>
          </div>
        </div>
        <!-- Display name row (editable for signed-in users) -->
        ${guest ? '' : `
        <div class="profile-row" id="profile-name-row" style="cursor:pointer;">
          <div class="profile-row-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <div class="profile-row-content">
            <div class="profile-row-label">Display name</div>
            <div class="profile-row-value ${displayName ? '' : 'required'}">${displayName || 'Tap to set'}</div>
            <form class="profile-edit-form" id="profile-form">
              <input id="profile-name" maxlength="80" autocomplete="name" placeholder="Enter your name" value="${displayName.replace(/"/g, '&quot;')}">
              <button type="submit">Save</button>
            </form>
            <div class="profile-status-msg" role="status"></div>
          </div>
          <span class="profile-row-action">Edit</span>
        </div>
        `}
        <!-- Session type row -->
        <div class="profile-row">
          <div class="profile-row-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div class="profile-row-content">
            <div class="profile-row-label">Session</div>
            <div class="profile-row-value">${guest ? 'Guest — temporary access' : 'Authenticated'}</div>
          </div>
        </div>
      </div>
      <!-- Footer -->
      <div class="profile-footer">
        <button type="button" class="profile-signout-new" id="profile-signout-btn">Sign out</button>
      </div>
    `;
    document.body.append(dialog);
    const emailEl = dialog.querySelector('.profile-email');
    if (emailEl) emailEl.textContent = user?.email || 'Guest session';
    const providerEl = dialog.querySelector('.profile-provider');
    if (providerEl) providerEl.textContent = guest ? 'You are exploring without an account.' : 'Signed in with ' + (user.providerData?.some(p => p.providerId === 'google.com') ? 'Google' : 'email and password');
    const form = dialog.querySelector('#profile-form');
    if (form) form.hidden = guest;
    const name = dialog.querySelector('input');
    if (name) name.value = user?.displayName || '';
    const status = dialog.querySelector('.profile-status');
    if (form) form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button');
      button.disabled = true;
      if (status) status.textContent = 'Saving…';
      try {
        await window.LOGIN_AUTH.updateProfile(name.value.trim());
        if (status) status.textContent = 'Profile saved.';
      } catch (error) { if (status) status.textContent = error.message || 'Could not save. Try again.'; }
      finally { button.disabled = false; }
    });
    /* Close button */
    dialog.querySelector('.profile-close-new').onclick = () => dialog.close();
    /* Inline name editing */
    const nameRow = dialog.querySelector('#profile-name-row');
    if (nameRow) {
      const editForm = nameRow.querySelector('.profile-edit-form');
      const nameInput = dialog.querySelector('#profile-name');
      const statusMsg = nameRow.querySelector('.profile-status-msg');
      const valueDisplay = nameRow.querySelector('.profile-row-value');
      nameRow.addEventListener('click', (e) => {
        if (e.target.closest('.profile-edit-form')) return;
        editForm.classList.toggle('active');
        if (editForm.classList.contains('active')) nameInput.focus();
      });
      editForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const btn = editForm.querySelector('button');
        btn.disabled = true;
        statusMsg.textContent = 'Saving…';
        statusMsg.className = 'profile-status-msg';
        try {
          await window.LOGIN_AUTH.updateProfile(nameInput.value.trim());
          statusMsg.textContent = 'Saved!';
          valueDisplay.textContent = nameInput.value.trim() || 'Tap to set';
          valueDisplay.classList.toggle('required', !nameInput.value.trim());
          /* Update avatar initials */
          const heroName = dialog.querySelector('[style*="font-weight:700;font-size:17px"]');
          if (heroName) heroName.textContent = nameInput.value.trim() || 'User';
          const avatarEl = dialog.querySelector('[style*="width:68px;height:68px"]');
          if (avatarEl && nameInput.value.trim()) {
            avatarEl.textContent = nameInput.value.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
          }
          setTimeout(() => { editForm.classList.remove('active'); statusMsg.textContent = ''; }, 1200);
        } catch (error) {
          statusMsg.textContent = error.message || 'Could not save. Try again.';
          statusMsg.className = 'profile-status-msg error';
        } finally { btn.disabled = false; }
      });
    }
    /* Open dialog */
    identity.children[0].onclick = () => dialog.showModal();
    /* Close on backdrop click */
    dialog.addEventListener('click', event => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
    /* Sign out */
    const signOutButton = dialog.querySelector('#profile-signout-btn');
    signOutButton.onclick = async () => {
      const button = signOutButton;
      button.disabled = true;
      button.textContent = 'Signing out…';
      signOutButton.disabled = true;
      signOutButton.textContent = 'Signing out…';
      try {
        if (!guest) await window.LOGIN_AUTH.signOut();
        clearSession();
        toLogin();
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Sign out';
        status.textContent = error.message || 'Could not sign out. Please try again.';
        signOutButton.disabled = false;
        signOutButton.textContent = 'Sign out';
        const statusEl = dialog.querySelector('.profile-status-msg');
        if (statusEl) {
          statusEl.textContent = error.message || 'Could not sign out. Please try again.';
          statusEl.className = 'profile-status-msg error';
        }
        if (!dialog.open) dialog.showModal();
      }
    };
  }
  function connect() {
    if (window.LOGIN_AUTH?.onUser) window.LOGIN_AUTH.onUser(renderUser);
    else renderUser(null);
  }
  connect();
})();
