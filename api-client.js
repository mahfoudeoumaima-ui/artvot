/**
 * ARTVOT API Client
 * Centralized API service for all backend communication
 * Handles authentication, requests, error handling, and token management
 */
 
const API = (() => {
  const BASE_URL = '/again/api'; // ✅ relative path — ما كاينش CORS
  
  // Token management
  const getToken = () => localStorage.getItem('artvot_token');
  const setToken = (token) => localStorage.setItem('artvot_token', token);
  const clearToken = () => localStorage.removeItem('artvot_token');
  
  const getCurrentUser = () => {
    const userStr = localStorage.getItem('artvot_user');
    if (!userStr) return null;
    try {
      const user = JSON.parse(userStr);
      if (user && user.id && !user.user_id) {
        user.user_id = user.id;
      } else if (user && user.user_id && !user.id) {
        user.id = user.user_id;
      }
      return user;
    } catch(e) {
      return null;
    }
  };
  const setCurrentUser = (user) => {
    if (user && user.id && !user.user_id) {
      user.user_id = user.id;
    } else if (user && user.user_id && !user.id) {
      user.id = user.user_id;
    }
    localStorage.setItem('artvot_user', JSON.stringify(user));
  };
  const clearCurrentUser = () => localStorage.removeItem('artvot_user');
  
  // Default request headers
  const getHeaders = (includeAuth = true) => {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (includeAuth) {
      const token = getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return headers;
  };
  
  // HTTP request wrapper
  const request = async (endpoint, options = {}) => {
    const {
      method = 'GET',
      body = null,
      includeAuth = true,
      showError = true,
    } = options;
    
    const config = {
      method,
      headers: getHeaders(includeAuth),
    };
    
    if (body) {
      config.body = JSON.stringify(body);
    }
    
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, config);
      const text = await response.text();
      
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error('API returned non-JSON response:', text);
        return {
          success: false,
          message: 'Server error: Invalid response format',
          data: null,
          raw: text,
        };
      }
      
      // Handle token expiration
      if (response.status === 401 || (response.status === 404 && data && data.message === 'User not found')) {
        clearToken();
        clearCurrentUser();
        // Redirect to login if not already there and we are on a protected page
        if (!window.location.pathname.includes('login')) {
          if (window.location.pathname.includes('admin')) {
            window.location.href = 'admin-login.html';
          } else {
            const protectedPages = ['page-profile', 'page-settings', 'page-offer-hub', 'page-designer-artworks', 'page-admin-dashboard'];
            const activeSection = document.querySelector('.page-section.active');
            const activePageId = activeSection ? activeSection.id : '';
            if (protectedPages.includes(activePageId)) {
              window.location.href = 'login.html';
            }
          }
        }
      }
      
      if (!data.success && showError) {
        console.error('API Error:', data.message, data);
      }
      
      return data;
    } catch (error) {
      console.error('Request failed:', error);
      if (showError) {
        return {
          success: false,
          message: error.message || 'Network error',
          data: null,
        };
      }
      throw error;
    }
  };
  
  // ════════════════════════════════
  // PUBLIC API METHODS
  // ════════════════════════════════
  
  return {
    // ── Authentication ──
    auth: {
      register: async (payload) => {
        return request('/auth/register', {
          method: 'POST',
          body: payload,
          includeAuth: false,
        });
      },
      
      login: async (email, password) => {
        const response = await request('/auth/login', {
          method: 'POST',
          body: { email, password },
          includeAuth: false,
          showError: false,
        });
        
        if (response.success && response.data) {
          setToken(response.data.token);
          setCurrentUser(response.data.user);
        }
        return response;
      },
      
      logout: async () => {
        const response = await request('/auth/logout', {
          method: 'POST',
          includeAuth: true,
          showError: false,
        });
        clearToken();
        clearCurrentUser();
        return response;
      },
      
      getMe: async () => {
        return request('/auth/me', {
          method: 'GET',
          includeAuth: true,
        });
      },
      
      updateProfile: async (payload) => {
        return request('/auth/profile', {
          method: 'PUT',
          body: payload,
          includeAuth: true,
        });
      },
      
      changePassword: async (current_password, new_password, new_password_confirm) => {
        return request('/auth/change-password', {
          method: 'POST',
          body: { current_password, new_password, new_password_confirm },
          includeAuth: true,
        });
      },

      /**
       * Google OAuth — initiate redirect (convenience wrapper).
       * Calling this navigates the page; it does not return a Promise response.
       * Alternatively, point the Google button href directly to /again/api/auth/google.
       */
      googleLogin: () => {
        window.location.href = '/again/api/auth/google';
      },
    },
    
    // ── User Wallet ──
    wallet: {
      getBalance: async () => {
        return request('/user/wallet', {
          method: 'GET',
          includeAuth: true,
        });
      },
      
      getTransactions: async (limit = 20, offset = 0) => {
        return request(`/user/wallet/transactions?limit=${limit}&offset=${offset}`, {
          method: 'GET',
          includeAuth: true,
        });
      },
    },
    
    // ── Offers ──
    offers: {
      getAll: async (page = 1, limit = 12, filter = 'active', category = 'all', search = '', sort = 'trending') => {
        return request(`/offers?page=${page}&limit=${limit}&filter=${filter}&category=${encodeURIComponent(category)}&search=${encodeURIComponent(search)}&sort=${sort}`, {
          method: 'GET',
        });
      },
      
      getById: async (id) => {
        return request(`/offers/${id}`, {
          method: 'GET',
        });
      },
      
      create: async (payload) => {
        return request('/offers', {
          method: 'POST',
          body: payload,
          includeAuth: true,
        });
      },
      
      update: async (id, payload) => {
        return request(`/offers/${id}`, {
          method: 'PUT',
          body: payload,
          includeAuth: true,
        });
      },
      
      delete: async (id) => {
        return request(`/offers/${id}`, {
          method: 'DELETE',
          includeAuth: true,
        });
      },
      
      getUserOffers: async () => {
        return request('/user/offers', {
          method: 'GET',
          includeAuth: true,
        });
      },
      
      getApplications: async () => {
        return request('/user/applications', {
          method: 'GET',
          includeAuth: true,
        });
      },
      
      cancelApplication: async (offerId) => {
        return request(`/user/applications/${offerId}`, {
          method: 'DELETE',
          includeAuth: true,
        });
      },
      
      getSubmissions: async (offerId) => {
        return request(`/offers/${offerId}/submissions`, {
          method: 'GET',
          includeAuth: true,
        });
      },

      acceptSubmission: async (offerId, subId) => {
        return request(`/offers/${offerId}/submissions/${subId}/accept`, {
          method: 'POST',
          includeAuth: true,
        });
      },

      rejectSubmission: async (offerId, subId) => {
        return request(`/offers/${offerId}/submissions/${subId}/reject`, {
          method: 'POST',
          includeAuth: true,
        });
      },

      applyToOffer: async (offerId, message = "") => {
        return request(`/offers/${offerId}/apply`, {
          method: 'POST',
          body: { message },
          includeAuth: true,
        });
      },

      close: async (offerId) => {
        return request(`/offers/${offerId}/close`, {
          method: 'PUT',
          includeAuth: true,
        });
      },
    },
    
    // ── Uploads ──
    uploads: {
      create: async (formData, category = 'posts') => {
        const token = getToken();
        const headers = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        if (category && formData && typeof formData.append === 'function' && !formData.has('category')) {
          formData.append('category', category);
        }
        
        // Upload endpoint — upload.php lives inside api/uploads/
        const response = await fetch('/again/api/uploads/upload.php', {
          method: 'POST',
          headers,
          body: formData,
        });
        let result;
        try {
          result = await response.json();
        } catch(e) {
          return { success: false, message: 'Upload server error' };
        }
        return result;
      }
    },
    
    // ── Submissions ──
    submissions: {
      getByDesigner: async (designerId) => {
        return request(`/submissions?designer_id=${designerId}`, {
          method: 'GET',
          includeAuth: true,
        });
      },
      getByOffer: async (offerId) => {
        return request(`/submissions?offer_id=${offerId}`, {
          method: 'GET',
          includeAuth: true,
        });
      },
      updateStatus: async (subId, status) => {
        return request(`/submissions/${subId}/status`, {
          method: 'PUT',
          body: { status },
          includeAuth: true,
        });
      },
      delete: async (subId) => {
        return request(`/submissions/${subId}`, {
          method: 'DELETE',
          includeAuth: true,
        });
      }
    },
    

    
    // ── Votes ──
    votes: {
      vote: async (offer_id, score) => {
        return request('/votes', {
          method: 'POST',
          body: { offer_id, score },
          includeAuth: true,
        });
      },
      
      getOfferVotes: async (offerId) => {
        return request(`/offers/${offerId}/votes`, {
          method: 'GET',
        });
      },
      
      getUserVote: async (offerId) => {
        return request(`/offers/${offerId}/vote`, {
          method: 'GET',
          includeAuth: true,
          showError: false,
        });
      },
      
      deleteVote: async (offerId) => {
        return request(`/votes/${offerId}`, {
          method: 'DELETE',
          includeAuth: true,
        });
      },
      
      getUserVotes: async () => {
        return request('/user/votes', {
          method: 'GET',
          includeAuth: true,
        });
      },
    },

    // ── Comments ──
    comments: {
      getOfferComments: async (offerId) => {
        return request(`/offers/${offerId}/comments`, {
          method: 'GET',
        });
      },

      create: async (offerId, commentText) => {
        return request(`/offers/${offerId}/comments`, {
          method: 'POST',
          body: { comment_text: commentText },
          includeAuth: true,
        });
      },

      delete: async (commentId) => {
        return request(`/comments/${commentId}`, {
          method: 'DELETE',
          includeAuth: true,
        });
      },
    },
    
    // ── Users ──
    users: {
      getByUsername: async (username) => {
        return request(`/users/${username}`, {
          method: 'GET',
        });
      },
      
      getById: async (id) => {
        return request(`/users/id/${id}`, {
          method: 'GET',
        });
      },
      
      getRewards: async () => {
        return request('/user/rewards', {
          method: 'GET',
          includeAuth: true,
        });
      },
      
      getRewardHistory: async () => {
        return request('/user/rewards/history', {
          method: 'GET',
          includeAuth: true,
        });
      },
      
      getLeaderboard: async () => {
        return request('/users/leaderboard', {
          method: 'GET',
        });
      },
      
      getUserDesigns: async (username) => {
        return request(`/users/${username}/offers`, {
          method: 'GET',
        });
      },
    },
    
    // ── Admin ──
    admin: {
      getStats: async () => {
        return request('/admin/stats', {
          method: 'GET',
          includeAuth: true,
        });
      },
      
      getUsers: async () => {
        return request('/admin/users', {
          method: 'GET',
          includeAuth: true,
        });
      },
      
      blockUser: async (userId, isBlocked) => {
        // isBlocked = true to block, false to unblock (explicit — avoids server-side flip race)
        return request(`/admin/users/${userId}/block`, {
          method: 'PUT',
          body: { is_blocked: !!isBlocked },
          includeAuth: true,
        });
      },

      getAdminOffers: async (limit = 100) => {
        // Admin-only: returns ALL offers regardless of status/approval via dedicated route
        return request(`/admin/offers?limit=${limit}`, {
          method: 'GET',
          includeAuth: true,
        });
      },

      pauseOffer: async (offerId) => {
        return request(`/admin/offers/${offerId}/pause`, {
          method: 'PUT',
          includeAuth: true,
        });
      },

      reopenOffer: async (offerId) => {
        return request(`/admin/offers/${offerId}/reopen`, {
          method: 'PUT',
          includeAuth: true,
        });
      },
      
      deleteOffer: async (offerId) => {
        return request(`/admin/offers/${offerId}`, {
          method: 'DELETE',
          includeAuth: true,
        });
      },
      
      approveOffer: async (offerId) => {
        return request(`/admin/offers/${offerId}/approve`, {
          method: 'POST',
          includeAuth: true,
        });
      },
      
      deleteUser: async (userId) => {
        return request(`/admin/users/${userId}`, {
          method: 'DELETE',
          includeAuth: true,
        });
      },
      
      togglePostingRestriction: async (userId, restricted) => {
        return request(`/admin/users/${userId}/posting`, {
          method: 'PUT',
          body: { posting_restricted: restricted },
          includeAuth: true,
        });
      },
      
      hideOffer: async (offerId, hidden) => {
        return request(`/admin/offers/${offerId}/hide`, {
          method: 'PUT',
          body: { is_hidden: hidden },
          includeAuth: true,
        });
      },
      
      closeOffer: async (offerId) => {
        return request(`/admin/offers/${offerId}/close`, {
          method: 'PUT',
          includeAuth: true,
        });
      },
      
      getSubmissions: async () => {
        return request('/admin/submissions', {
          method: 'GET',
          includeAuth: true,
        });
      },
      
      moderateSubmission: async (subId, status) => {
        return request(`/admin/submissions/${subId}`, {
          method: 'PUT',
          body: { status },
          includeAuth: true,
        });
      },
      
      deleteSubmission: async (subId) => {
        return request(`/admin/submissions/${subId}`, {
          method: 'DELETE',
          includeAuth: true,
        });
      },
    },
    
    // ── Notifications ──
    notifications: {
      getAll: async (page = 1, limit = 20, unreadOnly = false) => {
        return request(`/user/notifications?page=${page}&limit=${limit}&unread_only=${unreadOnly}`, {
          method: 'GET',
          includeAuth: true,
        });
      },
      getUnreadCount: async () => {
        return request('/user/notifications/unread-count', {
          method: 'GET',
          includeAuth: true,
        });
      },
      markAsRead: async (id) => {
        return request(`/user/notifications/${id}/read`, {
          method: 'PUT',
          includeAuth: true,
        });
      },
      markAllAsRead: async () => {
        return request('/user/notifications/read-all', {
          method: 'PUT',
          includeAuth: true,
        });
      },
      delete: async (id) => {
        return request(`/user/notifications/${id}`, {
          method: 'DELETE',
          includeAuth: true,
        });
      },
    },

    // ── Analytics / Dashboard ──
    analytics: {
      getUserDashboard: async () => {
        return request('/user/dashboard', {
          method: 'GET',
          includeAuth: true,
        });
      },
      getUserActivity: async () => {
        return request('/user/activity', {
          method: 'GET',
          includeAuth: true,
        });
      },
      getPlatformStats: async () => {
        return request('/analytics/platform', {
          method: 'GET',
        });
      },
    },

    // ── Global Safe Request ──
    safeRequest: async (url) => {
      try {
        const response = await fetch(url);
        const text = await response.text();

        try {
          return JSON.parse(text);
        } catch {
          return {
            success: false,
            message: 'Invalid JSON response'
          };
        }
      } catch (err) {
        return {
          success: false,
          message: err.message
        };
      }
    },

    // ── Token & Auth State ──
    isAuthenticated: () => !!getToken(),
    getToken,
    setToken,
    clearToken,
    getCurrentUser,
    setCurrentUser,
    clearCurrentUser,
  };
})();

