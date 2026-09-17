/**
 * Minimalist Roadmap Checklist - Online Web Edition
 * Shared multi-user roadmap web app
 * 
 * Features:
 * 1. Multi-user email/password sign-in with one server-enforced editor
 * 2. Instant local persistence in browser (localStorage)
 * 3. Automatic Cloud Sync via Supabase across all devices
 * 4. Zero-Click Today's Focus Command Center
 * 5. Unbroken Daily Streak Engine & Activity Heatmap
 * 6. Anti-Guilt "Defer to Weekend" Protocol
 */

const STORAGE_KEY = 'study_roadmap_checklist_v1';

// Hardened Roadmap Start Date: Monday, September 14, 2026 at 5:30 AM IST (00:00:00 UTC)
// The study day rolls over strictly at 5:30 AM IST.
// Since IST is UTC+5:30, 05:30:00 IST maps precisely to 00:00:00 UTC.
const ROADMAP_START_UTC = Date.UTC(2026, 8, 14, 0, 0, 0, 0);
const ROADMAP_START_DATE = new Date('2026-09-14T05:30:00+05:30');

function getRoadmapCalendarInfo(targetDate = new Date()) {
  const cur = new Date(targetDate);
  const curUtcDay = Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate());
  
  const diffTime = curUtcDay - ROADMAP_START_UTC;
  const diffDays = Math.floor(diffTime / 86400000);
  const dayCodes = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  if (diffDays < 0) {
    // Before official start: anchor to Week 1, Monday
    return {
      weekNum: 1,
      dayCode: 'Mon',
      dayIndex: 0,
      diffDays: diffDays,
      isBeforeStart: true,
      effectiveDateStr: cur.toISOString().slice(0, 10)
    };
  }
  
  const weekNum = Math.min(50, Math.floor(diffDays / 7) + 1);
  const dayIndex = diffDays % 7; // 0 = Mon, ..., 6 = Sun
  const dayCode = dayCodes[dayIndex] || 'Mon';
  
  return {
    weekNum,
    dayCode,
    dayIndex,
    diffDays,
    isBeforeStart: false,
    effectiveDateStr: cur.toISOString().slice(0, 10)
  };
}

// Set these values for *your own* Supabase project before deploying. The key is
// intentionally a browser-safe publishable/anon key; never place a service-role
// key in this file. See README.md and supabase_security_setup.sql.
const suppliedCloudConfig = window.TRACKER_SUPABASE_CONFIG || {};
const cloudBaseUrl = String(suppliedCloudConfig.baseUrl || 'https://YOUR_PROJECT_REF.supabase.co').replace(/\/$/, '');
const CLOUD_CONFIG = {
  baseUrl: cloudBaseUrl,
  endpoint: `${cloudBaseUrl}/rest/v1/tracker_state`,
  rpcSync: `${cloudBaseUrl}/rest/v1/rpc/sync_tracker_state`,
  wsUrl: cloudBaseUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:') + '/realtime/v1/websocket',
  apiKey: String(suppliedCloudConfig.apiKey || 'YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY'),
  docId: 'shared_roadmap'
};

function isCloudConfigured() {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(CLOUD_CONFIG.baseUrl)
    && !CLOUD_CONFIG.baseUrl.includes('YOUR_PROJECT_REF')
    && CLOUD_CONFIG.apiKey.length > 20
    && !CLOUD_CONFIG.apiKey.includes('YOUR_SUPABASE');
}

function showToast(msg, duration = 2500) {
  let toast = document.getElementById('abhyas-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'abhyas-toast';
    toast.className = 'fixed bottom-6 right-6 z-[9999] px-4 py-2.5 rounded-lg bg-surface-container-highest/95 backdrop-blur-md border border-white/15 text-xs font-mono text-on-surface shadow-2xl transition-all duration-300 transform translate-y-4 opacity-0 pointer-events-none flex items-center gap-2';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.remove('translate-y-4', 'opacity-0', 'pointer-events-none');
  toast.classList.add('translate-y-0', 'opacity-100');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.add('translate-y-4', 'opacity-0', 'pointer-events-none');
    toast.classList.remove('translate-y-0', 'opacity-100');
  }, duration);
}

