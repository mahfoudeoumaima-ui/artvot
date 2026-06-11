/**
 * ADMIN DASHBOARD
 * Platform management, moderation queue, user management, analytics
 * 
 * Features:
 * - Platform overview with key metrics
 * - Moderation queue for reports and content
 * - User management and verification
 * - Offer moderation
 * - Reward and transaction monitoring
 * - Real-time platform analytics
 */

// Ensure API_BASE_URL is defined (matches api-client.js base)
if (typeof API_BASE_URL === 'undefined') {
  var API_BASE_URL = '/again/api';
}

class AdminDashboard {
  constructor() {
    this.platformStats = null;
    this.reports = [];
    this.users = [];
    this.allUsers = [];
    this.offerings = [];
    this.isLoading = false;
    this.currentFilter = 'all';
    this.currentTab = 'overview';
    this.pageSize = 20;
    this.currentPage = 1;
  }

  // Initialize admin dashboard
  async init(containerId = 'admin-dashboard-container') {
    const user = typeof API !== 'undefined' ? API.getCurrentUser() : null;
    const roles = user ? (Array.isArray(user.roles) ? user.roles : (typeof user.roles === 'string' ? JSON.parse(user.roles || '[]') : [])) : [];
    if (!roles.includes('admin')) {
      console.warn('Admin dashboard initialization aborted: User is not an admin.');
      return;
    }

    try {
      this.isLoading = true;
      
      const token = (typeof API !== 'undefined' ? API.getToken() : null) || localStorage.getItem('artvot_token') || localStorage.getItem('token');
      const authHdr = { 'Authorization': `Bearer ${token}` };

      // Fetch stats and users in parallel; reports/offers degrade gracefully on failure
      const [statsRes, usersRes, offersRes, reportsRes] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/admin/stats`,         { headers: authHdr }),
        fetch(`${API_BASE_URL}/admin/users?limit=50`, { headers: authHdr }),
        fetch(`${API_BASE_URL}/admin/offers?limit=50`, { headers: authHdr }),
        fetch(`${API_BASE_URL}/admin/reports?status=pending&limit=50`, { headers: authHdr }),
      ]);

      // Stats (required)
      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        const raw = await statsRes.value.json();
        this.platformStats = raw.data || raw;
      } else {
        this.platformStats = {};
      }

      // Users (required)
      if (usersRes.status === 'fulfilled' && usersRes.value.ok) {
        const raw = await usersRes.value.json();
        this.users = Array.isArray(raw) ? raw : (raw.data || raw.users || []);
        this.allUsers = [...this.users];
      } else {
        this.users = [];
        this.allUsers = [];
      }

      // Offers (admin endpoint — all statuses)
      if (offersRes.status === 'fulfilled' && offersRes.value.ok) {
        const raw = await offersRes.value.json();
        this.offerings = Array.isArray(raw) ? raw : (raw.data || raw.offers || []);
      } else {
        this.offerings = [];
      }

      // Reports (optional — no reports table in fresh installs, degrade silently)
      if (reportsRes.status === 'fulfilled' && reportsRes.value.ok) {
        try {
          const raw = await reportsRes.value.json();
          this.reports = Array.isArray(raw) ? raw : (raw.data || raw.reports || []);
        } catch(e) { this.reports = []; }
      } else {
        this.reports = [];
      }

      this.isLoading = false;
      this.render(containerId);
    } catch (error) {
      console.error('Admin dashboard error:', error);
      this.renderError(containerId, error.message);
    }
  }

  // Render complete admin dashboard
  render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const html = `
      <div class="admin-dashboard">
        <div class="admin-header">
          <h1 class="admin-title">Admin Control Center</h1>
          <p class="admin-subtitle">Platform management, moderation, and analytics</p>
          <div class="admin-actions">
            <button class="btn btn-outline" onclick="adminDashboard.refreshData()">
              <i class="bx bx-refresh"></i> Refresh
            </button>
            <button class="btn btn-gold" onclick="adminDashboard.exportAnalytics()">
              <i class="bx bx-download"></i> Export
            </button>
          </div>
        </div>

        <!-- Tab Navigation -->
        <div class="admin-tabs">
          <button class="admin-tab ${this.currentTab === 'overview' ? 'active' : ''}" 
                  onclick="adminDashboard.switchTab('overview')">
            <i class="bx bx-chart-line"></i> Overview
          </button>
          <button class="admin-tab ${this.currentTab === 'moderation' ? 'active' : ''}" 
                  onclick="adminDashboard.switchTab('moderation')">
            <i class="bx bx-shield"></i> Moderation
          </button>
          <button class="admin-tab ${this.currentTab === 'users' ? 'active' : ''}" 
                  onclick="adminDashboard.switchTab('users')">
            <i class="bx bx-user"></i> Users
          </button>
          <button class="admin-tab ${this.currentTab === 'offers' ? 'active' : ''}" 
                  onclick="adminDashboard.switchTab('offers')">
            <i class="bx bx-briefcase"></i> Offers
          </button>
          <button class="admin-tab ${this.currentTab === 'rewards' ? 'active' : ''}" 
                  onclick="adminDashboard.switchTab('rewards')">
            <i class="bx bx-wallet"></i> Rewards
          </button>
        </div>

        <!-- Tab Content -->
        <div class="admin-content">
          ${this.currentTab === 'overview' ? this.createOverviewTab() : ''}
          ${this.currentTab === 'moderation' ? this.createModerationTab() : ''}
          ${this.currentTab === 'users' ? this.createUsersTab() : ''}
          ${this.currentTab === 'offers' ? this.createOffersTab() : ''}
          ${this.currentTab === 'rewards' ? this.createRewardsTab() : ''}
        </div>
      </div>
    `;

    container.innerHTML = html;
    this.setupEventListeners();
  }

  // OVERVIEW TAB
  createOverviewTab() {
    if (!this.platformStats) return '<p class="loading">Loading platform data...</p>';

    const stats = this.platformStats;
    // Support both short aliases (users) and full aliases (total_users) from getStats()
    const totalUsers   = stats.total_users   || stats.users   || 0;
    const totalOffers  = stats.total_offers  || stats.offers  || 0;
    const totalVotes   = stats.total_votes   || stats.votes   || 0;
    const activeOffers = stats.active_offers || 0;
    const blockedUsers = stats.blocked_users || 0;
    const totalRewards = stats.total_rewards_distributed || stats.admin_earnings || 0;
    return `
      <section class="admin-section">
        <h2 class="section-title">Platform Overview</h2>
        
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-icon" style="background-color: rgba(212, 175, 55, 0.1); color: #D4AF37;">
              <i class="bx bx-user-check"></i>
            </div>
            <div class="metric-info">
              <h3>Total Users</h3>
              <p class="metric-value">${totalUsers.toLocaleString()}</p>
              <p class="metric-detail">${blockedUsers} blocked</p>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-icon" style="background-color: rgba(16, 185, 129, 0.1); color: #10B981;">
              <i class="bx bx-user"></i>
            </div>
            <div class="metric-info">
              <h3>Active Users (30d)</h3>
              <p class="metric-value">${(stats.active_users_30d || 0).toLocaleString()}</p>
              <p class="metric-detail">${totalUsers > 0 ? parseFloat((stats.active_users_30d||0) / totalUsers * 100).toFixed(1) : 0}% of total</p>
            </div>
          </div>



          <div class="metric-card">
            <div class="metric-icon" style="background-color: rgba(212, 175, 55, 0.1); color: #A37F1A;">
              <i class="bx bx-briefcase"></i>
            </div>
            <div class="metric-info">
              <h3>Total Offers</h3>
              <p class="metric-value">${totalOffers.toLocaleString()}</p>
              <p class="metric-detail">${activeOffers} active</p>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-icon" style="background-color: rgba(212, 175, 55, 0.1); color: #D4AF37;">
              <i class="bx bx-star"></i>
            </div>
            <div class="metric-info">
              <h3>Total Votes</h3>
              <p class="metric-value">${totalVotes.toLocaleString()}</p>
              <p class="metric-detail">Avg ${activeOffers > 0 ? parseFloat(totalVotes / activeOffers).toFixed(1) : 0} per offer</p>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-icon" style="background-color: rgba(16, 185, 129, 0.1); color: #10B981;">
              <i class="bx bx-wallet"></i>
            </div>
            <div class="metric-info">
              <h3>Rewards Distributed</h3>
              <p class="metric-value">${totalRewards.toLocaleString('en-US', { maximumFractionDigits: 0 })} DH</p>
              <p class="metric-detail">Platform ecosystem</p>
            </div>
          </div>
        </div>

        <!-- Health Status -->
        <div class="health-section">
          <h3 class="section-subtitle">Platform Health</h3>
          <div class="health-grid">
            <div class="health-item">
              <span class="health-label">Reports Pending</span>
              <span class="health-value ${(stats.pending_reports || 0) > 10 ? 'warning' : 'healthy'}">
                ${stats.pending_reports || 0}
              </span>
            </div>
            <div class="health-item">
              <span class="health-label">Flagged Content</span>
              <span class="health-value ${(stats.flagged_content || 0) > 5 ? 'warning' : 'healthy'}">
                ${stats.flagged_content || 0}
              </span>
            </div>
            <div class="health-item">
              <span class="health-label">Blocked Users</span>
              <span class="health-value">${blockedUsers}</span>
            </div>
            <div class="health-item">
              <span class="health-label">System Health</span>
              <span class="health-value healthy">✓ Optimal</span>
            </div>
          </div>
        </div>

        <!-- Growth Analytics -->
        <div class="analytics-section">
          <h3 class="section-subtitle">Growth Metrics (Last 30 Days)</h3>
          <div class="analytics-cards">
            <div class="analytics-card">
              <h4>User Growth</h4>
              <div class="spark-chart">📈</div>
              <p>${parseFloat(stats.user_growth_rate || 0).toFixed(1)}% growth</p>
            </div>
            <div class="analytics-card">
              <h4>Engagement Rate</h4>
              <div class="spark-chart">📊</div>
              <p>${parseFloat(stats.engagement_rate || 0).toFixed(1)}% active</p>
            </div>
            <div class="analytics-card">
              <h4>Average Rating</h4>
              <div class="spark-chart">⭐</div>
              <p>${parseFloat(stats.platform_avg_rating || 0).toFixed(1)} / 5.0</p>
            </div>
            <div class="analytics-card">
              <h4>Content Quality</h4>
              <div class="spark-chart">✨</div>
              <p>${parseFloat(stats.content_quality_score || 0).toFixed(1)}% quality</p>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  // MODERATION TAB
  createModerationTab() {
    return `
      <section class="admin-section">
        <div class="section-header">
          <h2 class="section-title">Moderation Queue</h2>
          <div class="filter-buttons">
            <button class="filter-btn ${this.currentFilter === 'all' ? 'active' : ''}" 
                    onclick="adminDashboard.filterReports('all')">
              All (${this.reports.length})
            </button>
            <button class="filter-btn ${this.currentFilter === 'pending' ? 'active' : ''}" 
                    onclick="adminDashboard.filterReports('pending')">
              Pending
            </button>
            <button class="filter-btn ${this.currentFilter === 'offer' ? 'active' : ''}" 
                    onclick="adminDashboard.filterReports('offer')">
              Offers
            </button>
            <button class="filter-btn ${this.currentFilter === 'user' ? 'active' : ''}" 
                    onclick="adminDashboard.filterReports('user')">
              Users
            </button>
          </div>
        </div>

        ${this.reports.length > 0 ? this.createReportsTable() : this.createEmptyState('No reports')}
      </section>
    `;
  }

  // Create reports table
  createReportsTable() {
    return `
      <div class="reports-table-wrapper">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Report ID</th>
              <th>Type</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Submitted</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.reports.slice(0, 20).map((report, idx) => this.createReportRow(report, idx)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Create single report row
  createReportRow(report, index) {
    const typeLabel = report.report_type === 'user' ? '👤 User' : '📤 Offer';
    const status = report.status || 'pending';
    const statusClass = status === 'pending' ? 'status-pending' : status === 'resolved' ? 'status-resolved' : 'status-rejected';
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

    return `
      <tr class="report-row" style="animation-delay: ${index * 50}ms;">
        <td>#${report.id}</td>
        <td>${typeLabel}</td>
        <td>
          <span class="reason-badge">${this.escapeHtml(report.reason)}</span>
        </td>
        <td>
          <span class="status-badge ${statusClass}">${statusLabel}</span>
        </td>
        <td>${this.formatTimeAgo(report.created_at)}</td>
        <td class="cell-actions">
          <button class="btn-icon" title="Review" onclick="adminDashboard.reviewReport(${report.id})">
            <i class="bx bx-show"></i>
          </button>
          <button class="btn-icon approve" title="Approve" onclick="adminDashboard.approveReport(${report.id})">
            <i class="bx bx-check"></i>
          </button>
          <button class="btn-icon reject" title="Reject" onclick="adminDashboard.rejectReport(${report.id})">
            <i class="bx bx-x"></i>
          </button>
        </td>
      </tr>
    `;
  }

  // USERS TAB
  createUsersTab() {
    return `
      <section class="admin-section">
        <div class="section-header">
          <h2 class="section-title">User Management</h2>
          <div class="search-bar">
            <input type="text" id="user-search" placeholder="Search users..." class="search-input">
            <button class="btn-icon" onclick="adminDashboard.searchUsers()">
              <i class="bx bx-search"></i>
            </button>
          </div>
        </div>

        ${this.users.length > 0 ? this.createUsersTable() : this.createEmptyState('No users')}
      </section>
    `;
  }

  // Create users table
  createUsersTable() {
    return `
      <div class="users-table-wrapper">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.users.slice(0, 20).map((user, idx) => this.createUserRow(user, idx)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Create single user row
  createUserRow(user, index) {
    const statusClass = user.is_blocked ? 'status-blocked' : user.is_verified ? 'status-verified' : 'status-active';
    const statusLabel = user.is_blocked ? 'Blocked' : user.is_verified ? 'Verified' : 'Active';

    return `
      <tr class="user-row" style="animation-delay: ${index * 50}ms;">
        <td>
          <div class="user-cell">
            ${user.avatar_url ? `<img src="${user.avatar_url}" alt="${this.escapeHtml(user.username)}" class="avatar-sm">` : '<div class="avatar-placeholder">👤</div>'}
            <span>${this.escapeHtml(user.username)}</span>
          </div>
        </td>
        <td>${this.escapeHtml(user.email)}</td>
        <td>${user.role || 'user'}</td>
        <td>
          <span class="status-badge ${statusClass}">${statusLabel}</span>
        </td>
        <td>${this.formatTimeAgo(user.created_at)}</td>
        <td class="cell-actions">
          <button class="btn-icon" title="View Profile" onclick="adminDashboard.viewUserProfile(${user.id})">
            <i class="bx bx-user-check"></i>
          </button>
          ${!user.is_blocked ? `
            <button class="btn-icon reject" title="Block User" onclick="adminDashboard.blockUser(${user.id})">
              <i class="bx bx-block"></i>
            </button>
          ` : `
            <button class="btn-icon approve" title="Unblock" onclick="adminDashboard.unblockUser(${user.id})">
              <i class="bx bx-check"></i>
            </button>
          `}
          ${!user.is_verified ? `
            <button class="btn-icon approve" title="Verify" onclick="adminDashboard.verifyUser(${user.id})">
              <i class="bx bxs-badge"></i>
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }

  // OFFERS TAB
  createOffersTab() {
    return `
      <section class="admin-section">
        <div class="section-header">
          <h2 class="section-title">Offer Moderation</h2>
          <div class="filter-buttons">
            <button class="filter-btn active">
              Pending (${this.offerings.length})
            </button>
            <button class="filter-btn">
              Flagged (0)
            </button>
            <button class="filter-btn">
              Completed (0)
            </button>
          </div>
        </div>

        ${this.offerings.length > 0 ? this.createOffersTable() : '<p class="empty-state-text">All offers are compliant. Great job!</p>'}
      </section>
    `;
  }

  // Create offers table
  createOffersTable() {
    return `
      <div class="reports-table-wrapper">
        <table class="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>User ID</th>
              <th>Title</th>
              <th>Budget</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.offerings.slice(0, 20).map((offer, idx) => `
              <tr class="report-row" style="animation-delay: ${idx * 50}ms;">
                <td>#${offer.id}</td>
                <td>User #${offer.user_id}</td>
                <td><strong>${this.escapeHtml(offer.title)}</strong></td>
                <td>$${offer.budget}</td>
                <td><span class="status-badge status-pending">${offer.status}</span></td>
                <td class="cell-actions">
                  <button class="btn-icon approve" title="Approve" onclick="adminDashboard.approveOffer(${offer.id})">
                    <i class="bx bx-check"></i>
                  </button>
                  <button class="btn-icon reject" title="Reject" onclick="adminDashboard.rejectOffer(${offer.id})">
                    <i class="bx bx-x"></i>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Approve offer
  async approveOffer(offerId) {
    if(!confirm('Approve this offer?')) return;
    try {
      const token = (typeof API !== 'undefined' ? API.getToken() : null) || localStorage.getItem('artvot_token') || localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/admin/offers/${offerId}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to approve offer');
      alert('Offer approved!');
      await this.init();
    } catch(err) {
      console.error(err);
      alert(err.message);
    }
  }

  // Reject offer (delete)
  async rejectOffer(offerId) {
    if(!confirm('Reject and delete this offer?')) return;
    try {
      const token = (typeof API !== 'undefined' ? API.getToken() : null) || localStorage.getItem('artvot_token') || localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/admin/offers/${offerId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to delete offer');
      alert('Offer rejected!');
      await this.init();
    } catch(err) {
      console.error(err);
      alert(err.message);
    }
  }

  // REWARDS TAB
  createRewardsTab() {
    return `
      <section class="admin-section">
        <h2 class="section-title">Reward Monitoring</h2>
        
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-icon" style="background-color: rgba(212, 175, 55, 0.1); color: #D4AF37;">
              <i class="bx bx-wallet"></i>
            </div>
            <div class="metric-info">
              <h3>Total Distributed</h3>
              <p class="metric-value">$${(this.platformStats?.total_rewards_distributed || 0).toLocaleString()}</p>
              <p class="metric-detail">All time</p>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-icon" style="background-color: rgba(16, 185, 129, 0.1); color: #10B981;">
              <i class="bx bx-trending-up"></i>
            </div>
            <div class="metric-info">
              <h3>This Month</h3>
              <p class="metric-value">$${(this.platformStats?.rewards_this_month || 0).toLocaleString()}</p>
              <p class="metric-detail">Monthly distribution</p>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-icon" style="background-color: rgba(225, 29, 72, 0.1); color: #E11D48;">
              <i class="bx bx-flag"></i>
            </div>
            <div class="metric-info">
              <h3>Flagged Transactions</h3>
              <p class="metric-value">${this.platformStats?.flagged_transactions || 0}</p>
              <p class="metric-detail">Suspicious activity</p>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-icon" style="background-color: rgba(212, 175, 55, 0.1); color: #A37F1A;">
              <i class="bx bx-bar-chart"></i>
            </div>
            <div class="metric-info">
              <h3>Avg User Earning</h3>
              <p class="metric-value">$${parseFloat(this.platformStats?.avg_user_earnings || 0).toFixed(2)}</p>
              <p class="metric-detail">Per active user</p>
            </div>
          </div>
        </div>

        <p class="empty-state-text">All transactions verified. System healthy.</p>
      </section>
    `;
  }

  // Switch admin tabs (re-render only — no re-fetch)
  switchTab(tabName) {
    this.currentTab = tabName;
    this.currentFilter = 'all';
    this.render('admin-dashboard-container');
  }

  // Filter reports (re-render only)
  filterReports(filter) {
    this.currentFilter = filter;
    this.render('admin-dashboard-container');
  }

  // Review report
  async reviewReport(reportId) {
    const report = this.reports.find(r => r.id == reportId);
    if (!report) return;
    
    const modalHtml = `
      <div class="admin-modal-overlay open" id="report-review-modal">
        <div class="admin-modal">
          <div class="modal-header">
            <h3>Review Report #${report.id}</h3>
            <button class="btn-icon" onclick="document.getElementById('report-review-modal').remove()"><i class="bx bx-x"></i></button>
          </div>
          <div class="modal-body">
            <div class="report-detail-group">
              <label>Type:</label> <span class="badge badge-pending">${report.report_type || 'General'}</span>
            </div>
            <div class="report-detail-group">
              <label>Reason:</label> <p class="report-reason-box">${this.escapeHtml(report.reason || report.description || 'No reason specified')}</p>
            </div>
            <div class="report-detail-group">
              <label>Status:</label> <strong>${report.status || 'pending'}</strong>
            </div>
            <div class="report-detail-group">
              <label>Reported At:</label> <span>${new Date(report.created_at).toLocaleString()}</span>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="document.getElementById('report-review-modal').remove()">Close</button>
            <button class="btn btn-gold" onclick="adminDashboard.approveReport(${report.id}); document.getElementById('report-review-modal').remove();">Resolve</button>
            <button class="btn btn-danger" onclick="adminDashboard.rejectReport(${report.id}); document.getElementById('report-review-modal').remove();">Dismiss</button>
          </div>
        </div>
      </div>
    `;
    
    const existing = document.getElementById('report-review-modal');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  // Approve report action
  async approveReport(reportId) {
    try {
      const token = (typeof API !== 'undefined' ? API.getToken() : null) || localStorage.getItem('artvot_token') || localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/admin/reports/${reportId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'resolved' })
      });

      if (!response.ok) throw new Error('Failed to approve report');
      await this.init();
    } catch (error) {
      console.error('Approve error:', error);
      alert('Failed to approve report');
    }
  }

  // Reject report action
  async rejectReport(reportId) {
    try {
      const token = (typeof API !== 'undefined' ? API.getToken() : null) || localStorage.getItem('artvot_token') || localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/admin/reports/${reportId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'rejected' })
      });

      if (!response.ok) throw new Error('Failed to reject report');
      await this.init();
    } catch (error) {
      console.error('Reject error:', error);
      alert('Failed to reject report');
    }
  }

  // View user profile
  async viewUserProfile(userId) {
    console.log('Viewing user:', userId);
    if (typeof window.viewUserProfile === 'function') {
      const userObj = this.users.find(u => u.id == userId);
      if (userObj) window.viewUserProfile(userObj.username);
    }
  }

  // Block user
  async blockUser(userId) {
    if (!confirm('Block this user?')) return;
    try {
      const token = (typeof API !== 'undefined' ? API.getToken() : null) || localStorage.getItem('artvot_token') || localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/block`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ is_blocked: true })
      });
      if (!response.ok) throw new Error('Failed to block user');
      await this.init();
    } catch (error) {
      console.error('Block error:', error);
      alert('Failed to block user');
    }
  }

  // Unblock user
  async unblockUser(userId) {
    if (!confirm('Unblock this user?')) return;
    try {
      const token = (typeof API !== 'undefined' ? API.getToken() : null) || localStorage.getItem('artvot_token') || localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/block`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ is_blocked: false })
      });
      if (!response.ok) throw new Error('Failed to unblock user');
      await this.init();
    } catch (error) {
      console.error('Unblock error:', error);
      alert('Failed to unblock user');
    }
  }

  // Verify user
  async verifyUser(userId) {
    try {
      const token = (typeof API !== 'undefined' ? API.getToken() : null) || localStorage.getItem('artvot_token') || localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/block`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ is_verified: true })
      });

      if (!response.ok) throw new Error('Failed to verify user');
      await this.init();
    } catch (error) {
      console.error('Verify error:', error);
      alert('Failed to verify user');
    }
  }

  // Search users
  searchUsers() {
    const query = document.getElementById('user-search')?.value.toLowerCase().trim() || '';
    if (!query) {
      this.users = [...this.allUsers];
    } else {
      this.users = this.allUsers.filter(u => 
        (u.username && u.username.toLowerCase().includes(query)) ||
        (u.email && u.email.toLowerCase().includes(query)) ||
        (u.full_name && u.full_name.toLowerCase().includes(query))
      );
    }
    this.render('admin-dashboard-container');
    const input = document.getElementById('user-search');
    if (input) {
      input.value = query;
      input.focus();
    }
  }

  // Refresh data
  async refreshData() {
    this.init();
  }

  // Export analytics
  exportAnalytics() {
    console.log('Exporting analytics...');
    let csv = 'Type,ID,Name/Title,Status,Created At\n';
    
    this.allUsers.forEach(u => {
      csv += `User,${u.id},"${this.escapeHtml(u.username || '')}",${u.is_blocked ? 'Blocked' : 'Active'},"${u.created_at || ''}"\n`;
    });
    
    this.offerings.forEach(o => {
      csv += `Offer,${o.id},"${this.escapeHtml(o.title || '')}",${o.status || 'active'},"${o.created_at || ''}"\n`;
    });
    
    this.reports.forEach(r => {
      csv += `Report,${r.id},"${this.escapeHtml(r.reason || '')}",${r.status || 'pending'},"${r.created_at || ''}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `artvot_analytics_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Create empty state
  createEmptyState(message) {
    return `
      <div class="empty-state">
        <i class="bx bx-inbox"></i>
        <p>${message}</p>
      </div>
    `;
  }

  // Setup event listeners
  setupEventListeners() {
    // Add any real-time listeners here
  }

  // Render error state
  renderError(containerId, message) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="error-state">
        <i class="bx bxs-error-circle"></i>
        <h3>Error Loading Admin Dashboard</h3>
        <p>${message}</p>
        <button class="btn btn-gold" onclick="adminDashboard.init()">
          Try Again
        </button>
      </div>
    `;
  }

  // Utility: Escape HTML
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Utility: Format time ago
  formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return `${Math.floor(seconds / 604800)}w ago`;
  }
}

// Initialize on page load
const adminDashboard = new AdminDashboard();
