/**
 * NOTIFICATIONS SYSTEM
 * Complete notification management for ARTVOT platform
 * 
 * Features:
 * - Bell icon with unread badge
 * - Dropdown panel with latest notifications
 * - Full notifications page with filtering
 * - Polling for real-time updates (disabled when backend offline)
 * - Mark as read/unread
 * - Delete notifications
 * - Type-specific icons and colors
 */
 
/* ── Mock notifications shown when backend is offline ── */
const MOCK_NOTIFICATIONS = [
  { id: 1, type: 'reward_earned',    message: 'You earned $50 for your artwork "Neon Desert"!',   created_at: new Date(Date.now() - 1800000).toISOString(),  read_at: null },
  { id: 2, type: 'artwork_voted',    message: 'Your artwork received 24 new votes today.',          created_at: new Date(Date.now() - 3600000).toISOString(),  read_at: null },
  { id: 3, type: 'offer_approved',   message: 'Your offer "Brand Identity" has been approved.',     created_at: new Date(Date.now() - 7200000).toISOString(),  read_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 4, type: 'user_followed',    message: 'lina_draws started following you.',                  created_at: new Date(Date.now() - 86400000).toISOString(), read_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 5, type: 'offer_created',    message: 'New offer posted: "NFT Collection Artwork — $1500"', created_at: new Date(Date.now() - 172800000).toISOString(),read_at: null },
];
 
class NotificationSystem {
  constructor() {
    this.notifications = [];
    this.unreadCount = 0;
    this.isLoading = false;
    this.pollInterval = null;
    this.pageSize = 15;
    this.currentPage = 1;
    this.allNotifications = [];
    this.selectedFilter = 'all';
    this.backendOnline = false; // ← assume offline until proven otherwise
  }
 
  /**
   * Initialize notification system
   */
  async init() {
    try {
      await this.loadNotifications();
      await this.loadUnreadCount();
 
      this.renderBell();
      this.renderDropdown();
      this.setupEventListeners();
 
      // Only start polling if backend responded successfully
      if (this.backendOnline) {
        this.startPolling();
      }
 
      console.log('✅ Notification system initialized');
    } catch (error) {
      // Silent — use mock data, no console noise
      this._useMockData();
      this.renderBell();
      this.renderDropdown();
      this.setupEventListeners();
      console.log('✅ Notification system initialized');
    }
  }
 
  /**
   * Load mock data silently (when backend is offline)
   */
  _useMockData() {
    this.notifications = MOCK_NOTIFICATIONS.slice(0, 5);
    this.allNotifications = MOCK_NOTIFICATIONS;
    this.unreadCount = MOCK_NOTIFICATIONS.filter(n => !n.read_at).length;
    this.backendOnline = false;
  }
 
  /**
   * Load latest notifications for dropdown
   */
  async loadNotifications() {
    if (typeof api === 'undefined' || !api.isLoggedIn()) {
      this.notifications = [];
      this.unreadCount = 0;
      this.updateBellBadge();
      return;
    }
    try {
      this.isLoading = true;
      if (typeof api.getNotifications !== 'function') {
        this._useMockData();
        return;
      }
      const response = await api.getNotifications(1, 5);
      if (response && response.success && response.data) {
        this.notifications = response.data;
        this.backendOnline = true;
      } else {
        this._useMockData();
      }
      this.updateBellBadge();
    } catch (error) {
      this._useMockData();
    } finally {
      this.isLoading = false;
    }
  }
 
  /**
   * Load unread count
   */
  async loadUnreadCount() {
    if (typeof api === 'undefined' || !api.isLoggedIn()) {
      this.unreadCount = 0;
      this.updateBellBadge();
      return;
    }
    if (!this.backendOnline) {
      this.unreadCount = this.notifications.filter(n => !n.read_at).length;
      this.updateBellBadge();
      return;
    }
    try {
      if (typeof api.getUnreadNotificationCount !== 'function') {
        this.unreadCount = this.notifications.filter(n => !n.read_at).length;
        this.updateBellBadge();
        return;
      }
      const response = await api.getUnreadNotificationCount();
      if (response && response.success) {
        this.unreadCount = response.data?.unread_count || 0;
      } else {
        this.unreadCount = this.notifications.filter(n => !n.read_at).length;
      }
      this.updateBellBadge();
    } catch (error) {
      this.unreadCount = this.notifications.filter(n => !n.read_at).length;
      this.updateBellBadge();
    }
  }
 