// ==========================================================================
// Multi-user authentication (Supabase Auth + database-authorized editor role)
// ===========================================================================
const MultiUserAuthManager = {
  client: null,
  session: null,
  access: { authenticated: false, canEdit: false },
  _sdkPromise: null,

  async init() {
    this.injectAuthUI();
    this.updateUIState();
    if (!isCloudConfigured()) {
      this.setStatus('Add your Supabase URL and publishable key in js/app.js to enable sign-in.', 'error');
      return;
    }

    try {
      const sdk = await this.loadSdk();
      this.client = sdk.createClient(CLOUD_CONFIG.baseUrl, CLOUD_CONFIG.apiKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      this.session = data.session;
      this.client.auth.onAuthStateChange((_event, session) => {
        this.session = session;
        this.refreshAccess().finally(() => {
          this.updateUIState();
          // A magic-link callback can establish a session without a reload.
          if (window.AppState?._initialized && this.isAuthenticated()) {
            window.AppState.startRealtimeSubscription();
            window.AppState.fetchFromCloud();
          }
        });
      });
      await this.refreshAccess();
    } catch (error) {
      console.warn('Supabase Auth initialization error:', error);
      this.setStatus('Sign-in could not start. Check the Supabase URL, key, and network connection.', 'error');
    } finally {
      this.updateUIState();
    }
  },

  isAuthenticated() {
    return !!this.session?.access_token && !!this.session?.user;
  },

  canEdit() {
    return this.isAuthenticated() && this.access.canEdit === true;
  },

  getAuthToken() {
    return this.canEdit() ? this.session.access_token : null;
  },

  // Viewers need their JWT to read shared progress; only editors receive a
  // token from getAuthToken(), which is used for writes.
  getSessionToken() {
    return this.isAuthenticated() ? this.session.access_token : null;
  },

  async loadSdk() {
    if (window.supabase?.createClient) return window.supabase;
    if (this._sdkPromise) return this._sdkPromise;
    this._sdkPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-supabase-sdk]');
      if (existing) {
        existing.addEventListener('load', () => window.supabase?.createClient ? resolve(window.supabase) : reject(new Error('Supabase SDK unavailable')));
        existing.addEventListener('error', () => reject(new Error('Supabase SDK failed to load')));
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.async = true;
      script.dataset.supabaseSdk = 'true';
      script.onload = () => window.supabase?.createClient ? resolve(window.supabase) : reject(new Error('Supabase SDK unavailable'));
      script.onerror = () => reject(new Error('Supabase SDK failed to load'));
      document.head.appendChild(script);
    });
    return this._sdkPromise;
  },

  async refreshAccess() {
    if (!this.isAuthenticated() || !this.client) {
      this.access = { authenticated: false, canEdit: false };
      return this.access;
    }
    try {
      const { data, error } = await this.client.rpc('tracker_access');
      if (error) throw error;
      this.access = { authenticated: true, canEdit: data?.can_edit === true };
    } catch (error) {
      console.warn('Editor role lookup error:', error);
      this.access = { authenticated: true, canEdit: false };
      this.setStatus('Signed in, but the editor-role check is unavailable. Run the supplied Supabase setup SQL.', 'error');
    }
    return this.access;
  },

  requestEdit() {
    if (!this.isAuthenticated()) {
      this.setStatus('Sign in with your email and password. Only the configured editor can change progress.', 'info');
    } else if (!this.canEdit()) {
      this.setStatus('This account is a viewer. Only the configured editor email can change progress.', 'error');
    }
    this.showPrompt();
  },

  async signInWithEmail(email, password) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return this.setStatus('Enter a valid email address.', 'error');
    }
    if (!password || password.length < 8) return this.setStatus('Enter your password (at least 8 characters).', 'error');
    if (!this.client) return this.setStatus('Supabase is not configured yet.', 'error');
    const submitButton = document.getElementById('btn-email-signin');
    if (submitButton) submitButton.disabled = true;
    this.setStatus('Signing in securely...', 'info');
    try {
      const { error } = await this.client.auth.signInWithPassword({
        email: normalizedEmail,
        password
      });
      if (error) throw error;
      this.setStatus('Signed in successfully.', 'info');
    } catch (error) {
      this.setStatus(error?.message || 'Unable to sign in with that email and password.', 'error');
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  },

  async createEmailAccount(email, password) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) return this.setStatus('Enter a valid email address.', 'error');
    if (!password || password.length < 8) return this.setStatus('Choose a password with at least 8 characters.', 'error');
    if (!this.client) return this.setStatus('Supabase is not configured yet.', 'error');
    const submitButton = document.getElementById('btn-email-signup');
    if (submitButton) submitButton.disabled = true;
    this.setStatus('Creating your account...', 'info');
    try {
      const { data, error } = await this.client.auth.signUp({ email: normalizedEmail, password });
      if (error) throw error;
      this.setStatus(data.session ? 'Account created and signed in.' : 'Account created. Confirm the email address if your project requires it.', 'info');
    } catch (error) {
      this.setStatus(error?.message || 'Unable to create this account.', 'error');
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  },

  async signInWithGoogle() {
    if (!this.client) return this.setStatus('Supabase is not configured yet.', 'error');
    const submitButton = document.getElementById('btn-google-signin');
    if (submitButton) submitButton.disabled = true;
    this.setStatus('Opening Google sign-in...', 'info');
    try {
      const { error } = await this.client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: this.redirectUrl() }
      });
      if (error) throw error;
    } catch (error) {
      this.setStatus(error?.message || 'Unable to start Google sign-in.', 'error');
      if (submitButton) submitButton.disabled = false;
    }
  },

  async logout() {
    try {
      await this.client?.auth.signOut();
    } catch (error) {
      console.warn('Sign-out error:', error);
    }
    this.session = null;
    this.access = { authenticated: false, canEdit: false };
    this.updateUIState();
    showToast('Signed out. You are viewing the shared roadmap.');
  },

  showPrompt() {
    const overlay = document.getElementById('auth-lock-overlay');
    if (overlay) {
      overlay.classList.add('active');
      overlay.scrollTop = 0;
      const emailInput = document.getElementById('auth-email-input');
      if (!this.isAuthenticated() && emailInput) {
        requestAnimationFrame(() => emailInput.focus({ preventScroll: true }));
      }
    }
  },

  closeModal() {
    document.getElementById('auth-lock-overlay')?.classList.remove('active');
  },

  updateUIState() {
    const entry = document.getElementById('auth-entry');
    const accountText = document.getElementById('auth-account-message');
    const controls = document.getElementById('auth-signin-controls');
    const accountActions = document.getElementById('auth-account-actions');
    document.body.classList.remove('auth-locked');
    if (!entry) return;

    if (!isCloudConfigured()) {
      entry.className = 'auth-badge locked auth-entry';
      entry.innerHTML = '<span class="auth-dot"></span><span>Setup required</span>';
      entry.title = 'Configure Supabase to enable sign-in.';
    } else if (this.canEdit()) {
      entry.className = 'auth-badge unlocked auth-entry';
      entry.innerHTML = '<span class="auth-dot"></span><span>Editor</span>';
      entry.title = `Signed in as ${this.session.user.email}. Click for account options.`;
    } else if (this.isAuthenticated()) {
      entry.className = 'auth-badge locked auth-entry';
      entry.innerHTML = '<span class="auth-dot"></span><span>Viewer</span>';
      entry.title = `Signed in as ${this.session.user.email}. This account is read-only.`;
    } else {
      entry.className = 'auth-badge locked auth-entry';
      entry.innerHTML = '<span class="auth-dot"></span><span>Sign in</span>';
      entry.title = 'Sign in with your email address.';
    }

    if (accountText) {
      if (this.canEdit()) {
        accountText.textContent = `Signed in as ${this.session.user.email}. This is the configured editor account.`;
      } else if (this.isAuthenticated()) {
        accountText.textContent = `Signed in as ${this.session.user.email}. This account can view the shared roadmap but cannot change it.`;
      } else {
        accountText.textContent = 'Sign in with your email and password. The configured editor is the only account that can change progress.';
      }
    }
    if (controls) controls.hidden = this.isAuthenticated();
    if (accountActions) accountActions.hidden = !this.isAuthenticated();
  },

  injectAuthUI() {
    if (document.getElementById('auth-lock-overlay')) return;
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.id = 'auth-entry';
    entry.className = 'auth-badge locked auth-entry';
    entry.addEventListener('click', () => this.showPrompt());
    document.body.appendChild(entry);

    const overlay = document.createElement('div');
    overlay.id = 'auth-lock-overlay';
    overlay.className = 'auth-overlay';
    overlay.innerHTML = `
      <div class="auth-card cockpit-glass border border-white/10 rounded-2xl p-6 sm:p-8 max-w-sm w-full shadow-2xl relative mx-4">
        <button type="button" id="auth-close" class="absolute top-4 right-4 text-on-surface-variant/40 hover:text-on-surface transition-colors p-1 rounded-lg cursor-pointer" title="Close"><span class="material-symbols-outlined text-[20px]">close</span></button>
        <div class="flex justify-center mb-4"><div class="w-12 h-12 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shadow-inner"><span class="material-symbols-outlined text-[24px]">group</span></div></div>
        <h2 class="font-headline text-lg sm:text-xl font-bold text-center text-on-surface mb-1">Shared roadmap</h2>
        <p class="font-mono text-xs text-on-surface-variant text-center mb-4">Secure account sign-in</p>
        <p id="auth-account-message" class="text-xs text-on-surface-variant/80 text-center leading-relaxed mb-5"></p>
        <div id="auth-signin-controls">
          <button type="button" class="w-full py-2.5 px-4 rounded-lg bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold font-mono tracking-wide transition-all shadow-md cursor-pointer flex items-center justify-center gap-2" id="btn-google-signin"><span class="material-symbols-outlined text-[16px]">account_circle</span><span>Continue with Google</span></button><div class="flex items-center gap-3 my-4 text-[10px] font-mono text-on-surface-variant/60"><span class="h-px flex-1 bg-outline-variant/25"></span><span>OR</span><span class="h-px flex-1 bg-outline-variant/25"></span></div><form id="auth-login-form"><div class="mb-3 text-left"><label class="block text-xs font-mono text-on-surface-variant mb-1.5 font-medium" for="auth-email-input">Email address</label><input type="email" id="auth-email-input" class="w-full px-3.5 py-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-sm text-on-surface placeholder:text-outline-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 font-mono transition-all" placeholder="you@example.com" autocomplete="email" /></div><div class="mb-4 text-left"><label class="block text-xs font-mono text-on-surface-variant mb-1.5 font-medium" for="auth-password-input">Password</label><input type="password" id="auth-password-input" class="w-full px-3.5 py-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-sm text-on-surface placeholder:text-outline-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 font-mono transition-all" placeholder="At least 8 characters" autocomplete="current-password" minlength="8" /></div><button type="submit" class="w-full py-2.5 px-4 rounded-lg bg-primary hover:bg-primary/90 text-on-primary text-xs font-semibold font-mono tracking-wide transition-all shadow-md cursor-pointer flex items-center justify-center gap-2" id="btn-email-signin"><span class="material-symbols-outlined text-[16px]">login</span><span>Sign in</span></button><button type="button" class="w-full mt-2 py-2.5 px-4 rounded-lg bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/30 text-xs font-semibold font-mono tracking-wide transition-all cursor-pointer" id="btn-email-signup">Create account</button></form>
        </div>
        <div id="auth-account-actions" hidden><button type="button" id="btn-signout" class="w-full py-2.5 px-4 rounded-lg bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/30 text-xs font-semibold font-mono tracking-wide transition-all cursor-pointer flex items-center justify-center gap-2"><span class="material-symbols-outlined text-[16px]">logout</span><span>Sign out</span></button></div>
        <div id="auth-status-msg" class="auth-status-msg text-xs min-h-[1.25rem] text-center mt-4"></div>
        <div class="mt-5 pt-3.5 border-t border-outline-variant/15 flex flex-col gap-1 text-center font-mono text-[11px] text-on-surface-variant/60"><span>Secure Supabase session</span><span>Editor permissions are enforced by the database</span></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#auth-close').addEventListener('click', () => this.closeModal());
    overlay.querySelector('#auth-login-form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.signInWithEmail(overlay.querySelector('#auth-email-input').value, overlay.querySelector('#auth-password-input').value);
    });
    overlay.querySelector('#btn-email-signup').addEventListener('click', () => {
      this.createEmailAccount(overlay.querySelector('#auth-email-input').value, overlay.querySelector('#auth-password-input').value);
    });
    overlay.querySelector('#btn-google-signin').addEventListener('click', () => this.signInWithGoogle());
    overlay.querySelector('#btn-signout').addEventListener('click', () => this.logout());
  },

  redirectUrl() {
    return `${window.location.origin}${window.location.pathname}`;
  },

  setStatus(message, type = 'info') {
    const status = document.getElementById('auth-status-msg');
    if (!status) return;
    status.className = `auth-status-msg ${type === 'error' ? 'error' : 'info'} text-xs font-mono`;
    status.textContent = message;
  }
};
window.MultiUserAuthManager = MultiUserAuthManager;

// ===========================================================================
// App State & Cloud Sync Controller
// ==========================================================================
const AppState = {
  data: {
    tasks: {},          // { [taskId]: true }
    taskMeta: {},       // { [taskId]: { done: boolean, updatedAt: ISOString } }
    notes: {},          // { [weekNum]: string }
    notesMeta: {},      // { [weekNum]: { updatedAt: ISOString } }
    activityLog: {},    // { [YYYY-MM-DD]: taskCount }
    deferredTasks: {},  // { [taskId]: "YYYY-MM-DD" }
    srQueue: {},        // { [taskId]: { reps, stage, interval, easeFactor, lastReviewed, nextReview } }
    lastModified: null
  },
  cloudConnected: false,
  syncTimeout: null,
  isSyncing: false,
  lastSyncTime: null,
  lastKnownServerUpdatedAt: null,
  onDataLoadedCallbacks: [],
  _initialized: false,
  _ws: null,
  _wsHeartbeatInterval: null,
  _pollingInterval: null,
  _broadcastChannel: null,

  async init() {
    if (this._initialized) return;
    this._initialized = true;

    // 0. Restore the Supabase session and fetch the server-authorized editor role.
    await MultiUserAuthManager.init();

    // 1. Instant load from local browser cache for zero-latency rendering
    this.loadLocal();
    this.initTheme();

    // 2. Cross-tab & cross-window live synchronisation
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this._broadcastChannel = new BroadcastChannel('abhyas_state_sync');
        this._broadcastChannel.onmessage = (e) => {
          if (e.data && e.data.data) {
            this.data = e.data.data;
            this.notifyDataUpdated();
          }
        };
      } catch (err) {}
    }

    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed && typeof parsed.tasks === 'object') {
            this.data = parsed;
            this.notifyDataUpdated();
          }
        } catch (err) {}
      }
    });

    // 3. Start Live Realtime WebSocket & Polling Heartbeat
    this.startRealtimeSubscription();
    this.startPollingHeartbeat();

    // 4. Re-read storage and refresh when returning via browser back/forward, tab switch, or BFCache
    window.addEventListener('pageshow', () => {
      this.fetchFromCloud();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.fetchFromCloud();
      }
    });

    // 5. Reliable sync flush on tab close or page navigate
    window.addEventListener('pagehide', () => this.flushCloudSync());
    window.addEventListener('beforeunload', () => this.flushCloudSync());

    window.addEventListener('online', () => {
      this.fetchFromCloud();
    });

    // 6. Notify all registered listeners immediately with local data
    this.notifyDataUpdated();

    // 7. Fetch and synchronize with Supabase cloud database in background
    await this.fetchFromCloud();
  },

  startRealtimeSubscription() {
    const token = MultiUserAuthManager.getSessionToken();
    if (!isCloudConfigured() || !token) return;
    if (typeof WebSocket === 'undefined') return;
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const url = `${CLOUD_CONFIG.wsUrl}?apikey=${CLOUD_CONFIG.apiKey}&vsn=1.0.0`;
      const ws = new WebSocket(url);
      this._ws = ws;

      ws.onopen = () => {
        const joinMsg = {
          topic: 'realtime:public:tracker_state',
          event: 'phx_join',
          payload: {
            access_token: token,
            config: {
              postgres_changes: [
                {
                  event: '*',
                  schema: 'public',
                  table: 'tracker_state'
                }
              ]
            }
          },
          ref: 'abhyas_join_1'
        };
        ws.send(JSON.stringify(joinMsg));

        if (this._wsHeartbeatInterval) clearInterval(this._wsHeartbeatInterval);
        this._wsHeartbeatInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              topic: 'phoenix',
              event: 'heartbeat',
              payload: {},
              ref: `hb_${Date.now()}`
            }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg && msg.event === 'postgres_changes') {
            const record = msg.payload?.data?.record || msg.payload?.record;
            if (record && record.id === CLOUD_CONFIG.docId) {
              if (record.updated_at) {
                this.lastKnownServerUpdatedAt = record.updated_at;
              }
              if (record.data && typeof record.data === 'object') {
                this.reconcileData(record.data);
                this.saveLocal();
                this.notifyDataUpdated();
                return;
              }
            }
            this.fetchFromCloud();
          }
        } catch (err) {
          console.warn('Realtime message parse note:', err);
        }
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        if (this._wsHeartbeatInterval) clearInterval(this._wsHeartbeatInterval);
        this._ws = null;
        setTimeout(() => {
          if (document.visibilityState === 'visible') {
            this.startRealtimeSubscription();
          }
        }, 3000);
      };
    } catch (e) {
      console.warn('Realtime init notice:', e);
    }
  },

  startPollingHeartbeat() {
    if (!isCloudConfigured()) return;
    if (this._pollingInterval) clearInterval(this._pollingInterval);

    const checkServer = async () => {
      if (this.isSyncing) return;
      const token = MultiUserAuthManager.getSessionToken();
      if (!token) return;
      try {
        const res = await fetch(`${CLOUD_CONFIG.endpoint}?id=eq.${CLOUD_CONFIG.docId}&select=updated_at`, {
          headers: {
            'apikey': CLOUD_CONFIG.apiKey,
            'Authorization': `Bearer ${token}`
          },
          cache: 'no-store'
        });
        if (res.ok) {
          const rows = await res.json();
          if (rows && rows.length > 0 && rows[0].updated_at) {
            const serverTime = rows[0].updated_at;
            if (this.lastKnownServerUpdatedAt && serverTime !== this.lastKnownServerUpdatedAt) {
              this.lastKnownServerUpdatedAt = serverTime;
              await this.fetchFromCloud();
            } else {
              this.lastKnownServerUpdatedAt = serverTime;
            }
          }
        }
      } catch (e) {}
    };

    this._pollingInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkServer();
      }
    }, 2500);

    window.addEventListener('focus', checkServer);
  },

  loadLocal() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          const validPattern = /^w\d+_[a-z]+_[a-z0-9]+$/;
          const cleanTasks = {};
          const cleanMeta = {};
          Object.keys(parsed.tasks || {}).forEach(k => {
            if (validPattern.test(k) && parsed.tasks[k]) {
              cleanTasks[k] = true;
            }
          });
          Object.keys(parsed.taskMeta || {}).forEach(k => {
            if (validPattern.test(k)) {
              cleanMeta[k] = parsed.taskMeta[k];
            }
          });

          this.data.tasks = cleanTasks;
          this.data.taskMeta = cleanMeta;
          this.data.notes = parsed.notes || {};
          this.data.notesMeta = parsed.notesMeta || {};
          this.data.activityLog = parsed.activityLog || {};
          this.data.deferredTasks = parsed.deferredTasks || {};
          this.data.srQueue = parsed.srQueue || {};
          this.data.lastModified = parsed.lastModified || null;

          const doneCount = Object.keys(this.data.tasks).length;
          if (doneCount === 0) {
            this.data.activityLog = {};
          }
        }
      }
    } catch (e) {
      console.warn('Storage load warning:', e);
    }
  },

  async fetchFromCloud() {
    const token = MultiUserAuthManager.getSessionToken();
    if (!isCloudConfigured() || !token) return;
    if (this.isSyncing) return;
    try {
      const res = await fetch(`${CLOUD_CONFIG.endpoint}?id=eq.${CLOUD_CONFIG.docId}`, {
        headers: {
          'apikey': CLOUD_CONFIG.apiKey,
          'Authorization': `Bearer ${token}`
        },
        cache: 'no-store'
      });

      if (res.ok) {
        const rows = await res.json();
        if (rows && rows.length > 0 && rows[0].data) {
          this.cloudConnected = true;
          this.lastSyncTime = new Date();
          this.lastKnownServerUpdatedAt = rows[0].updated_at || null;
          this.reconcileData(rows[0].data);
          this.saveLocal();
          this.notifyDataUpdated();
          return;
        } else {
          await this.pushToCloud();
          return;
        }
      }
    } catch (e) {
      console.warn('Cloud fetch notice:', e);
    }
  },

  reconcileData(cloudData) {
    if (!cloudData || typeof cloudData !== 'object') return;

    // 1. View Mode (Guest / Read-Only): The cloud is the single authoritative source of truth
    if (!MultiUserAuthManager.canEdit()) {
      this.data.tasks = { ...(cloudData.tasks || {}) };
      this.data.taskMeta = { ...(cloudData.taskMeta || {}) };
      this.data.notes = { ...(cloudData.notes || {}) };
      this.data.notesMeta = { ...(cloudData.notesMeta || {}) };
      this.data.activityLog = { ...(cloudData.activityLog || {}) };
      this.data.deferredTasks = { ...(cloudData.deferredTasks || {}) };
      this.data.lastModified = cloudData.lastModified || new Date().toISOString();
      return;
    }

    // 2. Authorized Mode: If cloud timestamp is strictly newer or equal, adopt cloud
    const localTime = new Date(this.data.lastModified || 0).getTime();
    const cloudTime = new Date(cloudData.lastModified || 0).getTime();

    if (cloudTime >= localTime && !this.isSyncing) {
      this.data.tasks = { ...(cloudData.tasks || {}) };
      this.data.taskMeta = { ...(cloudData.taskMeta || {}) };
      this.data.notes = { ...(cloudData.notes || {}) };
      this.data.notesMeta = { ...(cloudData.notesMeta || {}) };
      this.data.activityLog = { ...(cloudData.activityLog || {}) };
      this.data.deferredTasks = { ...(cloudData.deferredTasks || {}) };
      this.data.srQueue = { ...(cloudData.srQueue || {}) };
      this.data.lastModified = cloudData.lastModified || new Date().toISOString();
      return;
    }

    // 3. Conflict resolution (only if local edits happened while offline): Last-Write-Wins per task
    const validPattern = /^w\d+_[a-z]+_[a-z0-9]+$/;
    const localTasks = this.data.tasks || {};
    const cloudTasks = cloudData.tasks || {};
    const localMeta = this.data.taskMeta || {};
    const cloudMeta = cloudData.taskMeta || {};

    const allTaskIds = new Set([
      ...Object.keys(localTasks),
      ...Object.keys(cloudTasks),
      ...Object.keys(localMeta),
      ...Object.keys(cloudMeta)
    ].filter(id => validPattern.test(id)));

    const mergedTasks = {};
    const mergedMeta = {};

    allTaskIds.forEach(id => {
      const lm = localMeta[id];
      const cm = cloudMeta[id];
      const lt = lm ? new Date(lm.updatedAt).getTime() : 0;
      const ct = cm ? new Date(cm.updatedAt).getTime() : 0;

      if (ct > lt) {
        const isDone = cm ? cm.done : !!cloudTasks[id];
        if (isDone) mergedTasks[id] = true;
        mergedMeta[id] = cm || { done: isDone, updatedAt: cloudData.lastModified || new Date().toISOString() };
      } else {
        const isDone = lm ? lm.done : !!localTasks[id];
        if (isDone) mergedTasks[id] = true;
        mergedMeta[id] = lm || { done: isDone, updatedAt: this.data.lastModified || new Date().toISOString() };
      }
    });

    this.data.tasks = mergedTasks;
    this.data.taskMeta = mergedMeta;
    this.data.notes = { ...(cloudData.notes || {}), ...(this.data.notes || {}) };
    this.data.deferredTasks = { ...(cloudData.deferredTasks || {}), ...(this.data.deferredTasks || {}) };
    this.data.srQueue = { ...(cloudData.srQueue || {}), ...(this.data.srQueue || {}) };
    this.data.activityLog = { ...(cloudData.activityLog || {}), ...(this.data.activityLog || {}) };
    this.data.lastModified = new Date(Math.max(localTime, cloudTime, Date.now())).toISOString();
  },

  saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  },

  isTaskDone(id) {
    return !!(this.data && this.data.tasks && this.data.tasks[id]);
  },

  isTaskDeferred(id) {
    return !!(this.data && this.data.deferredTasks && this.data.deferredTasks[id]);
  },

  setTask(id, done) {
    if (!MultiUserAuthManager.canEdit()) {
      MultiUserAuthManager.requestEdit();
      return;
    }

    const now = new Date().toISOString();
    const todayStr = now.slice(0, 10);
    if (!this.data.activityLog) this.data.activityLog = {};
    if (!this.data.tasks) this.data.tasks = {};
    if (!this.data.taskMeta) this.data.taskMeta = {};

    const prevDone = !!this.data.tasks[id];
    if (done === prevDone) return; // No change needed

    if (done) {
      this.data.tasks[id] = true;
      this.data.activityLog[todayStr] = (this.data.activityLog[todayStr] || 0) + 1;
      if (this.data.deferredTasks && this.data.deferredTasks[id]) {
        delete this.data.deferredTasks[id];
      }
      if (window.SpacedRepetitionEngine) {
        window.SpacedRepetitionEngine.registerCompletedTask(id, now);
      }
    } else {
      delete this.data.tasks[id];
      if (window.SpacedRepetitionEngine) {
        window.SpacedRepetitionEngine.unregisterUncheckedTask(id);
      }
      const prevDate = (this.data.taskMeta[id]?.updatedAt || '').slice(0, 10) || todayStr;
      if (this.data.activityLog[prevDate]) {
        this.data.activityLog[prevDate] = Math.max(0, this.data.activityLog[prevDate] - 1);
        if (this.data.activityLog[prevDate] === 0) delete this.data.activityLog[prevDate];
      } else if (this.data.activityLog[todayStr]) {
        this.data.activityLog[todayStr] = Math.max(0, this.data.activityLog[todayStr] - 1);
        if (this.data.activityLog[todayStr] === 0) delete this.data.activityLog[todayStr];
      }
      const remainingTasks = Object.keys(this.data.tasks || {}).filter(k => this.data.tasks[k] && /^w\d+_[a-z]+_[a-z0-9]+$/.test(k)).length;
      if (remainingTasks === 0) {
        this.data.activityLog = {};
      }
    }

    this.data.taskMeta[id] = { done: !!done, updatedAt: now };
    this.data.lastModified = now;

    this.saveLocal();
    if (this._broadcastChannel) {
      try {
        this._broadcastChannel.postMessage({ type: 'TASK_UPDATED', data: this.data });
      } catch (err) {}
    }
    this.scheduleCloudSync(true);
    this.notifyDataUpdated();
  },

  deferTask(id, defer = true) {
    if (!MultiUserAuthManager.canEdit()) {
      MultiUserAuthManager.requestEdit();
      return;
    }

    const now = new Date().toISOString();
    if (!this.data.deferredTasks) this.data.deferredTasks = {};
    if (defer) {
      this.data.deferredTasks[id] = now.slice(0, 10);
      showToast('⏳ Task deferred to Weekend Lab block (Zero guilt!)');
    } else {
      delete this.data.deferredTasks[id];
      showToast('Task returned to regular weekday schedule');
    }
    this.data.lastModified = now;
    this.saveLocal();
    if (this._broadcastChannel) {
      try {
        this._broadcastChannel.postMessage({ type: 'TASK_DEFERRED', data: this.data });
      } catch (err) {}
    }
    this.scheduleCloudSync(true);
    this.notifyDataUpdated();
  },

  getNote(weekNum) {
    return (this.data && this.data.notes && this.data.notes[weekNum]) || localStorage.getItem(`study_notes_week_${weekNum}`) || '';
  },

  setNote(weekNum, text) {
    if (!MultiUserAuthManager.canEdit()) {
      MultiUserAuthManager.requestEdit();
      return;
    }

    const now = new Date().toISOString();
    if (!this.data.notes) this.data.notes = {};
    if (!this.data.notesMeta) this.data.notesMeta = {};
    this.data.notes[weekNum] = text;
    this.data.notesMeta[weekNum] = { updatedAt: now };
    this.data.lastModified = now;
    try {
      localStorage.setItem(`study_notes_week_${weekNum}`, text);
    } catch (e) {}
    this.saveLocal();
    if (this._broadcastChannel) {
      try {
        this._broadcastChannel.postMessage({ type: 'NOTE_UPDATED', data: this.data });
      } catch (err) {}
    }
    this.scheduleCloudSync(true);
  },

  scheduleCloudSync(immediate = false) {
    clearTimeout(this.syncTimeout);
    if (immediate) {
      this.pushToCloud();
    } else {
      this.syncTimeout = setTimeout(() => {
        this.pushToCloud();
      }, 50);
    }
  },

  flushCloudSync() {
    clearTimeout(this.syncTimeout);
    if (!MultiUserAuthManager.canEdit()) return;
    if (!this.data || !this.data.lastModified) return;
    const token = MultiUserAuthManager.getAuthToken();
    if (!token) return;

    try {
      fetch(CLOUD_CONFIG.rpcSync, {
        method: 'POST',
        headers: {
          'apikey': CLOUD_CONFIG.apiKey,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_doc_id: CLOUD_CONFIG.docId,
          p_data: this.data
        }),
        keepalive: true
      }).catch(() => {});
    } catch (e) {}
  },

  async pushToCloud() {
    if (!MultiUserAuthManager.canEdit()) return;
    const token = MultiUserAuthManager.getAuthToken();
    if (!token) return;

    this.isSyncing = true;
    try {
      const rpcRes = await fetch(CLOUD_CONFIG.rpcSync, {
        method: 'POST',
        headers: {
          'apikey': CLOUD_CONFIG.apiKey,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_doc_id: CLOUD_CONFIG.docId,
          p_data: this.data
        }),
        keepalive: true
      });

      if (rpcRes.ok) {
        this.cloudConnected = true;
        this.lastSyncTime = new Date();
        try {
          const resJson = await rpcRes.json();
          if (resJson && resJson.updated_at) {
            this.lastKnownServerUpdatedAt = resJson.updated_at;
          }
        } catch (err) {}
      } else if (rpcRes.status === 401 || rpcRes.status === 403) {
        console.warn('Server authorization rejected for the current account');
        await MultiUserAuthManager.refreshAccess();
        MultiUserAuthManager.requestEdit();
      }
    } catch (e) {
      console.warn('Cloud sync error:', e);
    } finally {
      this.isSyncing = false;
    }
  },

  onDataLoaded(cb) {
    if (typeof cb === 'function') {
      this.onDataLoadedCallbacks.push(cb);
      if (this._initialized) {
        try { cb(this.data); } catch (e) { console.error('Error in onDataLoaded:', e); }
      }
    }
  },

  notifyDataUpdated() {
    this.onDataLoadedCallbacks.forEach(cb => {
      try { cb(this.data); } catch (e) { console.error('Error in notifyDataUpdated:', e); }
    });
  },

  initTheme() {
    // Dedicated Obsidian Dark Design System
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  }
};
window.AppState = AppState;
// Kept as an alias for any existing page integrations.
window.AuthManager = MultiUserAuthManager;

// ==========================================================================
// Streak Engine & Analytics
// ==========================================================================
const StreakEngine = {
  getStats(activityLog = {}) {
    const validPattern = /^w\d+_[a-z]+_[a-z0-9]+$/;
    const completedCount = Object.keys(AppState.data.tasks || {}).filter(k => AppState.data.tasks[k] && validPattern.test(k)).length;
    if (completedCount === 0) {
      return { current: 0, longest: 0, totalDays: 0, todayDone: false };
    }

    const dates = Object.keys(activityLog).filter(d => (activityLog[d] || 0) > 0).sort();
    if (dates.length === 0) {
      return { current: 0, longest: 0, totalDays: 0, todayDone: false };
    }

    const dateSet = new Set(dates);
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const todayStr = new Date(todayUtc).toISOString().slice(0, 10);

    const yesterdayUtc = todayUtc - 86400000;
    const yesterdayStr = new Date(yesterdayUtc).toISOString().slice(0, 10);

    const todayDone = dateSet.has(todayStr);

    let currentStreak = 0;
    let checkUtc = todayUtc;

    // If today is not yet done, check if yesterday was done to keep streak alive
    if (!todayDone) {
      if (dateSet.has(yesterdayStr)) {
        checkUtc = yesterdayUtc;
      } else {
        checkUtc = null;
      }
    }

    if (checkUtc !== null) {
      while (true) {
        const dStr = new Date(checkUtc).toISOString().slice(0, 10);
        if (dateSet.has(dStr)) {
          currentStreak++;
          checkUtc -= 86400000;
        } else {
          break;
        }
      }
    }

    // Longest streak calculation
    let longestStreak = 0;
    let tempStreak = 0;
    let prevDateUtc = null;

    dates.forEach(dStr => {
      const parts = dStr.split('-').map(Number);
      if (parts.length === 3) {
        const curUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
        if (prevDateUtc === null) {
          tempStreak = 1;
        } else {
          const diffDays = Math.round((curUtc - prevDateUtc) / 86400000);
          if (diffDays === 1) {
            tempStreak++;
          } else if (diffDays > 1) {
            tempStreak = 1;
          }
        }
        if (tempStreak > longestStreak) longestStreak = tempStreak;
        prevDateUtc = curUtc;
      }
    });

    return {
      current: currentStreak,
      longest: Math.max(longestStreak, currentStreak),
      totalDays: dates.length,
      todayDone: todayDone
    };
  }
};

// ==========================================================================
// Spaced Repetition Engine (Modified SuperMemo SM-2 & Leitner Hybrid)
// ==========================================================================
const SpacedRepetitionEngine = {
  taskCache: {},

  initTaskCache(roadmapData) {
    if (!roadmapData || !Array.isArray(roadmapData)) return;
    roadmapData.forEach(w => {
      const wNum = w.week_num;
      (w.days || []).forEach(d => {
        (d.tasks || []).forEach(t => {
          if (t && t.id) {
            const metaObj = {
              id: t.id,
              weekNum: wNum,
              dayName: d.day_name,
              dayCode: d.day_code,
              trackId: t.track_id,
              trackName: t.track_name || t.track_id,
              title: t.title || t.raw || '',
              desc: t.desc || '',
              raw: t.raw || '',
              ref: t.ref || '',
              isRest: !!t.is_rest
            };
            this.taskCache[t.id] = metaObj;
            // Dual-alias for w1_ vs w01_
            const withZero = t.id.replace(/^w(\d)_/, 'w0$1_');
            if (withZero !== t.id) this.taskCache[withZero] = metaObj;
            const noZero = t.id.replace(/^w0(\d)_/, 'w$1_');
            if (noZero !== t.id) this.taskCache[noZero] = metaObj;
          }
        });
      });
    });
  },

  getTaskMeta(taskId) {
    if (this.taskCache[taskId]) return this.taskCache[taskId];
    const noZero = taskId.replace(/^w0(\d)_/, 'w$1_');
    if (this.taskCache[noZero]) return this.taskCache[noZero];
    const withZero = taskId.replace(/^w(\d)_/, 'w0$1_');
    if (this.taskCache[withZero]) return this.taskCache[withZero];
    return null;
  },

  getStudyDateStr(date = new Date()) {
    // 5:30 AM IST (00:00:00 UTC) rollover
    const d = new Date(date);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
  },

  addDays(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().slice(0, 10);
  },

  getStage(interval) {
    if (interval < 3) return 1;       // Consolidation (+1d)
    if (interval < 7) return 2;       // Early Retrieval (+3d)
    if (interval < 16) return 3;      // Deep Encoding (+7d)
    if (interval < 30) return 4;      // Retention Transfer (+16d)
    return 5;                         // Permanent Mastery (+30d+)
  },

  getStageName(stage) {
    const names = {
      1: 'Stage 1 • Consolidation',
      2: 'Stage 2 • Early Recall',
      3: 'Stage 3 • Deep Encoding',
      4: 'Stage 4 • Retention Transfer',
      5: 'Stage 5 • Mastered ⭐'
    };
    return names[stage] || `Stage ${stage}`;
  },

  registerCompletedTask(taskId, completedAt = new Date().toISOString()) {
    if (!AppState.data.srQueue) AppState.data.srQueue = {};
    if (AppState.data.srQueue[taskId]) return; // Already enrolled

    const todayStr = this.getStudyDateStr(completedAt);
    const nextReview = this.addDays(todayStr, 1);

    AppState.data.srQueue[taskId] = {
      reps: 0,
      stage: 1,
      interval: 1,
      easeFactor: 2.5,
      lastReviewed: todayStr,
      nextReview: nextReview,
      enrolledAt: completedAt
    };
  },

  unregisterUncheckedTask(taskId) {
    if (!AppState.data.srQueue) return;
    if (AppState.data.srQueue[taskId]) {
      delete AppState.data.srQueue[taskId];
    }
  },

  syncCompletedTasks() {
    if (!AppState.data.srQueue) AppState.data.srQueue = {};
    const tasks = AppState.data.tasks || {};
    const taskMeta = AppState.data.taskMeta || {};
    const todayStr = this.getStudyDateStr();

    Object.keys(tasks).forEach(taskId => {
      if (tasks[taskId] && !AppState.data.srQueue[taskId] && /^w\d+_[a-z]+_[a-z0-9]+$/.test(taskId)) {
        const completedAt = taskMeta[taskId]?.updatedAt || new Date().toISOString();
        const doneDateStr = this.getStudyDateStr(completedAt);
        const nextReview = doneDateStr === todayStr ? this.addDays(todayStr, 1) : todayStr;

        AppState.data.srQueue[taskId] = {
          reps: 0,
          stage: 1,
          interval: 1,
          easeFactor: 2.5,
          lastReviewed: doneDateStr,
          nextReview: nextReview,
          enrolledAt: completedAt
        };
      }
    });
  },

  getDueTasks(limit = 5) {
    this.syncCompletedTasks();
    const todayStr = this.getStudyDateStr();
    const queue = AppState.data.srQueue || {};
    const dueList = [];

    Object.keys(queue).forEach(taskId => {
      const item = queue[taskId];
      if (!AppState.data.tasks || !AppState.data.tasks[taskId]) return;

      if (item.nextReview <= todayStr) {
        const overdueDays = Math.max(0, Math.floor((new Date(todayStr) - new Date(item.nextReview)) / 86400000));
        const meta = this.getTaskMeta(taskId) || null;
        dueList.push({
          taskId,
          item,
          overdueDays,
          meta
        });
      }
    });

    dueList.sort((a, b) => {
      if (b.overdueDays !== a.overdueDays) return b.overdueDays - a.overdueDays;
      if (a.item.stage !== b.item.stage) return a.item.stage - b.item.stage;
      return a.taskId.localeCompare(b.taskId);
    });

    return {
      totalDue: dueList.length,
      tasks: dueList.slice(0, limit)
    };
  },

  getStats() {
    this.syncCompletedTasks();
    const queue = AppState.data.srQueue || {};
    const todayStr = this.getStudyDateStr();
    let totalTracked = 0;
    let dueCount = 0;
    let masteredCount = 0;
    let stageBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    Object.keys(queue).forEach(tId => {
      if (AppState.data.tasks && AppState.data.tasks[tId]) {
        totalTracked++;
        const item = queue[tId];
        if (item.nextReview <= todayStr) dueCount++;
        if (item.stage >= 5 || item.interval >= 30) masteredCount++;
        const s = item.stage || 1;
        stageBreakdown[s] = (stageBreakdown[s] || 0) + 1;
      }
    });

    const retentionIndex = totalTracked > 0 
      ? Math.round(((totalTracked - dueCount + (masteredCount * 0.5)) / (totalTracked + (masteredCount * 0.5))) * 100) 
      : 100;

    return {
      totalTracked,
      dueCount,
      masteredCount,
      stageBreakdown,
      retentionIndex: Math.min(100, Math.max(0, retentionIndex))
    };
  },

  submitReview(taskId, grade) {
    if (!MultiUserAuthManager.canEdit()) {
      MultiUserAuthManager.requestEdit();
      return;
    }

    if (!AppState.data.srQueue) AppState.data.srQueue = {};
    const item = AppState.data.srQueue[taskId] || {
      reps: 0,
      stage: 1,
      interval: 1,
      easeFactor: 2.5
    };

    const todayStr = this.getStudyDateStr();
    let newInterval = 1;
    let newReps = item.reps || 0;
    let newEase = item.easeFactor || 2.5;
    let toastMsg = '';

    if (grade === 'again') {
      newReps = 0;
      newInterval = 1;
      newEase = Math.max(1.3, newEase - 0.2);
      toastMsg = '🔁 Reset to Stage 1 (+1d). Review scheduled for tomorrow.';
    } else if (grade === 'good') {
      newReps += 1;
      if (newReps === 1) {
        newInterval = 3;
      } else if (newReps === 2) {
        newInterval = 7;
      } else {
        newInterval = Math.max(item.interval + 2, Math.round(item.interval * newEase));
      }
      toastMsg = `🧠 Recall confirmed! Next review in ${newInterval} days.`;
    } else if (grade === 'easy') {
      newReps += 1;
      newEase = Math.min(3.0, newEase + 0.15);
      if (newReps === 1) {
        newInterval = 5;
      } else if (newReps === 2) {
        newInterval = 14;
      } else {
        newInterval = Math.max(item.interval + 4, Math.round(item.interval * newEase * 1.3));
      }
      toastMsg = `⭐ Concept Mastered! Next review in ${newInterval} days.`;
    }

    const newStage = this.getStage(newInterval);
    const nextReview = this.addDays(todayStr, newInterval);

    AppState.data.srQueue[taskId] = {
      reps: newReps,
      stage: newStage,
      interval: newInterval,
      easeFactor: Number(newEase.toFixed(2)),
      lastReviewed: todayStr,
      nextReview: nextReview,
      lastGrade: grade
    };

    AppState.data.lastModified = new Date().toISOString();
    AppState.saveLocal();
    AppState.scheduleCloudSync(true);
    AppState.notifyDataUpdated();

    showToast(toastMsg, 3500);

    if (window.renderMemoryDeck) {
      window.renderMemoryDeck();
    }
  }
};
window.SpacedRepetitionEngine = SpacedRepetitionEngine;

// ==========================================================================
// Week Page Controller
// ==========================================================================
function initWeekPage(weekNum) {
  if (!AppState._initialized) {
    AppState.init();
    AppState._initialized = true;
  }

  const notesArea = document.getElementById('week-notes');
  function autoResizeNotes() {
    if (!notesArea) return;
    notesArea.style.height = 'auto';
    notesArea.style.height = `${Math.max(120, notesArea.scrollHeight)}px`;
  }

  function syncUI() {
    const taskCards = document.querySelectorAll('.task-card, .task-item');
    taskCards.forEach(card => {
      const taskId = card.getAttribute('data-task-id');
      const isDone = AppState.isTaskDone(taskId);
      card.setAttribute('data-completed', isDone ? 'true' : 'false');
      updateTaskCardVisual(card, isDone);
      updateDeferBtnVisual(taskId);
    });

    if (notesArea && !notesArea._userTyping) {
      const savedNote = localStorage.getItem(`study_notes_week_${weekNum}`) || AppState.getNote(weekNum) || '';
      if (savedNote) {
        notesArea.value = savedNote;
        autoResizeNotes();
      }
    }

    updateWeekProgress();
    updateDayProgress();
    renderWeekendDeferredQueue(weekNum);
  }

  AppState.onDataLoaded(() => {
    syncUI();
  });

  // 1. Task Card & Checkbox clicks
  document.querySelectorAll('.task-card, .task-item').forEach(card => {
    const taskId = card.getAttribute('data-task-id');
    const isDone = AppState.isTaskDone(taskId);
    card.setAttribute('data-completed', isDone ? 'true' : 'false');
    updateTaskCardVisual(card, isDone);
    updateDeferBtnVisual(taskId);

    card.addEventListener('click', (e) => {
      // Ignore if clicking on external link or defer button
      if (e.target.closest('a') || e.target.closest('.btn-defer')) return;
      if (!MultiUserAuthManager.canEdit()) {
        MultiUserAuthManager.requestEdit();
        return;
      }
      const currentDone = AppState.isTaskDone(taskId);
      const nextDone = !currentDone;
      AppState.setTask(taskId, nextDone);
      card.setAttribute('data-completed', nextDone ? 'true' : 'false');
      updateTaskCardVisual(card, nextDone);
      updateDeferBtnVisual(taskId);
      updateWeekProgress();
      updateDayProgress();

      if (nextDone && isWeekAllDone()) {
        showToast('🎉 Outstanding! All Week tasks completed & logged!');
      }
    });
  });



  // 5. Notes Scratchpad auto-save & auto-expanding height
  if (notesArea) {
    // Initial fetch from localStorage and AppState
    const initialNote = localStorage.getItem(`study_notes_week_${weekNum}`) || AppState.getNote(weekNum) || '';
    if (initialNote) {
      notesArea.value = initialNote;
    }
    autoResizeNotes();

    notesArea.addEventListener('focus', () => {
      if (!MultiUserAuthManager.canEdit()) {
        MultiUserAuthManager.requestEdit();
        notesArea.blur();
      }
    });

    let timeout;
    notesArea.addEventListener('input', () => {
      if (!MultiUserAuthManager.canEdit()) {
        MultiUserAuthManager.requestEdit();
        notesArea.value = localStorage.getItem(`study_notes_week_${weekNum}`) || AppState.getNote(weekNum) || '';
        return;
      }
      autoResizeNotes();
      notesArea._userTyping = true;
      const text = notesArea.value;

      // Instant local persistence
      try {
        localStorage.setItem(`study_notes_week_${weekNum}`, text);
      } catch (e) {}

      if (!AppState.data.notes) AppState.data.notes = {};
      AppState.data.notes[weekNum] = text;
      AppState.saveLocal();

      // Cloud sync debounced
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        notesArea._userTyping = false;
        if (MultiUserAuthManager.canEdit()) {
          AppState.scheduleCloudSync();
        }
      }, 400);
    });

    window.addEventListener('resize', autoResizeNotes);
  }

  // 6. Keyboard navigation (Arrow keys & bracket shortcuts)
  window.addEventListener('keydown', (e) => {
    if (['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement.tagName)) return;
    
    if (e.key === 'ArrowLeft' || e.key === '[') {
      const prevBtn = document.getElementById('nav-prev') || document.querySelector('a[title*="Previous Week"]');
      if (prevBtn && prevBtn.getAttribute('href')) {
        window.location.href = prevBtn.getAttribute('href');
      }
    } else if (e.key === 'ArrowRight' || e.key === ']') {
      const nextBtn = document.getElementById('nav-next') || document.querySelector('a[title*="Next Week"]');
      if (nextBtn && nextBtn.getAttribute('href')) {
        window.location.href = nextBtn.getAttribute('href');
      }
    }
  });

  updateWeekProgress();
  updateDayProgress();
  renderWeekendDeferredQueue(weekNum);
}

function updateDeferBtnVisual(taskId) {
  const card = document.querySelector(`.task-card[data-task-id="${taskId}"], .task-item[data-task-id="${taskId}"]`);
  if (card) {
    const isDeferred = AppState.isTaskDeferred(taskId);
    const isDone = AppState.isTaskDone(taskId);
    card.classList.toggle('deferred', isDeferred && !isDone);
  }
}

/**
 * Weekend Spillover Protocol
 * If a weekday task is incomplete when that day passes (or if manually deferred),
 * it is automatically added to the weekend, allocated to Saturday or Sunday
 * based on whichever day currently has fewer scheduled hours.
 */
function renderWeekendDeferredQueue(weekNum) {
  const satContainer = document.querySelector('.weekend-deferred-container[data-day="Sat"]');
  const sunContainer = document.querySelector('.weekend-deferred-container[data-day="Sun"]');
  if (!satContainer && !sunContainer) return;

  const cal = getRoadmapCalendarInfo();
  const weekdayCodes = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const eligibleSpilloverTasks = [];

  // 1. Gather all incomplete weekday tasks from this week
  weekdayCodes.forEach((dayCode, dIdx) => {
    const dayCard = document.querySelector(`.day-card[data-day="${dayCode}"]`);
    if (!dayCard) return;

    const dayName = dayCard.querySelector('h3')?.innerText.trim() || dayCode;
    const taskCards = dayCard.querySelectorAll('.task-card, .task-item');

    taskCards.forEach(card => {
      const tid = card.getAttribute('data-task-id');
      const isDone = AppState.isTaskDone(tid);
      const isExplicitlyDeferred = AppState.isTaskDeferred(tid);
      const hours = parseFloat(card.getAttribute('data-hours')) || 2.5;
      const track = card.getAttribute('data-track') || 'corecs';
      const trackTag = card.querySelector('.task-tag')?.innerText.trim() || 'CORE';
      const rawText = card.querySelector('.task-title, .task-text')?.innerText.trim() || tid;
      const descText = card.querySelector('.task-desc')?.innerHTML || '';

      // Eligibility criteria:
      // Incomplete AND (manually deferred OR past week OR past weekday in current week)
      const isPastDay = (weekNum < cal.weekNum) || (weekNum === cal.weekNum && !cal.isBeforeStart && dIdx < cal.dayIndex);
      
      if (!isDone && (isExplicitlyDeferred || isPastDay)) {
        eligibleSpilloverTasks.push({
          id: tid,
          dayCode: dayCode,
          dayName: dayName,
          title: rawText,
          desc: descText,
          hours: hours,
          track: track,
          trackTag: trackTag,
          isDeferred: isExplicitlyDeferred
        });
      }
    });
  });

  // 2. Calculate base hours for Saturday and Sunday
  let satBaseHours = 0;
  document.querySelectorAll('.day-card[data-day="Sat"] .task-card').forEach(c => {
    satBaseHours += parseFloat(c.getAttribute('data-hours')) || 2.5;
  });
  if (satBaseHours === 0) satBaseHours = 8.0;

  let sunBaseHours = 0;
  document.querySelectorAll('.day-card[data-day="Sun"] .task-card').forEach(c => {
    sunBaseHours += parseFloat(c.getAttribute('data-hours')) || 2.5;
  });
  if (sunBaseHours === 0) sunBaseHours = 8.0;

  // 3. Allocate spilled tasks dynamically to Saturday or Sunday (lowest load balance)
  let currentSatHours = satBaseHours;
  let currentSunHours = sunBaseHours;
  const satTasks = [];
  const sunTasks = [];

  eligibleSpilloverTasks.forEach(task => {
    if (currentSatHours <= currentSunHours) {
      satTasks.push(task);
      currentSatHours += task.hours;
    } else {
      sunTasks.push(task);
      currentSunHours += task.hours;
    }
  });

  // Helper to render spillover list in a container
  function renderSpilloverBox(container, tasks, dayName) {
    if (!container) return;
    if (tasks.length === 0) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    container.style.display = 'block';
    const totalSpillHours = tasks.reduce((sum, t) => sum + t.hours, 0);

    let rowsHtml = '';
    tasks.forEach(t => {
      const isDone = AppState.isTaskDone(t.id);
      const rawTitle = t.title || '';
      const cleanTaskTitle = rawTitle.replace(/<[^>]*>/g, '').replace(/"/g, '&quot;').trim();
      rowsHtml += `
        <div class="deferred-backlog-row flex items-start justify-between p-2.5 rounded bg-surface-container border border-white/[0.06] text-xs gap-2 ${isDone ? 'opacity-50' : ''}">
          <div class="flex items-start gap-2.5 min-w-0 flex-1">
            <button type="button" role="checkbox" aria-checked="${isDone ? 'true' : 'false'}" aria-label="Toggle task: ${cleanTaskTitle}" class="checkbox-spring shrink-0 mt-0.5 w-4 h-4 rounded-[3px] ${isDone ? 'bg-primary border-primary' : 'bg-surface-container-lowest border border-outline-variant/50'} flex items-center justify-center shadow-sm cursor-pointer" onclick="AppState.setTask('${t.id}', ${!isDone}); const p = window.location.pathname; if(window.initWeekPage) { const m = p.match(/week-(\\d+)/); if(m) initWeekPage(parseInt(m[1], 10)); }">
              <span class="material-symbols-outlined text-[13px] text-on-primary font-bold ${isDone ? 'opacity-100' : 'opacity-0'}">check</span>
            </button>
            <div class="flex flex-col gap-0.5 min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-1.5 min-w-0">
                <span class="px-1.5 py-0.2 rounded bg-surface-container-highest text-on-surface-variant font-mono text-[10px] border border-outline-variant/20 font-semibold">From ${t.dayName}</span>
                <span class="task-tag shrink-0 px-1.5 py-0.2 rounded bg-surface-container-highest font-mono text-[10px] text-on-surface-variant font-semibold uppercase">${t.trackTag}</span>
                <span class="deferred-backlog-text font-semibold ${isDone ? 'line-through text-on-surface-variant/60' : 'text-on-surface'} truncate">${t.title}</span>
              </div>
              ${t.desc ? `<div class="text-[11px] text-on-surface-variant opacity-80 line-clamp-1">${t.desc}</div>` : ''}
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0 pt-0.5">
            <span class="font-mono text-[11px] text-on-surface-variant/70">${t.hours}h</span>
            ${t.isDeferred ? `<button type="button" class="btn-undefer text-slate-500 hover:text-slate-300 text-[10px] font-mono cursor-pointer" onclick="AppState.deferTask('${t.id}', false); renderWeekendDeferredQueue(${weekNum}); updateDeferBtnVisual('${t.id}');">Return</button>` : ''}
          </div>
        </div>
      `;
    });

    container.innerHTML = `
      <div class="deferred-backlog-box rounded-lg bg-surface-container-lowest/90 border border-outline-variant/20 p-3 mb-3 flex flex-col gap-2 shadow-lg">
        <div class="flex items-center justify-between pb-1.5 border-b border-white/[0.06]">
          <span class="font-mono text-[11px] font-semibold text-primary flex items-center gap-1.5">
            <span>⏳</span>
            <span>Spillover Queue (${tasks.length} tasks &bull; +${totalSpillHours.toFixed(1)}h)</span>
          </span>
          <span class="font-mono text-[10px] text-on-surface-variant/60">Allocated to ${dayName} (load balanced)</span>
        </div>
        <div class="flex flex-col gap-1.5">
          ${rowsHtml}
        </div>
      </div>
    `;
  }

  renderSpilloverBox(satContainer, satTasks, 'Saturday');
  renderSpilloverBox(sunContainer, sunTasks, 'Sunday');

  // Update day badges with spillover hours
  const satBadge = document.querySelector('.day-card[data-day="Sat"] .day-badge');
  if (satBadge && satTasks.length > 0) {
    const totalSatCount = document.querySelectorAll('.day-card[data-day="Sat"] .task-card').length + satTasks.length;
    let doneSatCount = 0;
    document.querySelectorAll('.day-card[data-day="Sat"] .task-card').forEach(c => {
      if (AppState.isTaskDone(c.getAttribute('data-task-id'))) doneSatCount++;
    });
    satTasks.forEach(t => { if (AppState.isTaskDone(t.id)) doneSatCount++; });
    satBadge.textContent = `${doneSatCount} / ${totalSatCount} done (+${satTasks.length} spill)`;
  }

  const sunBadge = document.querySelector('.day-card[data-day="Sun"] .day-badge');
  if (sunBadge && sunTasks.length > 0) {
    const totalSunCount = document.querySelectorAll('.day-card[data-day="Sun"] .task-card').length + sunTasks.length;
    let doneSunCount = 0;
    document.querySelectorAll('.day-card[data-day="Sun"] .task-card').forEach(c => {
      if (AppState.isTaskDone(c.getAttribute('data-task-id'))) doneSunCount++;
    });
    sunTasks.forEach(t => { if (AppState.isTaskDone(t.id)) doneSunCount++; });
    sunBadge.textContent = `${doneSunCount} / ${totalSunCount} done (+${sunTasks.length} spill)`;
  }
}

function updateTaskCardVisual(card, isDone) {
  const btn = card.querySelector('.task-toggle-btn, .task-checkbox');
  const icon = btn?.querySelector('.material-symbols-outlined') || btn?.querySelector('svg');
  const title = card.querySelector('.task-title, .task-text');
  const desc = card.querySelector('.task-desc');

  if (isDone) {
    card.classList.add('completed');
    card.setAttribute('data-completed', 'true');
    if (btn) {
      btn.setAttribute('aria-checked', 'true');
      btn.className = 'task-toggle-btn task-checkbox checkbox-spring shrink-0 mt-0.5 w-4 h-4 rounded-[3px] bg-primary border-primary flex items-center justify-center shadow-sm cursor-pointer';
    }
    if (icon) {
      icon.className = 'material-symbols-outlined text-[13px] text-on-primary font-bold opacity-100 transition-opacity';
    }
    if (title) {
      title.className = 'task-title font-body-md text-xs sm:text-[13px] text-on-surface-variant/60 line-through leading-snug break-words transition-all duration-150';
    }
    if (desc) {
      desc.classList.add('line-through', 'opacity-50');
    }
  } else {
    card.classList.remove('completed');
    card.setAttribute('data-completed', 'false');
    if (btn) {
      btn.setAttribute('aria-checked', 'false');
      btn.className = 'task-toggle-btn task-checkbox checkbox-spring shrink-0 mt-0.5 w-4 h-4 rounded-[3px] bg-surface-container-lowest border border-outline-variant/50 group-hover:border-primary flex items-center justify-center shadow-sm cursor-pointer';
    }
    if (icon) {
      icon.className = 'material-symbols-outlined text-[13px] text-on-primary font-bold opacity-0 transition-opacity';
    }
    if (title) {
      title.className = 'task-title font-body-md text-xs sm:text-[13px] text-on-surface leading-snug break-words transition-all duration-150';
    }
    if (desc) {
      desc.classList.remove('line-through', 'opacity-50');
    }
  }

  // Spaced Repetition Retention Stage Badge
  const taskId = card.getAttribute('data-task-id');
  let srBadge = card.querySelector('.task-sr-badge');
  if (isDone && taskId && AppState.data.srQueue && AppState.data.srQueue[taskId]) {
    const item = AppState.data.srQueue[taskId];
    const todayStr = (window.SpacedRepetitionEngine && window.SpacedRepetitionEngine.getStudyDateStr()) || new Date().toISOString().slice(0, 10);
    const isDue = item.nextReview <= todayStr;
    const stageName = item.stage >= 5 ? '⭐ Mastered' : `Stage ${item.stage || 1} (${item.interval || 1}d)`;

    if (!srBadge) {
      srBadge = document.createElement('span');
      srBadge.className = 'task-sr-badge shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded transition-all select-none';
      const titleWrapper = card.querySelector('.flex.flex-wrap.items-center.gap-2') || card.querySelector('.flex-col');
      if (titleWrapper) {
        titleWrapper.appendChild(srBadge);
      }
    }
    if (isDue) {
      srBadge.className = 'task-sr-badge shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 select-none';
      srBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>Due Recall`;
      srBadge.title = `Memory review due today! Interval: ${item.interval} days`;
    } else {
      srBadge.className = 'task-sr-badge shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 select-none';
      srBadge.textContent = stageName;
      srBadge.title = `Next spaced recall review: ${item.nextReview}`;
    }
  } else if (!isDone && srBadge) {
    srBadge.remove();
  }
}



