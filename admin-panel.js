/**
 * ARTVOT Admin Panel — Full Access
 */
(function() {
  'use strict';

  // ── Auth Guard ──
  if (!API.isAuthenticated()) { window.location.href = 'admin-login.html'; return; }
  const currentUser = API.getCurrentUser();
  if (!currentUser || !currentUser.roles || !currentUser.roles.includes('admin')) {
    API.clearToken(); API.clearCurrentUser();
    window.location.href = 'admin-login.html'; return;
  }

  const nameEl = document.getElementById('admin-display-name');
  if (nameEl) nameEl.textContent = currentUser.full_name || currentUser.username;

  // ── Navigation ──
  document.querySelectorAll('[data-section]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const id = item.dataset.section;
      document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
      const target = document.getElementById('section-' + id);
      if (target) target.classList.add('active');
      const titleEl = document.querySelector('.admin-page-title');
      const titles = { dashboard:'Dashboard', users:'Users', offers:'Offers', submissions:'Submissions', reports:'Reports', analytics:'Analytics', platform:'Platform Controls' };
      if (titleEl) titleEl.textContent = titles[id] || id;
      loadSection(id);
    });
  });

  // ── Logout ──
  document.getElementById('admin-logout')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await API.auth.logout();
    window.location.href = 'admin-login.html';
  });

  function loadSection(s) {
    if (s === 'dashboard') loadDashboard();
    else if (s === 'users') loadUsers();
    else if (s === 'offers') loadOffers();
    else if (s === 'submissions') loadSubmissions();
    else if (s === 'reports') loadReports();
    else if (s === 'analytics') loadAnalytics();
    else if (s === 'platform') loadPlatformSettings();
  }

  // ── Toast ──
  function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = 'admin-toast admin-toast-' + type;
    const icons = { success: 'bx-check-circle', error: 'bx-x-circle', info: 'bx-info-circle' };
    t.innerHTML = `<i class='bx ${icons[type] || icons.info}'></i> <span>${msg}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
  }

  // ── Confirm Dialog ──
  function adminConfirm(msg) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'admin-modal-overlay open';
      overlay.innerHTML = `
        <div class="admin-modal" style="max-width:400px;">
          <div class="admin-modal-header" style="margin-bottom:16px;">
            <h2><i class='bx bx-error-circle' style="color:var(--pink)"></i> Confirm Action</h2>
          </div>
          <p style="color:var(--text-sec);font-size:0.9rem;margin-bottom:24px;line-height:1.6;">${msg}</p>
          <div style="display:flex;gap:10px;">
            <button class="btn-admin-action red" id="c-yes" style="flex:1;justify-content:center;padding:11px;"><i class='bx bx-check'></i> Confirm</button>
            <button class="btn-admin-action" id="c-no" style="flex:1;justify-content:center;padding:11px;background:var(--surface);border-color:var(--border);color:var(--text-sec)"><i class='bx bx-x'></i> Cancel</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#c-yes').onclick = () => { overlay.remove(); resolve(true); };
      overlay.querySelector('#c-no').onclick  = () => { overlay.remove(); resolve(false); };
      overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
    });
  }

  // ══════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════
  async function loadDashboard() {
    try {
      const res = await API.admin.getStats();
      if (res.success && res.data) {
        const d = res.data;
        setText('stat-users',    d.total_users    || d.users    || 0);
        setText('stat-offers',   d.total_offers   || d.offers   || 0);
        setText('stat-artworks', d.total_artworks || d.artworks || d.submissions || 0);
        setText('stat-votes',    d.total_votes    || d.votes    || 0);
      }
    } catch(e) { console.warn('Stats failed:', e); }

    const actEl = document.getElementById('recent-activity');
    if (!actEl) return;
    try {
      const res = await fetch('/again/api/admin/activity', { headers: authHeaders() });
      const data = await res.json();
      if (data.success && data.data?.length > 0) {
        actEl.innerHTML = data.data.slice(0, 8).map(a => {
          const type = a.type || a.action_type || a.action;
          const title = a.title || a.description || '';
          const username = a.username || 'system';
          let actionText = type === 'offer' ? 'Created offer' : type === 'vote' ? 'Voted on' : (a.action || type || 'Action');
          const targetText = title ? `"${title}"` : (a.id ? `#${a.id}` : '');
          return `<div class="admin-list-item"><i class='bx bx-time-five'></i><span><strong>@${username}</strong> ${actionText} ${targetText}</span></div>`;
        }).join('');
      } else {
        actEl.innerHTML = '<div class="admin-list-item"><i class="bx bx-info-circle"></i> No recent activity</div>';
      }
    } catch(e) {
      actEl.innerHTML = '<div class="admin-list-item"><i class="bx bx-info-circle"></i> No recent activity</div>';
    }
  }

  // ══════════════════════════════════════
  // USERS
  // ══════════════════════════════════════
  let allUsers = [];

  async function loadUsers() {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="loading-placeholder">Loading users...</td></tr>';
    try {
      const res = await API.admin.getUsers();
      if (res.success && res.data?.length > 0) {
        allUsers = res.data;
        renderUsers(allUsers);
        const badge = document.getElementById('users-count-badge');
        if (badge) badge.textContent = `${allUsers.length} users`;
      } else {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-placeholder">No users found</td></tr>';
      }
    } catch(e) {
      tbody.innerHTML = '<tr><td colspan="7" class="loading-placeholder">Failed to load users</td></tr>';
    }
  }

  function renderUsers(users) {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="loading-placeholder">No users match</td></tr>';
      return;
    }
    tbody.innerHTML = users.map(u => {
      const roles    = parseRoles(u.roles);
      const isBlocked = u.is_blocked == 1;
      const isAdmin  = roles.includes('admin');
      const joinDate = u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' }) : '—';
      const avatar   = (u.username||'?')[0].toUpperCase();
      return `<tr class="${isBlocked ? 'row-blocked' : ''}">
        <td style="color:var(--text-sec);font-size:0.78rem;">#${u.id}</td>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="user-avatar-mini">${avatar}</div>
            <div>
              <div style="font-weight:600;font-size:0.88rem;">${u.username || '—'}</div>
              <div style="font-size:0.74rem;color:var(--text-sec);">${u.full_name || ''}</div>
            </div>
          </div>
        </td>
        <td style="font-size:0.84rem;">${u.email || '—'}</td>
        <td>${roles.map(r => `<span class="badge badge-${r==='admin'?'admin':'active'}">${r}</span>`).join(' ') || '<span class="badge badge-pending">none</span>'}</td>
        <td>
          <span class="badge ${isBlocked ? 'badge-blocked' : 'badge-active'}">
            <i class='bx ${isBlocked ? 'bx-block' : 'bx-check-circle'}'></i>
            ${isBlocked ? 'Blocked' : 'Active'}
          </span>
        </td>
        <td style="font-size:0.78rem;color:var(--text-sec);">${joinDate}</td>
        <td>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <button class="btn-admin-action btn-sm ${isBlocked ? 'green' : 'red'}"
              onclick="toggleBlockUser(${u.id}, ${isBlocked}, '${esc(u.username)}')">
              <i class='bx ${isBlocked ? 'bx-check' : 'bx-block'}'></i>
              ${isBlocked ? 'Unblock' : 'Block'}
            </button>
            <button class="btn-admin-action btn-sm gold"
              onclick="viewUserDetails(${u.id})" title="View Details">
              <i class='bx bx-show'></i>
            </button>
            ${!isAdmin ? `<button class="btn-admin-action btn-sm red"
              onclick="deleteUser(${u.id}, '${esc(u.username)}')" title="Delete User">
              <i class='bx bx-trash'></i>
            </button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // Search
  const searchInput = document.getElementById('users-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      const filtered = q
        ? allUsers.filter(u =>
            (u.username||'').toLowerCase().includes(q) ||
            (u.email||'').toLowerCase().includes(q) ||
            (u.full_name||'').toLowerCase().includes(q))
        : allUsers;
      renderUsers(filtered);
    });
  }

  // Filter tabs
  document.querySelectorAll('[data-user-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-user-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const f = btn.dataset.userFilter;
      if (f === 'all')     return renderUsers(allUsers);
      if (f === 'blocked') return renderUsers(allUsers.filter(u => u.is_blocked == 1));
      if (f === 'active')  return renderUsers(allUsers.filter(u => u.is_blocked != 1));
      if (f === 'admin')   return renderUsers(allUsers.filter(u => parseRoles(u.roles).includes('admin')));
    });
  });

  // ── View User Details ──
  window.viewUserDetails = function(userId) {
    const u = allUsers.find(x => x.id === userId);
    if (!u) return;
    const roles     = parseRoles(u.roles);
    const isBlocked = u.is_blocked == 1;
    const isAdmin   = roles.includes('admin');
    const joinDate  = u.created_at ? new Date(u.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : '—';

    const overlay = document.createElement('div');
    overlay.className = 'admin-modal-overlay open';
    overlay.id = 'user-detail-modal';
    overlay.innerHTML = `
      <div class="admin-modal" style="max-width:500px;">
        <div class="admin-modal-header">
          <h2><i class='bx bx-user-circle'></i> User Details</h2>
          <button class="modal-close" onclick="document.getElementById('user-detail-modal').remove()">&times;</button>
        </div>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid var(--border);">
          <div class="user-avatar-lg">${(u.username||'?')[0].toUpperCase()}</div>
          <div>
            <div style="font-family:'Syne',sans-serif;font-size:1.15rem;font-weight:700;">${u.username}</div>
            <div style="font-size:0.82rem;color:var(--text-sec);">${u.full_name || 'No full name'}</div>
            <div style="margin-top:8px;">${roles.map(r=>`<span class="badge badge-${r==='admin'?'admin':'active'}" style="margin-right:4px;">${r}</span>`).join('') || '<span class="badge badge-pending">no role</span>'}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">
          <div class="detail-cell"><div class="detail-label">Email</div><div class="detail-val">${u.email||'—'}</div></div>
          <div class="detail-cell"><div class="detail-label">Status</div><span class="badge ${isBlocked?'badge-blocked':'badge-active'}">${isBlocked?'Blocked':'Active'}</span></div>
          <div class="detail-cell"><div class="detail-label">User ID</div><div class="detail-val" style="font-family:'Syne',sans-serif;">#${u.id}</div></div>
          <div class="detail-cell"><div class="detail-label">Joined</div><div class="detail-val">${joinDate}</div></div>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn-admin-action ${isBlocked?'green':'red'}"
            style="flex:1;justify-content:center;padding:11px;"
            onclick="toggleBlockUser(${u.id}, ${isBlocked}, '${esc(u.username)}', true)">
            <i class='bx ${isBlocked?'bx-check':'bx-block'}'></i>
            ${isBlocked ? 'Unblock User' : 'Block User'}
          </button>
          ${!isAdmin ? `<button class="btn-admin-action red" style="padding:11px 16px;"
            onclick="deleteUser(${u.id}, '${esc(u.username)}', true)">
            <i class='bx bx-trash'></i> Delete
          </button>` : ''}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  };

  // ── Block / Unblock ──
  window.toggleBlockUser = async function(userId, isCurrentlyBlocked, username, fromModal = false) {
    const action = isCurrentlyBlocked ? 'unblock' : 'block';
    const confirmed = await adminConfirm(
      isCurrentlyBlocked
        ? `Unblock <strong>@${username}</strong>? They will regain full platform access.`
        : `Block <strong>@${username}</strong>? They will be <strong>immediately logged out</strong> and cannot access the platform until unblocked.`
    );
    if (!confirmed) return;
    try {
      const res = await API.admin.blockUser(userId, !isCurrentlyBlocked);
      if (res.success) {
        showToast(`@${username} ${action}ed — access ${isCurrentlyBlocked ? 'restored' : 'revoked'}`, 'success');
        if (fromModal) document.getElementById('user-detail-modal')?.remove();
        loadUsers();
      } else {
        showToast(res.message || 'Action failed', 'error');
      }
    } catch(e) { showToast('Network error', 'error'); }
  };

  // ── Delete User ──
  window.deleteUser = async function(userId, username, fromModal = false) {
    const confirmed = await adminConfirm(
      `⚠️ This will <strong>permanently delete</strong> @<strong>${username}</strong> and all their data. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`/again/api/admin/users/${userId}`, {
        method: 'DELETE', headers: authHeaders()
      });
      const data = await res.json();
      if (data.success) {
        showToast(`@${username} deleted`, 'success');
        if (fromModal) document.getElementById('user-detail-modal')?.remove();
        loadUsers();
      } else {
        showToast(data.message || 'Failed to delete', 'error');
      }
    } catch(e) { showToast('Network error', 'error'); }
  };

  // ══════════════════════════════════════
  // OFFERS
  // ══════════════════════════════════════
  async function loadOffers() {
    const tbody = document.getElementById('offers-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="loading-placeholder">Loading...</td></tr>';
    try {
      // Use admin-specific endpoint that returns ALL offers regardless of status
      const res = await API.admin.getAdminOffers(200);
      const offers = (res.success && res.data) ? res.data : [];
      if (offers.length > 0) {
        tbody.innerHTML = offers.map(o => {
          const deadline  = o.deadline ? new Date(o.deadline).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
          const isExpired = o.deadline && new Date(o.deadline) < new Date();
          const status    = o.status || 'active';
          const badgeMap  = {
            active:  'badge-active',
            expired: 'badge-blocked',
            closed:  'badge-pending',
            paused:  'badge-paused',
            deleted: 'badge-blocked',
          };
          const displayStatus = (status === 'active' && isExpired) ? 'expired' : status;
          return `<tr>
            <td style="color:var(--text-sec);font-size:0.78rem;">#${o.id}</td>
            <td><strong style="font-size:0.88rem;">${o.title||'—'}</strong></td>
            <td><span style="color:var(--gold);font-weight:700;">${parseFloat(o.budget||0).toLocaleString()} DH</span></td>
            <td style="font-size:0.82rem;">${deadline}</td>
            <td style="font-size:0.82rem;color:var(--text-sec);">${o.applications_count||0}</td>
            <td><span class="badge ${badgeMap[displayStatus]||'badge-pending'}">${displayStatus}</span></td>
            <td>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${status==='active' ? `<button class="btn-admin-action btn-sm" style="background:rgba(212,175,55,0.1);border-color:var(--gold);color:var(--gold);" onclick="pauseOffer(${o.id},'${esc(o.title||'')}')"><i class='bx bx-pause'></i> Pause</button>` : ''}
                ${status==='active' ? `<button class="btn-admin-action btn-sm red" onclick="closeOffer(${o.id},'${esc(o.title||'')}')"><i class='bx bx-stop-circle'></i> Close</button>` : ''}
                ${status==='paused' ? `<button class="btn-admin-action btn-sm green" onclick="reopenOffer(${o.id},'${esc(o.title||'')}')"><i class='bx bx-play'></i> Reopen</button>` : ''}
                ${status==='closed' ? `<button class="btn-admin-action btn-sm green" onclick="reopenOffer(${o.id},'${esc(o.title||'')}')"><i class='bx bx-play'></i> Reopen</button>` : ''}
                <button class="btn-admin-action btn-sm" style="background:rgba(107,114,128,0.1);border-color:#6B7280;color:#6B7280;" onclick="toggleHideOffer(${o.id}, ${o.is_hidden ? 1 : 0}, '${esc(o.title||'')}')"><i class='bx ${o.is_hidden ? 'bx-show' : 'bx-hide'}'></i></button>
                <button class="btn-admin-action btn-sm red" onclick="deleteOffer(${o.id},'${esc(o.title||'')}')"><i class='bx bx-trash'></i></button>
              </div>
            </td>
          </tr>`;
        }).join('');
      } else {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-placeholder">No offers yet — create one!</td></tr>';
      }
    } catch(e) {
      tbody.innerHTML = '<tr><td colspan="7" class="loading-placeholder">Failed to load offers</td></tr>';
    }
  }

  // ══════════════════════════════════════
  // REPORTS
  // ══════════════════════════════════════
  async function loadReports() {
    const list = document.getElementById('reports-list');
    if (!list) return;
    list.innerHTML = '<div class="loading-placeholder">Loading...</div>';
    try {
      const res  = await fetch('/again/api/admin/reports', { headers: authHeaders() });
      const data = await res.json();
      if (data.success && data.data?.length > 0) {
        list.innerHTML = data.data.map(r => {
          const reason     = r.reason || r.description || 'No reason provided';
          const reportType = r.report_type || 'report';
          const status     = r.status || 'open';
          return `<div class="admin-list-item" style="justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:12px;">
              <i class='bx bx-flag' style="color:var(--pink);font-size:1.2rem;flex-shrink:0;"></i>
              <div>
                <div style="font-weight:600;font-size:0.88rem;">${reason}</div>
                <div style="font-size:0.75rem;color:var(--text-sec);margin-top:2px;">${reportType} · #${r.id}</div>
              </div>
            </div>
            <span class="badge ${status==='open'?'badge-blocked':'badge-active'}">${status}</span>
          </div>`;
        }).join('');
      } else {
        list.innerHTML = '<div class="admin-list-item"><i class="bx bx-check-circle" style="color:var(--green);font-size:1.3rem;"></i><span style="color:var(--text-sec);">No open reports — platform is clean!</span></div>';
      }
    } catch(e) {
      list.innerHTML = '<div class="admin-list-item"><i class="bx bx-check-circle" style="color:var(--green)"></i> No open reports</div>';
    }
  }

  // ══════════════════════════════════════
  // ANALYTICS
  // ══════════════════════════════════════
  async function loadAnalytics() {
    const el = document.getElementById('analytics-stats');
    if (!el) return;
    el.innerHTML = '<div class="loading-placeholder">Loading...</div>';
    try {
      const res = await API.admin.getStats();
      if (res.success && res.data) {
        const d = res.data;
        el.innerHTML = `
          <div class="stat-card"><div class="stat-icon blue"><i class='bx bx-group'></i></div><div class="stat-info"><span class="stat-value">${d.total_users||d.users||0}</span><span class="stat-label">Total Users</span></div></div>
          <div class="stat-card"><div class="stat-icon gold"><i class='bx bx-briefcase'></i></div><div class="stat-info"><span class="stat-value">${d.total_offers||d.offers||0}</span><span class="stat-label">Total Offers</span></div></div>
          <div class="stat-card"><div class="stat-icon pink"><i class='bx bx-palette'></i></div><div class="stat-info"><span class="stat-value">${d.total_artworks||d.artworks||d.submissions||0}</span><span class="stat-label">Submissions</span></div></div>
          <div class="stat-card"><div class="stat-icon green"><i class='bx bx-trophy'></i></div><div class="stat-info"><span class="stat-value">${d.total_votes||d.votes||0}</span><span class="stat-label">Total Votes</span></div></div>`;
      }
    } catch(e) {
      el.innerHTML = '<div class="loading-placeholder">Failed to load analytics</div>';
    }
  }

  window.pauseOffer = async function(id, title) {
    const confirmed = await adminConfirm(`Pause offer "<strong>${title || '#'+id}</strong>"? Submissions, votes, and comments will be disabled.`);
    if (!confirmed) return;
    try {
      const res = await API.admin.pauseOffer(id);
      if (res.success) { showToast('Offer paused', 'success'); loadOffers(); loadDashboard(); }
      else showToast(res.message || 'Failed', 'error');
    } catch(e) { showToast('Network error', 'error'); }
  };

  window.reopenOffer = async function(id, title) {
    const confirmed = await adminConfirm(`Reopen offer "<strong>${title || '#'+id}</strong>"? It will become active again.`);
    if (!confirmed) return;
    try {
      const res = await API.admin.reopenOffer(id);
      if (res.success) { showToast('Offer reopened', 'success'); loadOffers(); loadDashboard(); }
      else showToast(res.message || 'Failed', 'error');
    } catch(e) { showToast('Network error', 'error'); }
  };

  window.toggleHideOffer = async function(id, isCurrentlyHidden, title) {
    const action = isCurrentlyHidden ? 'unhide' : 'hide';
    const confirmed = await adminConfirm(`${isCurrentlyHidden ? 'Unhide' : 'Hide'} offer "<strong>${title || '#'+id}</strong>" from public feeds?`);
    if (!confirmed) return;
    try {
      const res = await API.admin.hideOffer(id, !isCurrentlyHidden);
      if (res.success) { showToast(`Offer ${action}d`, 'success'); loadOffers(); }
      else showToast(res.message || 'Failed', 'error');
    } catch(e) { showToast('Network error', 'error'); }
  };

  // ══════════════════════════════════════
  // SUBMISSIONS
  // ══════════════════════════════════════
  async function loadSubmissions() {
    const container = document.getElementById('submissions-list');
    if (!container) return;
    container.innerHTML = '<div class="loading-placeholder">Loading submissions...</div>';
    try {
      const res = await API.admin.getSubmissions();
      if (res.success && res.data?.length > 0) {
        container.innerHTML = `
          <table class="admin-table" style="width:100%;">
            <thead><tr>
              <th>#</th><th>Designer</th><th>Offer</th><th>Status</th><th>Date</th><th>Actions</th>
            </tr></thead>
            <tbody>
              ${res.data.map(s => {
                const statusMap = { applied:'badge-pending', accepted:'badge-active', rejected:'badge-blocked' };
                const date = s.created_at ? new Date(s.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
                return `<tr>
                  <td style="color:var(--text-sec);font-size:0.78rem;">#${s.id}</td>
                  <td><strong style="font-size:0.85rem;">@${s.username||'—'}</strong><br><span style="font-size:0.75rem;color:var(--text-sec);">${s.full_name||''}</span></td>
                  <td style="font-size:0.83rem;">${s.offer_title||'—'}</td>
                  <td><span class="badge ${statusMap[s.status]||'badge-pending'}">${s.status||'applied'}</span></td>
                  <td style="font-size:0.78rem;color:var(--text-sec);">${date}</td>
                  <td>
                    <div style="display:flex;gap:5px;flex-wrap:wrap;">
                      <button class="btn-admin-action btn-sm green" onclick="moderateSubmission(${s.id},'accepted')"><i class='bx bx-check'></i> Accept</button>
                      <button class="btn-admin-action btn-sm red" onclick="moderateSubmission(${s.id},'rejected')"><i class='bx bx-x'></i> Reject</button>
                      <button class="btn-admin-action btn-sm red" onclick="deleteSubmission(${s.id})"><i class='bx bx-trash'></i></button>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`;
      } else {
        container.innerHTML = '<div class="admin-list-item"><i class="bx bx-inbox" style="font-size:1.3rem;color:var(--text-sec)"></i><span style="color:var(--text-sec)">No submissions yet</span></div>';
      }
    } catch(e) {
      container.innerHTML = '<div class="admin-list-item"><i class="bx bx-error-circle" style="color:var(--pink)"></i><span>Failed to load submissions</span></div>';
    }
  }

  window.moderateSubmission = async function(subId, status) {
    try {
      const res = await API.admin.moderateSubmission(subId, status);
      if (res.success) { showToast(`Submission ${status}`, 'success'); loadSubmissions(); }
      else showToast(res.message || 'Failed', 'error');
    } catch(e) { showToast('Network error', 'error'); }
  };

  window.deleteSubmission = async function(subId) {
    const confirmed = await adminConfirm('Permanently delete this submission?');
    if (!confirmed) return;
    try {
      const res = await API.admin.deleteSubmission(subId);
      if (res.success) { showToast('Submission deleted', 'success'); loadSubmissions(); }
      else showToast(res.message || 'Failed', 'error');
    } catch(e) { showToast('Network error', 'error'); }
  };

  // ══════════════════════════════════════
  // OFFER ACTIONS
  // ══════════════════════════════════════
  window.closeOffer = async function(id, title) {
    const confirmed = await adminConfirm(`Close offer "<strong>${title}</strong>"? No new applications will be accepted.`);
    if (!confirmed) return;
    try {
      const res  = await fetch(`/again/api/admin/offers/${id}/close`, { method:'PUT', headers: authHeaders() });
      const data = await res.json();
      if (data.success) { showToast('Offer closed', 'success'); loadOffers(); loadDashboard(); }
      else showToast(data.message || 'Failed', 'error');
    } catch(e) { showToast('Network error', 'error'); }
  };

  window.deleteOffer = async function(id, title) {
    const confirmed = await adminConfirm(`Permanently delete offer "<strong>${title || '#'+id}</strong>"?`);
    if (!confirmed) return;
    try {
      const res = await API.admin.deleteOffer(id);
      if (res.success) { showToast('Offer deleted', 'success'); loadOffers(); loadDashboard(); }
      else showToast(res.message || 'Failed', 'error');
    } catch(e) { showToast('Network error', 'error'); }
  };

  // ══════════════════════════════════════
  // CREATE OFFER MODAL
  // ══════════════════════════════════════
  window.showCreateOfferModal = function() {
    document.getElementById('create-offer-modal')?.classList.add('open');
    const dl = document.getElementById('co-deadline');
    if (dl && !dl.value) {
      dl.value = new Date(Date.now() + 7*86400000).toISOString().split('T')[0];
    }
  };

  window.closeModal = function(id) {
    document.getElementById(id)?.classList.remove('open');
  };

  window.submitCreateOffer = async function() {
    const title    = document.getElementById('co-title')?.value.trim();
    const desc     = document.getElementById('co-desc')?.value.trim();
    const budget   = document.getElementById('co-budget')?.value;
    const deadline = document.getElementById('co-deadline')?.value;
    if (!title)            { showToast('Title is required', 'error'); return; }
    if (!budget || budget <= 0) { showToast('Budget is required', 'error'); return; }
    if (!deadline)         { showToast('Deadline is required', 'error'); return; }

    const btn = document.getElementById('co-submit-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Publishing...'; }
    try {
      const res = await API.offers.create({
        title, description: desc || '', budget: parseFloat(budget),
        deadline, duration_days: Math.ceil((new Date(deadline)-new Date())/86400000)
      });
      if (res.success) {
        closeModal('create-offer-modal');
        ['co-title','co-desc','co-budget','co-deadline'].forEach(id => {
          const el = document.getElementById(id); if (el) el.value = '';
        });
        showToast('Offer published!', 'success');
        loadOffers(); loadDashboard();
      } else {
        showToast(res.message || 'Failed to create offer', 'error');
      }
    } catch(e) { showToast('Network error', 'error'); }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bx bx-send"></i> Publish Offer'; }
  };

  // ── Modal close on overlay/ESC ──
  document.querySelectorAll('.admin-modal-overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.admin-modal-overlay.open').forEach(m => m.classList.remove('open'));
  });

  // ══════════════════════════════════════
  // PLATFORM SETTINGS
  // ══════════════════════════════════════
  let platformSettings = { offer_creation_enabled: true, submissions_enabled: true };

  async function loadPlatformSettings() {
    const el = document.getElementById('section-platform');
    if (!el) return;
    try {
      const res = await fetch('/again/api/admin/platform/settings', { headers: authHeaders() });
      const data = await res.json();
      if (data.success && data.data) platformSettings = { ...platformSettings, ...data.data };
    } catch(e) {}
    renderPlatformToggles();
  }

  function renderPlatformToggles() {
    const el = document.getElementById('platform-toggles');
    if (!el) return;
    el.innerHTML = `
      <div class="platform-toggle-card">
        <div class="ptc-info">
          <div class="ptc-title"><i class='bx bx-briefcase'></i> Offer Creation</div>
          <div class="ptc-desc">Allow or block ALL users from creating new offers on the platform.</div>
        </div>
        <label class="admin-toggle" title="${platformSettings.offer_creation_enabled ? 'Disable offer creation' : 'Enable offer creation'}">
          <input type="checkbox" id="toggle-offer-creation" ${platformSettings.offer_creation_enabled ? 'checked' : ''}>
          <span class="admin-toggle-slider"></span>
        </label>
      </div>
      <div class="platform-toggle-card">
        <div class="ptc-info">
          <div class="ptc-title"><i class='bx bx-send'></i> Submissions</div>
          <div class="ptc-desc">Allow or block ALL users from submitting applications to offers.</div>
        </div>
        <label class="admin-toggle" title="${platformSettings.submissions_enabled ? 'Disable submissions' : 'Enable submissions'}">
          <input type="checkbox" id="toggle-submissions" ${platformSettings.submissions_enabled ? 'checked' : ''}>
          <span class="admin-toggle-slider"></span>
        </label>
      </div>`;

    document.getElementById('toggle-offer-creation').addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      try {
        const res = await fetch('/again/api/admin/platform/offer-creation', {
          method: 'PUT', headers: authHeaders(),
          body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        if (data.success) {
          platformSettings.offer_creation_enabled = enabled;
          showToast(`Offer creation ${enabled ? 'enabled' : 'disabled'} platform-wide`, enabled ? 'success' : 'info');
        } else { e.target.checked = !enabled; showToast(data.message || 'Failed', 'error'); }
      } catch(err) { e.target.checked = !enabled; showToast('Network error', 'error'); }
    });

    document.getElementById('toggle-submissions').addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      try {
        const res = await fetch('/again/api/admin/platform/submissions', {
          method: 'PUT', headers: authHeaders(),
          body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        if (data.success) {
          platformSettings.submissions_enabled = enabled;
          showToast(`Submissions ${enabled ? 'enabled' : 'disabled'} platform-wide`, enabled ? 'success' : 'info');
        } else { e.target.checked = !enabled; showToast(data.message || 'Failed', 'error'); }
      } catch(err) { e.target.checked = !enabled; showToast('Network error', 'error'); }
    });
  }

  // ── Helpers ──
  function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
  function authHeaders() { return { 'Authorization': 'Bearer ' + API.getToken(), 'Content-Type': 'application/json' }; }
  function parseRoles(r) { return (typeof r === 'string' ? JSON.parse(r||'[]') : r) || []; }
  function esc(str) { return (str||'').replace(/'/g, "\\'"); }

  // ── Init ──
  loadDashboard();
  loadPlatformSettings(); // preload settings silently
  API.auth.getMe().then(res => {
    if (!res.success) { API.clearToken(); API.clearCurrentUser(); window.location.href = 'admin-login.html'; }
  }).catch(() => {});

})();