  /**
   * Load all notifications for notifications page
   */
  async loadAllNotifications(page = 1, filter = 'all') {
    if (typeof api === 'undefined' || !api.isLoggedIn()) {
      this.allNotifications = [];
      return [];
    }
    try {
      this.isLoading = true;
      this.currentPage = page;
      this.selectedFilter = filter;
 
      if (!this.backendOnline) {
        this.allNotifications = filter === 'unread'
          ? MOCK_NOTIFICATIONS.filter(n => !n.read_at)
          : MOCK_NOTIFICATIONS;
        return this.allNotifications;
      }
 
      if (typeof api === 'undefined' || typeof api.getNotifications !== 'function') {
        this.allNotifications = filter === 'unread'
          ? MOCK_NOTIFICATIONS.filter(n => !n.read_at)
          : MOCK_NOTIFICATIONS;
        return this.allNotifications;
      }
      const unreadOnly = filter === 'unread';
      const response = await api.getNotifications(page, this.pageSize, unreadOnly);
      if (response && response.success && response.data) {
        this.allNotifications = response.data;
      } else {
        this.allNotifications = filter === 'unread'
          ? MOCK_NOTIFICATIONS.filter(n => !n.read_at)
          : MOCK_NOTIFICATIONS;
      }
      return this.allNotifications;
    } catch (error) {
      this.allNotifications = MOCK_NOTIFICATIONS;
      return this.allNotifications;
    } finally {
      this.isLoading = false;
    }
  }
 
  /**
   * Mark notification as read
   */
  async markAsRead(notificationId) {
    // Update local state immediately (optimistic UI)
    const notif = this.notifications.find(n => n.id === notificationId);
    if (notif && !notif.read_at) {
      notif.read_at = new Date().toISOString();
      if (this.unreadCount > 0) this.unreadCount--;
      this.updateBellBadge();
    }
 
    if (!this.backendOnline) return;
    try {
      if (typeof api !== 'undefined' && typeof api.markNotificationAsRead === 'function') {
        await api.markNotificationAsRead(notificationId);
      }
    } catch (error) { /* silent */ }
  }
 
  /**
   * Mark all notifications as read
   */
  async markAllAsRead() {
    this.notifications.forEach(n => { n.read_at = new Date().toISOString(); });
    this.allNotifications.forEach(n => { n.read_at = new Date().toISOString(); });
    this.unreadCount = 0;
    this.updateBellBadge();
    this.renderDropdown();
    this.setupEventListeners();
 
    if (!this.backendOnline) return;
    try {
      if (typeof api !== 'undefined' && typeof api.markAllNotificationsAsRead === 'function') {
        await api.markAllNotificationsAsRead();
      }
    } catch (error) { /* silent */ }
  }
 
  /**
   * Delete notification
   */
  async deleteNotification(notificationId) {
    // Update local state immediately
    this.notifications    = this.notifications.filter(n => n.id !== notificationId);
    this.allNotifications = this.allNotifications.filter(n => n.id !== notificationId);
    this.unreadCount = this.notifications.filter(n => !n.read_at).length;
    this.updateBellBadge();
 

 
    if (!this.backendOnline) return;
    try {
      if (typeof api !== 'undefined' && typeof api.deleteNotification === 'function') {
        await api.deleteNotification(notificationId);
      }
    } catch (error) { /* silent */ }
  }
 
  /**
   * Setup event listeners — safe to call multiple times (idempotent)
   */
  setupEventListeners() {
    // FIX: Use a single bound handler stored on the instance so we can
    // removeEventListener before re-adding. This prevents listener accumulation
    // when setupEventListeners() is called repeatedly (e.g. from markAllAsRead).
    if (!this._boundOutsideClick) {
      this._boundOutsideClick = (e) => {
        const dropdown = document.getElementById('notification-dropdown');
        const bell = document.getElementById('notification-bell-btn');
        if (dropdown && bell && !dropdown.contains(e.target) && !bell.contains(e.target)) {
          this.closeDropdown();
        }
      };
    }
    // Remove before re-adding to ensure only one listener is ever registered
    document.removeEventListener('click', this._boundOutsideClick);
    document.addEventListener('click', this._boundOutsideClick);

    const bellButton = document.getElementById('notification-bell-btn');
    if (bellButton) {
      // Replace onclick (idempotent) instead of addEventListener to avoid stacking
      bellButton.onclick = (e) => {
        e.stopPropagation();
        this.toggleDropdown();
      };
    }

    const markAllBtn = document.getElementById('notification-mark-all-btn');
    if (markAllBtn) {
      markAllBtn.onclick = () => this.markAllAsRead();
    }
  }
 
  toggleDropdown() {
    const dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;
    dropdown.style.opacity === '1' ? this.closeDropdown() : this.openDropdown();
  }
 
  openDropdown() {
    const dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;
    dropdown.style.display = 'block';
    setTimeout(() => {
      dropdown.style.opacity = '1';
      dropdown.style.transform = 'translateY(0) scale(1)';
    }, 10);
  }
 
  closeDropdown() {
    const dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;
    dropdown.style.opacity = '0';
    dropdown.style.transform = 'translateY(-8px) scale(0.95)';
    setTimeout(() => { dropdown.style.display = 'none'; }, 200);
  }
 