function updateWeekProgress() {
  const allCards = document.querySelectorAll('.task-card, .task-item');
  const total = allCards.length;
  let done = 0;
  let loggedHours = 0;

  allCards.forEach(card => {
    const tid = card.getAttribute('data-task-id');
    const h = parseFloat(card.getAttribute('data-hours')) || 2.5;
    if (AppState.isTaskDone(tid)) {
      done++;
      loggedHours += h;
    }
  });

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;


  const fill = document.getElementById('progress-bar-fill') || document.getElementById('week-progress-fill');
  const completedCountEl = document.getElementById('completed-count');
  const progressPercentEl = document.getElementById('progress-percent');
  const loggedHoursLabel = document.getElementById('logged-hours-label');
  
  if (fill) fill.style.width = pct + '%';
  if (completedCountEl) completedCountEl.textContent = done;
  if (progressPercentEl) progressPercentEl.textContent = `${pct}%`;
  if (loggedHoursLabel) loggedHoursLabel.textContent = `${loggedHours.toFixed(1)}h`;

  // Update Countdown & Streak on Week Page (5:30 AM IST boundary)
  const targetDateUtc = Date.UTC(2027, 6, 1);
  const curDateUtc = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const diffDays = Math.max(0, Math.ceil((targetDateUtc - curDateUtc) / 86400000));
  const countdownBadge = document.getElementById('target-countdown-badge');
  if (countdownBadge) countdownBadge.textContent = `T-${diffDays}d`;

  const statsObj = StreakEngine.getStats(AppState.data.activityLog || {});
  const streakBadge = document.getElementById('streak-stat-badge');
  if (streakBadge) streakBadge.textContent = `${statsObj.current}d`;
}

