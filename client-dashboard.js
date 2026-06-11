/**
 * CLIENT DASHBOARD
 * Professional workspace for managing offers and tracking performance
 * 
 * Features:
 * - Client overview with key metrics
 * - Offer performance analytics with charts
 * - Offer management (create, edit, close)
 * - Submission review and comparison
 * - Real-time engagement tracking
 */

// Ensure API_BASE_URL is defined (matches api-client.js base)
if (typeof API_BASE_URL === 'undefined') {
  var API_BASE_URL = '/again/api';
}

class ClientDashboard {
  constructor() {
    this.offers = [];
    this.selectedOffer = null;
    this.submissions = [];
    this.isLoading = false;
    this.pageSize = 10;
    this.currentPage = 1;
    this.clientStats = null;
  }

  // Initialize dashboard
  async init(containerId = 'client-dashboard-container') {
    const user = typeof API !== 'undefined' ? API.getCurrentUser() : null;
    const roles = user ? (Array.isArray(user.roles) ? user.roles : (typeof user.roles === 'string' ? JSON.parse(user.roles || '[]') : [])) : [];
    if (!roles.includes('client') && !roles.includes('admin')) {
      console.warn('Client dashboard initialization aborted: User is not a client.');
      return;
    }

    try {
      this.isLoading = true;
      const token = (typeof API !== 'undefined' ? API.getToken() : null) || localStorage.getItem('artvot_token') || localStorage.getItem('token');
      
      // Load all data in parallel
      const [statsRes, offersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/user/client-stats`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_BASE_URL}/user/offers`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (!statsRes.ok || !offersRes.ok) {
        throw new Error('Failed to load client dashboard');
      }

      this.clientStats = await statsRes.json();
      const offersData = await offersRes.json();
      
      this.offers = Array.isArray(offersData) ? offersData : offersData.offers || [];
      this.isLoading = false;
      
      this.render(containerId);
    } catch (error) {
      console.error('Dashboard error:', error);
      this.renderError(containerId, error.message);
    }
  }

  // Render complete dashboard
  render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const html = `
      <div class="client-dashboard">
        <div class="dashboard-header">
          <h1 class="dashboard-title">Client Dashboard</h1>
          <p class="dashboard-subtitle">Manage your creative campaigns and track performance</p>
        </div>

        <!-- Overview Section -->
        ${this.createOverviewSection()}

        <!-- Statistics Grid -->
        ${this.createStatsSection()}

        <!-- Offer Management Section -->
        <section class="dashboard-section">
          <div class="section-header">
            <h2 class="section-title">Your Offers</h2>
            <button class="btn btn-gold create-offer-btn" onclick="clientDashboard.openCreateOfferModal()">
              <i class="bx bxs-plus-circle"></i> Create Offer
            </button>
          </div>

          ${this.offers.length > 0 ? this.createOffersTable() : this.createEmptyState()}
        </section>

        <!-- Selected Offer Analytics -->
        ${this.selectedOffer ? this.createOfferAnalyticsSection() : ''}
      </div>

      <!-- Create Offer Modal -->
      <div id="create-offer-modal" class="modal-overlay hidden">
        <div class="modal-content">
          <div class="modal-header">
            <h2>Create New Offer</h2>
            <button class="modal-close" onclick="clientDashboard.closeCreateOfferModal()">
              <i class="bx bx-x"></i>
            </button>
          </div>
          <form id="create-offer-form" class="offer-form">
            <div class="form-group">
              <label>Offer Title</label>
              <input type="text" name="title" placeholder="e.g., Logo Design for Tech Startup" required>
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea name="description" placeholder="Describe what you're looking for..." rows="4" required></textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Category</label>
                <select name="category" required>
                  <option value="">Select category</option>
                  <option value="logo">Logo Design</option>
                  <option value="web">Web Design</option>
                  <option value="illustration">Illustration</option>
                  <option value="branding">Branding</option>
                  <option value="animation">Animation</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div class="form-group">
                <label>Budget ($)</label>
                <input type="number" name="budget" min="100" step="50" placeholder="500" required>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Duration (days)</label>
                <input type="number" name="duration" min="1" max="90" value="14" required>
              </div>
              <div class="form-group">
                <label>Max Submissions</label>
                <input type="number" name="max_submissions" min="5" value="50" required>
              </div>
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-outline" onclick="clientDashboard.closeCreateOfferModal()">Cancel</button>
              <button type="submit" class="btn btn-gold">Create Offer</button>
            </div>
          </form>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Setup event listeners
    this.setupEventListeners();
  }

  // Create overview cards
  createOverviewSection() {
    if (!this.clientStats) return '';

    const stats = this.clientStats;
    return `
      <section class="overview-section">
        <div class="overview-grid">
          <div class="overview-card">
            <div class="card-icon" style="color: #E8B842;">
              <i class="bx bxs-offer"></i>
            </div>
            <div class="card-content">
              <h3 class="card-label">Total Offers</h3>
              <p class="card-value">${stats.total_offers || 0}</p>
            </div>
          </div>

          <div class="overview-card">
            <div class="card-icon" style="color: #3CE89D;">
              <i class="bx bxs-check-circle"></i>
            </div>
            <div class="card-content">
              <h3 class="card-label">Active Offers</h3>
              <p class="card-value">${stats.active_offers || 0}</p>
            </div>
          </div>

          <div class="overview-card">
            <div class="card-icon" style="color: #E8428A;">
              <i class="bx bxs-award"></i>
            </div>
            <div class="card-content">
              <h3 class="card-label">Completed Offers</h3>
              <p class="card-value">${stats.completed_offers || 0}</p>
            </div>
          </div>

          <div class="overview-card">
            <div class="card-icon" style="color: #9D5D8C;">
              <i class="bx bxs-wallet"></i>
            </div>
            <div class="card-content">
              <h3 class="card-label">Total Budget</h3>
              <p class="card-value">$${(stats.total_budget || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  // Create detailed stats section
  createStatsSection() {
    if (!this.clientStats) return '';

    const stats = this.clientStats;
    return `
      <section class="dashboard-section stats-section">
        <h2 class="section-title">Performance Metrics</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Total Submissions</div>
            <div class="stat-value">${stats.total_submissions || 0}</div>
            <div class="stat-subtext">Across all offers</div>
          </div>

          <div class="stat-card">
            <div class="stat-label">Total Votes</div>
            <div class="stat-value">${stats.total_votes || 0}</div>
            <div class="stat-subtext">Community engagement</div>
          </div>

          <div class="stat-card">
            <div class="stat-label">Avg Engagement</div>
            <div class="stat-value">${parseFloat(stats.avg_engagement || 0).toFixed(1)}%</div>
            <div class="stat-subtext">Submission vs votes</div>
          </div>

          <div class="stat-card">
            <div class="stat-label">Avg Rating</div>
            <div class="stat-value">⭐ ${parseFloat(stats.avg_rating || 0).toFixed(1)}</div>
            <div class="stat-subtext">Quality average</div>
          </div>
        </div>
      </section>
    `;
  }

  // Create offers table
  createOffersTable() {
    return `
      <div class="offers-table-wrapper">
        <table class="offers-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Category</th>
              <th>Status</th>
              <th>Submissions</th>
              <th>Budget</th>
              <th>Ends</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.offers.map((offer, index) => this.createOfferRow(offer, index)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Create single offer row
  createOfferRow(offer, index) {
    const statusClass = offer.status === 'active' ? 'status-active' : offer.status === 'completed' ? 'status-completed' : 'status-draft';
    const statusLabel = offer.status.charAt(0).toUpperCase() + offer.status.slice(1);
    
    const deadlineDate = new Date(offer.deadline);
    const isValidDate = offer.deadline && offer.deadline !== '0000-00-00' && !isNaN(deadlineDate.getTime());
    const daysLeft = isValidDate ? Math.ceil((deadlineDate - new Date()) / (1000 * 60 * 60 * 24)) : 0;
    const daysLeftText = isValidDate ? (daysLeft > 0 ? `${daysLeft} days` : 'Expired') : 'No Deadline';

    return `
      <tr class="offer-row" style="animation-delay: ${index * 50}ms;">
        <td class="cell-title">
          <div class="offer-title-cell">
            <h3>${this.escapeHtml(offer.title)}</h3>
            <p>${offer.submissions_count || 0} submissions</p>
          </div>
        </td>
        <td>${offer.category || 'N/A'}</td>
        <td>
          <span class="status-badge ${statusClass}">${statusLabel}</span>
        </td>
        <td><strong>${offer.submissions_count || 0}</strong></td>
        <td>$${(offer.budget || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
        <td>${daysLeftText}</td>
        <td class="cell-actions">
          <button class="btn-icon" title="View Details" onclick="clientDashboard.viewOfferDetails(${offer.id})">
            <i class="bx bx-show"></i>
          </button>
          <button class="btn-icon" title="Edit" onclick="clientDashboard.editOffer(${offer.id})">
            <i class="bx bx-edit"></i>
          </button>
          <button class="btn-icon" title="View Submissions" onclick="clientDashboard.viewSubmissions(${offer.id})">
            <i class="bx bx-images"></i>
          </button>
        </td>
      </tr>
    `;
  }

  // Create offer analytics section
  createOfferAnalyticsSection() {
    if (!this.selectedOffer) return '';

    const offer = this.selectedOffer;
    const engagementRate = offer.submissions_count > 0 
      ? ((offer.votes_count || 0) / offer.submissions_count * 100).toFixed(1) 
      : 0;

    return `
      <section class="dashboard-section analytics-section">
        <div class="section-header">
          <h2 class="section-title">Analytics: ${this.escapeHtml(offer.title)}</h2>
          <button class="btn-close" onclick="clientDashboard.selectedOffer = null; clientDashboard.init()">
            <i class="bx bx-x"></i>
          </button>
        </div>

        <div class="analytics-grid">
          <div class="analytics-card">
            <h3>Submissions</h3>
            <div class="analytics-value">${offer.submissions_count || 0}</div>
            <p class="analytics-detail">Designs submitted</p>
          </div>

          <div class="analytics-card">
            <h3>Total Votes</h3>
            <div class="analytics-value">${offer.votes_count || 0}</div>
            <p class="analytics-detail">Community votes</p>
          </div>

          <div class="analytics-card">
            <h3>Engagement Rate</h3>
            <div class="analytics-value">${engagementRate}%</div>
            <p class="analytics-detail">Votes per submission</p>
          </div>

          <div class="analytics-card">
            <h3>Avg Rating</h3>
            <div class="analytics-value">⭐ ${parseFloat(offer.avg_rating || 0).toFixed(1)}</div>
            <p class="analytics-detail">Quality score</p>
          </div>
        </div>

        <!-- Top Submissions -->
        ${this.createTopSubmissionsSection(offer)}
      </section>
    `;
  }

  // Create top submissions section
  createTopSubmissionsSection(offer) {
    if (!offer.top_submissions || offer.top_submissions.length === 0) {
      return '<p class="no-data">No submissions yet</p>';
    }

    return `
      <div class="top-submissions">
        <h3>Top-Performing Submissions</h3>
        <div class="submissions-grid">
          ${offer.top_submissions.slice(0, 6).map((sub, idx) => `
            <div class="submission-card" style="animation-delay: ${idx * 50}ms;">
              <div class="submission-image">
                ${sub.image_url ? `<img src="${sub.image_url}" alt="${this.escapeHtml(sub.title)}" loading="lazy">` : '<div class="image-placeholder">No Image</div>'}
              </div>
              <div class="submission-info">
                <h4>${this.escapeHtml(sub.title)}</h4>
                <div class="submission-stats">
                  <span class="stat">
                    <i class="bx bx-star"></i> ${sub.votes_count || 0}
                  </span>
                  <span class="stat">
                    <i class="bx bx-award"></i> ${parseFloat(sub.avg_rating || 0).toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Create empty state
  createEmptyState() {
    return `
      <div class="empty-state">
        <div class="empty-icon">
          <i class="bx bxs-offer"></i>
        </div>
        <h3>No offers yet</h3>
        <p>Create your first offer to start receiving design submissions</p>
        <button class="btn btn-gold" onclick="clientDashboard.openCreateOfferModal()">
          Create Your First Offer
        </button>
      </div>
    `;
  }

  // Open create offer modal
  openCreateOfferModal() {
    const modal = document.getElementById('create-offer-modal');
    if (modal) {
      modal.classList.remove('hidden');
      if (typeof window.lockBodyScroll === 'function') window.lockBodyScroll();
    }
  }

  // Close create offer modal
  closeCreateOfferModal() {
    const modal = document.getElementById('create-offer-modal');
    if (modal) {
      modal.classList.add('hidden');
      if (typeof window.unlockBodyScroll === 'function') window.unlockBodyScroll();
    }
  }

  // Setup event listeners
  setupEventListeners() {
    const form = document.getElementById('create-offer-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleCreateOffer(e));
    }
  }

  // Handle create offer
  async handleCreateOffer(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const offerData = Object.fromEntries(formData);

    try {
      const response = await fetch(`${API_BASE_URL}/offers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(offerData)
      });

      if (!response.ok) throw new Error('Failed to create offer');

      // Close modal and reload
      this.closeCreateOfferModal();
      await this.init();
    } catch (error) {
      console.error('Create offer error:', error);
      alert('Failed to create offer: ' + error.message);
    }
  }

  // View offer details
  async viewOfferDetails(offerId) {
    try {
      const response = await fetch(`${API_BASE_URL}/offers/${offerId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      if (!response.ok) throw new Error('Failed to load offer');

      const offerData = await response.json();
      this.selectedOffer = offerData;
      this.init();
    } catch (error) {
      console.error('View offer error:', error);
      alert('Failed to load offer details');
    }
  }

  // Edit offer
  editOffer(offerId) {
    console.log('Edit offer:', offerId);
    // TODO: Implement edit modal
  }

  // View offer submissions
  async viewSubmissions(offerId) {
    try {
      const response = await fetch(`${API_BASE_URL}/offers/${offerId}/submissions`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      if (!response.ok) throw new Error('Failed to load submissions');

      this.submissions = await response.json();
      navigateTo('page-client-submissions');
      // Render submissions view
    } catch (error) {
      console.error('View submissions error:', error);
      alert('Failed to load submissions');
    }
  }

  // Render error state
  renderError(containerId, message) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="error-state">
        <i class="bx bxs-error-circle"></i>
        <h3>Error Loading Dashboard</h3>
        <p>${message}</p>
        <button class="btn btn-gold" onclick="clientDashboard.init()">
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
    return `${Math.floor(seconds / 86400)}d ago`;
  }
}

// Initialize on page load
const clientDashboard = new ClientDashboard();