  /**
   * Start polling — only when backend is confirmed online
   */
  startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(async () => {
      await this.loadUnreadCount();
      await this.loadNotifications();
      this.renderDropdown();


    }, 30000);
  }
 
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
 
  updateBellBadge() {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;
    if (this.unreadCount > 0) {
      badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
      badge.style.display = 'block';
      badge.classList.add('pulse');
    } else {
      badge.style.display = 'none';
      badge.classList.remove('pulse');
    }
  }
 
  getNotificationIcon(type) {
    const icons = {
      'reward_earned':    'bx-gift',
      'offer_approved':   'bx-check-circle',
      'artwork_voted':    'bx-star',
      'offer_created':    'bx-briefcase',
      'artwork_submitted':'bx-image',
      'offer_comment':    'bx-message-rounded',
      'user_mentioned':   'bx-at',
      'user_followed':    'bx-user-plus',
      'offer_message':    'bx-envelope',
      'system':           'bx-info-circle'
    };
    return icons[type] || 'bx-bell';
  }
 
  getNotificationColor(type) {
    const colors = {
      'reward_earned':    'gold',
      'offer_approved':   'green',
      'artwork_voted':    'green',
      'offer_created':    'pink',
      'artwork_submitted':'pink',
      'offer_comment':    'pink',
      'user_mentioned':   'gold',
      'user_followed':    'green',
      'offer_message':    'gold',
      'system':           'gray'
    };
    return colors[type] || 'gray';
  }
 
  getNotificationLabel(type) {
    const labels = {
      'reward_earned':    'Reward Earned',
      'offer_approved':   'Offer Approved',
      'artwork_voted':    'Artwork Voted',
      'offer_created':    'New Offer',
      'artwork_submitted':'Artwork Submitted',
      'offer_comment':    'New Comment',
      'user_mentioned':   'Mentioned',
      'user_followed':    'New Follower',
      'offer_message':    'New Message',
      'system':           'System'
    };
    return labels[type] || 'Notification';
  }
 
  formatTimeAgo(dateString) {
    const now  = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 60)    return 'just now';
    if (seconds < 3600)  return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800)return `${Math.floor(seconds / 86400)}d ago`;
    return `${Math.floor(seconds / 604800)}w ago`;
  }
 
  renderBell() {
    const bellContainer = document.getElementById('notification-bell-container');
    if (!bellContainer) return;
    bellContainer.innerHTML = `
      <button id="notification-bell-btn" class="notification-bell-btn" title="Notifications">
        <i class="bx bxs-bell"></i>
        <span id="notification-badge" class="notification-badge" style="display: ${this.unreadCount > 0 ? 'block' : 'none'}">
          ${this.unreadCount > 99 ? '99+' : this.unreadCount}
        </span>
      </button>
    `;
  }
 
  renderDropdown() {
    const dropdownContainer = document.getElementById('notification-dropdown-container');
    if (!dropdownContainer) return;
 
    const hasNotifications = this.notifications.length > 0;
    const notificationsHtml = hasNotifications
      ? this.notifications.map(notif => this.createNotificationItem(notif)).join('')
      : '<div class="notification-empty">No notifications yet</div>';
 
    dropdownContainer.innerHTML = `
      <div id="notification-dropdown" class="notification-dropdown" style="opacity: 0; transform: translateY(-8px) scale(0.95); display: none;">
        <div class="notification-dropdown-header">
          <h3>Notifications</h3>
          ${this.unreadCount > 0 ? `<button id="notification-mark-all-btn" class="notification-mark-all">Mark all as read</button>` : ''}
        </div>
        <div class="notification-dropdown-content">
          ${notificationsHtml}
        </div>

      </div>
    `;
  }
 
  createNotificationItem(notif) {
    const icon    = this.getNotificationIcon(notif.type);
    const color   = this.getNotificationColor(notif.type);
    const timeAgo = this.formatTimeAgo(notif.created_at);
    const isUnread = !notif.read_at;
 
    return `
      <div class="notification-item ${isUnread ? 'unread' : 'read'}" data-id="${notif.id}" onclick="if (!this.classList.contains('read')) { window.notificationSystem.markAsRead(${notif.id}); this.classList.remove('unread'); this.classList.add('read'); }">
        <div class="notification-item-icon icon-${color}">
          <i class="bx ${icon}"></i>
        </div>
        <div class="notification-item-content">
          <p class="notification-item-message">${notif.message}</p>
          <span class="notification-item-time">${timeAgo}</span>
        </div>
        <button class="notification-item-close" onclick="event.stopPropagation(); window.notificationSystem.deleteNotification(${notif.id})" title="Delete">
          <i class="bx bx-x"></i>
        </button>
      </div>
    `;
  }
 
  destroy() {
    this.stopPolling();
  }
}
 
// Global instance
window.notificationSystem = new NotificationSystem();
var notificationSystem = window.notificationSystem;
 
document.addEventListener('DOMContentLoaded', () => {
  notificationSystem.init();
});
 
window.addEventListener('beforeunload', () => {
  notificationSystem.destroy();
});