function isWeekAllDone() {
  const allCards = document.querySelectorAll('.task-card, .task-item');
  return allCards.length > 0 && Array.from(allCards).every(card => {
    const tid = card.getAttribute('data-task-id');
    return AppState.isTaskDone(tid);
  });
}

function updateDayProgress() {
  const dayCards = document.querySelectorAll('.day-card');
  dayCards.forEach(card => {
    const tasks = card.querySelectorAll('.task-card, .task-item');
    const badge = card.querySelector('.day-badge, .day-progress');
    if (badge && tasks.length > 0) {
      let done = 0;
      tasks.forEach(t => {
        const tid = t.getAttribute('data-task-id');
        if (AppState.isTaskDone(tid)) done++;
      });
      badge.textContent = `${done} / ${tasks.length} done`;
      if (done === tasks.length && done > 0) {
        badge.className = 'day-badge day-progress font-mono text-xs font-semibold text-primary';
      } else if (done > 0) {
        badge.className = 'day-badge day-progress font-mono text-xs font-medium text-primary/80';
      } else {
        badge.className = 'day-badge day-progress font-mono text-xs text-on-surface-variant';
      }
    }
  });
}



// ==========================================================================
// Dashboard (index.html) Controller & Today's Focus Engine
// ==========================================================================
function initDashboard(roadmapData = window.DASHBOARD_DATA || window.ROADMAP_DATA) {
  if (!roadmapData) roadmapData = window.DASHBOARD_DATA || window.ROADMAP_DATA || [];
  if (!AppState._initialized) {
    AppState.init();
  }
  SpacedRepetitionEngine.initTaskCache(roadmapData);

  // Anchor Today's Command Center strictly to today's date (5:30 AM IST rollover)
  const calInfo = getRoadmapCalendarInfo();
  let selectedWeekNum = calInfo.weekNum;
  let selectedDayCode = calInfo.dayCode;

  // Auto-rollover day at 5:30 AM IST without requiring page reload
  let lastKnownDiffDays = calInfo.diffDays;
  setInterval(() => {
    const latestCal = getRoadmapCalendarInfo();
    if (latestCal.diffDays !== lastKnownDiffDays) {
      lastKnownDiffDays = latestCal.diffDays;
      selectedWeekNum = latestCal.weekNum;
      selectedDayCode = latestCal.dayCode;
      renderTodayCommandCenter();
      renderMemoryDeck();
      renderBacklogQueue();
      render50WeekHeatmap();
    }
  }, 30000);

  window.renderTodayCommandCenter = renderTodayCommandCenter;
  window.renderMemoryDeck = renderMemoryDeck;
  window.renderBacklogQueue = renderBacklogQueue;
  window.renderDashboardStats = renderDashboardStats;

  function renderTodayCommandCenter() {
    const currentWeek = roadmapData.find(w => w.week_num === selectedWeekNum) || roadmapData[0];
    const currentDay = currentWeek.days.find(d => d.day_code === selectedDayCode) || currentWeek.days[0];
    const isWeekend = ['Sat', 'Sun'].includes(currentDay.day_code);

    const titleEl = document.getElementById('today-day-title');
    if (titleEl) {
      titleEl.innerHTML = `<strong>${currentDay.day_name}</strong> &bull; Week ${String(currentWeek.week_num).padStart(2, '0')}`;
    }

    const budgetEl = document.getElementById('today-budget-pill');
    if (budgetEl) {
      budgetEl.className = `px-2 py-0.5 rounded font-mono-metric-md text-[11px] border ${isWeekend ? 'bg-primary/20 text-primary border-primary/30 font-semibold' : 'bg-surface-container text-on-surface-variant border-outline-variant/20'}`;
      budgetEl.textContent = isWeekend ? '⚡ 8h Deep Focus' : '⏱️ 4h Budget';
    }

    const openWeekLink = document.getElementById('today-open-week-link');
    if (openWeekLink) {
      openWeekLink.setAttribute('href', `weeks/week-${String(currentWeek.week_num).padStart(2, '0')}.html`);
      openWeekLink.innerHTML = `<span>Open Week</span> &rarr;`;
    }

    // Populate Day Picker Select
    const picker = document.getElementById('today-day-picker');
    if (picker && !picker._initialized) {
      picker._initialized = true;
      picker.innerHTML = '';
      currentWeek.days.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.day_code;
        opt.textContent = `${d.day_name} (${['Sat','Sun'].includes(d.day_code)?'8h':'4h'})`;
        if (d.day_code === selectedDayCode) opt.selected = true;
        picker.appendChild(opt);
      });
      picker.addEventListener('change', (e) => {
        selectedDayCode = e.target.value;
        renderTodayCommandCenter();
      });
    }

    // Render Tasks
    const listContainer = document.getElementById('today-tasks-list');
    if (!listContainer) return;

    let tasksHtml = '';
    let completedCount = 0;
    let totalEstimatedMinutes = 0;
    let completedEstimatedMinutes = 0;

    currentDay.tasks.forEach(t => {
      const isDone = AppState.isTaskDone(t.id);
      const isDeferred = AppState.isTaskDeferred(t.id);
      if (isDone) completedCount++;

      let duration = '2.5h';
      let mins = 150;
      let tagText = 'CORE';

      if (t.track_id === 'dsa') {
        duration = '1.5h';
        mins = 90;
        tagText = 'DSA';
      } else if (isWeekend && t.track_id === 'aiml') {
        duration = '4.0h';
        mins = 240;
        tagText = 'AI/ML';
      } else if (t.track_id === 'aiml') {
        tagText = 'AI/ML';
      } else if (t.track_id === 'corecs') {
        tagText = 'CORE';
      } else if (['aptitude', 'backend'].includes(t.track_id)) {
        tagText = t.track_id === 'backend' ? 'JAVA' : 'APT';
      }

      totalEstimatedMinutes += mins;
      if (isDone) completedEstimatedMinutes += mins;

      const titleHtml = t.title || t.raw || '';
      const cleanTaskTitle = (t.title || t.raw || '').replace(/<[^>]*>/g, '').replace(/"/g, '&quot;').trim();
      const hasDesc = t.desc && t.desc.trim().length > 0;
      const descHtml = hasDesc ? `
        <div class="task-desc text-[12px] text-on-surface-variant leading-relaxed break-words font-normal pl-0.5 pt-0.5 ${isDone ? 'line-through opacity-50' : ''}">
          ${t.desc}
        </div>
      ` : '';

      const deferredBadge = (isDeferred && !isDone) ? `
        <span class="text-[10px] text-primary font-mono-metric-md flex items-center gap-0.5" title="Deferred to weekend">⏳</span>
      ` : '';

      tasksHtml += `
        <div class="task-row group flex items-start justify-between px-5 py-3 hover:bg-surface-container-highest/30 transition-colors duration-150 cursor-pointer ${isDone ? 'completed' : ''}" data-task-id="${t.id}" onclick="if(!event.target.closest('.today-task-checkbox-btn') && !event.target.closest('a')) { const cb = this.querySelector('.today-task-checkbox-btn'); if(cb) cb.click(); }">
          <div class="flex items-start gap-3.5 min-w-0 flex-1">
            <button type="button" role="checkbox" aria-checked="${isDone ? 'true' : 'false'}" aria-label="Toggle task: ${cleanTaskTitle}" class="today-task-checkbox-btn checkbox-spring shrink-0 mt-0.5 w-4 h-4 rounded-[3px] ${isDone ? 'bg-primary border-primary' : 'bg-surface-container-lowest border border-outline-variant/50 group-hover:border-primary'} flex items-center justify-center shadow-sm cursor-pointer" onclick="event.stopPropagation(); AppState.setTask('${t.id}', ${!isDone}); renderTodayCommandCenter(); renderBacklogQueue(); renderDashboardStats();">
              <span class="material-symbols-outlined text-[13px] text-on-primary font-bold ${isDone ? 'opacity-100' : 'opacity-0'} transition-opacity">check</span>
            </button>
            <div class="flex flex-col gap-1 min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2 min-w-0">
                <span class="task-tag shrink-0 px-2 py-0.5 rounded bg-surface-container border border-outline-variant/20 font-label-caps text-[10px] text-on-surface-variant font-semibold uppercase">${tagText}</span>
                <span class="task-title font-body-md text-xs sm:text-[13px] ${isDone ? 'text-on-surface-variant/60 line-through' : 'text-on-surface'} font-semibold leading-snug break-words transition-all duration-150">${titleHtml}</span>
              </div>
              ${descHtml}
            </div>
          </div>
          <div class="flex items-center gap-2.5 shrink-0 pl-3 pt-0.5">
            ${deferredBadge}
            <span class="text-xs text-on-surface-variant/60 font-mono-metric-md">${duration}</span>
          </div>
        </div>
      `;
    });

    listContainer.innerHTML = tasksHtml;

    // Queue Counters & Progress Bar (No % in Today box)
    const totalCount = currentDay.tasks.length;
    const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    
    const completedCounter = document.getElementById('queue-completed-counter');
    const totalCounter = document.getElementById('queue-total-counter');
    const progressBar = document.getElementById('queue-progress-bar');

    if (completedCounter) completedCounter.textContent = completedCount;
    if (totalCounter) totalCounter.textContent = totalCount;
    if (progressBar) progressBar.style.width = `${pct}%`;
  }

  function renderBacklogQueue() {
    const listContainer = document.getElementById('backlog-tasks-list');
    if (!listContainer) return;

    const cal = getRoadmapCalendarInfo();
    const dayCodes = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Collect all past tasks in sequence from farthest past to recent past
    const backlogTasks = [];

    if (!cal.isBeforeStart) {
      for (const w of roadmapData) {
        if (w.week_num > cal.weekNum) break;
        for (const d of w.days) {
          const dIdx = dayCodes.indexOf(d.day_code);
          const isPast = (w.week_num < cal.weekNum) || (w.week_num === cal.weekNum && dIdx < cal.dayIndex);
          if (isPast) {
            d.tasks.forEach(t => {
              if (!t.is_rest) {
                backlogTasks.push({
                  ...t,
                  weekNum: w.week_num,
                  dayCode: d.day_code,
                  dayName: d.day_name
                });
              }
            });
          }
        }
      }
    }

    const incompleteTasks = backlogTasks.filter(t => !AppState.isTaskDone(t.id));
    const totalBacklogCount = backlogTasks.length;
    const completedBacklogCount = backlogTasks.filter(t => AppState.isTaskDone(t.id)).length;

    const completedCounter = document.getElementById('backlog-completed-counter');
    const totalCounter = document.getElementById('backlog-total-counter');
    const progressBar = document.getElementById('backlog-progress-bar');

    if (completedCounter) completedCounter.textContent = completedBacklogCount;
    if (totalCounter) totalCounter.textContent = totalBacklogCount;
    if (progressBar) {
      const pct = totalBacklogCount > 0 ? Math.round((completedBacklogCount / totalBacklogCount) * 100) : 100;
      progressBar.style.width = `${pct}%`;
    }

    const backlogSection = document.getElementById('backlog-section');
    if (backlogTasks.length === 0 || incompleteTasks.length === 0) {
      if (backlogSection) backlogSection.style.display = 'none';
      listContainer.innerHTML = '';
      return;
    }
    if (backlogSection) backlogSection.style.display = 'block';

    // Sequence: Incomplete tasks first (farthest past to recent past), followed by completed past tasks
    const orderedTasks = [...incompleteTasks, ...backlogTasks.filter(t => AppState.isTaskDone(t.id))];

    let html = '';
    orderedTasks.forEach(t => {
      const isDone = AppState.isTaskDone(t.id);
      let duration = '2.5h';
      let tagText = 'CORE';
      if (t.track_id === 'dsa') {
        duration = '1.5h';
        tagText = 'DSA';
      } else if (t.track_id === 'aiml') {
        duration = ['Sat', 'Sun'].includes(t.dayCode) ? '4.0h' : '2.5h';
        tagText = 'AI/ML';
      } else if (['aptitude', 'backend'].includes(t.track_id)) {
        tagText = t.track_id === 'backend' ? 'JAVA' : 'APT';
      }

      const titleHtml = t.title || t.raw || '';
      const cleanTaskTitle = (t.title || t.raw || '').replace(/<[^>]*>/g, '').replace(/"/g, '&quot;').trim();
      const hasDesc = t.desc && t.desc.trim().length > 0;
      const descHtml = hasDesc ? `
        <div class="task-desc text-[12px] text-on-surface-variant leading-relaxed break-words font-normal pl-0.5 pt-0.5 ${isDone ? 'line-through opacity-50' : ''}">
          ${t.desc}
        </div>
      ` : '';

      html += `
        <div class="task-row group flex items-start justify-between px-5 py-3 hover:bg-surface-container-highest/30 transition-colors duration-150 cursor-pointer ${isDone ? 'completed' : ''}" data-task-id="${t.id}" onclick="if(!event.target.closest('.backlog-task-checkbox-btn') && !event.target.closest('a')) { const cb = this.querySelector('.backlog-task-checkbox-btn'); if(cb) cb.click(); }">
          <div class="flex items-start gap-3.5 min-w-0 flex-1">
            <button type="button" role="checkbox" aria-checked="${isDone ? 'true' : 'false'}" aria-label="Toggle backlog task: ${cleanTaskTitle}" class="backlog-task-checkbox-btn checkbox-spring shrink-0 mt-0.5 w-4 h-4 rounded-[3px] ${isDone ? 'bg-primary border-primary' : 'bg-surface-container-lowest border border-outline-variant/50 group-hover:border-primary'} flex items-center justify-center shadow-sm cursor-pointer" onclick="event.stopPropagation(); AppState.setTask('${t.id}', ${!isDone}); renderBacklogQueue(); renderTodayCommandCenter(); renderDashboardStats();">
              <span class="material-symbols-outlined text-[13px] text-on-primary font-bold ${isDone ? 'opacity-100' : 'opacity-0'} transition-opacity">check</span>
            </button>
            <div class="flex flex-col gap-1 min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2 min-w-0">
                <span class="px-2 py-0.5 rounded bg-surface-container border border-outline-variant/20 font-mono text-[10px] text-on-surface-variant font-semibold uppercase">W${String(t.weekNum).padStart(2, '0')} ${t.dayCode}</span>
                <span class="task-tag shrink-0 px-2 py-0.5 rounded bg-surface-container border border-outline-variant/20 font-label-caps text-[10px] text-on-surface-variant font-semibold uppercase">${tagText}</span>
                <span class="task-title font-body-md text-xs sm:text-[13px] ${isDone ? 'text-on-surface-variant/60 line-through' : 'text-on-surface'} font-semibold leading-snug break-words transition-all duration-150">${titleHtml}</span>
              </div>
              ${descHtml}
            </div>
          </div>
          <div class="flex items-center gap-2.5 shrink-0 pl-3 pt-0.5">
            <span class="text-xs text-on-surface-variant/60 font-mono-metric-md">${duration}</span>
          </div>
        </div>
      `;
    });

    listContainer.innerHTML = html;
  }

  function renderMemoryDeck() {
    const container = document.getElementById('memory-deck-list');
    if (!container) return;

    SpacedRepetitionEngine.initTaskCache(roadmapData);
    const { totalDue, tasks } = SpacedRepetitionEngine.getDueTasks(5);
    const stats = SpacedRepetitionEngine.getStats();

    // Minimal Header Counters
    const dueCounter = document.getElementById('deck-due-counter');
    const masteredCounter = document.getElementById('deck-mastered-counter');
    const subtitle = document.getElementById('deck-subtitle');

    if (dueCounter) dueCounter.textContent = totalDue;
    if (masteredCounter) masteredCounter.textContent = stats.masteredCount;
    if (subtitle) {
      subtitle.textContent = totalDue > 0 ? `${totalDue} due for review` : 'Spaced repetition';
    }

    // 1-Line Minimal Consolidated State
    if (tasks.length === 0) {
      container.innerHTML = `
        <div class="px-5 py-3.5 flex items-center justify-between text-xs text-on-surface-variant/60 font-mono select-none">
          <div class="flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400/80"></span>
            <span>All reviews caught up</span>
          </div>
          <span class="text-[11px] text-on-surface-variant/40">Next unlock tomorrow 5:30 AM IST</span>
        </div>
      `;
      return;
    }

    let deckHtml = '';
    tasks.forEach(t => {
      const meta = SpacedRepetitionEngine.getTaskMeta(t.taskId) || t.meta || {};
      const item = t.item || {};
      const curInterval = item.interval || 1;
      const reps = item.reps || 0;
      const ease = item.easeFactor || 2.5;

      const nextGood = reps === 0 ? 3 : (reps === 1 ? 7 : Math.max(curInterval + 2, Math.round(curInterval * ease)));
      const nextEasy = reps === 0 ? 5 : (reps === 1 ? 14 : Math.max(curInterval + 4, Math.round(curInterval * ease * 1.3)));

      let tagText = 'CORE';
      if (meta.trackId === 'dsa') tagText = 'DSA';
      else if (meta.trackId === 'aiml') tagText = 'AI/ML';
      else if (meta.trackId === 'backend') tagText = 'JAVA';
      else if (meta.trackId === 'aptitude') tagText = 'APT';

      const weekOrigin = meta.weekNum ? `W${String(meta.weekNum).padStart(2, '0')}` : '';
      const dayOrigin = meta.dayCode || '';
      const originStr = [weekOrigin, dayOrigin].filter(Boolean).join(' ');

      const titleHtml = meta.title || t.taskId;
      const overdueStr = t.overdueDays > 0 ? `<span class="text-amber-400/80 font-mono text-[11px] font-normal shrink-0">+${t.overdueDays}d</span>` : '';

      deckHtml += `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3 hover:bg-surface-container-highest/20 transition-colors duration-150 gap-2.5" data-recall-id="${t.taskId}">
          <div class="flex items-start sm:items-center gap-3 min-w-0 flex-1">
            <span class="task-tag shrink-0 px-2 py-0.5 rounded bg-surface-container border border-outline-variant/20 font-label-caps text-[10px] text-on-surface-variant font-semibold uppercase">${tagText}</span>
            <div class="flex flex-col min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap min-w-0">
                <span class="task-title font-body-md text-xs sm:text-[13px] text-on-surface font-semibold leading-snug break-words">${titleHtml}</span>
                <span class="text-[11px] font-mono text-on-surface-variant/40 shrink-0">${originStr ? originStr + ' &bull; ' : ''}${curInterval}d</span>
                ${overdueStr}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-1 shrink-0 self-end sm:self-center">
            <div class="inline-flex rounded-md border border-outline-variant/20 bg-surface-container-lowest overflow-hidden divide-x divide-outline-variant/15 text-xs font-mono">
              <button type="button" class="px-2.5 py-1 text-on-surface-variant hover:text-red-400 hover:bg-red-500/10 active:scale-95 transition-all cursor-pointer" onclick="SpacedRepetitionEngine.submitReview('${t.taskId}', 'again');" title="Reset interval to 1d">Again</button>
              <button type="button" class="px-2.5 py-1 text-on-surface-variant hover:text-primary hover:bg-primary/10 active:scale-95 transition-all cursor-pointer" onclick="SpacedRepetitionEngine.submitReview('${t.taskId}', 'good');" title="Next review in ${nextGood}d">Good +${nextGood}d</button>
              <button type="button" class="px-2.5 py-1 text-on-surface-variant hover:text-emerald-400 hover:bg-emerald-500/10 active:scale-95 transition-all cursor-pointer" onclick="SpacedRepetitionEngine.submitReview('${t.taskId}', 'easy');" title="Next review in ${nextEasy}d">Easy +${nextEasy}d</button>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = deckHtml;
  }

  function render50WeekHeatmap() {
    const container = document.getElementById('heatmap-months-container');
    if (!container) return;

    // Today is the strict end point of the 1-year contribution window
    // Day rolls over strictly at 5:30 AM IST (00:00:00 UTC)
    const now = new Date();
    const todayYear = now.getUTCFullYear();
    const todayMonth = now.getUTCMonth();
    const todayDate = now.getUTCDate();
    const todayUtc = Date.UTC(todayYear, todayMonth, todayDate);
    const todayStr = new Date(todayUtc).toISOString().slice(0, 10);

    // Synchronize tasks completed in AppState.data.tasks to activityLog for today if needed
    const validPattern = /^w\d+_[a-z]+_[a-z0-9]+$/;
    const tasksDoneCount = Object.keys(AppState.data.tasks || {}).filter(k => AppState.data.tasks[k] && validPattern.test(k)).length;
    if (tasksDoneCount === 0) {
      AppState.data.activityLog = {};
    } else {
      let totalInLog = 0;
      Object.values(AppState.data.activityLog).forEach(v => totalInLog += (Number(v) || 0));
      if (tasksDoneCount > totalInLog) {
        AppState.data.activityLog[todayStr] = (AppState.data.activityLog[todayStr] || 0) + (tasksDoneCount - totalInLog);
      }
    }

    // Exactly 1 year ago today: starting on todayDate of the same month last year (e.g., 13 Sep 2025 to 13 Sep 2026)
    const startYear = todayYear - 1;
    const daysInStartMonth = new Date(Date.UTC(startYear, todayMonth + 1, 0)).getUTCDate();
    const startDate = Math.min(todayDate, daysInStartMonth);
    const startUtc = Date.UTC(startYear, todayMonth, startDate);

    // Group days from start to today by Year-Month
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const months = [];
    let curUtc = startUtc;

    while (curUtc <= todayUtc) {
      const curDateObj = new Date(curUtc);
      const y = curDateObj.getUTCFullYear();
      const m = curDateObj.getUTCMonth();
      const mKey = `${y}-${m}`;

      if (months.length === 0 || months[months.length - 1].key !== mKey) {
        months.push({
          key: mKey,
          name: monthNames[m],
          year: y,
          days: []
        });
      }

      const dateStr = curDateObj.toISOString().slice(0, 10);
      const dayOfWeek = curDateObj.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
      const isToday = (curUtc === todayUtc);

      months[months.length - 1].days.push({
        date: curDateObj,
        dateStr: dateStr,
        dayOfWeek: dayOfWeek,
        isToday: isToday,
        dayNum: curDateObj.getUTCDate()
      });

      curUtc += 86400000;
    }

    // Calculate task completion statistics across the past one year
    let totalTasksCompleted = 0;
    let activeDays = 0;
    let maxStreak = 0;
    let currentStreak = 0;

    if (tasksDoneCount > 0) {
      months.forEach(m => {
        m.days.forEach(d => {
          const count = AppState.data.activityLog[d.dateStr] || 0;
          if (count > 0) {
            totalTasksCompleted += count;
            activeDays++;
            currentStreak++;
            if (currentStreak > maxStreak) maxStreak = currentStreak;
          } else {
            currentStreak = 0;
          }
        });
      });

      if (window.StreakEngine) {
        try {
          const seStats = StreakEngine.getStats(AppState.data.activityLog || {});
          if (seStats.longest && seStats.longest > maxStreak) {
            maxStreak = seStats.longest;
          }
        } catch (e) {}
      }
    }

    // Update top header stats
    const totalEl = document.getElementById('heatmap-total-completed');
    const activeEl = document.getElementById('heatmap-active-days');
    const streakEl = document.getElementById('heatmap-max-streak');

    if (totalEl) totalEl.textContent = totalTasksCompleted;
    if (activeEl) activeEl.textContent = activeDays;
    if (streakEl) streakEl.textContent = maxStreak;

    // Populate month clusters
    container.innerHTML = '';

    months.forEach(m => {
      const monthCol = document.createElement('div');
      monthCol.className = 'flex flex-col items-center gap-2 shrink-0';

      const grid = document.createElement('div');
      grid.className = 'leetcode-month-grid';

      // 1. Invisible placeholders before the first day of this month
      // Row 0 = Sunday, Row 1 = Monday, ..., Row 6 = Saturday
      const startDow = m.days[0].dayOfWeek; // 0..6 (Sun..Sat)
      for (let i = 0; i < startDow; i++) {
        const placeholder = document.createElement('div');
        placeholder.className = 'leetcode-cell-placeholder';
        grid.appendChild(placeholder);
      }

      // 2. Real calendar days in this month
      m.days.forEach(d => {
        const cell = document.createElement('div');
        const count = tasksDoneCount === 0 ? 0 : (AppState.data.activityLog[d.dateStr] || 0);

        // Theme palette: Inactive dark surface -> Soft violet -> Medium violet -> Primary container -> Primary lavender
        let bgColor = 'bg-[#242429]'; // Level 0: Inactive
        if (count === 1) {
          bgColor = 'bg-[#8083ff]/30'; // Level 1: Theme Soft Indigo
        } else if (count === 2) {
          bgColor = 'bg-[#8083ff]/60'; // Level 2: Theme Medium Indigo
        } else if (count === 3) {
          bgColor = 'bg-[#8083ff]'; // Level 3: Theme Vibrant Container
        } else if (count >= 4) {
          bgColor = 'bg-[#c0c1ff]'; // Level 4: Theme Primary Accent
        }

        const todayRing = d.isToday ? ' ring-1 ring-[#c0c1ff]/70' : '';
        cell.className = `leetcode-cell ${bgColor}${todayRing}`;
        cell.title = count === 0
          ? `No tasks completed on ${d.dateStr}${d.isToday ? ' (Today)' : ''}`
          : `${count} task${count === 1 ? '' : 's'} completed on ${d.dateStr}${d.isToday ? ' (Today)' : ''}`;

        grid.appendChild(cell);
      });


      // 3. Invisible placeholders after the last day to fill the last column to 7 slots
      const totalSlots = startDow + m.days.length;
      const remainder = totalSlots % 7;
      if (remainder !== 0) {
        const fillSlots = 7 - remainder;
        for (let i = 0; i < fillSlots; i++) {
          const placeholder = document.createElement('div');
          placeholder.className = 'leetcode-cell-placeholder';
          grid.appendChild(placeholder);
        }
      }

      monthCol.appendChild(grid);

      // Month name label at bottom
      const label = document.createElement('span');
      label.className = 'text-[11px] text-zinc-400 font-normal select-none pt-0.5';
      label.textContent = m.name;
      monthCol.appendChild(label);

      container.appendChild(monthCol);
    });

    // Auto-scroll to today (the rightmost side) on smaller screens
    const wrapper = container.parentElement;
    if (wrapper) {
      wrapper.scrollLeft = wrapper.scrollWidth;
    }
  }

  function initQuietAccordion() {
    const toggles = document.querySelectorAll('.phase-toggle');
    toggles.forEach(toggle => {
      if (toggle._initialized) return;
      toggle._initialized = true;

      toggle.addEventListener('click', () => {
        const card = toggle.closest('[data-phase-card]');
        const content = card.querySelector('.accordion-content');
        const chevron = toggle.querySelector('.chevron-icon');

        const isExpanded = content.classList.contains('max-h-[800px]') || content.classList.contains('max-h-[1200px]');

        if (isExpanded) {
          content.classList.remove('max-h-[800px]', 'max-h-[1200px]', 'opacity-100', 'border-outline-variant/20');
          content.classList.add('max-h-0', 'opacity-0', 'border-transparent');
          if (chevron) chevron.classList.remove('rotate-180', 'text-primary');
          card.classList.remove('border', 'border-primary/40');
        } else {
          content.classList.remove('max-h-0', 'opacity-0', 'border-transparent');
          content.classList.add('max-h-[1200px]', 'opacity-100', 'border-outline-variant/20');
          if (chevron) chevron.classList.add('rotate-180', 'text-primary');
          card.classList.add('border', 'border-primary/40');
        }
      });
    });
  }

  function renderDashboardStats() {
    let totalTasksGlobal = 0;
    let completedTasksGlobal = 0;
    let completedWeeksGlobal = 0;
    let totalLoggedHours = 0;
    let firstIncompleteWeek = null;

    const trackCounts = { dsa: 0, aiml: 0, corecs: 0, backend: 0 };
    const trackCompleted = { dsa: 0, aiml: 0, corecs: 0, backend: 0 };
    const phaseStats = {};

    roadmapData.forEach(w => {
      let weekTotal = 0;
      let weekDone = 0;
      const pNum = w.phase_num;

      if (!phaseStats[pNum]) {
        phaseStats[pNum] = { total: 0, done: 0, weeksTotal: 0, weeksDone: 0 };
      }
      phaseStats[pNum].weeksTotal++;

      w.days.forEach(d => {
        const isWeekend = ['Sat', 'Sun'].includes(d.day_code);
        d.tasks.forEach(t => {
          if (!t.is_rest) {
            weekTotal++;
            totalTasksGlobal++;
            phaseStats[pNum].total++;

            let h = 2.5;
            if (t.track_id === 'dsa') h = 1.5;
            else if (isWeekend && t.track_id === 'aiml') h = 4.0;
            
            const trackKey = ['aptitude', 'backend'].includes(t.track_id) ? 'backend' : t.track_id;
            if (trackKey in trackCounts) trackCounts[trackKey]++;

            if (AppState.isTaskDone(t.id)) {
              weekDone++;
              completedTasksGlobal++;
              totalLoggedHours += h;
              phaseStats[pNum].done++;
              if (trackKey in trackCompleted) trackCompleted[trackKey]++;
            }
          }
        });
      });

      const isWeekDone = weekTotal > 0 && weekDone === weekTotal;
      if (isWeekDone) {
        completedWeeksGlobal++;
        phaseStats[pNum].weeksDone++;
      } else if (!firstIncompleteWeek) {
        firstIncompleteWeek = w.week_num;
      }

      // Update week micro-card inside accordion
      const weekTasksEl = document.getElementById(`dash-week-${w.week_num}-tasks`);
      const weekPctEl = document.getElementById(`dash-week-${w.week_num}-pct`);
      if (weekTasksEl) weekTasksEl.textContent = `${weekDone}/${weekTotal} Tasks`;
      if (weekPctEl) {
        const pct = weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0;
        weekPctEl.textContent = `${pct}%`;
        if (isWeekDone) weekPctEl.className = 'font-mono-metric-md text-[10px] text-emerald-400 font-bold week-pct';
      }
    });

    // Update Phase status pills in accordion
    Object.keys(phaseStats).forEach(pNum => {
      const ps = phaseStats[pNum];
      const pPill = document.getElementById(`phase-${pNum}-status`);
      if (pPill) {
        const pPct = ps.total > 0 ? Math.round((ps.done / ps.total) * 100) : 0;
        if (pPct === 100) {
          pPill.className = 'font-mono-metric-md text-xs font-semibold text-emerald-400 phase-status-pill';
          pPill.textContent = `100% (${ps.total}/${ps.total})`;
        } else if (pPct > 0) {
          pPill.className = 'font-mono-metric-md text-xs font-semibold text-primary phase-status-pill';
          pPill.textContent = `${pPct}% (${ps.done}/${ps.total})`;
        } else {
          pPill.className = 'font-mono-metric-md text-xs font-semibold text-on-surface-variant phase-status-pill';
          pPill.textContent = `0% (${ps.weeksTotal} Weeks)`;
        }
      }
    });

    // Overall Progress & Vitals Bar
    const globalPct = totalTasksGlobal > 0 ? ((completedTasksGlobal / totalTasksGlobal) * 100).toFixed(1) : 0;
    
    const elPct = document.getElementById('stat-pct-done');
    if (elPct) elPct.textContent = `${globalPct}%`;

    const globalBar = document.getElementById('global-progress-bar');
    if (globalBar) globalBar.style.width = `${globalPct}%`;

    const elLoggedHours = document.getElementById('vitals-logged-hours');
    if (elLoggedHours) elLoggedHours.textContent = `${totalLoggedHours.toFixed(1)}h`;

    const elTasksSub = document.getElementById('stat-tasks-done-sub');
    if (elTasksSub) elTasksSub.textContent = `${completedTasksGlobal} tasks completed`;

    // Target Countdown to July 2027 (5:30 AM IST boundary)
    const targetDateUtc = Date.UTC(2027, 6, 1);
    const curDateUtc = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    const diffDays = Math.max(0, Math.ceil((targetDateUtc - curDateUtc) / 86400000));
    const elCountdown = document.getElementById('vitals-countdown-val');
    if (elCountdown) elCountdown.textContent = `${diffDays}d`;

    // Streak
    const stats = StreakEngine.getStats(AppState.data.activityLog || {});
    const elStreakVal = document.getElementById('streak-current-val');
    if (elStreakVal) elStreakVal.textContent = stats.current;

    const elStreakBadge = document.getElementById('streak-stat-badge');
    if (elStreakBadge) elStreakBadge.textContent = `${stats.current}d`;

    // Subsystem Workload Distribution
    let dsaPct = 35, aimlPct = 30, corecsPct = 20, backendPct = 15;
    if (completedTasksGlobal > 0) {
      dsaPct = Math.round((trackCompleted.dsa / completedTasksGlobal) * 100);
      aimlPct = Math.round((trackCompleted.aiml / completedTasksGlobal) * 100);
      corecsPct = Math.round((trackCompleted.corecs / completedTasksGlobal) * 100);
      backendPct = Math.max(0, 100 - (dsaPct + aimlPct + corecsPct));
    }
    
    const dsaPctEl = document.getElementById('workload-dsa-pct');
    const dsaBarEl = document.getElementById('workload-dsa-bar');
    if (dsaPctEl) dsaPctEl.textContent = `${dsaPct}%`;
    if (dsaBarEl) dsaBarEl.style.width = `${dsaPct}%`;

    const aimlPctEl = document.getElementById('workload-aiml-pct');
    const aimlBarEl = document.getElementById('workload-aiml-bar');
    if (aimlPctEl) aimlPctEl.textContent = `${aimlPct}%`;
    if (aimlBarEl) aimlBarEl.style.width = `${aimlPct}%`;

    const corecsPctEl = document.getElementById('workload-corecs-pct');
    const corecsBarEl = document.getElementById('workload-corecs-bar');
    if (corecsPctEl) corecsPctEl.textContent = `${corecsPct}%`;
    if (corecsBarEl) corecsBarEl.style.width = `${corecsPct}%`;

    const backendPctEl = document.getElementById('workload-backend-pct');
    const backendBarEl = document.getElementById('workload-backend-bar');
    if (backendPctEl) backendPctEl.textContent = `${backendPct}%`;
    if (backendBarEl) backendBarEl.style.width = `${backendPct}%`;

    renderTodayCommandCenter();
    renderMemoryDeck();
    renderBacklogQueue();
    render50WeekHeatmap();
    initQuietAccordion();
  }

  // Smooth scroll for segmented nav
  document.querySelectorAll('.nav-segmented-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('href');
      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth' });
        document.querySelectorAll('.nav-segmented-btn').forEach(b => {
          b.classList.remove('bg-surface-container-high', 'font-semibold', 'text-on-surface');
          b.classList.add('text-on-surface-variant', 'font-medium');
        });
        btn.classList.add('bg-surface-container-high', 'font-semibold', 'text-on-surface');
        btn.classList.remove('text-on-surface-variant', 'font-medium');
      }
    });
  });

  renderDashboardStats();

  AppState.onDataLoaded(() => {
    renderTodayCommandCenter();
    renderMemoryDeck();
    renderBacklogQueue();
    render50WeekHeatmap();
    renderDashboardStats();
  });
}

// ==========================================================================
// Premium Silk Page Transitions (Cross-document Navigation Blending)
// ==========================================================================
function initPageTransitions() {
  window.addEventListener('pageshow', () => {
    document.body.classList.remove('page-leaving');
  });

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    // Ignore anchors, JS links, new tab targets, downloads, and external protocols
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || link.target === '_blank' || link.hasAttribute('download')) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    // Check if navigating to another HTML file in tracker
    const isInternalNav = href.endsWith('.html') || href.includes('week-') || href.includes('index.html') || href.startsWith('./') || href.startsWith('../');
    if (!isInternalNav) return;

    // Immediately flush any unsaved state to Supabase before navigating
    AppState.flushCloudSync();

    e.preventDefault();
    document.body.classList.add('page-leaving');
    setTimeout(() => {
      window.location.href = href;
    }, 120);
  });
}

// ==========================================================================
// Minimal Global Roadmap Search (Ctrl+F / Cmd+F / Ctrl+K / /)
// ==========================================================================
const GlobalSearch = {
  matches: [],
  currentIndex: -1,
  isOpen: false,
  query: '',
  hasNavigated: false,

  init() {
    this.injectUI();
    this.bindEvents();
    this.checkUrlParams();
  },

  injectUI() {
    if (document.getElementById('global-search-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'global-search-bar';
    bar.className = 'fixed top-3.5 right-6 flex items-center bg-[#1c1c1f]/95 border border-white/15 rounded-xl shadow-2xl px-3 py-1.5 gap-1.5 sm:gap-2 backdrop-blur-md transition-all duration-150 select-none text-on-surface';
    bar.style.display = 'none';
    bar.style.zIndex = '9999';
    bar.innerHTML = `
      <input id="global-search-input" type="text" autocomplete="off" spellcheck="false" placeholder="Find in 50 weeks..." class="bg-transparent text-xs sm:text-[13px] text-white/90 placeholder:text-white/30 outline-none border-none focus:ring-0 w-36 sm:w-56 py-0.5" />
      <button id="global-search-week-pill" type="button" class="text-[10px] font-mono text-primary bg-primary/10 border border-primary/25 hover:bg-primary/20 px-1.5 py-0.5 rounded font-medium shrink-0 cursor-pointer transition-colors" style="display: none;" title="Open Week">W01</button>
      <span id="global-search-count" class="text-xs font-mono text-white/50 min-w-[28px] text-right shrink-0">0/0</span>
      <div class="h-4 w-[1px] bg-white/20 mx-1 shrink-0"></div>
      <button id="global-search-prev" type="button" class="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer flex items-center justify-center shrink-0 disabled:opacity-25 disabled:cursor-not-allowed" title="Previous (Left Arrow / Shift+Enter)">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <button id="global-search-next" type="button" class="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer flex items-center justify-center shrink-0 disabled:opacity-25 disabled:cursor-not-allowed" title="Next (Right Arrow / Enter)">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
      <button id="global-search-close" type="button" class="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer flex items-center justify-center shrink-0 ml-0.5" title="Close (Escape)">
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;
    (document.documentElement || document.body).appendChild(bar);
  },

  bindEvents() {
    const input = document.getElementById('global-search-input');
    const weekPill = document.getElementById('global-search-week-pill');
    const prevBtn = document.getElementById('global-search-prev');
    const nextBtn = document.getElementById('global-search-next');
    const closeBtn = document.getElementById('global-search-close');

    if (input) {
      input.addEventListener('input', (e) => {
        this.hasNavigated = false;
        this.performSearch(e.target.value.trim(), true);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.onEnterPressed(e.shiftKey);
        } else if (e.key === 'ArrowRight' && (input.selectionStart === input.value.length || e.altKey)) {
          e.preventDefault();
          this.navigateMatch(1, true);
        } else if (e.key === 'ArrowLeft' && (input.selectionStart === 0 || e.altKey)) {
          e.preventDefault();
          this.navigateMatch(-1, true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.close();
        }
      });
    }

    if (weekPill) {
      weekPill.addEventListener('click', () => {
        this.applyCurrentMatch(true);
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.navigateMatch(-1, true));
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.navigateMatch(1, true));
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    window.addEventListener('keydown', (e) => {
      const isSearchShortcut = (e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'k');
      const isSlashShortcut = e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);

      if (isSearchShortcut || isSlashShortcut) {
        e.preventDefault();
        this.open();
      } else if (e.key === 'Escape' && this.isOpen) {
        e.preventDefault();
        this.close();
      }
    });
  },

  onEnterPressed(shiftKey) {
    if (this.matches.length === 0) return;
    const currentWeek = this.getCurrentWeekNum();
    const match = this.matches[this.currentIndex];

    // If currently not on the match week and user just pressed Enter, open the first match
    if (currentWeek !== match.weekNum && this.currentIndex === 0 && !this.hasNavigated) {
      this.hasNavigated = true;
      this.applyCurrentMatch(true);
      return;
    }

    this.navigateMatch(shiftKey ? -1 : 1, true);
  },

  open(initialQuery = '') {
    this.injectUI();
    const bar = document.getElementById('global-search-bar');
    const input = document.getElementById('global-search-input');
    const trigger = document.getElementById('global-search-trigger-btn');
    const weekActions = document.getElementById('week-header-actions');
    if (!bar || !input) return;

    bar.style.display = 'flex';
    if (trigger) trigger.style.display = 'none';
    if (weekActions) weekActions.style.opacity = '0';
    this.isOpen = true;

    if (initialQuery) {
      input.value = initialQuery;
      this.performSearch(initialQuery, false);
    }

    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
  },

  close() {
    const bar = document.getElementById('global-search-bar');
    const trigger = document.getElementById('global-search-trigger-btn');
    const weekActions = document.getElementById('week-header-actions');
    if (bar) bar.style.display = 'none';
    if (trigger) trigger.style.display = 'flex';
    if (weekActions) weekActions.style.opacity = '1';
    this.isOpen = false;
    this.clearHighlight();

    // Clean URL query params without reloading
    const url = new URL(window.location.href);
    if (url.searchParams.has('q')) {
      url.searchParams.delete('q');
      url.searchParams.delete('m');
      window.history.replaceState(null, '', url.pathname + (url.hash || ''));
    }
  },

  stripHtml(html) {
    return (html || '').replace(/<[^>]*>/g, ' ');
  },

  performSearch(query, isTyping = false) {
    this.query = query;
    this.matches = [];

    const countEl = document.getElementById('global-search-count');
    const weekPill = document.getElementById('global-search-week-pill');
    const prevBtn = document.getElementById('global-search-prev');
    const nextBtn = document.getElementById('global-search-next');

    if (!query || query.length < 2) {
      if (countEl) countEl.textContent = '0/0';
      if (weekPill) weekPill.style.display = 'none';
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      this.clearHighlight();
      return;
    }

    const q = query.toLowerCase();
    const roadmap = window.ROADMAP_DATA || window.DASHBOARD_DATA || [];

    roadmap.forEach(w => {
      const wNum = w.week_num;
      const wTitle = this.stripHtml(w.title || '');
      const wDeliv = this.stripHtml((w.deliverables || []).map(d => d.text || d.html || '').join(' '));

      if (wTitle.toLowerCase().includes(q)) {
        this.matches.push({
          weekNum: wNum,
          type: 'week-title',
          title: wTitle,
          taskId: null
        });
      }

      (w.days || []).forEach(d => {
        (d.tasks || []).forEach(t => {
          const tTitle = this.stripHtml(t.title || t.raw || '');
          const tDesc = this.stripHtml(t.desc || '');
          const tRaw = this.stripHtml(t.raw || '');
          const fullText = `${tTitle} ${tDesc} ${tRaw}`.toLowerCase();

          if (fullText.includes(q)) {
            this.matches.push({
              weekNum: wNum,
              dayCode: d.day_code,
              dayName: d.day_name,
              taskId: t.id,
              trackId: t.track_id,
              title: tTitle,
              desc: tDesc,
              type: 'task'
            });
          }
        });
      });

      if (wDeliv.toLowerCase().includes(q)) {
        this.matches.push({
          weekNum: wNum,
          type: 'deliverable',
          title: `Week ${wNum} Deliverable`,
          taskId: null
        });
      }
    });

    if (this.matches.length === 0) {
      if (countEl) {
        countEl.textContent = '0/0';
        countEl.className = 'text-xs font-mono text-red-400/80 min-w-[34px] text-right shrink-0';
      }
      if (weekPill) weekPill.style.display = 'none';
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      this.clearHighlight();
      return;
    }

    if (countEl) {
      countEl.className = 'text-xs font-mono text-on-surface-variant/80 min-w-[34px] text-right shrink-0';
    }
    if (prevBtn) prevBtn.disabled = false;
    if (nextBtn) nextBtn.disabled = false;

    if (this.currentIndex < 0 || this.currentIndex >= this.matches.length) {
      this.currentIndex = 0;
    }

    this.updateMatchDisplay();

    if (!isTyping) {
      this.applyCurrentMatch(false);
    }
  },

  updateMatchDisplay() {
    const countEl = document.getElementById('global-search-count');
    const weekPill = document.getElementById('global-search-week-pill');
    if (!countEl || this.matches.length === 0) return;

    countEl.textContent = `${this.currentIndex + 1}/${this.matches.length}`;

    const currentMatch = this.matches[this.currentIndex];
    if (weekPill && currentMatch) {
      weekPill.style.display = 'inline-block';
      weekPill.textContent = `W${String(currentMatch.weekNum).padStart(2, '0')}${currentMatch.dayCode ? ' ' + currentMatch.dayCode : ''}`;
    }
  },

  navigateMatch(direction, autoLoad = true) {
    if (this.matches.length === 0) return;
    const currentWeek = this.getCurrentWeekNum();
    const currentMatch = this.matches[this.currentIndex];

    // If currently not on the match week and user clicked next on the first match without navigating yet:
    if (currentWeek !== currentMatch.weekNum && this.currentIndex === 0 && direction === 1 && !this.hasNavigated) {
      this.hasNavigated = true;
      this.applyCurrentMatch(true);
      return;
    }

    this.hasNavigated = true;
    this.currentIndex = (this.currentIndex + direction + this.matches.length) % this.matches.length;
    this.updateMatchDisplay();
    this.applyCurrentMatch(autoLoad);
  },

  applyCurrentMatch(autoLoad = true) {
    if (this.matches.length === 0 || this.currentIndex < 0) return;
    const match = this.matches[this.currentIndex];
    const currentWeek = this.getCurrentWeekNum();

    if (currentWeek === match.weekNum) {
      this.highlightMatch(match);
      if (match.taskId) {
        window.history.replaceState(null, '', `#${match.taskId}`);
      }
    } else if (autoLoad) {
      const targetUrl = this.getWeekUrl(match.weekNum, this.query, this.currentIndex, match.taskId);
      window.location.href = targetUrl;
    }
  },

  getCurrentWeekNum() {
    const m = window.location.pathname.match(/week-(\d+)\.html/i);
    return m ? parseInt(m[1], 10) : null;
  },

  getWeekUrl(weekNum, query, matchIndex, taskId) {
    const isInsideWeeksDir = window.location.pathname.includes('/weeks/');
    const prefix = isInsideWeeksDir ? '' : 'weeks/';
    const pad = String(weekNum).padStart(2, '0');
    let url = `${prefix}week-${pad}.html?q=${encodeURIComponent(query)}&m=${matchIndex}`;
    if (taskId) url += `#${taskId}`;
    return url;
  },

  highlightMatch(match) {
    this.clearHighlight();

    let el = null;
    if (match.taskId) {
      el = document.querySelector(`[data-task-id="${match.taskId}"]`);
      if (!el) {
        const altId = match.taskId.startsWith('w0')
          ? match.taskId.replace(/^w0/, 'w')
          : match.taskId.replace(/^w(\d)_/, 'w0$1_');
        el = document.querySelector(`[data-task-id="${altId}"]`);
      }
    }
    if (!el && match.type === 'deliverable') {
      el = document.querySelector('.deliverable-text') || document.getElementById('deliverable') || document.querySelector('section');
    }
    if (!el) {
      el = document.querySelector('h1');
    }

    if (el) {
      el.classList.add('task-search-highlight');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  },

  clearHighlight() {
    document.querySelectorAll('.task-search-highlight').forEach(el => {
      el.classList.remove('task-search-highlight');
    });
  },

  checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const m = params.get('m');

    if (q) {
      const matchIdx = m ? parseInt(m, 10) : 0;
      this.hasNavigated = true;
      this.open(q);
      if (!isNaN(matchIdx) && matchIdx >= 0 && matchIdx < this.matches.length) {
        this.currentIndex = matchIdx;
        this.updateMatchDisplay();
      }
      setTimeout(() => {
        this.applyCurrentMatch(false);
      }, 100);
    }
  }
};
window.GlobalSearch = GlobalSearch;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    AppState.init();
    initPageTransitions();
    GlobalSearch.init();
  });
} else {
  AppState.init();
  initPageTransitions();
  GlobalSearch.init();
}
