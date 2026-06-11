/* ============================================================
   ARTVOT — Main JavaScript with Real API Integration
   ============================================================ */
 
(function () {
  'use strict';

  const DEBUG_FEED = window.ARTVOT_DEBUG_FEED === true || localStorage.getItem('artvot_debug_feed') === '1';
  const feedLog = (...args) => {
    if (DEBUG_FEED) console.log(...args);
  };

  // Safe DOM element access and mutation helper functions
  window.safeSetVal = function(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  window.safeGetVal = function(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  };
  window.safeSetText = function(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  window.safeSetHtml = function(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };
  window.safeSetStyleDisplay = function(id, display) {
    const el = document.getElementById(id);
    if (el) el.style.display = display;
  };
  window.safeSetClick = function(id, callback) {
    const el = document.getElementById(id);
    if (el) el.onclick = callback;
  };

  if (typeof API !== 'undefined') {
    window.currentUser = API.getCurrentUser();
  }
 
  // ════════════════════════════════════════════════════════════
  // AUTH CHECK & REDIRECT HELPER
  // ════════════════════════════════════════════════════════════
  window.redirectToLogin = function(targetPage = null, targetOfferId = null) {
    if (!targetPage) {
      const activeSection = document.querySelector('.page-section.active');
      if (activeSection) {
        targetPage = activeSection.id;
        if (targetPage === 'page-offer-detail') {
          targetOfferId = window._offerPageCurrentId;
        }
      }
    }
    if (targetPage) {
      sessionStorage.setItem('login_redirect_page', targetPage);
      if (targetOfferId) {
        sessionStorage.setItem('login_redirect_offer_id', targetOfferId);
      }
    }
    window.location.href = 'login.html';
  };

  // Verify token is still valid and load fresh user data
  async function verifyAndLoadUser() {
    try {
      const res = await API.auth.getMe();
      if (res.success && res.data) {
        API.setCurrentUser(res.data);
        window.currentUser = res.data;
        updateUIWithUser(res.data);
        return res.data;
      }
    } catch(e) { console.warn('Token verify skipped:', e.message); }
    return API.getCurrentUser();
  }
  window.verifyAndLoadUser = verifyAndLoadUser;

  window.checkRouteAccess = function(target) {
    const user = API.getCurrentUser();
    const protectedPages = [
      'page-profile',
      'page-settings',
      'page-offer-hub',
      'page-designer-artworks',
      'page-admin-dashboard'
    ];
    if (!user) {
      if (protectedPages.includes(target)) {
        window.redirectToLogin(target);
        return false;
      }
      return true; // Let guest browse public pages
    }
    const roles = Array.isArray(user.roles) ? user.roles : (typeof user.roles === 'string' ? JSON.parse(user.roles || '[]') : []);
    const isAdmin = roles.includes('admin');
    const isClient = roles.includes('client');
    const isDesigner = roles.includes('designer');

    if (target === 'page-admin-dashboard' && !isAdmin) {
      showToast('Unauthorized access: Admin Panel is restricted to administrators.', 'error');
      return false;
    }
    if (target === 'page-designer-artworks') {
      const designsCount = parseInt(user.designs_count || 0);
      if (designsCount < 1) {
        showToast('Access Denied: You must have submitted at least one design submission to access artwork.', 'error');
        return false;
      }
    }
    return true;
  };

  window.applyUserPreferences = function(user) {
    if (!user) return;
    
    // Theme Mode
    if (user.theme) {
      document.body.classList.toggle('light-mode', user.theme === 'light');
      localStorage.setItem('artvot_theme', user.theme);
      if (typeof updateThemeIcon === 'function') updateThemeIcon();
    }
    
    // UI Preferences
    let uiPrefs = {};
    if (user.ui_preferences) {
      try {
        uiPrefs = typeof user.ui_preferences === 'string' ? JSON.parse(user.ui_preferences) : user.ui_preferences;
      } catch(e) {}
    }
    
    document.body.classList.toggle('compact-view', !!uiPrefs.compactMode);
    const animationsDisabled = uiPrefs.enableAnimations === false;
    document.body.classList.toggle('animations-disabled', animationsDisabled);
    if (animationsDisabled) {
      document.querySelectorAll('.profile-tab-panel.active').forEach(el => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      });
      document.querySelectorAll('.reveal.visible').forEach(el => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      });
    }
  };

  function updateUIWithUser(user) {
    if (!user) {
      window.currentUser = null;
      // Hide admin, designer, and offer hub nav items
      window.safeSetStyleDisplay('nav-admin-dashboard', 'none');
      window.safeSetStyleDisplay('nav-designer-artworks', 'none');
      window.safeSetStyleDisplay('nav-offer-hub', 'none');
      window.safeSetStyleDisplay('nav-business-label', 'none');
      
      // Hide wallet container
      const walletEl = document.querySelector('.sidebar-wallet');
      if (walletEl) walletEl.style.display = 'none';
      
      // Hide logout button, show login button
      window.safeSetStyleDisplay('logout-btn', 'none');
      window.safeSetStyleDisplay('sidebar-login-btn', 'flex');
      
      // Hide notification bell for guests
      const bellContainer = document.getElementById('notification-bell-container');
      if (bellContainer) bellContainer.style.display = 'none';

      // Update topbar avatar to show generic guest avatar
      const topbarAvatar = document.querySelector('.topbar-avatar');
      if (topbarAvatar) {
        const fallbackUrl = 'https://ui-avatars.com/api/?name=Guest&background=333&color=fff&size=50';
        topbarAvatar.textContent = '';
        topbarAvatar.style.backgroundImage = `url('${fallbackUrl}')`;
        topbarAvatar.style.backgroundSize = 'cover';
        topbarAvatar.style.backgroundPosition = 'center';
      }
      return;
    }
    
    window.currentUser = user;
    
    // Apply preferences in real-time
    window.applyUserPreferences(user);
    
    // Show notification bell for authenticated users
    const bellContainer = document.getElementById('notification-bell-container');
    if (bellContainer) bellContainer.style.display = 'block';

    // Show/hide login/logout buttons
    window.safeSetStyleDisplay('logout-btn', 'flex');
    window.safeSetStyleDisplay('sidebar-login-btn', 'none');

    // Show wallet container
    const walletEl = document.querySelector('.sidebar-wallet');
    if (walletEl) walletEl.style.display = 'flex';
    
    // Role-based UI isolation
    const roles = Array.isArray(user.roles) ? user.roles : (typeof user.roles === 'string' ? JSON.parse(user.roles || '[]') : []);
    const isAdmin = roles.includes('admin');
    const isClient = roles.includes('client');
    const isDesigner = roles.includes('designer');
    
    const businessLabel = document.getElementById('nav-business-label');
    const adminNav = document.getElementById('nav-admin-dashboard');
    const designerNav = document.getElementById('nav-designer-artworks');

    if (designerNav) {
      const designsCount = parseInt(user.designs_count || 0);
      if (designsCount >= 1) {
        designerNav.style.display = 'flex';
      } else {
        designerNav.style.display = 'none';
        designerNav.classList.remove('active');
        const activeSection = document.querySelector('.page-section.active');
        if (activeSection && activeSection.id === 'page-designer-artworks' && typeof window.activatePage === 'function') {
          showToast('Artwork is available after your first design submission.', 'info');
          window.activatePage('page-home');
        }
      }
    }

    if (!isAdmin) {
      if (businessLabel) businessLabel.style.display = 'none';
      if (adminNav) adminNav.style.display = 'none';
      const adminSection = document.getElementById('page-admin-dashboard');
      if (adminSection) adminSection.style.display = 'none';
    } else {
      if (businessLabel) businessLabel.style.display = 'block';
      if (adminNav) adminNav.style.display = 'flex';
    }

    // Update sidebar username/avatar
    const sidebarName = document.querySelector('.sidebar-username');
    if (sidebarName) sidebarName.textContent = '@' + (user.username || 'user');
    const sidebarFullName = document.querySelector('.sidebar-fullname');
    if (sidebarFullName) sidebarFullName.textContent = user.full_name || user.username;
    // Update wallet
    const walletAmountEl = document.querySelector('.wallet-amount');
    if (walletAmountEl) walletAmountEl.textContent = '$' + (parseFloat(user.wallet_balance || 0).toFixed(2));
    // Update profile page
    const profileName = document.querySelector('.profile-display-name');
    if (profileName) profileName.textContent = user.full_name || user.username;
    const profileHandle = document.querySelector('.profile-handle');
    if (profileHandle) profileHandle.textContent = '@' + user.username;
    
    // Update topbar avatar
    const topbarAvatar = document.querySelector('.topbar-avatar');
    if (topbarAvatar) {
      if (user.avatar_url) {
        topbarAvatar.textContent = '';
        topbarAvatar.style.backgroundImage = `url('${user.avatar_url}')`;
        topbarAvatar.style.backgroundSize = 'cover';
        topbarAvatar.style.backgroundPosition = 'center';
      } else {
        const fallbackUrl = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.username || 'User') + '&background=E8B842&color=fff&size=50';
        topbarAvatar.textContent = '';
        topbarAvatar.style.backgroundImage = `url('${fallbackUrl}')`;
        topbarAvatar.style.backgroundSize = 'cover';
        topbarAvatar.style.backgroundPosition = 'center';
      }
    }
  }
  window.updateUIWithUser = updateUIWithUser;
 
  /* ── Helpers ── */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  
  // ── Global Feed Filter State ──
  let feedStatus = 'active';
  let feedCategory = 'all';
  let feedSearch = '';
  let feedSort = 'trending';
  
  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };
  window.escapeHtml = escapeHtml;

  const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
  const VIDEO_MAX_BYTES = 20 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'];

  function isVideoMediaSrc(src) {
    if (!src) return false;
    const clean = String(src).split('?')[0].toLowerCase();
    return clean.startsWith('data:video/') ||
      clean.endsWith('.mp4') ||
      clean.endsWith('.webm') ||
      clean.includes('/video/');
  }

  function validateMediaFile(file) {
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
    if (!isImage && !isVideo) {
      return 'Unsupported file type. Allowed: JPG, JPEG, PNG, WEBP, MP4, WEBM.';
    }
    if (isImage && file.size > IMAGE_MAX_BYTES) {
      return `Image ${file.name} is too large. Max size is 10MB.`;
    }
    if (isVideo && file.size > VIDEO_MAX_BYTES) {
      return `Video ${file.name} is too large. Max size is 20MB.`;
    }
    return '';
  }

  async function uploadMediaFile(file, category) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    const res = await API.uploads.create(formData, category);
    console.log('[UPLOAD DEBUG] raw server response:', JSON.stringify(res));
    if (!res || !res.success) {
      throw new Error((res && res.message) || `Failed to upload ${file.name}`);
    }
    // Normalize — upload.php may return the URL in different shapes:
    //   { success:true, file: "uploads/submissions/x.png" }          ← string
    //   { success:true, file: { url: "uploads/submissions/x.png" } } ← object
    //   { success:true, url: "uploads/submissions/x.png" }           ← top-level
    let url = null;
    if (typeof res.url === 'string' && res.url)            url = res.url;
    else if (typeof res.file === 'string' && res.file)     url = res.file;
    else if (res.file && typeof res.file.url === 'string') url = res.file.url;
    else if (res.file && typeof res.file.path === 'string')url = res.file.path;
    console.log('[UPLOAD DEBUG] resolved URL:', url);
    if (!url || url.startsWith('data:')) {
      throw new Error(`Upload server returned invalid URL for ${file.name}. Check upload.php response.`);
    }
    return url;
  }

 
  /* ── Toast ── */
  const toastContainer = (() => {
    const el = document.createElement('div');
    el.className = 'toast-container';
    document.body.appendChild(el);
    return el;
  })();
 
  function showToast(message, type = 'info', duration = 3000) {
    const icons = { success: 'bx-check-circle', error: 'bx-error-circle', info: 'bx-info-circle' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class='bx ${icons[type]}'></i><span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 350);
    }, duration);
  }
  window.showToast = showToast;
 
  /* ── Splash Screen ── */
  function initSplash() {
    const splash = $('#splash-screen');
    const app = $('#app-content');
    if (!splash || !app) return;
 
    setTimeout(() => {
      splash.classList.add('hidden');
      app.style.display = 'flex';
      requestAnimationFrame(() => {
        app.style.opacity = '1';
        app.style.transition = 'opacity 0.5s ease';
      });
      setTimeout(() => splash.remove(), 700);
    }, 2600);
  }
 
  /* ── Theme Toggle ── */
  function initTheme() {
    const saved = localStorage.getItem('artvot_theme');
    if (saved === 'light') {
      document.body.classList.add('light-mode');
    } else if (saved === 'dark') {
      document.body.classList.remove('light-mode');
    } else {
      const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      if (prefersLight) {
        document.body.classList.add('light-mode');
      }
    }
 
    $$('.theme-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        localStorage.setItem('artvot_theme', isLight ? 'light' : 'dark');
        btn.querySelector('.toggle-label') && (btn.querySelector('.toggle-label').textContent = isLight ? 'Dark Mode' : 'Light Mode');
        updateThemeIcon();
      });
    });
    updateThemeIcon();
  }
 
  function updateThemeIcon() {
    const isLight = document.body.classList.contains('light-mode');
    $$('.theme-icon').forEach(i => {
      i.className = `bx ${isLight ? 'bx-moon' : 'bx-sun'} theme-icon`;
    });
    $$('.toggle-label').forEach(el => {
      el.textContent = isLight ? 'Dark Mode' : 'Light Mode';
    });
  }
 
  /* ── Sidebar / Mobile Menu ── */
  function initSidebar() {
    const sidebar = $('.sidebar');
    const overlay = $('.sidebar-overlay');
    const toggleBtns = $$('.mobile-toggle');
    if (!sidebar) return;
 
    function openSidebar() {
      sidebar.classList.add('open');
      overlay && overlay.classList.add('open');
    }
 
    function closeSidebar() {
      sidebar.classList.remove('open');
      overlay && overlay.classList.remove('open');
    }
 
    toggleBtns.forEach(btn => btn.addEventListener('click', () => {
      sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    }));
 
    overlay && overlay.addEventListener('click', closeSidebar);
  }
 
  /* ── SPA Navigation ── */
  function initNavigation() {
    const navItems = $$('[data-page]');
    const sections = $$('.page-section');
 
    function activatePage(target, clickedEl) {
      if (typeof window.checkRouteAccess === 'function' && !window.checkRouteAccess(target)) {
        activatePage('page-home');
        return;
      }
      sections.forEach(s => s.classList.remove('active'));
      navItems.forEach(n => n.classList.remove('active'));
 
      const targetSection = $(`#${target}`);
      if (targetSection) {
        targetSection.classList.add('active');
        // Update topbar title
        const titles = {
          'page-home':       'Trending Creates',
          'page-offers':     'Active Offers',
          'page-offer-hub':  'My Offer Hub',
          'page-profile':    'My Profile',
          'page-settings':   'Account Settings',
          'page-portfolio':  'Portfolio',
          'page-admin-dashboard':  'Admin Panel',
          'page-designer-artworks': 'My Artworks',
          'about-us-section': 'Who We Are',
          'page-offer-detail': 'Offer Details',
        };
        const topbarTitle = $('.topbar-title');
        if (topbarTitle) topbarTitle.textContent = titles[target] || '';
      }
 
      // mark nav items
      navItems.forEach(n => {
        if (n.dataset.page === target) n.classList.add('active');
      });

      if (target === 'about-us-section') {
        document.body.classList.add('about-active');
      } else {
        document.body.classList.remove('about-active');
      }

      if (target === 'page-profile' && typeof loadProfileData === 'function') loadProfileData();
      if (target === 'page-offer-hub' && typeof window.loadOfferHubPage === 'function') window.loadOfferHubPage();
      if (target === 'page-settings' && typeof window.loadSettingsData === 'function') {
        // FIX: always make sure the first settings tab panel is visible on navigate
        const firstPanel = document.getElementById('settings-tab-profile');
        const secondPanel = document.getElementById('settings-tab-preferences');
        if (firstPanel) { firstPanel.classList.add('active'); firstPanel.style.display = 'block'; }
        if (secondPanel) { secondPanel.classList.remove('active'); secondPanel.style.display = 'none'; }
        // Mark the first tab button as active
        document.querySelectorAll('[data-settings-tab]').forEach((b, i) => {
          if (i === 0) b.classList.add('active'); else b.classList.remove('active');
        });
        window.loadSettingsData();
      }
      if (target === 'page-designer-artworks' && typeof window.loadDesignerArtworks === 'function') window.loadDesignerArtworks();
      if (target === 'page-admin-dashboard' && typeof adminDashboard !== 'undefined') {
        // Re-init admin dashboard each time the admin page is activated so data is fresh
        adminDashboard.init('admin-dashboard-container');
      }

      // Clear offer page polling when navigating away
      if (target !== 'page-offer-detail') {
        if (window._offerPagePollingId) {
          clearInterval(window._offerPagePollingId);
          window._offerPagePollingId = null;
        }
        window._offerPageCurrentId = null;
        window._offerPageLoading = false; // FIX: release loading guard when leaving the page
      }
 
      // Trigger reveals
      triggerReveals();

      // For page-settings, IntersectionObserver geometry is unreliable because the
      // section transitions display:none → display:flex in the same frame.
      // Force .visible directly on all .reveal elements inside #page-settings.
      if (target === 'page-settings') {
        requestAnimationFrame(() => {
          const settingsSection = document.getElementById('page-settings');
          if (settingsSection) {
            settingsSection.querySelectorAll('.reveal').forEach(el => {
              el.classList.add('visible');
            });
          }
        });
      }

      // Close sidebar on mobile
      if (window.innerWidth <= 900) {
        $('.sidebar') && $('.sidebar').classList.remove('open');
        $('.sidebar-overlay') && $('.sidebar-overlay').classList.remove('open');
      }
 
      // Scroll to top
      $('.main-content') && ($('.main-content').scrollTop = 0);
    }
 
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        activatePage(item.dataset.page, item);
      });
    });
 
    window.activatePage = activatePage;

    // Login/Register click handler
    const sidebarLoginBtn = document.getElementById('sidebar-login-btn');
    if (sidebarLoginBtn) {
      sidebarLoginBtn.addEventListener('click', () => {
        window.redirectToLogin();
      });
    }

    // Check for deep links / redirects in URL query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const redirectPage = urlParams.get('redirect');
    const redirectOfferId = urlParams.get('offer_id');
    if (redirectPage) {
      // Clean URL query parameters so reloading doesn't loop
      window.history.replaceState({}, document.title, window.location.pathname);
      
      if (redirectPage === 'page-offer-detail' && redirectOfferId) {
        if (typeof window.viewOfferDetails === 'function') {
          window.viewOfferDetails(parseInt(redirectOfferId));
        } else {
          activatePage('page-home');
        }
      } else {
        activatePage(redirectPage);
      }
    } else {
      activatePage('page-home');
    }
  }
 
  /* ── Reveal on Scroll ── */
  function triggerReveals() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(e => {
            if (e.isIntersecting) {
              e.target.classList.add('visible');
              observer.unobserve(e.target);
            }
          });
        }, { root: null, threshold: 0, rootMargin: '0px' });

        $$('.reveal').forEach(el => observer.observe(el));
      });
    });
  }
 
  // ── Sync Filters DOM with State ──
  function syncFilterUI() {
    // 1. Status Buttons
    const activeBtn = $('#feed-filter-active');
    const expiredBtn = $('#feed-filter-expired');
    if (activeBtn && expiredBtn) {
      if (feedStatus === 'active') {
        activeBtn.classList.add('active');
        expiredBtn.classList.remove('active');
      } else {
        expiredBtn.classList.add('active');
        activeBtn.classList.remove('active');
      }
    }

    // 2. Categories
    $$('.filters .filter-btn').forEach(btn => {
      const catText = btn.textContent.trim().toLowerCase();
      const currentCat = feedCategory.toLowerCase();
      if (catText === currentCat) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 3. Search Value
    const searchInput = $('#feed-search-input');
    if (searchInput && searchInput.value !== feedSearch) {
      searchInput.value = feedSearch;
    }

    // 4. Sort Buttons
    $$('.feed-filters .feed-filter-btn').forEach(btn => {
      const sortVal = btn.getAttribute('data-filter') || 'trending';
      if (sortVal === feedSort) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  /* ── Filter Buttons ── */
  function initFilters() {
    // Guard: only attach once
    if (window._filtersInitialized) return;
    window._filtersInitialized = true;

    // 1. Category click handler
    $$('.filters').forEach(group => {
      group.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        $$('.filter-btn', group).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        feedCategory = btn.textContent.trim();
        loadArtworksFromAPI();
      });
    });

    // 2. Status click handler
    const activeBtn = $('#feed-filter-active');
    const expiredBtn = $('#feed-filter-expired');
    if (activeBtn && expiredBtn) {
      activeBtn.addEventListener('click', () => {
        feedStatus = 'active';
        activeBtn.classList.add('active');
        expiredBtn.classList.remove('active');
        loadArtworksFromAPI();
      });
      expiredBtn.addEventListener('click', () => {
        feedStatus = 'expired';
        expiredBtn.classList.add('active');
        activeBtn.classList.remove('active');
        loadArtworksFromAPI();
      });
    }

    // 3. Search keyup debounce handler
    const searchInput = $('#feed-search-input');
    if (searchInput) {
      let searchDebounce = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          feedSearch = searchInput.value;
          loadArtworksFromAPI();
        }, 300);
      });
    }

    // 4. Sort click handler
    $$('.feed-filters .feed-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.feed-filters .feed-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        feedSort = btn.getAttribute('data-filter') || 'trending';
        loadArtworksFromAPI();
      });
    });
  }
 
  /* ── Scroll Locking Helpers ── */
  window.lockBodyScroll = function() {
    document.body.classList.add('modal-open');
  };

  window.unlockBodyScroll = function() {
    setTimeout(() => {
      const openModals = $$('.modal-overlay').filter(m => 
        m.classList.contains('open') || 
        m.classList.contains('active') || 
        m.style.display === 'flex'
      );
      if (openModals.length === 0) {
        document.body.classList.remove('modal-open');
      }
    }, 50);
  };

  /* ── Modals ── */
  function initModals() {
    // Open triggers
    $$('[data-modal]').forEach(trigger => {
      trigger.addEventListener('click', (e) => {
        if (!API.isAuthenticated()) {
          const protectedModals = ['upload-modal', 'edit-offer-modal', 'submission-workspace-modal'];
          if (protectedModals.includes(trigger.dataset.modal)) {
            e.preventDefault();
            e.stopPropagation();
            window.redirectToLogin();
            return;
          }
        }
        const modal = $(`#${trigger.dataset.modal}`);
        if (modal) {
          modal.classList.add('open');
          window.lockBodyScroll();
        }
      });
    });
 
    // Close X buttons
    $$('.close-modal-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.modal-overlay').forEach(m => {
          m.classList.remove('open', 'active');
          m.style.display = 'none';
        });
        window.unlockBodyScroll();
      });
    });
 
    // Clicking overlay background closes modal
    $$('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        // Only close if the click is directly on the overlay, not on the modal-content inside
        if (e.target === overlay) {
          overlay.classList.remove('open', 'active');
          overlay.style.display = 'none';
          window.unlockBodyScroll();
        }
      });
    });
 
    // Escape key
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        $$('.modal-overlay').forEach(m => {
          m.classList.remove('open', 'active');
          m.style.display = 'none';
        });
        window.unlockBodyScroll();
      }
    });
  }
 
  
  /* ══════════════════════════════════════════════════════════
     VOTE SLIDER — initVoting()
     Handles all .vote-slider-wrap instances on the page.
     Each card gets its own isolated state (closure).
 
     UX logic:
       • Thumb starts at centre = score 5 (Neutral)
       • Drag right  → score 6-10  → green spectrum
       • Drag left   → score 1-4   → red/pink spectrum
       • Spring physics on release for a tactile snap
       • Web Audio click per tick + vibration on mobile
       • Toast fires on a perfect 10 (once per session)
       • Keyboard: ArrowLeft / ArrowRight on focused thumb
  ══════════════════════════════════════════════════════════ */
  window.getMentionTag = function(title) {
    if (!title) return '';
    const clean = title.replace(/[^\w\s]/g, '').trim().split(/\s+/).map(word => {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join('');
    return `@${clean}`;
  };

  window.offerNameCache = {};

  window.populateOfferNameCache = async function() {
    try {
      const res = await API.offers.getAll(1, 100, 'active');
      if (res && res.success && Array.isArray(res.data)) {
        res.data.forEach(offer => {
          const tag = window.getMentionTag(offer.title);
          if (tag) {
            window.offerNameCache[tag.toLowerCase()] = offer.id;
          }
        });
      }
    } catch(e) {
      console.warn("Failed to populate offer name cache:", e);
    }
  };

  window.handleMentionClick = async function(mentionText) {
    const cleanMention = mentionText.trim().toLowerCase();
    const cachedId = window.offerNameCache[cleanMention];
    if (cachedId) {
      window.viewOfferDetails(cachedId);
      return;
    }
    try {
      const searchTerm = mentionText.replace('@', '');
      const res = await API.offers.getAll(1, 5, 'active', 'all', searchTerm);
      if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
        const match = res.data.find(o => window.getMentionTag(o.title).toLowerCase() === cleanMention) || res.data[0];
        window.viewOfferDetails(match.id);
      } else {
        showToast(`Could not find offer for ${mentionText}`, 'info');
      }
    } catch(e) {
      console.warn("Failed to lookup mention tag:", e);
    }
  };

  window.formatMentions = function(text) {
    if (!text) return '';
    const escaped = escapeHtml(text);
    return escaped.replace(/@([a-zA-Z0-9]+)/g, (match) => {
      return `<span class="mention-tag" onclick="window.handleMentionClick('${match}'); event.stopPropagation();">${match}</span>`;
    });
  };

  function initVoting() {
 
    /* ── Shared Web Audio context (one per page) ── */
    let audioCtx = null;
    function playTick(freq) {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, audioCtx.currentTime + 0.07);
        gain.gain.setValueAtTime(0.07, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.09);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
      } catch (_) {}
    }
 
    /* ── Score labels & colour ramp (1-10) ── */
    const SCORE_META = [
      null, // index 0 unused
      { label: 'Terrible', r: 232, g:  42, b: 138 }, // 1 – pink-red
      { label: 'Bad',      r: 232, g:  70, b:  90 }, // 2
      { label: 'Poor',     r: 232, g: 100, b:  66 }, // 3
      { label: 'Fair',     r: 232, g: 160, b:  66 }, // 4
      { label: 'Neutral',  r: 232, g: 184, b:  66 }, // 5 – gold
      { label: 'OK',       r: 180, g: 210, b:  55 }, // 6
      { label: 'Good',     r: 120, g: 220, b:  66 }, // 7
      { label: 'Great',    r:  66, g: 220, b: 120 }, // 8
      { label: 'Excellent',r:  60, g: 232, b: 180 }, // 9
      { label: 'Perfect!', r:  60, g: 232, b: 157 }, // 10 – green
    ];
 
    function scoreColor(v) {
      if (v === null || v === undefined || isNaN(v)) {
        return {
          main: 'rgb(128,128,128)',
          glow: 'rgba(128,128,128,0.45)',
          fill: 'rgba(128,128,128,0.22)',
          label: 'Neutral',
        };
      }
      const idx = Math.max(0, Math.min(9, Math.round(v) - 1));
      const m = SCORE_META[idx] || SCORE_META[4];
      return {
        main: `rgb(${m.r},${m.g},${m.b})`,
        glow: `rgba(${m.r},${m.g},${m.b},0.45)`,
        fill: `rgba(${m.r},${m.g},${m.b},0.22)`,
        label: m.label,
      };
    }
 
    /* ── Boot each slider independently ── */
    $$('.vote-slider-wrap').forEach(wrap => {
      if (wrap.dataset.initialized) return;
      wrap.dataset.initialized = 'true';
 
      /* DOM refs scoped to this card */
      const track  = $('.vs-track',       wrap);
      const fill   = $('.vs-fill',        wrap);
      const glow   = $('.vs-glow',        wrap);
      const thumb  = $('.vs-thumb',       wrap);
      const numEl  = $('.vs-num',         wrap);
      const lblEl  = $('.vs-label',       wrap);
      const hintEl = $('.vs-hint',        wrap);
      const ticks  = $('.vs-ticks',       wrap);
      const arrowL = $('.vs-arrow-left',  wrap);
      const arrowR = $('.vs-arrow-right', wrap);
 
      if (!track || !thumb) return; // safety guard
 
      /* Build tick marks (1-10) */
      ticks.innerHTML = '';
      for (let i = 1; i <= 10; i++) {
        const t = document.createElement('span');
        t.className = 'vs-tick';
        t.textContent = i;
        ticks.appendChild(t);
      }
      /* ── Triangle click: pop animation on the tapped triangle ──
         Each triangle is a CSS clip-path shape. On click we:
         1. Stop the event so it doesn't bubble to the track
         2. Remove then re-add .vs-clicked to restart animation
         3. Auto-remove after animation ends for cleanliness     */
      $$('.vs-arrow', wrap).forEach(arrow => {
        arrow.addEventListener('click', e => {
          e.stopPropagation();
          arrow.classList.remove('vs-clicked');
          void arrow.offsetWidth; // reflow → restart animation
          arrow.classList.add('vs-clicked');
          arrow.addEventListener('animationend', () => {
            arrow.classList.remove('vs-clicked');
          }, { once: true });
        });
      });
 
      /* ── Press effect: vs-pressing class scales arrows up on click, releases on mouseup ── */
      function addPressEffect() {
        thumb.classList.add('vs-pressing');
      }
      function removePressEffect() {
        thumb.classList.remove('vs-pressing');
      }
      thumb.addEventListener('mousedown', addPressEffect);
      thumb.addEventListener('touchstart', addPressEffect, { passive: true });
      document.addEventListener('mouseup', removePressEffect);
      document.addEventListener('touchend', removePressEffect);
 
 
      /* ── Slider state ── */
      const userVoteVal = wrap.getAttribute('data-user-vote');
      const hasUserVoted = userVoteVal !== null && userVoteVal !== '';
      const initialScore = hasUserVoted ? parseInt(userVoteVal) : Math.round(parseFloat(wrap.getAttribute('data-initial-val') || 5));

      let score      = initialScore;       // current 1-10 value
      let isDragging = false;
      let firstDrag  = hasUserVoted;   // hint hides after first interaction
      let tenFired   = (initialScore === 10);   // prevent repeated toasts
      let curX       = 0;       // current thumb pixel offset
      let targX      = 0;       // spring target
      let vel        = 0;       // spring velocity
      let rafId      = null;    // animation frame handle
      let lastScore  = initialScore;       // last value for haptic/audio gating

      if (hasUserVoted) {
        wrap.classList.remove('vs-initial');
        if (hintEl) hintEl.classList.add('vs-hint--gone');
      }
 
      /* ── Geometry helpers ── */
  // Thumb width is read dynamically to ensure correct behaviour on
  // responsive layouts (mobile uses a slightly smaller thumb).
  function thumbWidth() { return thumb.getBoundingClientRect().width || 84; }
  const PAD     = 8;  // px — minimum inset from track edge
 
      function trackUsable() {
        // The px range the thumb centre can travel
        return track.getBoundingClientRect().width - thumbWidth() - PAD * 2;
      }
 
      /*
       * Map value (1..10) -> x position (0..trackUsable) and back.
       * We use a smooth quadratic mapping so that value=5 maps exactly to
       * the geometric centre of the track while keeping the mapping
       * monotonic. The mapping is intentionally non-linear so the visual
       * neutral (5) is centered, and extreme values remain reachable.
       *
       * f(t) = A*t^2 + B*t  where t = (v-1)/9 in [0,1]
       * We choose A = -0.225, B = 1.225 which satisfies:
       *  f(0) = 0, f(1) = 1, f(4/9) = 0.5  (so v=5 -> center)
       */
      const _MAP_A = -0.225;
      const _MAP_B = 1.225;
 
      function valToX(v) {
        const t = (v - 1) / 9; // normalized 0..1
        const f = _MAP_A * t * t + _MAP_B * t;
        return f * trackUsable();
      }
 
      function xToVal(px) {
        const tw = trackUsable();
        const clamped = Math.max(0, Math.min(tw, px));
        const xNorm = clamped / tw; // in [0,1]
        // Solve quadratic: _MAP_A * t^2 + _MAP_B * t - xNorm = 0
        const a = _MAP_A;
        const b = _MAP_B;
        const c = -xNorm;
        const disc = b * b - 4 * a * c;
        let t = 0;
        if (disc <= 0) {
          // Fallback to linear if something numerically goes wrong
          t = Math.max(0, Math.min(1, xNorm));
        } else {
          // Quadratic has two roots; pick the one in [0,1]
          const sqrtD = Math.sqrt(disc);
          const r1 = (-b + sqrtD) / (2 * a);
          const r2 = (-b - sqrtD) / (2 * a);
          if (r1 >= 0 && r1 <= 1) t = r1; else if (r2 >= 0 && r2 <= 1) t = r2; else t = Math.max(0, Math.min(1, r1));
        }
        return Math.round(t * 9 + 1);
      }
 
      /* ── Update direction state classes on thumb ────────────────
         Adds exactly one of: .is-center / .is-right / .is-left
         Called every time the score changes so arrow visibility
         always matches the drag direction.
         CENTER zone: score 5 (shows both triangles)
         RIGHT zone:  score > 5 (shows right triangle only)
         LEFT zone:   score < 5 (shows left triangle only)
      ─────────────────────────────────────────────────────────── */
      function updateThumbDirection(v) {
        // Remove all direction classes first (clean slate)
        thumb.classList.remove('is-center', 'is-right', 'is-left');
        if (v === 5) {
          thumb.classList.add('is-center');
        } else if (v > 5) {
          thumb.classList.add('is-right');
        } else {
          thumb.classList.add('is-left');
        }
      }
 
      /* ── Apply thumb position to DOM ── */
      function applyX(x) {
        curX = x;
        if (thumb) thumb.style.left = (PAD + x) + 'px';
  
        // Fill grows from left for positive, from right for negative
        if (score >= 5) {
          const centre = PAD + trackUsable() * 4 / 9 + thumbWidth() / 2;
          const rightEdge = PAD + x + thumbWidth();
          if (fill) {
            fill.style.left  = centre + 'px';
            fill.style.right = 'auto';
            fill.style.width = Math.max(0, rightEdge - centre) + 'px';
          }
          if (glow) {
            glow.style.left  = centre + 'px';
            glow.style.right = 'auto';
            glow.style.width = Math.max(0, rightEdge - centre + 24) + 'px';
          }
        } else {
          const centre = PAD + trackUsable() * 4 / 9 + thumbWidth() / 2;
          const leftEdge = PAD + x;
          if (fill) {
            fill.style.right = 'auto';
            fill.style.left  = leftEdge + 'px';
            fill.style.width = Math.max(0, centre - leftEdge) + 'px';
          }
          if (glow) {
            glow.style.right = 'auto';
            glow.style.left  = leftEdge - 24 + 'px';
            glow.style.width = Math.max(0, centre - leftEdge + 24) + 'px';
          }
        }
      }
  
      /* ── Apply colour theme for given score ── */
      function applyTheme(v) {
        const c = scoreColor(v);
        if (!c) return;
        if (numEl) numEl.style.color = c.main;
        if (lblEl) {
          lblEl.style.color = c.main;
          lblEl.textContent = c.label;
        }
        if (thumb) {
          thumb.style.borderColor = c.main + '70';
          thumb.style.boxShadow = `0 0 0 1px ${c.main}35, 0 4px 20px ${c.glow}, 0 0 24px ${c.main}20`;
        }
        if (fill) fill.style.background = c.fill;
        if (glow) glow.style.background = `radial-gradient(ellipse at center, ${c.glow} 0%, transparent 70%)`;

        // Arrows: active direction brightens with glow, opposite dims
        const t = (v - 1) / 9;
        const lOpacity = Math.max(0.12, (1 - t) * 1.1).toFixed(2);
        const rOpacity = Math.max(0.12, t * 1.1).toFixed(2);
        if (arrowL) {
          arrowL.style.opacity = String(lOpacity);
          arrowL.style.color = c.main;
        }
        if (arrowR) {
          arrowR.style.opacity = String(rOpacity);
          arrowR.style.color = c.main;
        }

        const lGlow = parseFloat(lOpacity) > 0.5 ? `drop-shadow(0 0 6px ${c.main})` : `drop-shadow(0 0 3px ${c.main}80)`;
        const rGlow = parseFloat(rOpacity) > 0.5 ? `drop-shadow(0 0 6px ${c.main})` : `drop-shadow(0 0 3px ${c.main}80)`;
        if (arrowL) arrowL.style.filter = lGlow;
        if (arrowR) arrowR.style.filter = rGlow;

        const leftScale = (v <= 3) ? 1.4 : 1;
        const rightScale = (v >= 8) ? 1.4 : 1;
        if (arrowL) arrowL.style.setProperty('--local-arrow-scale', String(leftScale));
        if (arrowR) arrowR.style.setProperty('--local-arrow-scale', String(rightScale));

        // Update ARIA
        if (thumb) {
          thumb.setAttribute('aria-valuenow', v);
          thumb.setAttribute('aria-valuetext', c.label);
        }

        /* Update triangle direction classes based on new score */
        if (typeof updateThumbDirection === 'function') updateThumbDirection(v);
      }
 
      /* ── Spring physics loop ── */
      function springStep() {
        const dx = targX - curX;
        vel = vel * 0.70 + dx * 0.22;
        curX += vel;
        applyX(curX);
        if (Math.abs(dx) > 0.1 || Math.abs(vel) > 0.1) {
          rafId = requestAnimationFrame(springStep);
        } else {
          curX = targX;
          applyX(curX);
          rafId = null;
        }
      }
 
      function springTo(x) {
        targX = x;
        if (!rafId) rafId = requestAnimationFrame(springStep);
      }
 
      /* ── Master score setter ── */
      function setScore(v, snapImmediate) {
        v = Math.max(1, Math.min(10, v));
        const changed = (v !== score);
        score = v;
 
        // Pop animation on number change
        if (changed && numEl) {
          numEl.textContent = v;
          numEl.classList.remove('vs-popping');
          void numEl.offsetWidth; // reflow trigger
          numEl.classList.add('vs-popping');
        }
 
        applyTheme(v);
 
        const x = valToX(v);
        if (snapImmediate) {
          // During drag: no spring, follow finger exactly
          if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
          targX = x; curX = x;
          applyX(x);
        } else {
          // On release or click: spring into place
          springTo(x);
        }
 
        // ── Side effects ──
        if (v === 10 && !tenFired) {
          tenFired = true;
          showToast('Perfect score! 🔥', 'success');
          if (navigator.vibrate) navigator.vibrate([25, 10, 25]);
          playTick(1100);
        } else if (v < 10) {
          tenFired = false;
        }
      }
 
      /* ── Touch / Mouse helpers ── */
      function clientX(e) {
        return e.touches ? e.touches[0].clientX : e.clientX;
      }
 
      /* ── Drag handlers ── */
      function onDragStart(e) {
        if (!API.isAuthenticated()) {
          window.redirectToLogin();
          return;
        }
        e.preventDefault();
        isDragging = true;
        thumb.classList.remove('vs-pressing');
        thumb.classList.add('vs-thumb--dragging');
        thumb.classList.add('vs-active');
        glow.style.opacity = '1';
 
        // Hide hint permanently after first interaction
        if (!firstDrag) {
          firstDrag = true;
          hintEl && hintEl.classList.add('vs-hint--gone');
          // Remove the 'initial' appearance once user interacts
          wrap.classList.remove('vs-initial');
        }
 
        playTick(480 + score * 30);
        if (navigator.vibrate) navigator.vibrate(6);
        onDragMove(e); // apply immediately
      }
 
      function onDragMove(e) {
        if (!isDragging) return;
        const rect = track.getBoundingClientRect();
  const rawX = clientX(e) - rect.left - PAD - thumbWidth() / 2;
        const newV = xToVal(rawX);
 
        // Audio + haptic only on value change (not every pixel)
        if (newV !== lastScore) {
          playTick(340 + newV * 30);
          if (navigator.vibrate) navigator.vibrate(4);
          lastScore = newV;
        }
 
        score = newV;
        numEl.textContent = newV;
        applyTheme(newV);
 
        const x = Math.max(0, Math.min(trackUsable(), rawX));
        targX = x; curX = x;
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        applyX(x);
      }
 
      let isSaving = false;
      let pendingVote = null;

      async function saveVote(v) {
        if (isSaving) {
          pendingVote = v;
          return;
        }
        isSaving = true;
        const offerId = wrap.getAttribute('data-offer-id');
        if (!offerId) {
          isSaving = false;
          return;
        }
        try {
          wrap.setAttribute('data-user-vote', v);
          wrap.classList.remove('vs-initial');
          if (hintEl) hintEl.classList.add('vs-hint--gone');

          // Instantly show local/optimistic update on the "Your Vote" display
          const numElLeft = wrap.querySelector('.vs-num');
          if (numElLeft) numElLeft.textContent = v;

          const res = await API.votes.vote(parseInt(offerId), v);
          if (res && res.success && res.data) {
            const total = res.data.total_votes || 0;
            const avg = parseFloat(res.data.vote_average || 5).toFixed(1);
            if (hintEl) {
              hintEl.textContent = `${total} votes · drag to vote`;
            }
            const avgEl = wrap.querySelector('.vs-avg');
            if (avgEl) {
              avgEl.textContent = avg;
            }
          }
        } catch (err) {
          console.warn('Failed to save vote:', err);
        } finally {
          isSaving = false;
          if (pendingVote !== null) {
            const nextVote = pendingVote;
            pendingVote = null;
            saveVote(nextVote);
          }
        }
      }

      function onDragEnd() {
        if (!isDragging) return;
        isDragging = false;
        thumb.classList.remove('vs-thumb--dragging');
        // Remove active visual state
        thumb.classList.remove('vs-active');
        glow.style.opacity = '0';
        // Snap to nearest integer position with spring
        springTo(valToX(score));
        // Trigger pop on release
        numEl.classList.remove('vs-popping');
        void numEl.offsetWidth;
        numEl.classList.add('vs-popping');
        
        saveVote(score);
      }
 
      /* ── Track click (jump to position) ── */
      function onTrackClick(e) {
        if (!API.isAuthenticated()) {
          window.redirectToLogin();
          return;
        }
        if (thumb.contains(e.target)) return; // let thumb handle it
        const rect  = track.getBoundingClientRect();
  const rawX  = clientX(e) - rect.left - PAD - thumbWidth() / 2;
        const newV  = xToVal(rawX);
        if (!firstDrag) {
          firstDrag = true;
          hintEl && hintEl.classList.add('vs-hint--gone');
          wrap.classList.remove('vs-initial');
        }
        playTick(340 + newV * 30);
        // provide a brief active visual when user taps the track
        thumb.classList.add('vs-active');
        setTimeout(() => thumb.classList.remove('vs-active'), 290);
        setScore(newV, false); // spring animate
        
        saveVote(newV);
      }
 
      /* ── Keyboard accessibility on thumb ── */
      thumb.addEventListener('keydown', e => {
        if (!API.isAuthenticated()) {
          window.redirectToLogin();
          return;
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (!firstDrag) { firstDrag = true; hintEl && hintEl.classList.add('vs-hint--gone'); wrap.classList.remove('vs-initial'); }
          const targetScore = Math.min(10, score + 1);
          setScore(targetScore, false);
          saveVote(targetScore);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          if (!firstDrag) { firstDrag = true; hintEl && hintEl.classList.add('vs-hint--gone'); wrap.classList.remove('vs-initial'); }
          const targetScore = Math.max(1, score - 1);
          setScore(targetScore, false);
          saveVote(targetScore);
        }
      });
 
      /* ── Event bindings ── */
      // Mouse
      thumb.addEventListener('mousedown',  onDragStart);
      track.addEventListener('mousedown',  onTrackClick);
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup',   onDragEnd);
 
      // Touch
      thumb.addEventListener('touchstart', onDragStart, { passive: false });
      track.addEventListener('touchstart', e => {
        if (thumb.contains(e.target)) return;
        e.preventDefault();
        onTrackClick(e.touches[0]);
      }, { passive: false });
      document.addEventListener('touchmove', onDragMove, { passive: false });
      document.addEventListener('touchend',  onDragEnd);
 
      /* ── Initialise position & handle responsive resize ── */
      const ro = new ResizeObserver(() => {
        if (!isDragging) {
          const tw = trackUsable();
          if (tw > 0) {
            const x = valToX(score);
            targX = x; curX = x;
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            applyX(x);
          }
        }
      });
      ro.observe(track);
 
      // Set initial visuals
      applyTheme(score); // also calls updateThumbDirection(5) → adds .is-center
      if (numEl) numEl.textContent = score;
      if (glow) glow.style.opacity = '0';
 
    }); // end forEach .vote-slider-wrap
  } // end initVoting
  
  /* ── Comments ── */
  async function loadCommentsForOffer(offerId, section) {
    const list = $('.comments-list', section);
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-secondary);"><i class="bx bx-loader-alt bx-spin"></i> Loading comments...</div>';
    
    try {
      const response = await API.comments.getOfferComments(offerId);
      if (response && response.success && Array.isArray(response.data)) {
        if (response.data.length === 0) {
          list.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.8rem;">No comments yet. Be the first to comment!</div>';
          return;
        }
        
        list.innerHTML = response.data.map(comment => {
          const uname = comment.username || 'user';
          const avatar = comment.avatar_url 
            ? `<div class="user-avatar" style="background-image:url('${comment.avatar_url}');background-size:cover;background-position:center;width:24px;height:24px;border-radius:50%;flex-shrink:0;"></div>`
            : `<div class="user-avatar" style="background:linear-gradient(135deg,#E11D48,#D4AF37);width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:bold;color:#fff;flex-shrink:0;">${uname.charAt(0).toUpperCase()}</div>`;
          return `
            <div class="comment-item" style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;">
              ${avatar}
              <div style="flex:1;">
                <span style="font-weight:bold;font-size:0.85rem;color:var(--text-primary);">@${uname}</span>
                <p style="font-size:0.8rem;color:var(--text-secondary);margin:2px 0 0 0;word-break:break-word;">${window.formatMentions(comment.comment_text)}</p>
              </div>
            </div>
          `;
        }).join('');
        list.scrollTop = list.scrollHeight;
      } else {
        list.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-secondary);">Failed to load comments</div>';
      }
    } catch (e) {
      console.error('Failed to load comments:', e);
      list.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-secondary);">Error loading comments</div>';
    }
  }

  function initComments() {
    $$('.toggle-comments-btn').forEach(btn => {
      if (btn.dataset.initialized) return;
      btn.dataset.initialized = 'true';
      
      btn.addEventListener('click', async () => {
        const card = btn.closest('.post-card');
        const section = $('.comments-section', card);
        if (!section) return;
        const offerId = section.getAttribute('data-offer-id');
        const isOpen = section.style.display !== 'none';
        
        if (isOpen) {
          section.style.display = 'none';
        } else {
          section.style.display = 'block';
          await loadCommentsForOffer(offerId, section);
        }
      });
    });

    $$('.post-comment-btn').forEach(btn => {
      if (btn.dataset.initialized) return;
      btn.dataset.initialized = 'true';
      
      btn.addEventListener('click', async () => {
        const section = btn.closest('.comments-section');
        const input = $('.comment-input', section);
        if (!input || !input.value.trim()) return;
        
        if (!API.isAuthenticated()) {
          window.redirectToLogin();
          return;
        }
        
        const offerId = section.getAttribute('data-offer-id');
        const commentText = input.value.trim();
        
        btn.disabled = true;
        btn.textContent = 'Posting...';
        
        try {
          const res = await API.comments.create(offerId, commentText);
          if (res && res.success) {
            input.value = '';
            showToast('Comment posted successfully!', 'success');
            await loadCommentsForOffer(offerId, section);
          } else {
            showToast(res.message || 'Failed to post comment', 'error');
          }
        } catch (e) {
          console.error('Error posting comment:', e);
          showToast('Error posting comment', 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = 'Post';
        }
      });
    });
 
    // Enter key to post
    $$('.comment-input').forEach(input => {
      if (input.dataset.initialized) return;
      input.dataset.initialized = 'true';
      
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const section = input.closest('.comments-section');
          const postBtn = $('.post-comment-btn', section);
          if (postBtn) postBtn.click();
        }
      });
    });
  }
 
  /* ── Upload / Image Preview ── */
  function initUpload() {
    $$('.upload-area').forEach(area => {
      // #image-upload-area is fully managed by initSubmitPost() with its own
      // file input (#offer-image-file), preview logic, and click handler.
      // Attaching a second unconditional click→hiddenInput.click() here was
      // the root cause of the double file-picker bug: both listeners fired on
      // every click, queuing two picker opens. Skip it entirely.
      // #ws-upload-area is fully managed by the DOMContentLoaded block below
      // (ws-file-input handler + uploadMediaFile). Skipping here prevents
      // a second readAsDataURL-based handler from attaching to the workspace
      // upload area, which would race against the URL-only upload flow.
      if (area.id === 'image-upload-area') return;
      if (area.id === 'ws-upload-area') return;

      const hiddenInput = document.createElement('input');
      hiddenInput.type = 'file';
      hiddenInput.accept = 'image/*';
      hiddenInput.style.display = 'none';
      area.appendChild(hiddenInput);
 
      area.addEventListener('click', () => hiddenInput.click());
 
      hiddenInput.addEventListener('change', () => {
        const file = hiddenInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          if (!e || !e.target || !e.target.result) return;
          if (!area || !document.body.contains(area)) {
            console.warn('Upload area element was removed from DOM.');
            return;
          }
          let preview = area.querySelector('.upload-preview');
          if (!preview) {
            preview = document.createElement('img');
            preview.className = 'upload-preview';
            area.appendChild(preview);
          }
          if (preview) {
            preview.src = e.target.result;
          }
          area.classList.add('has-image');
          const icon = area.querySelector('i');
          if (icon) icon.style.display = 'none';
          const text = area.querySelector('p');
          if (text) text.style.display = 'none';
          showToast('Image loaded!', 'success');
        };
        reader.readAsDataURL(file);
      });
 
      // Drag & drop
      area.addEventListener('dragover', (e) => { e.preventDefault(); area.style.borderColor = 'var(--gold)'; });
      area.addEventListener('dragleave', () => area.style.borderColor = '');
      area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.style.borderColor = '';
        hiddenInput.files = e.dataTransfer.files;
        hiddenInput.dispatchEvent(new Event('change'));
      });
    });
  }
 
  /* ── Submit Post (Offer) ── Improved with Validation & Image Preview ── */
  function initSubmitPost() {
    const form = $('#create-offer-form');
    const btn = $('#submit-post-btn');
    const uploadArea = $('#image-upload-area');
    const fileInput = $('#offer-image-file');
    const cancelBtn = $('#cancel-upload-btn');

    if (!form || !btn) return;

    // Media upload handling
    if (uploadArea && fileInput) {
      window.offerSelectedFiles = [];
      window.offerSelectedFileMetadata = [];

      const renderOfferMediaPreviews = () => {
        const grid = document.getElementById('offer-media-previews-grid');
        const placeholder = document.getElementById('upload-placeholder');
        if (!grid) return;
        grid.innerHTML = '';
        
        if (!window.offerSelectedFiles) window.offerSelectedFiles = [];
        if (!window.offerSelectedFileMetadata) window.offerSelectedFileMetadata = [];

        if (window.offerSelectedFiles.length === 0) {
          if (placeholder) placeholder.style.display = 'block';
          return;
        }
        
        if (placeholder) placeholder.style.display = 'none';

        window.offerSelectedFiles.forEach((fileData, index) => {
          const item = document.createElement('div');
          item.style.position = 'relative';
          item.style.width = '80px';
          item.style.height = '80px';
          item.style.borderRadius = '8px';
          item.style.overflow = 'hidden';
          item.style.border = '1px solid var(--border)';
          item.style.background = 'var(--surface-3)';

          let mediaTag = '';
          if (isVideoMediaSrc(fileData)) {
            mediaTag = `<video src="${fileData}" style="width:100%; height:100%; object-fit:cover;"></video>`;
          } else {
            mediaTag = `<img src="${fileData || ''}" style="width:100%; height:100%; object-fit:cover;">`;
          }

          item.innerHTML = `
            ${mediaTag}
            <button type="button" style="position:absolute; top:4px; right:4px; width:18px; height:18px; border-radius:50%; background:rgba(0,0,0,0.6); color:#fff; border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:10px; z-index:5;" onclick="event.preventDefault(); event.stopPropagation(); window.offerSelectedFiles.splice(${index}, 1); if (window.offerSelectedFileMetadata) window.offerSelectedFileMetadata.splice(${index}, 1); window.renderOfferMediaPreviews();">
              <i class="bx bx-x"></i>
            </button>
          `;
          grid.appendChild(item);
        });
      };
      window.renderOfferMediaPreviews = renderOfferMediaPreviews;

      const processFiles = async (files) => {
        window.offerSelectedFileMetadata = window.offerSelectedFileMetadata || [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const validationError = validateMediaFile(file);
          if (validationError) {
            showToast(validationError, 'error');
            continue;
          }

          const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
          if (window.offerSelectedFileMetadata.includes(fileKey)) {
            showToast(`File "${file.name}" is already selected.`, 'warning');
            continue;
          }

          try {
            const modal = document.getElementById('upload-modal');
            if (modal && !modal.classList.contains('open') && !modal.classList.contains('active')) {
              console.warn('Upload modal is closed, ignoring loaded file.');
              return;
            }
            showToast(`Uploading ${file.name}...`, 'info', 1600);
            const uploadedUrl = await uploadMediaFile(file, 'offers');
            if (!window.offerSelectedFiles) window.offerSelectedFiles = [];
            window.offerSelectedFiles.push(uploadedUrl);
            window.offerSelectedFileMetadata.push(fileKey);
            window.renderOfferMediaPreviews();
          } catch (err) {
            showToast(err.message || `Failed to upload ${file.name}`, 'error');
          }
        }
      };

      uploadArea.addEventListener('click', (e) => {
        if (e.target === fileInput) return;
        fileInput.click();
      });

      fileInput.addEventListener('change', async (e) => {
        if (e.target.files.length) {
          await processFiles(e.target.files);
          fileInput.value = '';
        }
      });

      // Drag & drop
      uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--gold)';
        uploadArea.style.background = 'rgba(212, 175, 55, 0.05)';
      });
      uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '';
        uploadArea.style.background = '';
      });
      uploadArea.addEventListener('drop', async (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '';
        uploadArea.style.background = '';
        if (e.dataTransfer.files.length) {
          await processFiles(e.dataTransfer.files);
        }
      });
    }

    // AI Description Generator trigger logic
    const postTitle = $('#post-title');
    const postDesc = $('#post-desc');
    const aiBadge = $('#ws-ai-badge');
    
    if (postTitle && postDesc && aiBadge) {
      let aiTimeout = null;
      let lastGeneratedTitle = "";

      const triggerAIGeneration = async () => {
        const titleVal = postTitle.value.trim();
        if (titleVal.length < 5 || titleVal === lastGeneratedTitle) return;
        
        lastGeneratedTitle = titleVal;
        aiBadge.style.display = 'inline-flex';
        aiBadge.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> AI Generating...`;
        
        try {
          const res = await fetch('/again/api/ai/generate-description', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${API.getToken()}`
            },
            body: JSON.stringify({ title: titleVal, category: ($('#offer-category') ? $('#offer-category').value : '') })
          });
          const json = await res.json();
          if (json.success && json.data && json.data.description) {
            const description = json.data.description;
            
            // Streaming/typing animation effect
            postDesc.value = "";
            let idx = 0;
            const typeText = () => {
              if (idx < description.length) {
                postDesc.value += description.charAt(idx);
                idx++;
                postDesc.scrollTop = postDesc.scrollHeight;
                setTimeout(typeText, 15);
              } else {
                aiBadge.innerHTML = `✨ AI Generated`;
              }
            };
            typeText();
          } else {
            aiBadge.style.display = 'none';
          }
        } catch (err) {
          console.error("AI Generation failed:", err);
          // Fallback AI description
          const fallbackDesc = `A creative design competition for ${titleVal}. Designers are invited to submit their best work.`;
          postDesc.value = '';
          let fi = 0;
          const typeFallback = () => {
            if (fi < fallbackDesc.length) {
              postDesc.value += fallbackDesc.charAt(fi);
              fi++;
              setTimeout(typeFallback, 15);
            } else {
              aiBadge.innerHTML = `✨ AI Generated`;
            }
          };
          aiBadge.style.display = 'inline-flex';
          aiBadge.innerHTML = `✨ AI Generated`;
          typeFallback();
        }
      };

      postTitle.addEventListener('blur', triggerAIGeneration);
      postTitle.addEventListener('input', () => {
        if (aiTimeout) clearTimeout(aiTimeout);
        aiTimeout = setTimeout(triggerAIGeneration, 1000);
      });

      // Clear badge if the user manually overrides/types in the description box
      postDesc.addEventListener('input', () => {
        aiBadge.style.display = 'none';
      });
    }

    // Form submission
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Clear previous errors
      $$('.validation-error').forEach(el => el.style.display = 'none');

      // Validation
      const title = $('#post-title');
      const desc = $('#post-desc');
      const budget = $('#offer-budget');
      const deadline = $('#offer-deadline');

      let hasError = false;

      if (!title || !title.value.trim()) {
        const err = $('#title-error');
        if (err) { err.textContent = 'Title is required'; err.style.display = 'block'; }
        hasError = true;
      }

      if (!desc || !desc.value.trim()) {
        const err = $('#desc-error');
        if (err) { err.textContent = 'Description is required'; err.style.display = 'block'; }
        hasError = true;
      } else if (desc.value.trim().length < 20) {
        const err = $('#desc-error');
        if (err) { err.textContent = 'Description must be at least 20 characters'; err.style.display = 'block'; }
        hasError = true;
      }

      // Category validation
      const category = $('#offer-category');
      if (!category || !category.value) {
        const err = $('#category-error');
        if (err) { err.textContent = 'Please select a category'; err.style.display = 'block'; }
        hasError = true;
      }

      if (!budget || !budget.value || parseFloat(budget.value) <= 0) {
        const err = $('#budget-error');
        if (err) { err.textContent = 'Budget must be greater than 0'; err.style.display = 'block'; }
        hasError = true;
      }

      if (!deadline || !deadline.value) {
        const err = $('#deadline-error');
        if (err) { err.textContent = 'Deadline is required'; err.style.display = 'block'; }
        hasError = true;
      } else {
        const deadlineDate = new Date(deadline.value);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (deadlineDate < today) {
          const err = $('#deadline-error');
          if (err) { err.textContent = 'Deadline cannot be in the past'; err.style.display = 'block'; }
          hasError = true;
        }
      }

      if (hasError) return;

      btn.disabled = true;
      btn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Publishing...';

      try {
        let reference_images = null;
        if (window.offerSelectedFiles && window.offerSelectedFiles.length > 0) {
          const safeOfferUrls = window.offerSelectedFiles.filter(
            v => v && typeof v === 'string' && !v.startsWith('data:')
          );
          if (safeOfferUrls.length > 0) reference_images = JSON.stringify(safeOfferUrls);
        }

        // 2. Create offer
        const categoryVal = ($('#offer-category') ? $('#offer-category').value : '');
        const response = await API.offers.create({
          title: title.value.trim(),
          description: desc.value.trim(),
          budget: parseFloat(budget.value),
          deadline: deadline.value,
          package_type: 'basic',
          tags: categoryVal,
          reference_images: reference_images
        });

        if (response.success) {
          // Reset form
          form.reset();
          window.offerSelectedFiles = [];
          window.offerSelectedFileMetadata = [];
          window.renderOfferMediaPreviews();
          
          $$('.modal-overlay').forEach(m => m.classList.remove('open', 'active'));
          showToast('Offer launched! Designers can now find it. 🚀', 'success');
          
          // Reload offers feed + hub
          if (typeof loadOffersFromAPI === 'function') loadOffersFromAPI();
          if (typeof loadOfferHub === 'function') loadOfferHub();
          
          // Navigate to the new offer page
          const newOfferId = response.data && response.data.id ? response.data.id : (response.offer_id || null);
          if (newOfferId && typeof window.loadOfferPage === 'function') {
            window.loadOfferPage(newOfferId);
          }
        } else {
          showToast(response.message || 'Failed to publish offer', 'error');
        }
      } catch(e) {
        console.error('Offer creation error:', e);
        showToast('Network error. Please try again.', 'error');
      }

      btn.disabled = false;
      btn.innerHTML = '<i class="bx bx-rocket"></i> Launch Offer 🚀';
    });

    // Cancel button
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        form.reset();
        window.offerSelectedFiles = [];
        window.offerSelectedFileMetadata = [];
        window.renderOfferMediaPreviews();
        if (uploadArea) {
          uploadArea.style.borderColor = '';
          uploadArea.style.background = '';
        }
        $$('.validation-error').forEach(el => el.style.display = 'none');
        $$('.modal-overlay').forEach(m => m.classList.remove('open', 'active'));
      });
    }
  }
  /* ── Settings Form ── */
  /* ── Settings Form ── */
  function showSettingsStatus(message, type = 'loading') {
    const status = document.getElementById('settings-status');
    if (!status) return;
    status.className = `settings-status ${type}`;
    status.innerHTML = type === 'loading'
      ? `<i class='bx bx-loader-alt bx-spin'></i> ${escapeHtml(message)}`
      : escapeHtml(message);
    status.style.display = 'block';
  }

  function clearSettingsStatus(delay = 0) {
    const status = document.getElementById('settings-status');
    if (!status) return;
    const hide = () => {
      status.style.display = 'none';
      status.className = 'settings-status';
      status.textContent = '';
    };
    if (delay > 0) setTimeout(hide, delay);
    else hide();
  }

  function populateSettingsForm(user) {
    if (!user) return;
    const usernameEl = document.getElementById('settings-username');
    const emailEl = document.getElementById('settings-email');
    const bioEl = document.getElementById('settings-bio');
    const payoutEl = document.getElementById('settings-payout-method');
    const walletEl = document.getElementById('settings-wallet-address');
    const fullNameEl = document.getElementById('settings-full-name');
    const previewEl = document.getElementById('settings-avatar-preview');
    const iconEl = document.getElementById('settings-avatar-icon');

    if (usernameEl) usernameEl.value = user.username || '';
    if (emailEl) emailEl.value = user.email || '';
    if (bioEl) bioEl.value = user.bio || '';
    if (payoutEl) payoutEl.value = user.payout_method || 'crypto';
    if (walletEl) walletEl.value = user.wallet_address || '';
    if (fullNameEl) fullNameEl.value = user.full_name || '';

    if (previewEl) {
      if (user.avatar_url) {
        previewEl.style.backgroundImage = `url('${user.avatar_url}')`;
        previewEl.style.backgroundSize = 'cover';
        previewEl.style.backgroundPosition = 'center';
        if (iconEl) iconEl.style.display = 'none';
      } else {
        previewEl.style.backgroundImage = '';
        if (iconEl) iconEl.style.display = 'block';
      }
    }

    // Populate Preferences
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) themeSelect.value = user.theme || 'dark';

    const languageSelect = document.getElementById('language-select');
    if (languageSelect) languageSelect.value = user.language || 'en';

    let uiPrefs = {};
    if (user.ui_preferences) {
      try {
        uiPrefs = typeof user.ui_preferences === 'string' ? JSON.parse(user.ui_preferences) : user.ui_preferences;
      } catch(e) {}
    }
    const compactModeEl = document.getElementById('pref-compact-mode');
    const enableAnimationsEl = document.getElementById('pref-enable-animations');
    if (compactModeEl) compactModeEl.checked = !!uiPrefs.compactMode;
    if (enableAnimationsEl) enableAnimationsEl.checked = uiPrefs.enableAnimations !== false;
  }

  window.loadSettingsData = async function() {
    const cachedUser = API.getCurrentUser();
    populateSettingsForm(cachedUser);

    try {
      showSettingsStatus('Loading account details...', 'loading');
      const res = await API.auth.getMe();
      if (res && res.success && res.data) {
        API.setCurrentUser(res.data);
        window.currentUser = res.data;
        if (typeof window.updateUIWithUser === 'function') window.updateUIWithUser(res.data);
        populateSettingsForm(res.data);
        clearSettingsStatus();
        // FIX: always restore settings-tab-profile panel visibility after data load,
        // because initProfileTabs (scoped to #page-profile) no longer touches these,
        // but a second loadSettingsData call can re-trigger the settings tab switcher.
        const activeSettingsTab = document.querySelector('[data-settings-tab].active');
        const activeTabId = activeSettingsTab ? activeSettingsTab.dataset.settingsTab : 'settings-tab-profile';
        document.querySelectorAll('#page-settings .profile-tab-panel').forEach(panel => {
          if (panel.id === activeTabId) {
            panel.classList.add('active');
            panel.style.display = 'block';
          } else {
            panel.classList.remove('active');
            panel.style.display = 'none';
          }
        });
      } else {
        showSettingsStatus(res?.message || 'Unable to load account details.', 'error');
      }
    } catch (err) {
      showSettingsStatus('Unable to load account details. Please check your connection.', 'error');
    }
  };

  function initSettings() {
    const form = $('#settings-profile-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Saving...';
        }

        const username = document.getElementById('settings-username')?.value.trim() || '';
        const email = document.getElementById('settings-email')?.value.trim() || '';
        const bio = document.getElementById('settings-bio')?.value.trim() || '';
        const payout_method = document.getElementById('settings-payout-method')?.value || 'crypto';
        const wallet_address = document.getElementById('settings-wallet-address')?.value.trim() || '';
        const full_name = document.getElementById('settings-full-name')?.value.trim() || '';
        const avatarInput = document.getElementById('settings-profile-avatar-input');

        if (!username || username.length < 3) {
          showSettingsStatus('Username must be at least 3 characters.', 'error');
          showToast('Username must be at least 3 characters.', 'error');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bx bx-save"></i> Save Profile';
          }
          return;
        }

        if (!email || !email.includes('@')) {
          showSettingsStatus('Please enter a valid email address.', 'error');
          showToast('Please enter a valid email address.', 'error');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bx bx-save"></i> Save Profile';
          }
          return;
        }

        showSettingsStatus('Saving profile changes...', 'loading');

        const formData = new FormData();
        if (username) formData.append('username', username);
        if (email) formData.append('email', email);
        formData.append('bio', bio);
        formData.append('payout_method', payout_method);
        formData.append('wallet_address', wallet_address);
        formData.append('full_name', full_name);

        if (avatarInput && avatarInput.files && avatarInput.files[0]) {
          formData.append('avatar', avatarInput.files[0]);
        }

        try {
          const res = await fetch('/again/api/user/profile', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + API.getToken() },
            body: formData
          });
          const data = await res.json();
          if (res.ok && data.success) {
            const updatedUser = data.data || {};
            API.setCurrentUser(updatedUser);
            window.currentUser = updatedUser;
            if (typeof window.updateUIWithUser === 'function') window.updateUIWithUser(updatedUser);
            populateSettingsForm(updatedUser);
            if (avatarInput) avatarInput.value = '';
            showSettingsStatus('Profile saved successfully.', 'success');
            showToast('Settings saved successfully!', 'success');
            if (typeof loadProfileData === 'function') loadProfileData();
            clearSettingsStatus(3500);
          } else {
            showSettingsStatus(data.message || 'Failed to save settings.', 'error');
            showToast(data.message || 'Failed to save settings', 'error');
          }
        } catch (err) {
          showSettingsStatus('Network error while saving settings.', 'error');
          showToast('Network error while saving settings.', 'error');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bx bx-save"></i> Save Profile';
          }
        }
      });
    }

    // Avatar preview change on select
    const avatarInput = document.getElementById('settings-profile-avatar-input');
    if (avatarInput) {
      avatarInput.addEventListener('change', () => {
        if (avatarInput.files && avatarInput.files[0]) {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (!e || !e.target || !e.target.result) return;
            const preview = document.getElementById('settings-avatar-preview');
            const icon = document.getElementById('settings-avatar-icon');
            if (preview && document.body.contains(preview)) {
              preview.style.backgroundImage = `url('${e.target.result}')`;
              preview.style.backgroundSize = 'cover';
              preview.style.backgroundPosition = 'center';
            }
            if (icon && document.body.contains(icon)) {
              icon.style.display = 'none';
            }
          };
          reader.readAsDataURL(avatarInput.files[0]);
        }
      });
    }

    // Settings tab listeners
    const settingsTabBtns = document.querySelectorAll('[data-settings-tab]');
    settingsTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        settingsTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const targetTabId = btn.dataset.settingsTab;
        const tabPanels = document.querySelectorAll('#page-settings .profile-tab-panel');
        tabPanels.forEach(panel => {
          if (panel.id === targetTabId) {
            panel.classList.add('active');
            panel.style.display = 'block';
          } else {
            panel.classList.remove('active');
            panel.style.display = 'none';
          }
        });
      });
    });

    // Theme select preview
    const themeSelect = $('#theme-select');
    if (themeSelect) {
      themeSelect.addEventListener('change', () => {
        document.body.classList.toggle('light-mode', themeSelect.value === 'light');
        if (typeof updateThemeIcon === 'function') updateThemeIcon();
      });
    }

    // Save preferences form
    const prefForm = $('#settings-preferences-form');
    if (prefForm) {
      prefForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = prefForm.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Saving...';
        }

        const theme = document.getElementById('theme-select')?.value || 'dark';
        const language = document.getElementById('language-select')?.value || 'en';
        const compactMode = !!document.getElementById('pref-compact-mode')?.checked;
        const enableAnimations = !!document.getElementById('pref-enable-animations')?.checked;
        
        const ui_preferences = JSON.stringify({ compactMode, enableAnimations });

        try {
          const res = await fetch('/again/api/user/profile', {
            method: 'POST',
            headers: { 
              'Authorization': 'Bearer ' + API.getToken(),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ theme, language, ui_preferences })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            showToast('Preferences saved successfully!', 'success');
            let user = API.getCurrentUser();
            user.theme = theme;
            user.language = language;
            user.ui_preferences = ui_preferences;
            localStorage.setItem('artvot_user', JSON.stringify(user));
            
            // Apply theme and ui changes immediately
            document.body.classList.toggle('light-mode', theme === 'light');
            localStorage.setItem('artvot_theme', theme);
            if (typeof updateThemeIcon === 'function') updateThemeIcon();

            // Apply Compact mode
            document.body.classList.toggle('compact-view', compactMode);
            // Apply Animations mode
            document.body.classList.toggle('animations-disabled', !enableAnimations);

            if (typeof loadSettingsData === 'function') loadSettingsData();
          } else {
            showToast(data.message || 'Failed to save preferences', 'error');
          }
        } catch (err) {
          showToast('Network error while saving preferences.', 'error');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bx bx-save"></i> Save Preferences';
          }
        }
      });
    }
  }
 
  /* ── Video Vote Tracks ── */
  function initVideoVotes() {
    $$('.vote-track').forEach(track => {
      const fill = $('.vote-fill', track);
      if (!fill) return;
      fill.style.height = '60%';
 
      track.addEventListener('click', (e) => {
        const rect = track.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
        fill.style.height = (pct * 100) + '%';
        showToast(`Voted ${Math.round(pct * 10)}/10`, 'success');
      });
    });
  }
 
  /* ── Login Page ── */
  function initLogin() {
    // Toggle password visibility
    $$('.toggle-pw').forEach(icon => {
      icon.addEventListener('click', () => {
        const input = icon.closest('.input-icon-wrap').querySelector('input');
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        icon.className = `bx ${isPassword ? 'bx-hide' : 'bx-show'} toggle-pw`;
      });
    });
 
    // Login form submit
    const loginBtn = $('#login-submit-btn');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        const email = $('#login-email');
        const pass  = $('#login-password');
        if (!email || !email.value.includes('@')) { showToast('Enter a valid email', 'error'); return; }
        if (!pass || pass.value.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
        loginBtn.textContent = 'Signing in…';
        loginBtn.disabled = true;
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 1200);
      });
    }
 
    // Social buttons placeholder
    $$('.social-btn').forEach(btn => {
      btn.addEventListener('click', () => showToast('Social login coming soon!', 'info'));
    });
 
    // Show/hide login forms
    const toggleToRegister = $('#toggle-to-register');
    const toggleToLogin    = $('#toggle-to-login');
    const loginForm        = $('#login-form-section');
    const registerForm     = $('#register-form-section');
 
    if (toggleToRegister) {
      toggleToRegister.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm && (loginForm.style.display = 'none');
        registerForm && (registerForm.style.display = 'block');
      });
    }
    if (toggleToLogin) {
      toggleToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm && (registerForm.style.display = 'none');
        loginForm && (loginForm.style.display = 'block');
      });
    }
  }
 

 
  /* ── Profile Tab Switcher ── */
  function initProfileTabs() {
    // FIX: scope to #page-profile only — prevents cross-contamination with settings panels
    const profilePage = document.getElementById('page-profile');
    const tabBtns = profilePage ? [...profilePage.querySelectorAll('.profile-tab-btn')] : [];
    const tabPanels = profilePage ? [...profilePage.querySelectorAll('.profile-tab-panel')] : [];
    if (!tabBtns.length) return;
 
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
 
        // Update button states — only within profile page
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
 
        // Update panel visibility — only profile page panels
        tabPanels.forEach(panel => {
          if (panel.classList.contains('nested-tab-panel')) return;
          if (panel.id === target) {
            panel.classList.add('active');
          } else {
            panel.classList.remove('active');
          }
        });
      });
    });

    // ── Nested Tab Switcher (My Campaigns / Accepted Work) ──
    const nestedBtns = $$('.nested-tab-btn');
    nestedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.nestedTab;
        // Update nested button styles
        nestedBtns.forEach(b => {
          b.classList.remove('active');
          b.style.color = 'var(--text-secondary)';
          b.style.borderBottom = '2px solid transparent';
        });
        btn.classList.add('active');
        btn.style.color = 'var(--text)';
        btn.style.borderBottom = '2px solid var(--gold)';
        // Toggle nested panels
        const nestedPanels = $$('.nested-tab-panel');
        nestedPanels.forEach(panel => {
          if (panel.id === target) {
            panel.style.display = '';
            panel.classList.add('active');
          } else {
            panel.style.display = 'none';
            panel.classList.remove('active');
          }
        });
      });
    });
  }
 
  /* ══════════════════════════════════════════════════════════
     REAL API DATA LOADING (No Mock Data)
  ══════════════════════════════════════════════════════════ */

  async function loadArtworksFromAPI() {
    const grid = $('#artwork-feed');
    if (!grid) return;

    // ── Lock: prevent concurrent renders ──
    if (window._artworksLoading) { feedLog('[Feed] Skipped – already loading'); return; }
    window._artworksLoading = true;

    feedLog('[Feed] loadArtworksFromAPI START');

    grid.innerHTML = '<div class="loading-skeleton" style="text-align:center;padding:40px;color:var(--text-secondary);"><i class="bx bx-loader-alt bx-spin" style="font-size:2rem;"></i><p>Loading feed...</p></div>';

    syncFilterUI();

    try {
      const userVotesMap = {};
      if (API.isAuthenticated()) {
        try {
          const votesRes = await API.votes.getUserVotes();
          if (votesRes && votesRes.success && Array.isArray(votesRes.data)) {
            votesRes.data.forEach(v => { userVotesMap[v.offer_id] = v.score; });
          }
        } catch (e) { console.warn('[Feed] Failed to fetch user votes:', e); }
      }

      // Fetch with high limit to get ALL posts
      const response = await API.offers.getAll(1, 100, feedStatus, feedCategory, feedSearch, feedSort);
      const allData = (response && response.success && Array.isArray(response.data)) ? response.data : [];

      feedLog(`[Feed] API returned ${allData.length} total items`);

      // Home = ONLY designer submissions (contain "Submitted for Offer #")
      const data = allData.filter(o => o.description && o.description.includes('Submitted for Offer #'));

      feedLog(`[Feed] After filter: ${data.length} submissions to render`);

      grid.innerHTML = '';

      if (data.length === 0) {
        grid.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-secondary);grid-column:1/-1;"><i class="bx bx-palette" style="font-size:3rem;opacity:0.3;"></i><p style="margin-top:12px;font-size:1.1rem;">No designs submitted yet</p><p style="font-size:0.85rem;">Be the first to submit a design!</p></div>';
        window._artworksLoading = false;
        return;
      }

      // Track rendered IDs to prevent duplicates
      const renderedIds = new Set();

      data.forEach((offer, index) => {
        if (renderedIds.has(offer.id)) return;
        renderedIds.add(offer.id);

        const card = document.createElement('article');
        card.className = `post-card glass reveal ${index > 0 ? `delay-${Math.min(index - 1, 2)}` : ''}`;
        card.setAttribute('data-offer-id', offer.id);

        const timeAgo = getTimeAgo(offer.created_at);
        const uname = offer.username || offer.user?.username || 'artist';

        const mediaHtml = renderPostMedia(offer.reference_images, offer.id);

        const offerBadge = `<div style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.12);border-radius:8px;margin-bottom:8px;font-size:0.78rem;"><i class='bx bx-briefcase' style="color:var(--gold);"></i><span>Design by <strong style="color:var(--gold);">@${uname}</strong></span></div>`;

        const avatarHtml = offer.avatar_url
          ? `<div class="user-avatar" style="background-image:url('${offer.avatar_url}');background-size:cover;background-position:center;cursor:pointer;" onclick="viewUserProfile('${uname}')"></div>`
          : `<div class="user-avatar" style="background:linear-gradient(135deg,var(--gold),var(--pink));cursor:pointer;" onclick="viewUserProfile('${uname}')">${uname.charAt(0).toUpperCase()}</div>`;

        const userVote = userVotesMap[offer.id];
        const hasUserVoted = typeof userVote !== 'undefined' && userVote !== null;
        const vsClass = hasUserVoted ? 'vote-slider-wrap' : 'vote-slider-wrap vs-initial';
        const userVoteAttr = hasUserVoted ? `data-user-vote="${userVote}"` : '';
        const displayScore = hasUserVoted ? userVote : Math.round(offer.vote_average || 5);

        const deadlineDate = new Date(offer.deadline);
        const isValidDate = offer.deadline && offer.deadline !== '0000-00-00' && !isNaN(deadlineDate.getTime());
        const isCompleted = offer.status === 'closed' || (isValidDate && deadlineDate < new Date());

        const ratingHtml = isCompleted
          ? `<div style="display:flex;align-items:baseline;gap:4px;justify-content:flex-end;"><span class="vs-avg" style="font-size:1.5rem;font-weight:700;color:var(--gold);">${parseFloat(offer.vote_average||5).toFixed(1)}</span><span style="font-size:0.8rem;color:var(--text-muted);">/10</span></div><span style="font-size:0.7rem;color:var(--text-muted);letter-spacing:0.05em;text-transform:uppercase;">Avg Rating</span>`
          : `<span style="font-size:0.75rem;color:var(--text-secondary);text-align:right;font-style:italic;">Rating after offer closes</span>`;

        const scoreRowHtml = `<div class="vs-score-row" style="display:flex;justify-content:space-between;width:100%;align-items:center;"><div class="vs-score-left" style="display:flex;flex-direction:column;gap:2px;"><div style="display:flex;align-items:baseline;gap:4px;"><span class="vs-num" style="font-size:1.5rem;font-weight:700;color:var(--text-primary);">${displayScore}</span><span class="vs-denom" style="font-size:0.8rem;color:var(--text-muted);">/10</span></div><span style="font-size:0.7rem;color:var(--text-muted);letter-spacing:0.05em;text-transform:uppercase;">Your Vote</span></div><div class="vs-score-right" style="text-align:right;display:flex;flex-direction:column;gap:2px;justify-content:center;">${ratingHtml}</div></div>`;

        const mentionBadge = offer.parent_offer_id
          ? `<span class="mention-tag" onclick="window.loadOfferPage ? window.loadOfferPage(${offer.parent_offer_id}) : window.viewOfferDetails(${offer.parent_offer_id}); event.stopPropagation();">${window.getMentionTag ? window.getMentionTag(offer.parent_offer_title) : ('@' + (offer.parent_offer_title || 'Offer'))}</span> `
          : '';

        card.innerHTML = `<div class="post-header"><div class="user-info" style="cursor:pointer;" onclick="viewUserProfile('${uname}')">${avatarHtml}<div><h4>@${uname}</h4><p class="time">${timeAgo}</p></div></div><button class="btn-icon"><i class='bx bx-dots-horizontal-rounded'></i></button></div><div class="post-media-container" style="position:relative; width:100%; aspect-ratio:4/3; overflow:hidden;">${mediaHtml}</div><div class="post-body">${offerBadge}<h3 class="post-title" style="cursor:pointer;" onclick="window.loadOfferPage ? window.loadOfferPage(${offer.id}) : window.viewOfferDetails(${offer.id})">${mentionBadge}${escapeHtml(offer.title)}</h3><p class="post-desc">${window.formatMentions ? window.formatMentions(offer.description||'') : ''}</p></div><div class="post-actions" style="flex-direction:column;align-items:stretch;gap:12px;"><div class="${vsClass}" data-offer-id="${offer.id||0}" ${userVoteAttr} data-initial-val="${Math.round(offer.vote_average||5)}">${scoreRowHtml}<div class="vs-ticks"></div><div class="vs-track" touch-action="none"><div class="vs-fill"></div><div class="vs-glow"></div><div class="vs-thumb" role="slider" aria-valuemin="1" aria-valuemax="10" aria-valuenow="${displayScore}" tabindex="0"><span class="vs-arrow vs-arrow-left"></span><span class="vs-arrow vs-arrow-right"></span></div></div><p class="vs-hint">${offer.total_votes||0} votes · drag to vote</p></div><div style="display:flex;gap:8px;justify-content:flex-end;"><button class="btn-icon toggle-comments-btn" title="Comments"><i class='bx bx-comment'></i></button><button class="btn-icon" title="Share"><i class='bx bx-share-alt'></i></button></div></div><div class="comments-section" data-offer-id="${offer.id||0}" style="display:none;"><div class="comments-list" style="max-height:140px;overflow-y:auto;margin-bottom:10px;"></div><div class="comment-input-row"><input type="text" class="form-input comment-input" placeholder="Add a comment…" style="padding:8px 12px;"><button class="btn btn-ghost btn-sm post-comment-btn">Post</button></div></div>`;

        grid.appendChild(card);
        card.classList.add('visible');
      });

      feedLog(`[Feed] Rendered ${renderedIds.size} cards`);
      setTimeout(() => { initVoting(); initComments(); triggerReveals(); }, 100);

    } catch (error) {
      console.error('[Feed] Error loading artworks:', error);
      grid.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-secondary);grid-column:1/-1;"><i class="bx bx-error" style="font-size:3rem;opacity:0.3;"></i><p>Failed to load feed</p></div>';
    } finally {
      window._artworksLoading = false;
      feedLog('[Feed] loadArtworksFromAPI END');
    }
  }

  async function loadOffersFromAPI() {
    const grid = $('#offer-feed');
    if (!grid) return;
    grid.innerHTML = '<div class="loading-skeleton" style="text-align:center;padding:40px;color:var(--text-secondary);"><i class="bx bx-loader-alt bx-spin" style="font-size:2rem;"></i><p>Loading offers...</p></div>';
    try {
      const response = await API.offers.getAll(1, 12, 'active');
      const allData = (response && response.success && response.data && response.data.length > 0) ? response.data : [];
      // Offers Page = ONLY client-created offers
      const data = allData.filter(o => !o.description || !o.description.includes('Submitted for Offer #'));
      grid.innerHTML = '';
      if (data.length === 0) {
        grid.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-secondary);grid-column:1/-1;"><i class="bx bx-briefcase" style="font-size:3rem;opacity:0.3;"></i><p style="margin-top:12px;font-size:1.1rem;">No offers available</p><p style="font-size:0.85rem;">Check back soon for new opportunities!</p></div>';
        return;
      }
      data.forEach((offer, index) => {
        const card = document.createElement('article');
        card.className = `reward-card glass reveal ${index > 0 ? `delay-${Math.min(index - 1, 2)}` : ''}`;
        
        const deadlineDate = new Date(offer.deadline);
        const isValidDate = offer.deadline && offer.deadline !== '0000-00-00' && !isNaN(deadlineDate.getTime());
        const daysLeft = isValidDate ? Math.ceil((deadlineDate - new Date()) / (1000 * 60 * 60 * 24)) : 0;
        const ended = !isValidDate || daysLeft <= 0;
        const daysText = isValidDate ? (ended ? 'Ended' : daysLeft + ' Days') : 'No Deadline';
        const badgeColor = ended ? 'badge-pink' : (daysLeft <= 3 ? 'badge-pink' : 'badge-gold');
        
        let imgUrl = null;
        if (offer.reference_images) {
            try {
                const imgs = JSON.parse(offer.reference_images);
                if (imgs && Array.isArray(imgs) && imgs.length > 0) {
                    imgUrl = imgs[0];
                } else if (typeof offer.reference_images === 'string' && offer.reference_images.startsWith('http')) {
                    imgUrl = offer.reference_images;
                }
            } catch(e) {
                if (typeof offer.reference_images === 'string' && offer.reference_images.startsWith('http')) {
                    imgUrl = offer.reference_images;
                }
            }
        }
        
        const fallbackBg = `background: linear-gradient(135deg, #08080A 0%, ${['#E11D48', '#D4AF37', '#10B981', '#A37F1A'][index % 4]} 100%);`;
        const mediaHtml = imgUrl 
          ? `<div class="reward-card-media" style="height: 140px; border-radius: 8px; overflow: hidden; margin-bottom: 12px; background-image: url('${imgUrl}'); background-size: cover; background-position: center;"></div>`
          : `<div class="reward-card-media" style="height: 140px; border-radius: 8px; overflow: hidden; margin-bottom: 12px; ${fallbackBg}; display: flex; align-items: center; justify-content: center;"><i class="bx bx-image" style="font-size: 2.5rem; opacity: 0.15;"></i></div>`;
          
        const escapedTitle = escapeHtml(offer.title || 'Untitled Offer');
        const escapedDesc = escapeHtml(offer.description || 'No description provided.');
        const formattedBudget = offer.budget ? parseFloat(offer.budget).toLocaleString() : '0';
        const applicantsCount = offer.submission_count || 0;
        const offerId = offer.id || 0;

        const mentionBadge = offer.parent_offer_id ? `<span class="mention-tag" onclick="window.viewOfferDetails(${offer.parent_offer_id}); event.stopPropagation();">${window.getMentionTag(offer.parent_offer_title)}</span>` : '';
        const currentOfferTag = window.getMentionTag(offer.title);
        if (currentOfferTag) {
          window.offerNameCache[currentOfferTag.toLowerCase()] = offer.id;
        }

        card.innerHTML = `
          <div style="cursor:pointer;" onclick="window.viewOfferDetails(${offerId})">
            ${mediaHtml}
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
              <h3 style="font-size: 1.1rem; line-height: 1.3;">${mentionBadge}${escapedTitle}</h3>
              <span class="badge ${badgeColor}">${daysText}</span>
            </div>
            <p style="margin: 8px 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${window.formatMentions(offer.description || 'No description provided.')}</p>
          </div>
          <div class="reward-meta" style="margin-top: auto;">
            <span class="reward-amount text-gold">$${formattedBudget}</span>
            <span style="font-size:0.8rem;color:var(--text-muted);">${applicantsCount} applicants</span>
          </div>
          ${ended 
            ? '<button class="btn btn-ghost btn-full" style="margin-top: 12px;" disabled>Offer Closed</button>' 
            : `<button class="btn btn-gold btn-full accept-offer-btn" style="margin-top: 12px;" data-offer-id="${offerId}"><i class='bx bx-check-circle'></i> Take Offer</button>`
          }
        `;
        grid.appendChild(card);
        card.classList.add('visible');
      });
      // Bind accept buttons
      $$('.accept-offer-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
          if (!API.isAuthenticated()) {
            window.redirectToLogin('page-offers');
            return;
          }
          const offerId = this.dataset.offerId;
          this.disabled = true;
          this.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Accepting...';
          try {
            const res = await fetch('/again/api/offers/' + offerId + '/apply', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API.getToken() },
              body: JSON.stringify({ message: 'I would like to work on this offer.' })
            });
            const data = await res.json();
            if (data.success) {
              this.innerHTML = '<i class="bx bx-check"></i> Accepted!';
              this.style.background = 'linear-gradient(135deg,#10B981,#28A870)';
              this.style.color = '#000';
              showToast('Offer accepted! Opening workspace...', 'success');
              // Open submission workspace with offer details
              setTimeout(() => openSubmissionWorkspace(data.data.offer || { id: offerId }), 800);
            } else if (res.status === 409 || (data && data.message && data.message.toLowerCase().includes('already'))) {
              // Already applied — switch button to submit design
              this.innerHTML = '<i class="bx bx-palette"></i> Submit Design';
              this.style.background = 'linear-gradient(135deg,var(--gold),#A37F1A)';
              this.style.color = '#000';
              this.disabled = false;
              showToast('Already accepted — click to submit your design', 'info');
              this.onclick = () => {
                fetch('/again/api/offers/' + offerId + '/my-application', {
                  headers: { 'Authorization': 'Bearer ' + API.getToken() }
                })
                .then(r => {
                  if (!r.ok) throw new Error('HTTP error ' + r.status);
                  return r.json();
                })
                .then(appData => {
                  if (appData.success && appData.data) {
                    openSubmissionWorkspace({
                      id: offerId,
                      title: appData.data.offer_title,
                      client_name: appData.data.client_name,
                      budget: appData.data.budget,
                    });
                  }
                })
                .catch(err => console.warn('my-application fetch failed:', err));
              };
            }
          } catch(e) {
            this.disabled = false;
            this.innerHTML = '<i class="bx bx-check-circle"></i> Take Offer';
            showToast('Network error. Try again.', 'error');
          }
        });
      });
      triggerReveals();
    } catch (error) {
      console.error('Error loading offers:', error);
      grid.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-secondary);grid-column:1/-1;"><i class="bx bx-error" style="font-size:3rem;opacity:0.3;"></i><p>Failed to load offers</p></div>';
    }
  }

  // loadOfferHub: only manages sidebar nav visibility now.
  // The offer-hub-wrapper section has been removed from page-offers.
  window.loadOfferHub = async function() {
    const sidebarNav = document.getElementById('nav-offer-hub');
    if (!API.isAuthenticated()) {
      if (sidebarNav) sidebarNav.style.display = 'none';
      return;
    }
    try {
      const response = await API.offers.getUserOffers();
      const allOffers = (response && response.success && response.data) ? response.data : [];
      const offers = allOffers.filter(o => !o.description || !o.description.includes('Submitted for Offer #'));
      if (sidebarNav) sidebarNav.style.display = offers.length > 0 ? 'flex' : 'none';
    } catch(e) {
      console.error('Error loading Offer Hub nav:', e);
      if (sidebarNav) sidebarNav.style.display = 'none';
    }
  }
  // ── Offer Hub Page (separate SPA page) ──
  window.loadOfferHubPage = async function() {
    const grid = document.getElementById('offer-hub-page-feed');
    if (!grid) return;

    grid.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-secondary);grid-column:1/-1;">
      <i class='bx bx-loader-alt bx-spin' style="font-size:2.5rem;color:var(--gold);"></i>
      <p style="margin-top:12px;">Loading your campaigns...</p>
    </div>`;

    try {
      const response = await API.offers.getUserOffers();
      const allOffers = (response && response.success && response.data) ? response.data : [];
      // Only show offers created by this user (not submissions)
      const myOffers = allOffers.filter(o => !o.description || !o.description.includes('Submitted for Offer #'));

      // Show/hide nav item
      const navHub = document.getElementById('nav-offer-hub');
      if (navHub) navHub.style.display = myOffers.length > 0 ? 'flex' : 'none';

      if (myOffers.length === 0) {
        grid.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-secondary);grid-column:1/-1;">
          <i class='bx bx-briefcase' style="font-size:3rem;opacity:0.3;color:var(--gold);"></i>
          <p style="margin-top:16px;font-size:1rem;font-weight:600;">No campaigns yet</p>
          <p style="font-size:0.85rem;margin-top:4px;">Create your first offer to start receiving design submissions!</p>
          <button class="btn btn-primary" style="margin-top:20px;" data-modal="upload-modal" onclick="document.querySelector('[data-modal=upload-modal]').click()">
            <i class='bx bx-plus'></i> Create Offer
          </button>
        </div>`;
        return;
      }

      grid.innerHTML = '';
      myOffers.forEach((offer, index) => {
        const card = document.createElement('article');
        card.className = 'glass offer-hub-card reveal';

        const deadlineDate = new Date(offer.deadline);
        const isValidDate = offer.deadline && offer.deadline !== '0000-00-00' && !isNaN(deadlineDate.getTime());
        const daysLeft = isValidDate ? Math.ceil((deadlineDate - new Date()) / (1000 * 60 * 60 * 24)) : 0;
        const isClosed = offer.status === 'closed' || daysLeft <= 0;
        const statusColor = isClosed ? '#E11D48' : '#10B981';
        const statusLabel = isClosed ? '🔴 Closed' : '🟢 Active';
        const daysText = !isValidDate ? 'No Deadline' : (isClosed ? 'Ended' : `${daysLeft}d left`);

        let imgUrl = null;
        if (offer.reference_images) {
          try {
            const imgs = JSON.parse(offer.reference_images);
            if (Array.isArray(imgs) && imgs.length > 0) imgUrl = imgs[0];
          } catch(e) {
            if (typeof offer.reference_images === 'string' && offer.reference_images.startsWith('http')) imgUrl = offer.reference_images;
          }
        }

        const mediaHtml = imgUrl
          ? `<div style="height:160px;border-radius:10px;overflow:hidden;background:url('${imgUrl}') center/cover no-repeat;"></div>`
          : `<div style="height:160px;border-radius:10px;overflow:hidden;background:linear-gradient(135deg,#08080A,${['#E11D48','#D4AF37','#10B981','#D4AF37'][index%4]});display:flex;align-items:center;justify-content:center;"><i class='bx bx-briefcase-alt-2' style="font-size:3rem;opacity:0.2;"></i></div>`;

        const subCount = parseInt(offer.submission_count || 0);
        const budget = parseFloat(offer.budget || 0).toLocaleString();
        const category = offer.tags || 'General';

        const createdTime = new Date(offer.created_at);
        const diffHours = (new Date() - createdTime) / (1000 * 60 * 60);
        const isEditable = diffHours <= 1.0;

        card.innerHTML = `
          ${mediaHtml}
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
            <div style="flex:1;min-width:0;">
              <h3 style="font-size:1rem;font-weight:700;margin:0 0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(offer.title || 'Untitled')}</h3>
              <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                <span style="background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}44;font-size:0.65rem;font-weight:700;padding:2px 8px;border-radius:12px;">${statusLabel}</span>
                <span style="background:rgba(212,175,55,0.1);color:var(--gold);font-size:0.65rem;font-weight:600;padding:2px 8px;border-radius:12px;">${escapeHtml(category)}</span>
                <span style="font-size:0.72rem;color:var(--text-secondary);">⏰ ${daysText}</span>
              </div>
            </div>
            <span style="font-size:1.2rem;font-weight:800;color:var(--gold);white-space:nowrap;">$${budget}</span>
          </div>

          <!-- Stats bar -->
          <div class="offer-stats-bar" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:12px;background:rgba(255,255,255,0.03);border-radius:10px;border:1px solid rgba(255,255,255,0.05);">
            <div style="text-align:center;">
              <div style="font-size:1.3rem;font-weight:800;color:var(--text);">${subCount}</div>
              <div style="font-size:0.68rem;color:var(--text-secondary);margin-top:2px;">Submissions</div>
            </div>
            <div style="text-align:center;border-left:1px solid rgba(255,255,255,0.06);border-right:1px solid rgba(255,255,255,0.06);">
              <div style="font-size:1.3rem;font-weight:800;color:var(--gold);">$${budget}</div>
              <div style="font-size:0.68rem;color:var(--text-secondary);margin-top:2px;">Budget</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:1.3rem;font-weight:800;color:var(--pink);">${daysText}</div>
              <div style="font-size:0.68rem;color:var(--text-secondary);margin-top:2px;">Deadline</div>
            </div>
          </div>

          <!-- Action buttons -->
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-gold btn-sm" onclick="window.loadOfferPage ? window.loadOfferPage(${offer.id}, true) : window.viewOfferDetails(${offer.id})" style="flex:1;">
              <i class='bx bx-show'></i> View & Manage
            </button>
            ${isEditable ? `
            <button class="btn btn-ghost btn-sm" onclick="window.openEditOfferModal(${offer.id}, '${escapeHtml(offer.title||'').replace(/'/g,"\\'")}', '${escapeHtml(offer.description||'').replace(/'/g,"\\'")}', ${offer.budget||0}, '${offer.deadline||''}')">
              <i class='bx bx-edit'></i>
            </button>` : ''}
            ${!isClosed ? `
            <button class="btn btn-ghost btn-sm" onclick="window.closeOffer(${offer.id})" title="Close Campaign" style="color:var(--pink);">
              <i class='bx bx-lock-alt'></i>
            </button>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="window.deleteOfferHub(${offer.id})" style="color:var(--pink);" title="Delete">
              <i class='bx bx-trash'></i>
            </button>
          </div>`;

        grid.appendChild(card);
        card.classList.add('visible');
      });

      triggerReveals();
    } catch(e) {
      console.error('loadOfferHubPage error:', e);
      grid.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-secondary);grid-column:1/-1;">
        <i class='bx bx-error-circle' style="font-size:2.5rem;color:var(--pink);"></i>
        <p style="margin-top:12px;">Failed to load campaigns. Please try again.</p>
      </div>`;
    }
  };

  // ── Edit/Delete/Designer Artworks Handlers ──
  window.openEditOfferModal = function(offerId, title, description, budget, deadline) {
    const modal = document.getElementById('edit-offer-modal');
    if (!modal) return;
    
    window.safeSetVal('edit-offer-id', offerId);
    window.safeSetVal('edit-offer-title', title);
    window.safeSetVal('edit-offer-desc', description);
    window.safeSetVal('edit-offer-budget', budget);
    
    if (deadline) {
      window.safeSetVal('edit-offer-deadline', deadline.split(' ')[0]);
    } else {
      window.safeSetVal('edit-offer-deadline', '');
    }
    
    modal.classList.add('active');
  };

  window.deleteOfferHub = async function(offerId) {
    if (!confirm('Are you sure you want to delete this offer? This action cannot be undone.')) return;
    try {
      const res = await API.offers.delete(offerId);
      if (res && res.success) {
        showToast('Offer deleted successfully!', 'success');
        if (window.loadOfferHub) window.loadOfferHub();
        if (window.loadOfferHubPage) window.loadOfferHubPage();
        if (window.loadOffers) window.loadOffers();
        if (typeof loadArtworksFromAPI === 'function') loadArtworksFromAPI();
      } else {
        showToast(res.message || 'Failed to delete offer', 'error');
      }
    } catch (err) {
      console.error('Delete offer error:', err);
      showToast('Failed to delete offer.', 'error');
    }
  };

  window.loadDesignerArtworks = async function() {
    const user = API.getCurrentUser();
    if (!user) return;
    
    const grid = document.getElementById('designer-artworks-grid');
    if (!grid) return;
    
    grid.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-secondary);grid-column:1/-1;">
      <i class='bx bx-loader-alt bx-spin' style="font-size:2rem;color:var(--gold);"></i>
      <p style="margin-top:8px;">Fetching your creative gallery...</p>
    </div>`;
    
    try {
      // 1. Fetch user profile data to display in the header
      const profileNameEl = document.getElementById('artwork-profile-name');
      const profileUserEl = document.getElementById('artwork-profile-username');
      const profileBioEl = document.getElementById('artwork-profile-bio');
      const profileAvatarEl = document.getElementById('artwork-profile-avatar');

      try {
        const profileRes = await API.users.getById(user.id);
        if (profileRes && profileRes.success && profileRes.data) {
          const profile = profileRes.data;
          if (profileNameEl) profileNameEl.textContent = profile.full_name || profile.username;
          if (profileUserEl) profileUserEl.textContent = '@' + profile.username;
          if (profileBioEl) profileBioEl.textContent = profile.bio || 'This designer has not written a bio yet.';
          
          if (profileAvatarEl) {
            if (profile.avatar_url) {
              profileAvatarEl.style.backgroundImage = `url('${profile.avatar_url}')`;
            } else {
              const fallbackUrl = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(profile.username || 'User') + '&background=E8B842&color=fff&size=150';
              profileAvatarEl.style.backgroundImage = `url('${fallbackUrl}')`;
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load user profile details for header:', err);
        // Fallback using cached user data
        if (profileNameEl) profileNameEl.textContent = user.full_name || user.username;
        if (profileUserEl) profileUserEl.textContent = '@' + user.username;
        if (profileBioEl) profileBioEl.textContent = 'Active creator on ARTVOT.';
        if (profileAvatarEl) {
          const fallbackUrl = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.username || 'User') + '&background=E8B842&color=fff&size=150';
          profileAvatarEl.style.backgroundImage = `url('${fallbackUrl}')`;
        }
      }

      // 2. Fetch designer submissions and user offers
      const [subRes, offersRes] = await Promise.all([
        API.submissions.getByDesigner(user.id),
        API.offers.getUserOffers()
      ]);

      const submissions = (subRes && subRes.success && Array.isArray(subRes.data)) ? subRes.data : [];
      const userOffers = (offersRes && offersRes.success && Array.isArray(offersRes.data)) ? offersRes.data : [];

      const itemsMap = new Map();

      // Aggregate submissions first
      submissions.forEach(sub => {
        // Exclude campaigns (budget > 0)
        if (parseFloat(sub.budget) === 0) {
          itemsMap.set(sub.id, {
            ...sub,
            type: 'submission',
            displayStatus: sub.status || 'applied'
          });
        }
      });

      // Aggregate other portfolio items or posts with budget = 0
      userOffers.forEach(o => {
        if (parseInt(o.user_id) === parseInt(user.id)) {
          if (parseFloat(o.budget) === 0 && !itemsMap.has(o.id)) {
            itemsMap.set(o.id, {
              ...o,
              type: 'portfolio',
              displayStatus: o.user_application_status || o.status || 'active'
            });
          }
        }
      });

      const allArtworks = Array.from(itemsMap.values());

      // 3. Compute stats
      let totalUploads = allArtworks.length;
      let totalVotes = 0;
      let totalRatingSum = 0;
      let ratedCount = 0;

      allArtworks.forEach(o => {
        const tv = parseInt(o.total_votes || 0);
        totalVotes += tv;
        const va = parseFloat(o.vote_average || 0);
        if (va > 0) {
          totalRatingSum += va;
          ratedCount++;
        }
      });

      const avgRating = ratedCount > 0 ? (totalRatingSum / ratedCount).toFixed(1) : '0.0';

      const uploadsEl = document.getElementById('art-stat-uploads');
      const avgEl = document.getElementById('art-stat-avg');
      const votesEl = document.getElementById('art-stat-votes');

      if (uploadsEl) uploadsEl.textContent = totalUploads;
      if (avgEl) avgEl.textContent = avgRating;
      if (votesEl) votesEl.textContent = totalVotes;

      if (allArtworks.length === 0) {
        grid.innerHTML = `
          <div style="text-align: center; padding: 80px 24px; color: var(--text-secondary); grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 24px; box-shadow: var(--shadow-sm);">
            <div style="width: 80px; height: 80px; border-radius: 50%; background: rgba(212, 175, 55, 0.08); display: flex; align-items: center; justify-content: center; border: 1px solid rgba(212, 175, 55, 0.2); box-shadow: 0 0 15px rgba(212, 175, 55, 0.1);">
              <i class='bx bx-palette' style="font-size: 2.5rem; color: var(--gold);"></i>
            </div>
            <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--text); margin: 8px 0 0;">No artworks published yet.</h3>
            <p style="font-size: 0.88rem; max-width: 320px; line-height: 1.5; color: var(--text-muted); margin: 0 0 12px; text-align: center;">Browse active offers to submit your first design concept and start building your gallery!</p>
            <button class="btn btn-gold btn-sm" onclick="window.activatePage('page-offers')">
              <i class='bx bx-search'></i> Explore Offers
            </button>
          </div>`;
        return;
      }

      // 4. Render Grid of Cards
      grid.innerHTML = allArtworks.map((o, index) => {
        let imgUrl = 'style/images/placeholder.jpg';
        if (o.reference_images) {
          try {
            const parsed = typeof o.reference_images === 'string' ? JSON.parse(o.reference_images) : o.reference_images;
            if (Array.isArray(parsed) && parsed.length > 0) imgUrl = parsed[0];
            else if (typeof parsed === 'string') imgUrl = parsed;
          } catch(_) {}
        }

        const createdDate = o.created_at ? new Date(o.created_at).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'}) : 'Recently';

        // Badges depending on status
        const status = o.displayStatus || 'applied';
        let statusBadge = '';
        if (status === 'accepted') {
          statusBadge = `<span class="badge badge-green" style="position:absolute;top:16px;right:16px;z-index:3;box-shadow: 0 4px 10px rgba(16,185,129,0.25);">Winner 🏆</span>`;
        } else if (status === 'rejected') {
          statusBadge = `<span class="badge badge-pink" style="position:absolute;top:16px;right:16px;z-index:3;">Declined</span>`;
        } else if (status === 'completed') {
          statusBadge = `<span class="badge badge-green" style="position:absolute;top:16px;right:16px;z-index:3;">Completed</span>`;
        } else {
          statusBadge = `<span class="badge badge-gold" style="position:absolute;top:16px;right:16px;z-index:3;">Pending</span>`;
        }

        let parentOfferInfo = '';
        const match = o.description && o.description.match(/Submitted for Offer #(\d+)/i);
        const parentId = o.parent_offer_id || (match ? match[1] : null);
        const parentTitle = o.parent_offer_title || (match ? `Offer #${match[1]}` : null);
        
        if (parentTitle && parentId) {
          parentOfferInfo = `<div class="badge badge-gold" style="margin-top:8px;display:inline-flex;align-items:center;gap:4px;cursor:pointer;" onclick="window.loadOfferPage ? window.loadOfferPage(${parentId}) : window.viewOfferDetails(${parentId}); event.stopPropagation();">
            <i class='bx bx-link'></i> Submission to @${parentTitle.replace(/\s+/g,'')}
          </div>`;
        }

        const createdTime = new Date(o.created_at);
        const diffHours = (new Date() - createdTime) / (1000 * 60 * 60);
        const isEditable = diffHours <= 1.0;

        let editBtnHtml = '';
        if (isEditable) {
          editBtnHtml = `<button class="btn btn-ghost btn-sm" onclick="window.openEditOfferModal(${o.id}, '${escapeHtml(o.title).replace(/'/g, "\\'")}', '${escapeHtml(o.description || '').replace(/'/g, "\\'")}', ${o.budget}, '${o.deadline}'); event.stopPropagation();" style="flex:1; font-size:0.75rem;">
            <i class='bx bx-edit-alt'></i> Edit
          </button>`;
        } else {
          editBtnHtml = `<button class="btn btn-ghost btn-sm" disabled title="Editing period (1 hour) expired" style="flex:1; opacity:0.5; cursor:not-allowed; font-size:0.75rem; pointer-events: none;">
            <i class='bx bx-lock-alt'></i> Lock
          </button>`;
        }

        const deleteBtnHtml = `<button class="btn btn-pink btn-ghost btn-sm" onclick="window.deleteOfferHub(${o.id}); event.stopPropagation();" style="flex:1; font-size:0.75rem;">
          <i class='bx bx-trash'></i> Delete
        </button>`;

        const mediaHtml = renderPostMedia(o.reference_images, o.id);

        return `
          <div class="glass artwork-card reveal" style="overflow:hidden; border-radius:20px; transition: all 0.3s var(--ease); border: 1px solid var(--border); background: var(--surface); display:flex; flex-direction:column; position:relative; cursor:pointer;" onclick="window.loadOfferPage ? window.loadOfferPage(${o.id}) : window.viewOfferDetails(${o.id})">
            
            <!-- Card Media Container -->
            <div class="artwork-card-media" style="height:230px; overflow:hidden; position:relative; background: var(--surface-2); display:flex; align-items:center; justify-content:center;">
              ${statusBadge}
              ${mediaHtml}
            </div>
            
            <!-- Card Body -->
            <div class="artwork-card-body" style="padding:20px; display:flex; flex-direction:column; flex:1; justify-content:space-between;">
              <div>
                <h4 class="artwork-card-title" style="font-family:'Syne',sans-serif; font-size:1.15rem; font-weight:700; color:var(--text); margin-bottom:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(o.title)}">${escapeHtml(o.title)}</h4>
                <p class="artwork-card-desc" style="font-size:0.85rem; color:var(--text-secondary); line-height:1.5; margin-bottom:12px; height:40px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtml(o.description || '')}</p>
                ${parentOfferInfo}
              </div>
              
              <!-- Footer Meta -->
              <div style="margin-top:16px;">
                <div style="display:flex; align-items:center; justify-content:space-between; padding-top:12px; border-top:1px solid rgba(255,255,255,0.06);">
                  <span class="artwork-card-date" style="font-size:0.75rem; color:var(--text-muted); display:flex; align-items:center; gap:4px;">
                    <i class='bx bx-calendar-event'></i> ${createdDate}
                  </span>
                  
                  <div style="display:flex; align-items:center; gap:4px; font-size:0.82rem; color:var(--text-primary);">
                    <i class='bx bxs-star' style="color:var(--gold);"></i>
                    <strong style="color:var(--text-primary); font-size:0.9rem;">${parseFloat(o.vote_average || 0).toFixed(1)}</strong>
                    <span style="color:var(--text-secondary); font-size:0.75rem;">(${o.total_votes || 0} votes)</span>
                  </div>
                </div>
                
                <!-- Action Buttons -->
                <div style="display:flex; gap:8px; margin-top:16px;">
                  ${editBtnHtml}
                  ${deleteBtnHtml}
                </div>
              </div>
            </div>
            
          </div>`;
      }).join('');

      triggerReveals();
    } catch (err) {
      console.error('Failed to load designer artworks:', err);
      grid.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-secondary);grid-column:1/-1;">
        <i class='bx bx-error-circle' style="font-size:2rem;color:var(--pink);"></i>
        <p style="margin-top:8px;">Failed to load artworks. Please check your network connection.</p>
      </div>`;
    }
  };

  // Wire up the edit offer save listener
  setTimeout(() => {
    const saveOfferBtn = document.getElementById('save-offer-btn');
    if (saveOfferBtn) {
      saveOfferBtn.addEventListener('click', async () => {
        const offerId = window.safeGetVal('edit-offer-id');
        const title = window.safeGetVal('edit-offer-title').trim();
        const desc = window.safeGetVal('edit-offer-desc').trim();
        const budget = parseFloat(window.safeGetVal('edit-offer-budget') || 0);
        const deadline = window.safeGetVal('edit-offer-deadline');
        
        if (!title || !desc || !deadline) {
          showToast('Please fill in all fields', 'error');
          return;
        }
        
        saveOfferBtn.disabled = true;
        saveOfferBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Saving...";
        
        try {
          const res = await API.offers.update(offerId, {
            title,
            description: desc,
            budget,
            deadline
          });
          
          if (res && res.success) {
            showToast('Offer updated successfully!', 'success');
            document.getElementById('edit-offer-modal').classList.remove('active');
            if (window.loadOfferHub) window.loadOfferHub();
            if (window.loadOffers) window.loadOffers();
          } else {
            showToast(res.message || 'Failed to update offer', 'error');
          }
        } catch (err) {
          console.error('Update offer error:', err);
          showToast('Failed to save changes.', 'error');
        } finally {
          saveOfferBtn.disabled = false;
          saveOfferBtn.innerHTML = "<i class='bx bx-save'></i> Save Changes";
        }
      });
    }
  }, 100);

  // ══════════════════════════════════════════════════════════
  // DESIGN SUBMISSION WORKSPACE
  // ══════════════════════════════════════════════════════════
  
  window.submissionSelectedFiles = [];
  window.submissionSelectedFileMetadata = [];

  window.renderSubmissionPreviews = function() {
    const grid = document.getElementById('ws-media-previews-grid');
    const placeholder = document.getElementById('ws-upload-placeholder');
    if (!grid) return;
    grid.innerHTML = '';
    
    if (!window.submissionSelectedFiles) window.submissionSelectedFiles = [];
    if (!window.submissionSelectedFileMetadata) window.submissionSelectedFileMetadata = [];

    if (window.submissionSelectedFiles.length === 0) {
      if (placeholder) placeholder.style.display = 'block';
      return;
    }
    
    if (placeholder) placeholder.style.display = 'none';

    window.submissionSelectedFiles.forEach((fileData, index) => {
      const item = document.createElement('div');
      item.style.position = 'relative';
      item.style.width = '80px';
      item.style.height = '80px';
      item.style.borderRadius = '8px';
      item.style.overflow = 'hidden';
      item.style.border = '1px solid var(--border)';
      item.style.background = 'var(--surface-3)';

      let mediaTag = '';
      if (isVideoMediaSrc(fileData)) {
        mediaTag = `<video src="${fileData}" style="width:100%; height:100%; object-fit:cover;"></video>`;
      } else {
        mediaTag = `<img src="${fileData || ''}" style="width:100%; height:100%; object-fit:cover;">`;
      }

      item.innerHTML = `
        ${mediaTag}
        <button type="button" style="position:absolute; top:4px; right:4px; width:18px; height:18px; border-radius:50%; background:rgba(0,0,0,0.6); color:#fff; border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:10px; z-index:5;" onclick="event.preventDefault(); event.stopPropagation(); window.submissionSelectedFiles.splice(${index}, 1); if (window.submissionSelectedFileMetadata) window.submissionSelectedFileMetadata.splice(${index}, 1); window.renderSubmissionPreviews();">
          <i class="bx bx-x"></i>
        </button>
      `;
      grid.appendChild(item);
    });
  };

  window.openSubmissionWorkspace = function(offer, submissionData = null) {
    if (!API.isAuthenticated()) {
      window.redirectToLogin('page-offer-detail', offer ? offer.id : null);
      return;
    }
    const modal = document.getElementById('submission-workspace-modal');
    if (!modal) return;
    // Fill offer info
    window.safeSetVal('ws-offer-id', offer.id || '');
    window.safeSetText('ws-offer-title', offer.title || 'Untitled Offer');
    window.safeSetText('ws-client-name', offer.client_name || 'Client');
    window.safeSetText('ws-budget', '$' + parseFloat(offer.budget || 0).toLocaleString());
    window.safeSetVal('ws-client-name-val', offer.client_name || '');
    window.safeSetVal('ws-offer-title-val', offer.title || '');
    
    const btn = document.getElementById('ws-submit-btn');
    window.submissionSelectedFiles = [];
    window.submissionSelectedFileMetadata = [];

    if (submissionData) {
      // Edit mode
      window.safeSetVal('ws-submission-id', submissionData.id);
      window.safeSetVal('ws-design-title', submissionData.title || '');
      
      let cleanDesc = submissionData.description || '';
      if (offer.id) {
        const suffix = `(Submitted for Offer #${offer.id})`;
        cleanDesc = cleanDesc.replace(suffix, '').trim();
      }
      window.safeSetVal('ws-design-desc', cleanDesc);
      window.safeSetVal('ws-tags', submissionData.tags || '');
      
      if (submissionData.reference_images) {
        try {
          const imgs = typeof submissionData.reference_images === 'string'
            ? JSON.parse(submissionData.reference_images)
            : submissionData.reference_images;
          const rawList = Array.isArray(imgs) ? imgs
                        : (typeof imgs === 'string' && imgs ? [imgs] : []);
          // ROOT CAUSE FIX: strip any base64 strings that may exist in old DB records.
          // Only keep real file URLs — base64 is never a valid stored URL.
          window.submissionSelectedFiles = rawList.filter(
            v => v && typeof v === 'string' && !v.startsWith('data:')
          );
        } catch(e) {
          window.submissionSelectedFiles = [];
        }
      }
      if (window.submissionSelectedFiles) {
        window.submissionSelectedFileMetadata = window.submissionSelectedFiles.map((src, idx) => `loaded-${idx}`);
      }
      
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="bx bx-save"></i> Save Changes';
      }
    } else {
      // Create mode
      window.safeSetVal('ws-submission-id', '');
      window.safeSetVal('ws-design-title', '');
      window.safeSetVal('ws-design-desc', '');
      window.safeSetVal('ws-tags', '');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="bx bx-send"></i> Submit Design';
      }
    }
    
    window.renderSubmissionPreviews();

    // Show modal
    modal.classList.add('active');
    modal.style.display = 'flex';
    window.lockBodyScroll();
  };

  window.closeSubmissionWorkspace = function() {
    const modal = document.getElementById('submission-workspace-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
      window.unlockBodyScroll();
      
      const fi = document.getElementById('ws-file-input');
      if (fi) fi.value = '';
      
      window.submissionSelectedFiles = [];
      window.submissionSelectedFileMetadata = [];
      window.renderSubmissionPreviews();
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('ws-file-input');
    const wsUploadArea = document.getElementById('ws-upload-area');
    if (fileInput && !fileInput.dataset.initialized) {
      fileInput.dataset.initialized = 'true';
      
      const processSubFiles = async (files) => {
        window.submissionSelectedFileMetadata = window.submissionSelectedFileMetadata || [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const validationError = validateMediaFile(file);
          if (validationError) {
            showToast(validationError, 'error');
            continue;
          }

          const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
          if (window.submissionSelectedFileMetadata.includes(fileKey)) {
            showToast(`File "${file.name}" is already selected.`, 'warning');
            continue;
          }

          try {
            const modal = document.getElementById('submission-workspace-modal');
            if (modal && !modal.classList.contains('open') && !modal.classList.contains('active')) {
              console.warn('Submission workspace modal is closed, ignoring loaded file.');
              return;
            }
            showToast(`Uploading ${file.name}...`, 'info', 1600);
            const uploadedUrl = await uploadMediaFile(file, 'submissions');
            // Hard guard: uploadMediaFile should NEVER return a data: URI.
            // If it does, the upload.php response is malformed — abort immediately
            // rather than silently poisoning submissionSelectedFiles with base64.
            if (!uploadedUrl || uploadedUrl.startsWith('data:')) {
              throw new Error(`Upload returned invalid URL for ${file.name}. Expected a server path, got base64. Check upload.php.`);
            }
            if (!window.submissionSelectedFiles) window.submissionSelectedFiles = [];
            window.submissionSelectedFiles.push(uploadedUrl);
            window.submissionSelectedFileMetadata.push(fileKey);
            window.renderSubmissionPreviews();
          } catch (err) {
            showToast(err.message || `Failed to upload ${file.name}`, 'error');
          }
        }
      };

      fileInput.addEventListener('change', async function() {
        if (this.files.length) {
          await processSubFiles(this.files);
          this.value = '';
        }
      });

      if (wsUploadArea) {
        wsUploadArea.addEventListener('click', (e) => {
          if (e.target === fileInput) return;
          fileInput.click();
        });
        
        wsUploadArea.addEventListener('dragover', (e) => {
          e.preventDefault();
          wsUploadArea.style.borderColor = 'var(--gold)';
        });
        wsUploadArea.addEventListener('dragleave', () => {
          wsUploadArea.style.borderColor = '';
        });
        wsUploadArea.addEventListener('drop', async (e) => {
          e.preventDefault();
          wsUploadArea.style.borderColor = '';
          if (e.dataTransfer.files.length) {
            await processSubFiles(e.dataTransfer.files);
          }
        });
      }
    }
  });

  window.submitDesignWork = async function() {
    if (!API.isAuthenticated()) {
      window.redirectToLogin();
      return;
    }
    const offerId = window.safeGetVal('ws-offer-id');
    const subId = window.safeGetVal('ws-submission-id');
    const title = window.safeGetVal('ws-design-title').trim();
    const desc = window.safeGetVal('ws-design-desc').trim();
    const clientName = window.safeGetVal('ws-client-name-val');
    const offerTitle = window.safeGetVal('ws-offer-title-val');
    const tags = window.safeGetVal('ws-tags').trim();

    if (!title) { showToast('Please enter a design title', 'error'); return; }
    if (!subId && window.submissionSelectedFiles.length === 0) { showToast('Please upload your design file(s)', 'error'); return; }

    const btn = document.getElementById('ws-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = subId ? '<i class="bx bx-loader-alt bx-spin"></i> Saving changes...' : '<i class="bx bx-loader-alt bx-spin"></i> Uploading design...';
    }

    try {
      // Final URL-only guard — never send base64 to the API
      const safeUrls = (window.submissionSelectedFiles || []).filter(
        v => v && typeof v === 'string' && !v.startsWith('data:')
      );
      console.log('submissionSelectedFiles (raw)', window.submissionSelectedFiles);
      console.log('safeUrls (base64 stripped)', safeUrls);
      // Fail loudly if any base64 survived into submissionSelectedFiles
      const base64Leaks = (window.submissionSelectedFiles || []).filter(v => v && typeof v === 'string' && v.startsWith('data:'));
      if (base64Leaks.length > 0) {
        console.error('[BASE64 LEAK] submissionSelectedFiles contained base64 entries that were stripped:', base64Leaks.length);
        showToast('Warning: some file entries were invalid and removed. Please re-upload if missing.', 'error', 5000);
      }

      let reference_images = null;
      if (safeUrls.length > 0) {
        reference_images = JSON.stringify(safeUrls);
      }

      let response;
      const payload = {
        title: title,
        description: desc + (offerId ? ` (Submitted for Offer #${offerId})` : ''),
        budget: 0,
        deadline: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        package_type: 'basic',
        tags: tags,
      };
      if (reference_images) {
        payload.reference_images = reference_images;
      }

      console.log('reference_images payload', payload.reference_images);
      // Final assertion: confirm NO data: URIs made it into the payload
      if (payload.reference_images) {
        const decoded = JSON.parse(payload.reference_images);
        const bad = decoded.filter(u => u.startsWith('data:'));
        if (bad.length > 0) {
          console.error('[ABORT] payload.reference_images still contains base64 — refusing to submit:', bad.length, 'item(s)');
          showToast('Upload error: base64 data detected in payload. Please re-upload your files.', 'error', 6000);
          if (btn) { btn.disabled = false; btn.innerHTML = subId ? '<i class="bx bx-save"></i> Save Changes' : '<i class="bx bx-send"></i> Submit Design'; }
          return;
        }
      }

      if (subId) {
        response = await API.offers.update(subId, payload);
      } else {
        response = await API.offers.create(payload);
      }

      if (response.success) {
        if (btn) {
          btn.innerHTML = subId ? '<i class="bx bx-check"></i> Saved!' : '<i class="bx bx-check"></i> Submitted!';
          btn.style.background = 'linear-gradient(135deg,#10B981,#28A870)';
          btn.style.color = '#000';
        }
        showToast(subId ? 'Design updated successfully!' : 'Design submitted! Good luck 🎨', 'success');
        setTimeout(() => {
          closeSubmissionWorkspace();
          if (btn) {
            btn.style.background = '';
            btn.style.color = '';
          }
          if (typeof loadProfileData === 'function') loadProfileData();
          verifyAndLoadUser(); // Update navigation/access count dynamically
          if (offerId && window._offerPageCurrentId == offerId) {
            window._offerPageLoadSubs(offerId, false, null);
          }
          if (typeof loadArtworksFromAPI === 'function') loadArtworksFromAPI();
        }, 1200);
      } else {
        showToast(response.message || 'Action failed', 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = subId ? '<i class="bx bx-save"></i> Save Changes' : '<i class="bx bx-send"></i> Submit Design';
        }
      }
    } catch(e) {
      console.error(e);
      showToast('Network error. Try again.', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = subId ? '<i class="bx bx-save"></i> Save Changes' : '<i class="bx bx-send"></i> Submit Design';
      }
    }
  };

  window.acceptSub = async function(offerId, subId) {
    if (!confirm("Are you sure you want to accept this submission as the winning design?")) return;
    try {
      const res = await API.offers.acceptSubmission(offerId, subId);
      if (res.success) {
        showToast("Submission accepted successfully!", "success");
        window.viewOfferDetails(offerId);
      } else {
        showToast(res.message || "Failed to accept submission", "error");
      }
    } catch (e) {
      showToast("Error accepting submission", "error");
    }
  };

  window.rejectSub = async function(offerId, subId) {
    if (!confirm("Are you sure you want to reject this submission?")) return;
    try {
      const res = await API.offers.rejectSubmission(offerId, subId);
      if (res.success) {
        showToast("Submission rejected.", "success");
        window.viewOfferDetails(offerId);
      } else {
        showToast(res.message || "Failed to reject submission", "error");
      }
    } catch (e) {
      showToast("Error rejecting submission", "error");
    }
  };

  window.editSub = function(sub) {
    let parentId = null;
    if (sub.description) {
      const m = sub.description.match(/\(Submitted for Offer #(\d+)\)/);
      if (m) parentId = parseInt(m[1]);
    }
    window.openSubmissionWorkspace({ id: parentId }, sub);
  };

  window.cancelSub = async function(offerId, subId) {
    if (!confirm("Are you sure you want to withdraw this design?")) return;
    try {
      // Use submissions delete endpoint (not offers delete)
      const res = await API.submissions.delete(subId);
      if (res.success) {
        showToast("Design withdrawn successfully.", "success");
        // Remove card from DOM immediately (optimistic UI)
        const card = document.querySelector(`[data-sub-id="${subId}"]`);
        if (card) card.remove();
        // Refresh offer page if on it
        if (window._offerPageCurrentId == offerId) {
          window._offerPageLoadSubs(offerId, false, null);
        } else {
          window.viewOfferDetails(offerId);
        }
        // Refresh profile
        if (typeof loadProfileData === 'function') loadProfileData();
      } else {
        showToast(res.message || "Failed to withdraw design", "error");
      }
    } catch (e) {
      showToast("Error withdrawing design", "error");
    }
  };

  // window.cancelParticipation is defined in the Profile section below (line ~3529)

  window.viewOfferDetails = async function(offerId) {
    // Navigate to full offer page instead of modal
    if (typeof window.loadOfferPage === 'function') {
      window.loadOfferPage(offerId);
      return;
    }
    // Fallback to modal if loadOfferPage not available
    const modal = document.getElementById('offer-detail-modal');
    if (!modal) return;
    
    // Show modal and loading state
    modal.classList.add('active');
    modal.style.display = 'flex';
    window.lockBodyScroll();
    
    document.getElementById('od-campaign-title').textContent = 'Loading details...';
    document.getElementById('od-campaign-desc').textContent = 'Fetching contest specifications...';
    document.getElementById('od-campaign-budget').textContent = '$0.00';
    document.getElementById('od-campaign-client').textContent = '—';
    document.getElementById('od-campaign-deadline').textContent = '—';
    document.getElementById('od-campaign-tags').innerHTML = '—';
    document.getElementById('od-submissions-count').textContent = '0';
    document.getElementById('od-submissions-grid').innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding:40px; color:var(--text-secondary);">
        <i class='bx bx-loader-alt bx-spin' style="font-size:2.5rem; color:var(--gold); margin-bottom:12px; display:block;"></i>
        Fetching submissions...
      </div>`;
    document.getElementById('od-accept-container').style.display = 'none';
    document.getElementById('od-submit-work-container').style.display = 'none';

    try {
      const offerRes = await API.offers.getById(offerId);
      if (!offerRes || !offerRes.success) {
        showToast('Campaign not found or deleted.', 'error');
        closeOfferDetailModal();
        return;
      }
      
      const offer = offerRes.data;
      
      // Set details
      document.getElementById('od-campaign-title').textContent = offer.title || 'Untitled Campaign';
      document.getElementById('od-campaign-desc').innerHTML = window.formatMentions(offer.description || 'No description provided.');
      document.getElementById('od-campaign-budget').textContent = '$' + parseFloat(offer.budget || 0).toLocaleString();
      document.getElementById('od-campaign-client').textContent = offer.client_name || offer.client_username || 'Host';
      document.getElementById('od-campaign-deadline').textContent = offer.deadline ? new Date(offer.deadline).toLocaleDateString() : '—';
      
      // Tags
      const tagsEl = document.getElementById('od-campaign-tags');
      tagsEl.innerHTML = '';
      if (offer.tags) {
        const parts = offer.tags.split(',').map(t => t.trim()).filter(Boolean);
        if (parts.length > 0) {
          parts.forEach(t => {
            const span = document.createElement('span');
            span.style.background = 'rgba(212,175,55,0.1)';
            span.style.color = 'var(--gold)';
            span.style.border = '1px solid rgba(212,175,55,0.2)';
            span.style.borderRadius = '20px';
            span.style.padding = '2px 8px';
            span.style.fontSize = '0.72rem';
            span.textContent = t;
            tagsEl.appendChild(span);
          });
        } else {
          tagsEl.textContent = 'None';
        }
      } else {
        tagsEl.textContent = 'None';
      }

      // Check current user relationships
      const currentUser = API.getCurrentUser();
      const isOwner = currentUser && parseInt(currentUser.user_id) === parseInt(offer.user_id);
      const isDesigner = currentUser && currentUser.roles && currentUser.roles.includes('designer');
      
      let appData = null;
      if (currentUser && API.isAuthenticated()) {
        try {
          const appRes = await fetch(`/again/api/offers/${offerId}/my-application`, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${API.getToken()}`
            }
          });
          const appJson = await appRes.json();
          if (appJson.success) appData = appJson.data;
        } catch(e) {
          console.warn('Error fetching my-application:', e);
        }
      }

      // Campaign Owner actions vs Designer actions
      if (isDesigner && offer.status === 'active') {
        if (!appData) {
          // Hasn't accepted yet
          document.getElementById('od-accept-container').style.display = 'block';
          document.getElementById('od-accept-btn').onclick = async () => {
            const acceptBtn = document.getElementById('od-accept-btn');
            acceptBtn.disabled = true;
            acceptBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Accepting...";
            
            const res = await API.offers.applyToOffer(offerId, "Accepted Campaign");
            if (res.success) {
              showToast("Campaign accepted! You can now submit designs.", "success");
              window.viewOfferDetails(offerId);
            } else {
              showToast(res.message || "Failed to accept campaign", "error");
              acceptBtn.disabled = false;
              acceptBtn.innerHTML = "<i class='bx bx-check-circle'></i> Take Offer";
            }
          };
          document.getElementById('od-submit-work-container').style.display = 'none';
        } else if (appData.status === 'accepted') {
          // Has accepted, can submit design
          document.getElementById('od-accept-container').style.display = 'none';
          document.getElementById('od-submit-work-container').style.display = 'block';
          document.getElementById('od-submit-work-btn').onclick = () => {
            window.openSubmissionWorkspace({
              id: offer.id,
              title: offer.title,
              budget: offer.budget,
              client_name: offer.client_name || offer.client_username || 'Host'
            });
          };
        } else {
          document.getElementById('od-accept-container').style.display = 'none';
          document.getElementById('od-submit-work-container').style.display = 'none';
        }
      } else {
        document.getElementById('od-accept-container').style.display = 'none';
        document.getElementById('od-submit-work-container').style.display = 'none';
      }

      // Fetch Submissions
      const subRes = await API.offers.getSubmissions(offerId);
      const grid = document.getElementById('od-submissions-grid');
      grid.innerHTML = '';
      
      if (subRes && subRes.success && subRes.data && subRes.data.length > 0) {
        document.getElementById('od-submissions-count').textContent = subRes.data.length;
        
        subRes.data.forEach(sub => {
          const subMediaHtml = renderPostMedia(sub.reference_images, sub.id);
          const isSubOwner = currentUser && parseInt(currentUser.user_id) === parseInt(sub.user_id);
          
          const card = document.createElement('div');
          card.className = 'glass';
          card.style.borderRadius = '16px';
          card.style.overflow = 'hidden';
          card.style.border = '1px solid rgba(255,255,255,0.08)';
          card.style.display = 'flex';
          card.style.flexDirection = 'column';
          card.style.padding = '12px';
          card.style.gap = '12px';
          card.style.background = 'rgba(255,255,255,0.02)';
          
          let actionButtonsHtml = '';
          if (isOwner && offer.status === 'active' && sub.status !== 'accepted') {
            actionButtonsHtml = `
              <div style="display:flex; gap:8px; margin-top:8px;">
                <button class="btn btn-gold btn-sm" onclick="window.acceptSub(${offerId}, ${sub.id})" style="flex:1; padding: 6px 12px; font-size:0.75rem;">
                  <i class='bx bx-check'></i> Accept
                </button>
                <button class="btn btn-secondary btn-sm" onclick="window.rejectSub(${offerId}, ${sub.id})" style="flex:1; padding: 6px 12px; font-size:0.75rem; border-color:rgba(225,29,72,0.3); color:rgb(232,70,90);">
                  <i class='bx bx-x'></i> Reject
                </button>
              </div>
            `;
          } else if (isSubOwner && offer.status === 'active' && sub.status !== 'accepted') {
            const safeSubJson = JSON.stringify(sub).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            actionButtonsHtml = `
              <div style="display:flex; gap:8px; margin-top:8px;">
                <button class="btn btn-gold btn-sm" onclick="window.editSub(${safeSubJson})" style="flex:1; padding: 6px 12px; font-size:0.75rem;">
                  <i class='bx bx-edit'></i> Edit
                </button>
                <button class="btn btn-secondary btn-sm" onclick="window.cancelSub(${offerId}, ${sub.id})" style="flex:1; padding: 6px 12px; font-size:0.75rem;">
                  <i class='bx bx-trash'></i> Withdraw
                </button>
              </div>
            `;
          }

          let badgeColor = 'rgba(212,175,55,0.15)';
          let badgeText = sub.status || 'Applied';
          let badgeTextColor = 'var(--gold)';
          if (sub.status === 'accepted') {
            badgeColor = 'rgba(16,185,129,0.15)';
            badgeTextColor = 'rgb(60,232,157)';
            badgeText = 'WINNING DESIGN';
          } else if (sub.status === 'rejected') {
            badgeColor = 'rgba(225,29,72,0.15)';
            badgeTextColor = 'rgb(232,70,90)';
          }

          card.innerHTML = `
            <div style="position:relative; width:100%; height:180px; border-radius:10px; overflow:hidden; background: var(--surface-2);">
              ${subMediaHtml}
              <span style="position:absolute; top:8px; right:8px; background:${badgeColor}; color:${badgeTextColor}; border:1px solid ${badgeTextColor}33; font-size:0.68rem; font-weight:700; padding:2px 8px; border-radius:12px; text-transform:uppercase; letter-spacing:0.05em; z-index:3;">
                ${badgeText}
              </span>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px; flex:1;">
              <h4 style="font-size:0.92rem; font-weight:700; margin:0; color:var(--text);">${escapeHtml(sub.title)}</h4>
              <p style="font-size:0.78rem; color:var(--text-secondary); margin:0; line-height:1.4; display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                ${window.formatMentions(sub.description.replace(/\(Submitted for Offer #\d+\)/g, '').trim())}
              </p>
              <div style="display:flex; align-items:center; gap:8px; margin-top:4px; font-size:0.75rem; color:var(--text-secondary);">
                <i class='bx bx-user' style="color:var(--gold);"></i> By <strong>${escapeHtml(sub.full_name || sub.username || 'Designer')}</strong>
              </div>
            </div>
            
            <div class="vote-slider-wrap" data-offer-id="${sub.id}" style="margin-top:4px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.05);">
              <div class="vs-header" style="margin-bottom:6px;">
                <span class="vs-title" style="font-size:0.75rem;">Rate Design</span>
                <div class="vs-score-badge">
                  <span class="vs-num">5</span><span class="vs-scale">/10</span>
                </div>
              </div>
              <div class="vs-track-container" style="height:22px;">
                <div class="vs-arrow vs-arrow-left" style="width:20px;height:20px;font-size:0.7rem;"><i class='bx bxs-left-arrow'></i></div>
                <div class="vs-track" style="height:4px;">
                  <div class="vs-fill"></div>
                  <div class="vs-glow"></div>
                  <div class="vs-thumb" tabindex="0" style="width:14px;height:14px;top:-5px;"></div>
                  <div class="vs-ticks" style="display:none;"></div>
                </div>
                <div class="vs-arrow vs-arrow-right" style="width:20px;height:20px;font-size:0.7rem;"><i class='bx bxs-right-arrow'></i></div>
              </div>
              <div class="vs-footer" style="margin-top:4px;">
                <span class="vs-label" style="font-size:0.7rem;">Neutral</span>
              </div>
            </div>
            
            ${actionButtonsHtml}
          `;
          
          grid.appendChild(card);
        });
        
        setTimeout(() => {
          if (typeof initVoting === 'function') initVoting();
        }, 50);

      } else {
        document.getElementById('od-submissions-count').textContent = '0';
        grid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align:center; padding:40px; color:var(--text-secondary);">
            <i class='bx bx-palette' style="font-size:3rem; opacity:0.3; margin-bottom:12px; display:block;"></i>
            No designs submitted yet. Be the first to submit!
          </div>`;
      }

    } catch(e) {
      console.error(e);
      showToast('Error loading campaign details.', 'error');
    }
  };

  window.closeOfferDetailModal = function() {
    const modal = document.getElementById('offer-detail-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
      window.unlockBodyScroll();
    }
  };
  
  function getTimeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return days < 7 ? `${days}d ago` : date.toLocaleDateString();
  }
  window.getTimeAgo = getTimeAgo;

  /* ── Media Carousel & Lightbox Helper Functions ── */
  window.renderPostMedia = function(referenceImages, offerId) {
    if (!referenceImages) return '<div class="no-media-placeholder"><i class="bx bx-image"></i></div>';
    
    let mediaItems = [];
    try {
      const parsed = typeof referenceImages === 'string' ? JSON.parse(referenceImages) : referenceImages;
      if (Array.isArray(parsed)) {
        mediaItems = parsed.filter(Boolean);
      } else if (typeof parsed === 'string') {
        mediaItems = [parsed];
      }
    } catch (e) {
      if (typeof referenceImages === 'string') {
        mediaItems = [referenceImages];
      }
    }

    if (mediaItems.length === 0) {
      return '<div class="no-media-placeholder"><i class="bx bx-image"></i></div>';
    }

    const isVideoItem = (src) => {
      if (!src) return false;
      return src.startsWith('data:video/') || 
             src.endsWith('.mp4') || 
             src.endsWith('.webm') || 
             src.endsWith('.ogg') || 
             src.endsWith('.mov') ||
             src.includes('video');
    };

    const escapedJson = JSON.stringify(mediaItems).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    if (mediaItems.length === 1) {
      const item = mediaItems[0];
      if (isVideoItem(item)) {
        return `<video src="${item}" class="post-media-item" controls loop muted playsinline style="width:100%; height:100%; object-fit:cover; display:block;"></video>`;
      } else {
        return `<img src="${item}" class="post-media-item" alt="Post media" style="width:100%; height:100%; object-fit:cover; display:block; cursor:pointer;" onclick="window.openLightbox(event, 0, '${escapedJson}')">`;
      }
    }

    // Multi-media Carousel
    const carouselId = `carousel-${offerId || Math.random().toString(36).substr(2, 9)}`;
    window.carouselStates = window.carouselStates || {};
    window.carouselStates[carouselId] = 0; // Current active index

    let slidesHtml = '';
    let dotsHtml = '';

    mediaItems.forEach((item, index) => {
      const isVid = isVideoItem(item);
      const activeClass = index === 0 ? 'active' : '';
      
      let slideContent = '';
      if (isVid) {
        slideContent = `<video src="${item}" class="post-media-item" controls loop muted playsinline style="width:100%; height:100%; object-fit:cover; display:block;"></video>`;
      } else {
        slideContent = `<img src="${item}" class="post-media-item" alt="Slide ${index + 1}" style="width:100%; height:100%; object-fit:cover; display:block; cursor:pointer;" onclick="window.openLightbox(event, ${index}, '${escapedJson}')">`;
      }

      slidesHtml += `<div class="carousel-slide ${activeClass}" data-index="${index}">${slideContent}</div>`;
      dotsHtml += `<span class="carousel-dot ${activeClass}" onclick="window.setCarouselSlide('${carouselId}', ${index})" data-index="${index}"></span>`;
    });

    return `
      <div class="media-carousel" id="${carouselId}" style="position:relative; width:100%; height:100%; overflow:hidden;">
        <div class="carousel-track" style="display:flex; width:100%; height:100%; position:relative;">
          ${slidesHtml}
        </div>
        <button class="carousel-btn prev-btn" onclick="event.preventDefault(); event.stopPropagation(); window.slideCarousel('${carouselId}', -1)" aria-label="Previous slide">
          <i class='bx bx-chevron-left'></i>
        </button>
        <button class="carousel-btn next-btn" onclick="event.preventDefault(); event.stopPropagation(); window.slideCarousel('${carouselId}', 1)" aria-label="Next slide">
          <i class='bx bx-chevron-right'></i>
        </button>
        <div class="carousel-dots" style="position:absolute; bottom:12px; left:50%; transform:translateX(-50%); display:flex; gap:6px; z-index:4;">
          ${dotsHtml}
        </div>
      </div>
    `;
  };

  window.slideCarousel = function(carouselId, direction) {
    const carousel = document.getElementById(carouselId);
    if (!carousel) return;
    const slides = carousel.querySelectorAll('.carousel-slide');
    const dots = carousel.querySelectorAll('.carousel-dot');
    if (slides.length <= 1) return;

    let currentIndex = window.carouselStates[carouselId] || 0;
    slides[currentIndex].classList.remove('active');
    dots[currentIndex].classList.remove('active');

    currentIndex = (currentIndex + direction + slides.length) % slides.length;
    window.carouselStates[carouselId] = currentIndex;

    slides[currentIndex].classList.add('active');
    dots[currentIndex].classList.add('active');
  };

  window.setCarouselSlide = function(carouselId, index) {
    const carousel = document.getElementById(carouselId);
    if (!carousel) return;
    const slides = carousel.querySelectorAll('.carousel-slide');
    const dots = carousel.querySelectorAll('.carousel-dot');
    if (slides.length <= 1 || index < 0 || index >= slides.length) return;

    let currentIndex = window.carouselStates[carouselId] || 0;
    slides[currentIndex].classList.remove('active');
    dots[currentIndex].classList.remove('active');

    currentIndex = index;
    window.carouselStates[carouselId] = currentIndex;

    slides[currentIndex].classList.add('active');
    dots[currentIndex].classList.add('active');
  };

  let currentLightboxItems = [];
  let currentLightboxIndex = 0;

  window.openLightbox = function(event, index, itemsJsonStr) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    try {
      currentLightboxItems = JSON.parse(itemsJsonStr);
      currentLightboxIndex = index;
      
      const modal = document.getElementById('lightbox-modal');
      if (!modal) return;
      
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      
      renderLightboxItem();
    } catch(e) {
      console.error('Lightbox open error:', e);
    }
  };

  function renderLightboxItem() {
    const content = document.getElementById('lightbox-content');
    const counter = document.getElementById('lightbox-counter');
    const prevBtn = document.getElementById('lightbox-prev-btn');
    const nextBtn = document.getElementById('lightbox-next-btn');
    if (!content) return;

    if (currentLightboxItems.length === 0) {
      content.innerHTML = '';
      return;
    }

    const src = currentLightboxItems[currentLightboxIndex];
    const isVideo = src.startsWith('data:video/') || 
                    src.endsWith('.mp4') || 
                    src.endsWith('.webm') || 
                    src.endsWith('.ogg') || 
                    src.endsWith('.mov') ||
                    src.includes('video');

    if (isVideo) {
      content.innerHTML = `<video src="${src}" controls autoplay loop style="max-width:100%; max-height:85vh; border-radius:8px; box-shadow:0 10px 40px rgba(0,0,0,0.8);"></video>`;
    } else {
      content.innerHTML = `<img src="${src}" alt="Lightbox media" style="max-width:100%; max-height:85vh; object-fit:contain; border-radius:8px; box-shadow:0 10px 40px rgba(0,0,0,0.8);">`;
    }

    if (counter) {
      counter.textContent = `${currentLightboxIndex + 1} / ${currentLightboxItems.length}`;
    }

    if (prevBtn && nextBtn) {
      if (currentLightboxItems.length <= 1) {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
      } else {
        prevBtn.style.display = 'flex';
        nextBtn.style.display = 'flex';
      }
    }
  }

  window.closeLightbox = function() {
    const modal = document.getElementById('lightbox-modal');
    if (modal) {
      modal.style.display = 'none';
    }
    document.body.style.overflow = '';
    const content = document.getElementById('lightbox-content');
    if (content) content.innerHTML = '';
  };

  window.lightboxNext = function() {
    if (currentLightboxItems.length <= 1) return;
    currentLightboxIndex = (currentLightboxIndex + 1) % currentLightboxItems.length;
    renderLightboxItem();
  };

  window.lightboxPrev = function() {
    if (currentLightboxItems.length <= 1) return;
    currentLightboxIndex = (currentLightboxIndex - 1 + currentLightboxItems.length) % currentLightboxItems.length;
    renderLightboxItem();
  };

  function initLightboxEvents() {
    const closeBtn = document.getElementById('lightbox-close-btn');
    const prevBtn = document.getElementById('lightbox-prev-btn');
    const nextBtn = document.getElementById('lightbox-next-btn');
    const modal = document.getElementById('lightbox-modal');

    if (closeBtn) closeBtn.onclick = window.closeLightbox;
    if (prevBtn) prevBtn.onclick = window.lightboxPrev;
    if (nextBtn) nextBtn.onclick = window.lightboxNext;
    
    if (modal) {
      modal.onclick = (e) => {
        if (e.target === modal || e.target.id === 'lightbox-content') {
          window.closeLightbox();
        }
      };
    }

    document.addEventListener('keydown', (e) => {
      const modal = document.getElementById('lightbox-modal');
      if (!modal || modal.style.display === 'none') return;

      if (e.key === 'Escape') {
        window.closeLightbox();
      } else if (e.key === 'ArrowRight') {
        window.lightboxNext();
      } else if (e.key === 'ArrowLeft') {
        window.lightboxPrev();
      }
    });
  }

  /* ── Init All ── */
  document.addEventListener('DOMContentLoaded', () => {
    try { initSplash(); } catch(e) { console.warn('initSplash error:', e); }
    try { initTheme(); } catch(e) { console.warn('initTheme error:', e); }
    try { initSidebar(); } catch(e) { console.warn('initSidebar error:', e); }
    try { initNavigation(); } catch(e) { console.warn('initNavigation error:', e); }
    try { initFilters(); } catch(e) { console.warn('initFilters error:', e); }
    try { initModals(); } catch(e) { console.warn('initModals error:', e); }
    try { initVoting(); } catch(e) { console.warn('initVoting error:', e); }
    try { initComments(); } catch(e) { console.warn('initComments error:', e); }
    try { initUpload(); } catch(e) { console.warn('initUpload error:', e); }
    try { initSubmitPost(); } catch(e) { console.warn('initSubmitPost error:', e); }
    try { initSettings(); } catch(e) { console.warn('initSettings error:', e); }
    try { initVideoVotes(); } catch(e) { console.warn('initVideoVotes error:', e); }
    try { initLightboxEvents(); } catch(e) { console.warn('initLightboxEvents error:', e); }

    try { initProfileTabs(); } catch(e) { console.warn('initProfileTabs error:', e); }
    try { triggerReveals(); } catch(e) { console.warn('triggerReveals error:', e); }
    
    // Load cached user immediately, then verify async
    const cachedUser = API.getCurrentUser();
    if (cachedUser) updateUIWithUser(cachedUser);

    // Logout handler
    const logoutBtn = document.querySelector('#logout-btn, [data-action="logout"]');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await API.auth.logout();
        window.location.href = 'login.html';
      });
    }

    // Load real data from API
    setTimeout(() => {
      if (API.isAuthenticated()) {
        try { verifyAndLoadUser(); } catch(e) { console.warn('verifyUser error:', e); }
        try { loadOfferHub(); } catch(e) { console.warn('loadOfferHub error:', e); }
        // Check if user has offers → show Hub nav
        API.offers.getUserOffers().then(res => {
          const myOffers = (res && res.success && res.data) ? res.data.filter(o => !o.description || !o.description.includes('Submitted for Offer #')) : [];
          const navHub = document.getElementById('nav-offer-hub');
          if (navHub) navHub.style.display = myOffers.length > 0 ? 'flex' : 'none';
        }).catch(() => {});
        // Load wallet balance
        API.wallet.getBalance().then(res => {
          if (res && res.success && res.data) {
            const walletEl = document.querySelector('.wallet-amount');
            if (walletEl) walletEl.textContent = '$' + parseFloat(res.data.balance || 0).toFixed(2);
          }
        }).catch(() => {});
      } else {
        updateUIWithUser(null);
      }
      try { loadArtworksFromAPI(); } catch(e) { console.warn('loadArtworks error:', e); }
      try { loadOffersFromAPI(); } catch(e) { console.warn('loadOffers error:', e); }

      // Notification polling
      async function pollNotifications() {
        if (!API.isAuthenticated()) return;
        try {
          const res = await API.notifications.getUnreadCount();
          if (res && res.success && res.data) {
            const count = res.data.count || res.data.unread_count || 0;
            const badges = document.querySelectorAll('.notification-badge');
            badges.forEach(b => {
              b.textContent = count;
              b.style.display = count > 0 ? 'flex' : 'none';
            });
          }
        } catch(e) { /* silent */ }
      }

      // Real-time synchronization polling every 5 seconds
      // ── Smart poll: only append NEW items to home feed, never full re-render ──
    async function _pollNewArtworks() {
      const grid = $('#artwork-feed');
      if (!grid) return;
      // If feed is empty or showing skeleton, do a full load instead
      const existingCards = grid.querySelectorAll('[data-offer-id]');
      if (existingCards.length === 0) {
        return loadArtworksFromAPI();
      }
      try {
        const response = await API.offers.getAll(1, 100, feedStatus, feedCategory, feedSearch, feedSort);
        const allData = (response && response.success && Array.isArray(response.data)) ? response.data : [];
        const data = allData.filter(o => o.description && o.description.includes('Submitted for Offer #'));
        // Collect existing rendered IDs
        const existingIds = new Set([...existingCards].map(c => parseInt(c.getAttribute('data-offer-id'))));
        const newItems = data.filter(o => !existingIds.has(o.id));
        if (newItems.length === 0) return; // Nothing new — no flicker
        feedLog(`[Feed] Poll found ${newItems.length} new items — appending`);
        // Prepend new items to top
        newItems.reverse().forEach(offer => {
          if (existingIds.has(offer.id)) return;
          const card = document.createElement('article');
          card.className = 'post-card glass reveal visible';
          card.setAttribute('data-offer-id', offer.id);
          card.style.animation = 'fadeInDown 0.4s ease';
          const uname = offer.username || 'artist';
          const mediaHtml = renderPostMedia(offer.reference_images, offer.id);
          const timeAgo = getTimeAgo(offer.created_at);
          const mentionBadge = offer.parent_offer_id ? `<span class="mention-tag" onclick="window.loadOfferPage ? window.loadOfferPage(${offer.parent_offer_id}) : window.viewOfferDetails(${offer.parent_offer_id});event.stopPropagation();">@${(offer.parent_offer_title||'Offer').replace(/\s+/g,'')}</span> ` : '';
          card.innerHTML = `<div class="post-header"><div class="user-info"><div class="user-avatar" style="background:linear-gradient(135deg,var(--gold),var(--pink));">${uname.charAt(0).toUpperCase()}</div><div><h4>@${uname}</h4><p class="time">${timeAgo}</p></div></div></div><div class="post-media-container" style="position:relative; width:100%; aspect-ratio:4/3; overflow:hidden;">${mediaHtml}</div><div class="post-body"><h3 class="post-title" style="cursor:pointer;" onclick="window.loadOfferPage ? window.loadOfferPage(${offer.id}) : window.viewOfferDetails(${offer.id})">${mentionBadge}${escapeHtml(offer.title)}</h3></div><div class="post-actions" style="flex-direction:column;align-items:stretch;gap:12px;"><div class="vote-slider-wrap vs-initial" data-offer-id="${offer.id}" data-initial-val="${Math.round(offer.vote_average||5)}"><p class="vs-hint">${offer.total_votes||0} votes</p></div></div><div class="comments-section" data-offer-id="${offer.id}" style="display:none;"><div class="comments-list" style="max-height:140px;overflow-y:auto;margin-bottom:10px;"></div><div class="comment-input-row"><input type="text" class="form-input comment-input" placeholder="Add a comment…"><button class="btn btn-ghost btn-sm post-comment-btn">Post</button></div></div>`;
          grid.prepend(card);
        });
        if (newItems.length > 0) {
          setTimeout(() => { initVoting(); initComments(); }, 100);
        }
      } catch(e) {
        console.warn('[Feed] Poll error (silent):', e);
      }
    }

    async function runSyncPolling() {
        // Lock: skip if previous poll still running
        if (window._syncPollingRunning) return;
        window._syncPollingRunning = true;
        try {
        await pollNotifications();

        // Avoid polling updates if user is currently interacting
        const isUserInteracting =
          document.activeElement &&
          (document.activeElement.tagName === 'INPUT' ||
           document.activeElement.tagName === 'TEXTAREA' ||
           document.activeElement.isContentEditable ||
           document.querySelector('.vs-thumb--dragging'));

        if (isUserInteracting) {
          window._syncPollingRunning = false;
          return;
        }

        // ── Smart polling: only full reload on page-offers/profile, append-only on page-home ──
        const activeSection = document.querySelector('.page-section.active');
        if (activeSection) {
          const id = activeSection.id;
          if (id === 'page-home') {
            // Append-only: don't full re-render, only add new items
            await _pollNewArtworks();
          } else if (id === 'page-offers') {
            await loadOffersFromAPI();
          } else if (id === 'page-profile') {
            await loadProfileData();
            await loadOfferHub();
          }
        }
        } catch(e) {
          console.warn('[Poll] runSyncPolling error:', e);
        } finally {
          window._syncPollingRunning = false;
        }
      }

      // Expose local functions globally so they can be called by outside actions (like profile cancellations)
      window.loadOffersFromAPI = loadOffersFromAPI;
      window.loadArtworksFromAPI = loadArtworksFromAPI;

      // ── Single interval guard — prevent multiple intervals ──
      if (window._syncPollingInterval) {
        clearInterval(window._syncPollingInterval);
      }
      window.populateOfferNameCache && window.populateOfferNameCache();
      runSyncPolling();
      window._syncPollingInterval = setInterval(runSyncPolling, 5000);
    }, 500);
  });
 
})();

const escapeHtml = window.escapeHtml || ((str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
});
 
// ════════════════════════════════════════
// Global Navigation Helper
// ════════════════════════════════════════
window.navigateTo = function(pageId) {
  if (typeof window.checkRouteAccess === 'function' && !window.checkRouteAccess(pageId)) {
    window.navigateTo('page-home');
    return;
  }
  const sections = document.querySelectorAll('.page-section');
  const navItems = document.querySelectorAll('[data-page]');
  
  // Clear any dynamic inline overrides from isolated pages
  sections.forEach(s => s.style.display = '');
  const aboutSection = document.getElementById('about-us-section');
  if (aboutSection) {
    aboutSection.style.display = '';
    aboutSection.classList.remove('active');
  }
  
  // Update sections
  sections.forEach(s => s.classList.remove('active'));
  const targetSection = document.getElementById(pageId);
  if (targetSection) {
    targetSection.classList.add('active');
  }
  
  // Update nav items
  navItems.forEach(n => {
    if (n.dataset.page === pageId) {
      n.classList.add('active');
    } else {
      n.classList.remove('active');
    }
  });
  
  // Update topbar title
  const titles = {
    'page-home':       'Trending Creates',
    'page-offers':     'Active Offers',
    'page-profile':    'My Profile',
    'page-settings':   'Account Settings',
  };
  const topbarTitle = document.querySelector('.topbar-title');
  if (topbarTitle) topbarTitle.textContent = titles[pageId] || '';
  
  // About-us body class management
  if (pageId === 'about-us-section') {
    document.body.classList.add('about-active');
  } else {
    document.body.classList.remove('about-active');
  }

  // Clear offer page polling when navigating away
  if (pageId !== 'page-offer-detail') {
    if (window._offerPagePollingId) {
      clearInterval(window._offerPagePollingId);
      window._offerPagePollingId = null;
    }
    window._offerPageCurrentId = null;
  }

  // Load profile data when navigating to profile
  if (pageId === 'page-profile' && typeof loadProfileData === 'function') loadProfileData();
  if (pageId === 'page-settings' && typeof window.loadSettingsData === 'function') window.loadSettingsData();
  if (pageId === 'page-offer-hub' && typeof window.loadOfferHubPage === 'function') window.loadOfferHubPage();
  if (pageId === 'page-designer-artworks' && typeof window.loadDesignerArtworks === 'function') window.loadDesignerArtworks();
  
  // Scroll to top
  const mainContent = document.querySelector('.main-content');
  if (mainContent) mainContent.scrollTop = 0;
  
  // Close mobile sidebar
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  if (window.innerWidth <= 900) {
    sidebar && sidebar.classList.remove('open');
    overlay && overlay.classList.remove('open');
  }

  // Trigger reveals
  if (typeof triggerReveals === 'function') {
    try { triggerReveals(); } catch(e) {}
  }
};

// ══════════════════════════════════════════════════════════
// PROFILE DATA LOADER — Real API data
// ══════════════════════════════════════════════════════════

async function loadProfileData() {
  const user = API.getCurrentUser();
  if (!user) return;

  // Update hero
  const nameEl = document.getElementById('profile-display-name');
  const bioEl = document.getElementById('profile-bio');
  if (nameEl) nameEl.innerHTML = `@${user.username} <span class="badge badge-gold" style="font-size:0.8rem;">${user.roles?.includes('designer') ? 'Designer' : 'Member'}</span>`;
  if (bioEl) bioEl.textContent = user.bio || 'No bio yet. Click "Edit Profile" to add one.';

  // Avatar
  const avatarEl = document.getElementById('profile-avatar-display');
  if (avatarEl) {
    if (user.avatar_url) {
      avatarEl.textContent = '';
      avatarEl.style.backgroundImage = `url('${user.avatar_url}')`;
      avatarEl.style.backgroundSize = 'cover';
      avatarEl.style.backgroundPosition = 'center';
    } else {
      const fallbackUrl = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.username || 'User') + '&background=E8B842&color=fff&size=150';
      avatarEl.textContent = '';
      avatarEl.style.backgroundImage = `url('${fallbackUrl}')`;
      avatarEl.style.backgroundSize = 'cover';
      avatarEl.style.backgroundPosition = 'center';
    }
  }

  // Load wallet & earnings
  try {
    const walletRes = await API.wallet.getBalance();
    if (walletRes && walletRes.success && walletRes.data) {
      const statEarnings = document.getElementById('stat-earnings');
      if (statEarnings) statEarnings.textContent = '$' + parseFloat(walletRes.data.total_earned || 0).toLocaleString();
    }
  } catch (e) { console.warn('Wallet load error:', e); }

  // Load designer submissions & stats dynamically
  try {
    const res = await API.offers.getUserOffers();
    const offers = (res && res.success && res.data) ? res.data : [];
    
    // Filter for submissions (i.e. description contains "Submitted for Offer #")
    const submissions = offers.filter(o => o.description && o.description.includes('Submitted for Offer #'));
    
    let totalVotes = 0;
    let totalRatingSum = 0;
    let ratedCount = 0;
    
    submissions.forEach(o => {
      const tv = parseInt(o.total_votes || 0);
      totalVotes += tv;
      const va = parseFloat(o.vote_average || 0);
      if (va > 0) {
        totalRatingSum += va;
        ratedCount++;
      }
    });
    
    const avgRating = ratedCount > 0 ? (totalRatingSum / ratedCount).toFixed(1) : '0.0';
    
    const statArtworks = document.getElementById('stat-contributions');
    if (statArtworks) statArtworks.textContent = submissions.length;
    
    const statAvg = document.getElementById('stat-avg-score');
    if (statAvg) statAvg.textContent = avgRating;
    
    const grid = document.getElementById('portfolio-grid');
    if (grid) {
      if (submissions.length === 0) {
        grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);grid-column:1/-1;"><p style="margin-top:8px;">No design submissions found in your portfolio yet.</p></div>';
      } else {
        grid.innerHTML = submissions.map(o => {
          const mediaHtml = renderPostMedia(o.reference_images, o.id);
          const escapedTitle = typeof escapeHtml === 'function' ? escapeHtml(o.title || 'Untitled Design') : (o.title || 'Untitled Design');
          // @mention badge from parent offer
          const match = o.description && o.description.match(/\(Submitted for Offer #(\d+)\)/);
          const parentId = o.parent_offer_id || (match ? match[1] : null);
          const parentTitle = o.parent_offer_title || (match ? `Offer #${match[1]}` : null);
          const mentionBadge = parentTitle ? `<span class="mention-tag" onclick="window.loadOfferPage && window.loadOfferPage(${parentId})" style="cursor:pointer;font-size:0.68rem;">@${parentTitle.replace(/\s+/g,'')}</span>` : '';
          // Status badge
          const status = o.user_application_status || o.status || 'pending';
          const statusColors = { accepted: '#10B981', rejected: '#E11D48', applied: '#D4AF37' };
          const statusColor = statusColors[status] || '#D4AF37';
          return `<div class="glass card" style="overflow:hidden;border-radius:16px;display:flex;flex-direction:column;position:relative;cursor:pointer;" onclick="window.loadOfferPage ? window.loadOfferPage(${o.id}) : window.viewOfferDetails(${o.id})">
            <div class="artwork-card-media" style="height:150px; overflow:hidden; position:relative; background: var(--surface-2); display:flex; align-items:center; justify-content:center;">
              <span style="position:absolute;top:8px;right:8px;background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}44;font-size:0.65rem;font-weight:700;padding:2px 8px;border-radius:12px;text-transform:uppercase;z-index:3;">${status}</span>
              ${mediaHtml}
            </div>
            <div style="padding:12px;">
              <h4 style="margin:0 0 4px;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapedTitle}</h4>
              ${mentionBadge}
              <p style="font-size:0.75rem;color:var(--text-secondary);margin:4px 0 0;">Votes: ${o.total_votes || 0} · Rating: ${parseFloat(o.vote_average || 0).toFixed(1)}/10</p>
            </div>
          </div>`;
        }).join('');
      }
    }
  } catch (e) {
    console.warn('Portfolio load error:', e);
    const statArtworks = document.getElementById('stat-contributions');
    if (statArtworks) statArtworks.textContent = '0';
    const statAvg = document.getElementById('stat-avg-score');
    if (statAvg) statAvg.textContent = '0.0';
    const grid = document.getElementById('portfolio-grid');
    if (grid) {
      grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);grid-column:1/-1;"><p style="margin-top:8px;">Failed to load portfolio items.</p></div>';
    }
  }

  // ── Load My Offers (accepted / participating offers) → my-offers-list ──
  try {
    const [appRes, offersRes] = await Promise.all([
      API.offers.getApplications(), // fetches GET /user/applications
      API.offers.getUserOffers()    // fetches user's own submissions
    ]);

    console.log('API.offers.getApplications response:', JSON.stringify(appRes, null, 2));
    console.log('API.offers.getUserOffers response:', JSON.stringify(offersRes, null, 2));

    const applications = (appRes && appRes.success && Array.isArray(appRes.data)) ? appRes.data : [];
    const ownOffers = (offersRes && offersRes.success && Array.isArray(offersRes.data)) ? offersRes.data : [];

    // Submissions have description matching format: contains "Submitted for Offer #X"
    const ownSubmissions = ownOffers.filter(o => o.description && o.description.includes('Submitted for Offer #'));
    // Client offers (offers created by current user as a client)
    const clientOffers = ownOffers.filter(o => !o.description || !o.description.includes('Submitted for Offer #'));

    const listContainer = document.getElementById('my-offers-list');
    if (listContainer) {
      if (applications.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-secondary);grid-column:1/-1;">
          <i class="bx bx-briefcase" style="font-size:2.5rem;opacity:0.25;color:var(--gold);"></i>
          <p style="margin-top:10px;font-size:0.88rem;">No offers found.</p>
          <p style="font-size:0.78rem;color:var(--text-secondary);opacity:0.7;">Browse active offers to accept them and start competing!</p>
        </div>`;
      } else {
        listContainer.innerHTML = applications.map(app => {
          const offerId = parseInt(app.offer_id);
          const offerTitle = app.offer_title || 'Untitled Offer';
          const budget = parseFloat(app.budget || 0).toLocaleString();
          const clientName = app.client_name || app.client_username || 'Client';
          
          // Check application status
          const status = app.status || 'applied'; // status in offer_applications: 'applied','accepted','rejected','completed'
          const isWinner = status === 'accepted';
          
          // Check if user has already submitted a design for this offer
          const matchSub = ownSubmissions.find(sub => 
            sub.description && sub.description.includes(`Submitted for Offer #${offerId}`)
          );

          // Get image preview if submission exists
          let imgThumb = '';
          if (matchSub && matchSub.reference_images) {
            try {
              const imgs = typeof matchSub.reference_images === 'string' ? JSON.parse(matchSub.reference_images) : matchSub.reference_images;
              if (Array.isArray(imgs) && imgs.length > 0) {
                imgThumb = `<div style="width:64px;height:64px;border-radius:10px;background:url('${imgs[0]}') center/cover no-repeat;flex-shrink:0;border:1px solid rgba(255,255,255,0.08);"></div>`;
              }
            } catch(_) {}
          }
          
          // Badge styling
          const badgeColor = isWinner ? '#10B981' : '#D4AF37';
          const badgeText = isWinner ? '🏆 Winner' : '🟢 Active';

          // Action buttons html
          let actionButtons = '';
          if (matchSub) {
            // Designer has submitted a design, show Push Design and Cancel Participation
            const escapedSubTitle = escapeHtml(matchSub.title).replace(/'/g, "\\'");
            const escapedSubDesc = escapeHtml(matchSub.description || '').replace(/'/g, "\\'");
            const escapedSubTags = escapeHtml(matchSub.tags || '').replace(/'/g, "\\'");
            
            actionButtons = `
              <button class="btn btn-gold btn-sm" onclick="window.pushDesignSubmission(${matchSub.id}, '${escapedSubTitle}', '${escapedSubDesc}', ${matchSub.budget}, '${matchSub.deadline}', '${escapedSubTags}')" style="flex:1;">
                <i class='bx bx-rocket'></i> Push Design
              </button>
              <button class="btn btn-ghost btn-sm" onclick="window.cancelParticipation(${offerId})" style="color:var(--pink);">
                <i class='bx bx-x'></i> Cancel
              </button>
            `;
          } else {
            // Designer has NOT submitted yet, show Submit Design and Cancel Participation
            const safeOfferJson = JSON.stringify({
              id: offerId,
              title: offerTitle,
              budget: parseFloat(app.budget || 0),
              client_name: clientName
            }).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

            actionButtons = `
              <button class="btn btn-primary btn-sm" onclick="window.openSubmissionWorkspace(${safeOfferJson})" style="flex:1;">
                <i class='bx bx-upload'></i> Submit Design
              </button>
              <button class="btn btn-ghost btn-sm" onclick="window.cancelParticipation(${offerId})" style="color:var(--pink);">
                <i class='bx bx-x'></i> Cancel
              </button>
            `;
          }

          return `<div class="glass" style="padding:16px;border-radius:14px;display:flex;flex-direction:column;gap:12px;border:1px solid rgba(255,255,255,0.06);transition:transform 0.2s;" onmouseenter="this.style.transform='translateY(-2px)'" onmouseleave="this.style.transform=''">
              <div style="display:flex;gap:12px;align-items:flex-start;">
                  ${imgThumb}
                  <div style="flex:1;min-width:0;">
                      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
                          <strong style="font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">${escapeHtml(offerTitle)}</strong>
                          <span class="badge" style="background:${badgeColor}22;color:${badgeColor};border:1px solid ${badgeColor}44;font-size:0.65rem;font-weight:700;padding:2px 8px;border-radius:12px;">${badgeText}</span>
                      </div>
                      <div style="font-size:0.78rem;color:var(--text-secondary);display:flex;gap:8px;flex-direction:column;">
                          <span>Client: <strong style="color:var(--text-primary);">@${escapeHtml(clientName)}</strong></span>
                          <span>Budget: <strong class="text-gold">$${budget}</strong></span>
                      </div>
                  </div>
              </div>
              <div style="display:flex;gap:8px;margin-top:4px;">
                <button class="btn btn-ghost btn-sm" onclick="window.loadOfferPage ? window.loadOfferPage(${offerId}) : window.viewOfferDetails(${offerId})" style="padding:4px 8px;" title="View Contest">
                  <i class='bx bx-show'></i>
                </button>
                ${actionButtons}
              </div>
          </div>`;
        }).join('');
      }
    }

    // Update client created campaigns stat count in profile
    const statOffers = document.getElementById('stat-offers');
    if (statOffers) statOffers.textContent = clientOffers.length;
  } catch(e) { 
    console.error('Profile offers load error (full stack):', e); 
    const listContainer = document.getElementById('my-offers-list');
    if (listContainer) {
      listContainer.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-secondary);grid-column:1/-1;">
        <i class="bx bx-error-circle" style="font-size:2.5rem;color:var(--pink);"></i>
        <p style="margin-top:10px;">Failed to load offers. Please try again.</p>
      </div>`;
    }
  }
}
// ══════════════════════════════════════════════════════════
// EDIT PROFILE LOGIC
// ══════════════════════════════════════════════════════════

window.openEditProfile = function() {
  if (typeof window.activatePage === 'function') {
    window.activatePage('page-settings');
  } else if (typeof window.navigateTo === 'function') {
    window.navigateTo('page-settings');
  }
  
  // Also make sure the Settings Profile tab is active
  const profileTabBtn = document.querySelector('[data-settings-tab="settings-tab-profile"]');
  if (profileTabBtn) {
    profileTabBtn.click();
  }
};

window.pushDesignSubmission = async function(submissionId, offerTitle, offerDesc, offerBudget, offerDeadline, offerTags) {
  // Find and disable the clicked button to prevent double-clicks
  const btn = event && event.target ? event.target.closest('button') : null;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Pushing...'; }
  try {
    const res = await API.offers.update(submissionId, {
      title: offerTitle,
      description: offerDesc,
      budget: offerBudget,
      deadline: offerDeadline,
      tags: offerTags
    });
    if (res && res.success) {
      showToast('Design pushed to the top of the feed!', 'success');
      loadProfileData();
      // Feed will update on next poll cycle — no immediate reload needed
    } else {
      showToast(res.message || 'Failed to push design', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bx bx-rocket"></i> Push Design'; }
    }
  } catch(e) {
    console.error(e);
    showToast('Failed to push design', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bx bx-rocket"></i> Push Design'; }
  }
};

window.cancelParticipation = async function(offerId) {
  if (!confirm('Are you sure you want to cancel your participation? This will delete your application and all design submissions for this offer.')) return;
  try {
    const res = await API.offers.cancelApplication(offerId);
    if (res && res.success) {
      showToast('Participation cancelled successfully', 'success');
      if (detailModal && detailModal.classList.contains('active')) {
        if (typeof window.viewOfferDetails === 'function') window.viewOfferDetails(offerId);
      }
      if (window._offerPageCurrentId == offerId && typeof window.loadOfferPage === 'function') {
        window.loadOfferPage(offerId);
      }
      loadProfileData();
      verifyAndLoadUser(); // Update navigation/access count dynamically
      if (typeof loadOffersFromAPI === 'function') loadOffersFromAPI();
      // Feed auto-updates via poll
    } else {
      showToast(res.message || 'Failed to cancel participation', 'error');
    }
  } catch(e) {
    console.error(e);
    showToast('Failed to cancel participation', 'error');
  }
};

window.closeOffer = async function(offerId) {
  if (!confirm('Are you sure you want to close this campaign? Designers will no longer be able to submit work.')) return;
  try {
    const res = await API.offers.close(offerId);
    if (res && res.success) {
      showToast('Campaign closed successfully!', 'success');
      loadProfileData();
      if (window.loadOfferHubPage) window.loadOfferHubPage();
      if (typeof loadOffersFromAPI === 'function') loadOffersFromAPI();
      if (window._offerPageCurrentId == offerId && typeof window.loadOfferPage === 'function') {
        window.loadOfferPage(offerId);
      }
    } else {
      showToast(res.message || 'Failed to close campaign', 'error');
    }
  } catch(e) {
    console.error(e);
    showToast('Failed to close campaign', 'error');
  }
};

window.viewUserProfile = async function(username) {
  if (!username) return;
  const modal = document.getElementById('designer-profile-modal');
  if (!modal) return;
  modal.classList.add('open');
  if (typeof window.lockBodyScroll === 'function') window.lockBodyScroll();
  const container = document.getElementById('designer-portfolio-container');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);"><i class="bx bx-loader-alt bx-spin" style="font-size:2rem;margin-bottom:8px;"></i><p>Loading designer portfolio...</p></div>';

  try {
    const [userRes, designsRes] = await Promise.all([
      API.users.getByUsername(username),
      API.users.getUserDesigns(username)
    ]);

    const user = userRes?.success ? userRes.data : null;
    const allDesigns = designsRes?.success && Array.isArray(designsRes.data) ? designsRes.data : [];
    // Only show design submissions (not client offers)
    const designs = allDesigns.filter(o => o.description && o.description.includes('Submitted for Offer #'));

    const avatarHtml = user?.avatar_url
      ? `<div style="width:72px;height:72px;border-radius:50%;background:url('${user.avatar_url}') center/cover no-repeat;border:3px solid var(--gold);flex-shrink:0;"></div>`
      : `<div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--gold),var(--pink));display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:800;color:#fff;border:3px solid var(--gold);flex-shrink:0;">${username.charAt(0).toUpperCase()}</div>`;

    const statsHtml = `
      <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:8px;font-size:0.82rem;color:var(--text-secondary);">
        <span><strong style="color:var(--text);">${designs.length}</strong> Submissions</span>
        <span><strong style="color:var(--gold);">${user?.total_votes || 0}</strong> Total Votes</span>
      </div>`;

    const designCardsHtml = designs.length === 0
      ? `<div style="text-align:center;padding:40px 20px;color:var(--text-secondary);grid-column:1/-1;">
           <i class='bx bx-palette' style="font-size:2.5rem;opacity:0.25;"></i>
           <p style="margin-top:10px;">No design submissions yet.</p>
         </div>`
      : designs.map((o, i) => {
          let imgUrl = null;
          if (o.reference_images) {
            try {
              const parsed = JSON.parse(o.reference_images);
              if (Array.isArray(parsed) && parsed.length > 0) imgUrl = parsed[0];
            } catch(_) {
              if (typeof o.reference_images === 'string' && o.reference_images.startsWith('data:')) imgUrl = o.reference_images;
            }
          }
          const gradients = ['#E11D48','#D4AF37','#10B981','#D4AF37'];
          const mediaBg = imgUrl
            ? `background:url('${imgUrl}') center/cover no-repeat`
            : `background:linear-gradient(135deg,#08080A,${gradients[i % 4]})`;
          const match = o.description && o.description.match(/\(Submitted for Offer #(\d+)\)/);
          const parentId = o.parent_offer_id || (match ? match[1] : null);
          const parentTitle = o.parent_offer_title || (parentId ? `Offer #${parentId}` : null);
          const mentionTag = parentTitle ? `<span class="mention-tag" onclick="if(window.closeDesignerProfile)window.closeDesignerProfile();window.loadOfferPage&&window.loadOfferPage(${parentId})" style="cursor:pointer;font-size:0.68rem;">@${parentTitle.replace(/\s+/g,'')}</span>` : '';
          const votes = parseInt(o.total_votes || 0);
          const rating = parseFloat(o.vote_average || 0).toFixed(1);
          const escapedTitle = typeof escapeHtml === 'function' ? escapeHtml(o.title || 'Untitled Design') : (o.title || 'Untitled Design');
          return `<div class="glass" style="overflow:hidden;border-radius:14px;border:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;">
            <div style="height:160px;${mediaBg};position:relative;">
              <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 50%);"></div>
            </div>
            <div style="padding:12px;display:flex;flex-direction:column;gap:6px;flex:1;">
              <h4 style="margin:0;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapedTitle}</h4>
              ${mentionTag}
              <div style="display:flex;gap:12px;font-size:0.75rem;color:var(--text-secondary);margin-top:auto;">
                <span><i class='bx bx-star' style="color:var(--gold);"></i> ${rating}/10</span>
                <span><i class='bx bx-user-voice'></i> ${votes} votes</span>
              </div>
            </div>
          </div>`;
        }).join('');

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;flex-wrap:wrap;">
        ${avatarHtml}
        <div>
          <h3 style="margin:0;font-size:1.2rem;font-weight:700;">@${username}</h3>
          <p style="margin:4px 0 0;font-size:0.85rem;color:var(--text-secondary);">${user?.bio || 'Designer on ARTVOT'}</p>
          ${statsHtml}
        </div>
      </div>
      <h4 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-secondary);margin-bottom:16px;">Design Submissions</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;">
        ${designCardsHtml}
      </div>`;
  } catch(e) {
    console.error('viewUserProfile error:', e);
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);"><i class="bx bx-error-circle" style="font-size:2rem;color:var(--pink);"></i><p style="margin-top:8px;">Failed to load profile.</p></div>';
  }
};

window.closeDesignerProfile = function() {
  const modal = document.getElementById('designer-profile-modal');
  if (modal) {
    modal.classList.remove('open');
    window.unlockBodyScroll();
  }
};

// About Us Scroll and Navigation Trigger
document.addEventListener('DOMContentLoaded', () => {
  const aboutBtn = document.getElementById('about-us-btn');
  const aboutSection = document.getElementById('about-us-section');

  if (aboutBtn && aboutSection) {
    aboutBtn.addEventListener('click', () => {
      if (typeof window.activatePage === 'function') {
        window.activatePage('about-us-section');
      }
    });
  }
});

/* ============================================================
   OFFER DETAIL PAGE — loadOfferPage()
   Full immersive SPA page with 4 sections + 5s polling
   ============================================================ */

window._offerPagePollingId = null;
window._offerPageCurrentId = null;
window._offerPageKnownSubIds = new Set();
window._offerPageKnownCommentIds = new Set();
window._offerPageLoading = false; // FIX: guard against concurrent executions

window.loadOfferPage = async function(offerId, fromHub = false) {
  // FIX: Strict re-entrancy guard — never run two loadOfferPage calls simultaneously
  if (window._offerPageLoading) {
    console.warn('loadOfferPage: already loading, skipping duplicate call for offerId', offerId);
    return;
  }
  window._offerPageLoading = true;

  // Track where we came from for back button
  window._offerPageFromHub = fromHub;

  // FIX: Forcefully stop any existing polling interval BEFORE touching _offerPageCurrentId
  // so any in-flight async callback that checks _offerPageCurrentId !== offerId will bail
  if (window._offerPagePollingId) {
    clearInterval(window._offerPagePollingId);
    window._offerPagePollingId = null;
  }
  window._offerPageCurrentId = offerId;
  window._offerPageKnownSubIds = new Set();
  window._offerPageKnownCommentIds = new Set();

  // Navigate to the page
  if (typeof window.activatePage === 'function') {
    window.activatePage('page-offer-detail');
  }

  const container = document.getElementById('offer-page-container');
  if (!container) return;

  // Show skeleton
  container.innerHTML = `
    <div class="offer-page-skeleton">
      <div class="skeleton-block" style="height:300px;border-radius:16px;margin-bottom:24px;"></div>
      <div class="skeleton-block" style="height:24px;width:60%;border-radius:8px;margin-bottom:12px;"></div>
      <div class="skeleton-block" style="height:16px;width:40%;border-radius:8px;margin-bottom:32px;"></div>
      <div class="skeleton-block" style="height:200px;border-radius:16px;"></div>
    </div>`;

  try {
    // Fetch offer data
    const offerRes = await API.offers.getById(offerId);
    if (window._offerPageCurrentId !== offerId) {
      console.warn('loadOfferPage: User navigated away before details finished loading.');
      window._offerPageLoading = false;
      return;
    }
    if (!offerRes || !offerRes.success) {
      container.innerHTML = `<div class="offer-empty-state"><i class='bx bx-error-circle'></i><p>Offer not found or has been removed.</p></div>`;
      return;
    }
    const offer = offerRes.data;

    // Determine status
    const now = new Date();
    const deadlineDate = offer.deadline ? new Date(offer.deadline) : null;
    const isExpired = deadlineDate && deadlineDate < now;
    const isClosed = offer.status === 'closed' || offer.status === 'completed' || isExpired;
    const statusLabel = isClosed ? '🔴 Closed' : '🟢 Open';
    const statusClass = isClosed ? 'status-badge-closed' : 'status-badge-open';

    // Deadline countdown
    let deadlineText = '—';
    if (deadlineDate && !isClosed) {
      const diffMs = deadlineDate - now;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays > 1) deadlineText = `⏰ Closes in ${diffDays} days`;
      else if (diffDays === 1) deadlineText = '⏰ Closes tomorrow';
      else deadlineText = '⏰ Closes today';
    } else if (deadlineDate) {
      deadlineText = `Closed ${deadlineDate.toLocaleDateString()}`;
    }

    // Category from tags
    const category = offer.tags || 'General';

    // Owner info
    const ownerName = offer.username || offer.owner_name || 'Unknown';
    const ownerAvatar = offer.avatar || offer.profile_picture || '';
    const ownerAvatarHtml = ownerAvatar
      ? `<img class="offer-page-owner-avatar" src="${ownerAvatar}" alt="${ownerName}">`
      : `<div class="offer-page-owner-avatar" style="display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--gold);font-size:0.9rem;">${(ownerName[0]||'?').toUpperCase()}</div>`;

    // Media
    let mediaHtml = '';
    if (offer.reference_images) {
      mediaHtml = `<div class="offer-page-media-wrapper" style="height: 380px; width:100%; position:relative; overflow:hidden;">
        ${renderPostMedia(offer.reference_images, offer.id)}
      </div>`;
    }

    // Current user check
    const currentUser = window.currentUser || null;
    const isOwner = currentUser && (parseInt(currentUser.user_id) === parseInt(offer.user_id));

    // ═══════════ SECTION A — HERO ═══════════
    let heroHtml = `
      <div class="offer-page-hero">
        <div class="offer-page-hero-bg"></div>
        ${mediaHtml}
        <div class="offer-page-hero-body">
          <h1 class="offer-page-title">${_escHtml(offer.title || 'Untitled Offer')}</h1>
          <div class="offer-page-badges">
            <span class="category-badge">${_escHtml(category)}</span>
            <span class="${statusClass}">${statusLabel}</span>
            <span class="budget-badge">💰 $${parseFloat(offer.budget || 0).toFixed(2)}</span>
            <span class="deadline-badge">${deadlineText}</span>
          </div>
          <div class="offer-page-meta">
            <div class="offer-page-owner" onclick="window.viewUserProfile && window.viewUserProfile('${_escHtml(ownerName)}')">
              ${ownerAvatarHtml}
              <div>
                <div class="offer-page-owner-name">@${_escHtml(ownerName)}</div>
                <div class="offer-page-owner-role">Client / Host</div>
              </div>
            </div>
          </div>
          <p class="offer-page-desc">${window.formatMentions ? window.formatMentions(offer.description || '') : (offer.description || '')}</p>
        </div>
      </div>`;

    // ═══════════ SECTION B — ACTION BAR ═══════════
    let actionBarHtml = '<div class="offer-page-action-bar">';
    if (isOwner) {
      actionBarHtml += `<button class="btn btn-primary" onclick="window.activatePage ? window.activatePage('page-offer-hub') : window.navigateTo('page-offer-hub')"><i class='bx bx-cog'></i> Manage in Hub ⚙️</button>`;
      if (!isClosed) {
        actionBarHtml += `<button class="btn btn-ghost btn-sm" onclick="window.closeOffer(${offerId})" style="margin-left:8px;"><i class='bx bx-lock-alt'></i> Close Campaign</button>`;
      }
    } else if (!isClosed && currentUser) {
      actionBarHtml += `<button class="btn btn-gold" id="offer-page-submit-btn" onclick="window._offerPageSubmitDesign(${offerId})"><i class='bx bx-palette'></i> Submit Design 🎨</button>`;
    }
    if (!currentUser) {
      actionBarHtml += `<span style="color:var(--text-muted);font-size:0.85rem;"><i class='bx bx-lock-alt'></i> Log in to participate</span>`;
    }
    if (isClosed) {
      actionBarHtml += `<span style="color:var(--text-muted);font-size:0.85rem;"><i class='bx bx-check-circle'></i> This offer is closed — results are visible below</span>`;
    }
    actionBarHtml += '</div>';

    // ═══════════ SECTION C — SUBMISSIONS ═══════════
    let subsHtml = `
      <div id="offer-page-subs-section">
        <h2 class="offer-section-title"><i class='bx bx-grid-alt' style="color:var(--gold);"></i> Design Submissions <span class="count" id="offer-page-sub-count">0</span></h2>
        <div class="submissions-grid" id="offer-page-subs-grid">
          <div class="offer-empty-state"><i class='bx bx-loader-alt bx-spin'></i><p>Loading submissions...</p></div>
        </div>
      </div>`;

    // ═══════════ SECTION D — COMMENTS ═══════════
    let commentsHtml = `
      <div class="offer-comments-section" id="offer-page-comments-section">
        <h2 class="offer-section-title"><i class='bx bx-comment-detail' style="color:var(--gold);"></i> Comments <span class="count" id="offer-page-comment-count">0</span></h2>
        ${currentUser ? `
        <div class="offer-comment-input-wrap">
          <textarea id="offer-page-comment-input" rows="2" placeholder="Add a comment about this offer..."></textarea>
          <button class="btn btn-primary btn-sm" id="offer-page-post-comment-btn" onclick="window._offerPagePostComment(${offerId})">Post</button>
        </div>` : ''}
        <div class="offer-comments-list" id="offer-page-comments-list">
          <div class="offer-empty-state"><i class='bx bx-loader-alt bx-spin'></i><p>Loading comments...</p></div>
        </div>
      </div>`;

    // Render full page
    container.innerHTML = heroHtml + actionBarHtml + subsHtml + commentsHtml;

    // Load submissions & comments
    await Promise.all([
      window._offerPageLoadSubs(offerId, isClosed, offer),
      window._offerPageLoadComments(offerId)
    ]);

    if (window._offerPageCurrentId !== offerId) {
      console.warn('loadOfferPage: User navigated away during submissions and comments loading.');
      window._offerPageLoading = false;
      return;
    }

    // Check if current user already submitted — update action bar
    if (!isOwner && !isClosed && currentUser) {
      _offerPageCheckUserSubmission(offerId, offer);
    }

    // ═══════════ 5-SECOND POLLING ═══════════
    // pollState holds mutable flags so the interval callback can update them
    // without relying on the stale isClosed value captured in the closure.
    const pollState = { isClosed };

    // FIX: Release the loading guard — page is fully rendered, polling is about to start
    window._offerPageLoading = false;

    window._offerPagePollingId = setInterval(async () => {
      // Guard: if user navigated away, kill this interval immediately
      if (window._offerPageCurrentId !== offerId) {
        clearInterval(window._offerPagePollingId);
        window._offerPagePollingId = null;
        return;
      }
      try {
        // Poll subs
        const subsRes = await API.offers.getSubmissions(offerId);
        // Re-check after await — user may have navigated away during the fetch
        if (window._offerPageCurrentId !== offerId) return;
        if (subsRes && subsRes.success && Array.isArray(subsRes.data)) {
          const newSubs = subsRes.data.filter(s => !window._offerPageKnownSubIds.has(s.id));
          if (newSubs.length > 0) {
            const grid = document.getElementById('offer-page-subs-grid');
            if (grid) {
              newSubs.forEach(sub => {
                window._offerPageKnownSubIds.add(sub.id);
                const card = _buildSubCard(sub, pollState.isClosed, offer);
                card.classList.add('fade-in-item');
                grid.prepend(card);
              });
              // Remove empty state if present
              const empty = grid.querySelector('.offer-empty-state');
              if (empty) empty.remove();
            }
            const countEl = document.getElementById('offer-page-sub-count');
            if (countEl) countEl.textContent = window._offerPageKnownSubIds.size;
          }
        }
        // Poll comments
        const comRes = await API.comments.getOfferComments(offerId);
        if (window._offerPageCurrentId !== offerId) return;
        if (comRes && comRes.success && Array.isArray(comRes.data)) {
          const newComs = comRes.data.filter(c => !window._offerPageKnownCommentIds.has(c.id));
          if (newComs.length > 0) {
            const list = document.getElementById('offer-page-comments-list');
            if (list) {
              newComs.forEach(c => {
                window._offerPageKnownCommentIds.add(c.id);
                const item = _buildCommentItem(c);
                item.classList.add('fade-in-item');
                list.prepend(item);
              });
              const empty = list.querySelector('.offer-empty-state');
              if (empty) empty.remove();
            }
            const countEl = document.getElementById('offer-page-comment-count');
            if (countEl) countEl.textContent = window._offerPageKnownCommentIds.size;
          }
        }
        // FIX: Poll offer status changes — update UI in-place, NEVER call loadOfferPage
        if (!pollState.isClosed) {
          const statusRes = await API.offers.getById(offerId);
          if (window._offerPageCurrentId !== offerId) return;
          if (statusRes && statusRes.success) {
            const o = statusRes.data;
            const nowCheck = new Date();
            const dl = o.deadline ? new Date(o.deadline) : null;
            const closedNow = o.status === 'closed' || o.status === 'completed' || (dl && dl < nowCheck);
            if (closedNow) {
              // FIX: Offer just closed — update UI state in-place, do NOT call loadOfferPage.
              // Calling loadOfferPage from inside the interval causes recursive reload loops.
              pollState.isClosed = true;
              clearInterval(window._offerPagePollingId);
              window._offerPagePollingId = null;

              // Silently update status badges in the rendered DOM
              const statusBadge = document.querySelector('.status-badge-open');
              if (statusBadge) {
                statusBadge.textContent = '🔴 Closed';
                statusBadge.className = 'status-badge-closed';
              }
              const deadlineBadge = document.querySelector('.deadline-badge');
              if (deadlineBadge) deadlineBadge.textContent = 'Closed';

              // Hide submit button, show closed notice
              const submitBtn = document.getElementById('offer-page-submit-btn');
              if (submitBtn) submitBtn.remove();
              const actionBar = document.querySelector('.offer-page-action-bar');
              if (actionBar) {
                const notice = document.createElement('span');
                notice.style.cssText = 'color:var(--text-muted);font-size:0.85rem;';
                notice.innerHTML = "<i class='bx bx-check-circle'></i> This offer is closed — results are visible below";
                actionBar.appendChild(notice);
              }
            }
          }
        }
      } catch(e) {
        console.warn('Offer page polling error:', e);
      }
    }, 5000);

  } catch(e) {
    console.error('loadOfferPage error:', e);
    window._offerPageLoading = false; // FIX: always release guard on error
    container.innerHTML = `<div class="offer-empty-state"><i class='bx bx-error-circle'></i><p>Failed to load offer. Please try again.</p></div>`;
  }
};

/* ─── Load Submissions into the Offer Page ─── */
window._offerPageLoadSubs = async function(offerId, isClosed, offer) {
  const grid = document.getElementById('offer-page-subs-grid');
  if (!grid) return;

  try {
    const res = await API.offers.getSubmissions(offerId);
    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
      grid.innerHTML = '';
      res.data.forEach(sub => {
        window._offerPageKnownSubIds.add(sub.id);
        const card = _buildSubCard(sub, isClosed, offer);
        grid.appendChild(card);
      });
      const countEl = document.getElementById('offer-page-sub-count');
      if (countEl) countEl.textContent = res.data.length;
      // Initialize voting sliders on the new cards
      setTimeout(() => { if (typeof initVoting === 'function') initVoting(); }, 80);
    } else {
      grid.innerHTML = `<div class="offer-empty-state"><i class='bx bx-palette'></i><p>No designs submitted yet. Be the first!</p></div>`;
      const countEl = document.getElementById('offer-page-sub-count');
      if (countEl) countEl.textContent = '0';
    }
  } catch(e) {
    grid.innerHTML = `<div class="offer-empty-state"><i class='bx bx-error-circle'></i><p>Failed to load submissions.</p></div>`;
  }
};

/* ─── Build a single submission card ─── */
function _buildSubCard(sub, isClosed, parentOffer) {
  const card = document.createElement('div');
  card.className = 'submission-card';
  card.dataset.subId = sub.id;

  // Render media using the shared carousel/lightbox helper
  let mediaHtml = '';
  if (sub.reference_images && typeof renderPostMedia === 'function') {
    mediaHtml = renderPostMedia(sub.reference_images, `sub-${sub.id}`);
  } else {
    // Fallback: try to extract first image
    let imgSrc = '';
    if (sub.reference_images) {
      try {
        const imgs = JSON.parse(sub.reference_images);
        if (imgs && imgs.length > 0) imgSrc = imgs[0];
      } catch(e) {
        if (typeof sub.reference_images === 'string' && sub.reference_images.startsWith('http')) {
          imgSrc = sub.reference_images;
        }
      }
    }
    mediaHtml = imgSrc
      ? `<img src="${imgSrc}" alt="Submission" style="width:100%; height:100%; object-fit:cover; display:block;">`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);"><i class='bx bx-image' style="font-size:3rem;opacity:0.3;"></i></div>`;
  }

  const designerName = sub.username || sub.designer_name || 'Designer';
  const designerAvatar = sub.avatar || sub.profile_picture || '';
  const subTitle = (sub.title || 'Untitled Design').replace(/\(Submitted for Offer #\d+\)/g, '').trim();
  const subDesc = (sub.description || '').replace(/\(Submitted for Offer #\d+\)/g, '').trim();
  const timeAgo = typeof getTimeAgo === 'function' ? getTimeAgo(sub.created_at) : (sub.created_at || '');
  const offerTitle = parentOffer ? (parentOffer.title || '') : '';

  // Vote section
  let voteHtml = '';
  if (isClosed) {
    const avg = parseFloat(sub.vote_average || 0).toFixed(1);
    const totalVotes = parseInt(sub.total_votes || 0);
    voteHtml = `
      <div class="submission-vote-section">
        <div class="vote-slider-wrap">
          <input type="range" min="1" max="10" value="${Math.round(sub.vote_average || 5)}" 
            data-offer-id="${sub.id}" 
            onchange="window._offerPageVote(${sub.id}, this.value, this)">
          <span class="vote-value">${Math.round(sub.vote_average || 5)}</span>
        </div>
        <div class="submission-vote-avg">
          <span>⭐ Avg: <span class="avg-score">${avg}</span></span>
          <span>· ${totalVotes} vote${totalVotes !== 1 ? 's' : ''}</span>
        </div>
      </div>`;
  } else {
    voteHtml = `
      <div class="vote-locked-overlay">
        <i class='bx bx-lock-alt'></i>
        <span>🔒 Voting results after offer closes</span>
      </div>`;
  }

  const avatarHtml = designerAvatar
    ? `<img src="${designerAvatar}" alt="${designerName}">`
    : `<div style="width:32px;height:32px;border-radius:50%;background:var(--surface-3);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--gold);font-size:0.75rem;border:2px solid rgba(212,175,55,0.2);">${(designerName[0]||'?').toUpperCase()}</div>`;

  card.innerHTML = `
    <div class="submission-card-media">
      ${mediaHtml}
      ${offerTitle ? `<span class="submission-offer-badge">@${_escHtml(offerTitle)}</span>` : ''}
    </div>
    <div class="submission-card-body">
      <div class="submission-card-designer" onclick="window.viewUserProfile && window.viewUserProfile('${_escHtml(designerName)}')">
        ${avatarHtml}
        <span class="submission-card-designer-name">@${_escHtml(designerName)}</span>
      </div>
      <h4 class="submission-card-title">${_escHtml(subTitle)}</h4>
      <span class="submission-card-time">${timeAgo}</span>
      ${voteHtml}
    </div>`;

  return card;
}

/* ─── Load Comments into the Offer Page ─── */
window._offerPageLoadComments = async function(offerId) {
  const list = document.getElementById('offer-page-comments-list');
  if (!list) return;

  try {
    const res = await API.comments.getOfferComments(offerId);
    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
      list.innerHTML = '';
      res.data.forEach(c => {
        window._offerPageKnownCommentIds.add(c.id);
        const item = _buildCommentItem(c);
        list.appendChild(item);
      });
      const countEl = document.getElementById('offer-page-comment-count');
      if (countEl) countEl.textContent = res.data.length;
    } else {
      list.innerHTML = `<div class="offer-empty-state"><i class='bx bx-chat'></i><p>No comments yet. Start the conversation!</p></div>`;
      const countEl = document.getElementById('offer-page-comment-count');
      if (countEl) countEl.textContent = '0';
    }
  } catch(e) {
    list.innerHTML = `<div class="offer-empty-state"><i class='bx bx-error-circle'></i><p>Failed to load comments.</p></div>`;
  }
};

/* ─── Build a single comment item ─── */
function _buildCommentItem(c) {
  const item = document.createElement('div');
  item.className = 'offer-comment-item';
  item.dataset.commentId = c.id;

  const name = c.username || 'User';
  const avatar = c.avatar || c.profile_picture || '';
  const text = c.comment_text || '';
  const time = typeof getTimeAgo === 'function' ? getTimeAgo(c.created_at) : (c.created_at || '');
  const formattedText = window.formatMentions ? window.formatMentions(text) : text;

  const avatarHtml = avatar
    ? `<img class="offer-comment-avatar" src="${avatar}" alt="${name}">`
    : `<div class="offer-comment-avatar" style="display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--gold);font-size:0.8rem;background:var(--surface-3);">${(name[0]||'?').toUpperCase()}</div>`;

  item.innerHTML = `
    ${avatarHtml}
    <div class="offer-comment-body">
      <p class="offer-comment-name">@${_escHtml(name)}</p>
      <p class="offer-comment-text">${formattedText}</p>
      <span class="offer-comment-time">${time}</span>
    </div>`;

  return item;
}

/* ─── Post Comment from Offer Page ─── */
window._offerPagePostComment = async function(offerId) {
  if (!API.isAuthenticated()) {
    window.redirectToLogin('page-offer-detail', offerId);
    return;
  }
  const input = document.getElementById('offer-page-comment-input');
  const btn = document.getElementById('offer-page-post-comment-btn');
  if (!input || !input.value.trim()) return;

  const text = input.value.trim();
  btn.disabled = true;
  btn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i>';

  try {
    // Auto-prepend @OfferName mention if available.
    // Read the title from the already-rendered DOM heading — no extra API call needed.
    let commentText = text;
    if (window.getMentionTag) {
      const titleEl = document.querySelector('.offer-page-title');
      const offerTitle = titleEl ? titleEl.textContent.trim() : '';
      if (offerTitle) {
        const mentionTag = window.getMentionTag(offerTitle);
        if (mentionTag && !text.includes(mentionTag)) {
          commentText = mentionTag + ' ' + text;
        }
      }
    }

    const res = await API.comments.create(offerId, commentText);
    if (res && res.success) {
      input.value = '';
      if (typeof showToast === 'function') showToast('Comment posted!', 'success');
      // Immediate insert
      const list = document.getElementById('offer-page-comments-list');
      if (list) {
        const empty = list.querySelector('.offer-empty-state');
        if (empty) empty.remove();
        const newComment = {
          id: res.data ? res.data.id : Date.now(),
          username: (window.currentUser && window.currentUser.username) || 'You',
          avatar: (window.currentUser && (window.currentUser.avatar || window.currentUser.profile_picture)) || '',
          comment_text: commentText,
          created_at: new Date().toISOString()
        };
        window._offerPageKnownCommentIds.add(newComment.id);
        const item = _buildCommentItem(newComment);
        item.classList.add('fade-in-item');
        list.prepend(item);
        const countEl = document.getElementById('offer-page-comment-count');
        if (countEl) countEl.textContent = window._offerPageKnownCommentIds.size;
      }
    } else {
      if (typeof showToast === 'function') showToast(res.message || 'Failed to post comment', 'error');
    }
  } catch(e) {
    console.error('Post comment error:', e);
    if (typeof showToast === 'function') showToast('Network error posting comment.', 'error');
  }

  btn.disabled = false;
  btn.innerHTML = 'Post';
};

/* ─── Submit Design from Offer Page ─── */
window._offerPageSubmitDesign = async function(offerId) {
  if (!API.isAuthenticated()) {
    window.redirectToLogin('page-offer-detail', offerId);
    return;
  }
  try {
    const offerRes = await API.offers.getById(offerId);
    if (offerRes && offerRes.success && offerRes.data) {
      const offer = offerRes.data;
      if (typeof window.openSubmissionWorkspace === 'function') {
        window.openSubmissionWorkspace(offer);
      } else {
        if (typeof showToast === 'function') showToast('Submission workspace not available.', 'error');
      }
    }
  } catch(e) {
    if (typeof showToast === 'function') showToast('Failed to open submission form.', 'error');
  }
};

/* ─── Vote on a submission from the Offer Page ─── */
window._offerPageVote = async function(offerId, value, inputEl) {
  if (!API.isAuthenticated()) {
    window.redirectToLogin('page-offer-detail', window._offerPageCurrentId || offerId);
    return;
  }
  const valueDisplay = inputEl.parentElement.querySelector('.vote-value');
  if (valueDisplay) valueDisplay.textContent = value;

  try {
    const res = await API.votes.submit(offerId, parseInt(value));
    if (res && res.success) {
      if (typeof showToast === 'function') showToast('Vote recorded!', 'success');
    } else {
      if (typeof showToast === 'function') showToast(res.message || 'Vote failed.', 'error');
    }
  } catch(e) {
    if (typeof showToast === 'function') showToast('Network error submitting vote.', 'error');
  }
};

/* ─── Check if user already submitted to this offer ─── */
async function _offerPageCheckUserSubmission(offerId, offer) {
  try {
    const subsRes = await API.offers.getSubmissions(offerId);
    if (subsRes && subsRes.success && Array.isArray(subsRes.data)) {
      const currentUser = window.currentUser;
      if (!currentUser) return;
      const userSub = subsRes.data.find(s => parseInt(s.user_id) === parseInt(currentUser.user_id));
      if (userSub) {
        const btn = document.getElementById('offer-page-submit-btn');
        if (btn) {
          btn.outerHTML = `
            <button class="btn btn-outline" onclick="window._offerPageSubmitDesign(${offerId})"><i class='bx bx-edit'></i> Update My Submission ✏️</button>
            <button class="btn btn-ghost" onclick="window.cancelSub(${offerId}, ${userSub.id})"><i class='bx bx-x'></i> Cancel Submission</button>`;
        }
      }
    }
  } catch(e) {
    console.warn('Check user submission error:', e);
  }
}

/* ─── HTML Escaper helper ─── */
function _escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