// Expose safeRequest globally
window.safeRequest = API.safeRequest;

/**
 * Unified global `api` bridge mapping lowercase api.methodName() calls
 * (used in notifications.js, feed.js, dashboard.js, etc.) to the real API object.
 */
if (typeof window.api === 'undefined') {
  window.api = {
    // Auth
    isLoggedIn: () => API.isAuthenticated(),
    getCurrentUser: () => API.getCurrentUser(),
    getToken: () => API.getToken(),

    // Offers
    getTrendingOffers: () => API.offers.getAll(1, 12, 'active'),
    getOffers: (page, limit) => API.offers.getAll(page, limit),
    getUserOffers: () => API.offers.getUserOffers(),
    getUserApplications: () => API.offers.getApplications(),
    cancelParticipation: (offerId) => API.offers.cancelApplication(offerId),
    getOfferSubmissions: (offerId) => API.offers.getSubmissions(offerId),
    acceptSubmission: (offerId, subId) => API.offers.acceptSubmission(offerId, subId),
    rejectSubmission: (offerId, subId) => API.offers.rejectSubmission(offerId, subId),
    getDesignerSubmissions: (designerId) => API.submissions.getByDesigner(designerId),
    getOfferSubmissionsRaw: (offerId) => API.submissions.getByOffer(offerId),
    updateSubmissionStatus: (subId, status) => API.submissions.updateStatus(subId, status),
    deleteSubmission: (subId) => API.submissions.delete(subId),
    applyToOffer: (offerId, message) => API.offers.applyToOffer(offerId, message),

    // Votes
    vote: (offerId, score) => API.votes.vote(offerId, score),
    getUserVotes: () => API.votes.getUserVotes(),

    // Comments
    getOfferComments: (offerId) => API.comments.getOfferComments(offerId),
    createComment: (offerId, commentText) => API.comments.create(offerId, commentText),
    deleteComment: (commentId) => API.comments.delete(commentId),

    // Notifications
    getNotifications: (page, limit, unreadOnly) => API.notifications.getAll(page || 1, limit || 20, unreadOnly || false),
    getUnreadCount: () => API.notifications.getUnreadCount(),
    getUnreadNotificationCount: () => API.notifications.getUnreadCount(),
    markNotificationRead: (id) => API.notifications.markAsRead(id),
    markNotificationAsRead: (id) => API.notifications.markAsRead(id),
    markAllNotificationsRead: () => API.notifications.markAllAsRead(),
    markAllNotificationsAsRead: () => API.notifications.markAllAsRead(),
    deleteNotification: (id) => API.notifications.delete(id),

    // Wallet
    getWalletBalance: () => API.wallet.getBalance(),
    getWalletTransactions: (limit, offset) => API.wallet.getTransactions(limit, offset),

    // Users
    getUserProfile: (username) => API.users.getByUsername(username),
    getLeaderboard: () => API.users.getLeaderboard(),
    getRewards: () => API.users.getRewards(),
    getRewardHistory: () => API.users.getRewardHistory(),

    // Dashboard / Analytics
    getDashboardStats: () => API.analytics.getUserDashboard(),
    getUserDashboard: () => API.analytics.getUserDashboard(),
    getUserActivity: () => API.analytics.getUserActivity(),
    getUserRewardHistory: () => API.users.getRewardHistory(),

    // Safe Request
    safeRequest: (url) => API.safeRequest(url),
  };
}

// Expose safely in global scope to prevent redeclaration errors
if (typeof api === 'undefined') {
  var api = window.api;
}
