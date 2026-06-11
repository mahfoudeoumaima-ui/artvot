/**
 * ARTVOT User Dashboard System
 * Real-time dashboard showing wallet, earnings, activity, and portfolio data
 */

class UserDashboard {
  constructor() {
    this.dashboardContainer = null;
    this.userData = null;
    this.activityData = null;
    this.rewardHistory = null;
    this.isLoading = false;
  }

  /**
   * Initialize dashboard
   */
  async init(containerId = 'dashboard-container') {
    this.dashboardContainer = document.getElementById(containerId);
    if (!this.dashboardContainer) {
      console.error('Dashboard container not found:', containerId);
      return;
    }

    // Check authentication
    if (typeof API !== 'undefined' && !API.isAuthenticated()) {
      this.showLoginRequired();
      return;
    }

    // Load dashboard data
    await this.loadDashboard();
  }

  /**
   * Load all dashboard data
   */
  async loadDashboard() {
    this.isLoading = true;
    this.showLoadingSkeleton();

    try {
      // Fetch all data in parallel — use fallback data if API methods don't exist
      let dashboardRes = { success: true, data: { wallet_balance: 0, total_earned: 0, artworks_submitted: 0, votes_cast: 0, avg_artwork_rating: 0, designer_rewards_count: 0, voter_rewards_count: 0, active_offers: 0 } };
      let activityRes = { success: true, data: [] };
      let rewardRes = { success: true, data: [] };
 
      try {
        if (typeof api !== 'undefined' && typeof api.getUserDashboard === 'function') {
          [dashboardRes, activityRes, rewardRes] = await Promise.all([
            api.getUserDashboard(),
            api.getUserActivity(10),
            api.getUserRewardHistory()
          ]);
        }
      } catch(e) { console.warn('Dashboard API not available, using defaults'); }

      if (!dashboardRes.success || !activityRes.success) {
        throw new Error('Failed to load dashboard data');
      }

      this.userData = dashboardRes.data || {};
      this.activityData = activityRes.data || [];
      this.rewardHistory = rewardRes.data || [];

      // Render dashboard
      this.renderDashboard();

    } catch (error) {
      console.error('Dashboard error:', error);
      this.showErrorState(error.message);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Render complete dashboard
   */
  renderDashboard() {
    this.dashboardContainer.innerHTML = '';

    // Create dashboard sections
    const dashboard = document.createElement('div');
    dashboard.className = 'dashboard-grid';

    // Stats cards (top)
    dashboard.appendChild(this.createStatsSection());

    // Charts and activity (middle)
    const contentRow = document.createElement('div');
    contentRow.className = 'dashboard-row';
    contentRow.appendChild(this.createEarningsCard());
    contentRow.appendChild(this.createRecentActivityCard());
    dashboard.appendChild(contentRow);

    // Portfolio section (bottom)
    dashboard.appendChild(this.createPortfolioSection());

    this.dashboardContainer.appendChild(dashboard);
  }

  /**
   * Create stats cards section
   */
  createStatsSection() {
    const section = document.createElement('div');
    section.className = 'dashboard-stats-grid';

    const stats = [
      {
        label: 'Wallet Balance',
        value: this.formatCurrency(this.userData.wallet_balance),
        icon: 'bx-wallet',
        color: 'gold',
        subtext: `Earned: ${this.formatCurrency(this.userData.total_earned)}`
      },
      {
        label: 'Total Earnings',
        value: this.formatCurrency(this.userData.total_earned),
        icon: 'bx-trending-up',
        color: 'green'
      },
      {
        label: 'Designs',
        value: this.userData.artworks_submitted || 0,
        icon: 'bx-image',
        color: 'pink'
      },
      {
        label: 'Votes Cast',
        value: this.userData.votes_cast || 0,
        icon: 'bx-star',
        color: 'gold'
      },
      {
        label: 'Avg Rating',
        value: parseFloat(this.userData.avg_artwork_rating || 0).toFixed(1),
        icon: 'bx-badge-check',
        color: 'green',
        subtext: '/10'
      },
      {
        label: 'Designer Rewards',
        value: this.userData.designer_rewards_count || 0,
        icon: 'bx-gift',
        color: 'pink'
      }
    ];

    stats.forEach((stat, index) => {
      const card = document.createElement('div');
      card.className = `stat-card glass reveal`;
      if (index > 0) card.style.animationDelay = `${index * 0.05}s`;

      card.innerHTML = `
        <div class="stat-header">
          <i class='bx ${stat.icon} stat-icon stat-icon-${stat.color}'></i>
          <span class="stat-label">${stat.label}</span>
        </div>
        <div class="stat-value">${stat.value}</div>
        ${stat.subtext ? `<div class="stat-subtext">${stat.subtext}</div>` : ''}
      `;

      section.appendChild(card);
    });

    return section;
  }

  /**
   * Create earnings card with chart
   */
  createEarningsCard() {
    const card = document.createElement('div');
    card.className = 'dashboard-card glass reveal';

    const designer = this.userData.designer_rewards_count || 0;
    const voter = this.userData.voter_rewards_count || 0;
    const total = designer + voter;

    const designerPercent = total > 0 ? Math.round((designer / total) * 100) : 0;
    const voterPercent = total > 0 ? Math.round((voter / total) * 100) : 0;

    card.innerHTML = `
      <div class="card-header-text">
        <h3>Reward Breakdown</h3>
        <p class="subtitle">This month's earnings</p>
      </div>

      <div class="earnings-chart">
        <div class="chart-bars">
          <div class="bar-item">
            <div class="bar-label">Designer Rewards</div>
            <div class="bar-container">
              <div class="bar-fill" style="width: ${designerPercent}%; background: var(--gold);"></div>
            </div>
            <div class="bar-value">${designer} (${designerPercent}%)</div>
          </div>

          <div class="bar-item">
            <div class="bar-label">Voter Rewards</div>
            <div class="bar-container">
              <div class="bar-fill" style="width: ${voterPercent}%; background: var(--green);"></div>
            </div>
            <div class="bar-value">${voter} (${voterPercent}%)</div>
          </div>
        </div>

        <div class="chart-summary">
          <div class="summary-item">
            <span class="summary-label">Total Rewards</span>
            <span class="summary-value">${total}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Total Earned</span>
            <span class="summary-value">${this.formatCurrency(this.userData.total_earned)}</span>
          </div>
        </div>
      </div>
    `;

    return card;
  }

  /**
   * Create recent activity card
   */
  createRecentActivityCard() {
    const card = document.createElement('div');
    card.className = 'dashboard-card glass reveal';
    card.style.animationDelay = '0.1s';

    if (!this.activityData || this.activityData.length === 0) {
      card.innerHTML = `
        <div class="card-header-text">
          <h3>Recent Activity</h3>
        </div>
        <div class="empty-activity">
          <p>No recent activity</p>
        </div>
      `;
      return card;
    }

    let activityHTML = `
      <div class="card-header-text">
        <h3>Recent Activity</h3>
        <p class="subtitle">Latest 10 actions</p>
      </div>
      <div class="activity-list">
    `;

    this.activityData.slice(0, 10).forEach((activity) => {
      const icon = this.getActivityIcon(activity.action_type);
      const label = this.getActivityLabel(activity.action_type);
      const timeAgo = this.getTimeAgo(activity.created_at);

      activityHTML += `
        <div class="activity-item">
          <div class="activity-icon activity-${activity.action_type}">
            <i class='bx ${icon}'></i>
          </div>
          <div class="activity-content">
            <div class="activity-action">${label}</div>
            <div class="activity-time">${timeAgo}</div>
          </div>
        </div>
      `;
    });

    activityHTML += '</div>';
    card.innerHTML = activityHTML;

    return card;
  }

  /**
   * Create portfolio section with artworks and offers
   */
  createPortfolioSection() {
    const section = document.createElement('div');
    section.className = 'dashboard-portfolio-section';

    // Title
    const title = document.createElement('h2');
    title.className = 'section-title';
    title.textContent = 'Your Portfolio';
    section.appendChild(title);

    // Two-column layout
    const row = document.createElement('div');
    row.className = 'portfolio-row';

    // Designs
    row.appendChild(this.createDesignsCard());

    // Offers
    row.appendChild(this.createOffersCard());

    section.appendChild(row);

    return section;
  }

  /**
   * Create designs card
   */
  createDesignsCard() {
    const card = document.createElement('div');
    card.className = 'portfolio-card glass reveal';

    const count = this.userData.artworks_submitted || 0;

    card.innerHTML = `
      <div class="portfolio-card-header">
        <h3>Your Designs</h3>
        <span class="count-badge">${count}</span>
      </div>
      <p class="portfolio-description">Designs you've submitted to offers</p>
      <button class="btn btn-primary" onclick="window.activatePage('page-designer-artworks')">
        <i class='bx bx-image'></i> View All
      </button>
    `;

    return card;
  }

  /**
   * Create offers card
   */
  createOffersCard() {
    const card = document.createElement('div');
    card.className = 'portfolio-card glass reveal';
    card.style.animationDelay = '0.05s';

    const count = this.userData.active_offers || 0;

    card.innerHTML = `
      <div class="portfolio-card-header">
        <h3>Active Offers</h3>
        <span class="count-badge">${count}</span>
      </div>
      <p class="portfolio-description">Offers you've created for designers</p>
      <button class="btn btn-primary" onclick="window.activatePage('page-offers')">
        <i class='bx bx-briefcase'></i> View All
      </button>
    `;

    return card;
  }

  /**
   * Show loading skeleton
   */
  showLoadingSkeleton() {
    this.dashboardContainer.innerHTML = `
      <div class="dashboard-skeleton">
        <div class="skeleton-grid">
          ${Array(6).fill(0).map(() => `
            <div class="stat-card-skeleton glass">
              <div class="skeleton skeleton-avatar"></div>
              <div class="skeleton skeleton-text" style="width:60%;margin-top:12px;"></div>
              <div class="skeleton skeleton-text" style="width:80%;margin-top:8px;"></div>
            </div>
          `).join('')}
        </div>

        <div class="dashboard-row">
          <div class="dashboard-card glass">
            <div class="skeleton skeleton-text" style="width:40%;"></div>
            <div class="skeleton skeleton-chart" style="margin-top:20px;"></div>
          </div>
          <div class="dashboard-card glass">
            <div class="skeleton skeleton-text" style="width:40%;"></div>
            <div class="skeleton skeleton-list" style="margin-top:20px;"></div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Show login required
   */
  showLoginRequired() {
    this.dashboardContainer.innerHTML = `
      <div class="login-required-container">
        <div class="login-icon"><i class='bx bx-lock'></i></div>
        <h2>Authentication Required</h2>
        <p>Please log in to view your dashboard</p>
        <button class="btn btn-primary" onclick="window.location.hash='#login'">
          <i class='bx bx-log-in'></i> Go to Login
        </button>
      </div>
    `;
  }

  /**
   * Show error state
   */
  showErrorState(message = 'Failed to load dashboard') {
    this.dashboardContainer.innerHTML = `
      <div class="error-container">
        <div class="error-icon"><i class='bx bx-error-circle'></i></div>
        <h2>Oops! Something went wrong</h2>
        <p>${message}</p>
        <button class="btn btn-primary" onclick="location.reload()">
          <i class='bx bx-refresh'></i> Retry
        </button>
      </div>
    `;
  }

  /**
   * Utility: Format currency
   */
  formatCurrency(amount) {
    return parseFloat(amount || 0).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }

  /**
   * Utility: Get activity icon
   */
  getActivityIcon(actionType) {
    const icons = {
      'offer_created': 'bx-plus-circle',
      'artwork_submitted': 'bx-image-add',
      'design_submitted': 'bx-image-add',
      'artwork_voted': 'bx-star',
      'design_voted': 'bx-star',
      'reward_earned': 'bx-gift',
      'offer_approved': 'bx-badge-check',
      'comment_posted': 'bx-comment-detail'
    };
    return icons[actionType] || 'bx-star';
  }

  /**
   * Utility: Get activity label
   */
  getActivityLabel(actionType) {
    const labels = {
      'offer_created': 'Created an offer',
      'artwork_submitted': 'Submitted design',
      'design_submitted': 'Submitted design',
      'artwork_voted': 'Voted on design',
      'design_voted': 'Voted on design',
      'reward_earned': 'Earned reward',
      'offer_approved': 'Offer approved',
      'comment_posted': 'Posted comment'
    };
    return labels[actionType] || 'Activity';
  }

  /**
   * Utility: Format time ago
   */
  getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return date.toLocaleDateString();
  }

  /**
   * Refresh dashboard
   */
  async refresh() {
    await this.loadDashboard();
  }
}

// Global instance
let userDashboard = new UserDashboard();

/**
 * Initialize on DOM ready
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize when needed
  const dashboardContainer = document.getElementById('dashboard-container');
  if (dashboardContainer) {
    // Only auto-init if hash contains 'dashboard'
    if (window.location.hash.includes('dashboard')) {
      try {
        await userDashboard.init('dashboard-container');
      } catch(e) { console.warn('Dashboard auto-init skipped:', e.message); }
    }
  }
});
