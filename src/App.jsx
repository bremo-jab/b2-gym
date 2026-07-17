import React, { useState, useEffect, useCallback } from 'react';
import { LogOut, Dumbbell, Bell } from 'lucide-react';
import AdminDashboard from './components/AdminDashboard.jsx';
import ReceptionScanner from './components/ReceptionScanner.jsx';
import MemberView from './components/MemberView.jsx';

/** Resolve the API base URL from VITE_API_BASE_URL (set in Vercel/Render env).
 *  In development, this falls back to the Vite proxy at localhost.
 *  In production (Vercel), this points to the Render backend. */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// ── JWT-aware fetch helper ────────────────────────────────────────────────────
/**
 * Wraps fetch() to automatically inject the stored JWT Bearer token.
 * If the server responds with 401 (expired/invalid token), it calls onAuthError
 * to force logout — preventing stale sessions from accumulating.
 */
export function createAuthFetch(token, onAuthError) {
  return async function authFetch(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    const response = await fetch(`${API_BASE_URL}${url}`, { ...options, headers });

    // Auto-logout on expired or invalid token
    if (response.status === 401) {
      const data = await response.json().catch(() => ({}));
      if (onAuthError) onAuthError(data.expired ? 'session_expired' : 'unauthorized');
      // Return a synthetic error response so callers don't need special handling
      throw new Error(data.error || 'انتهت الجلسة، الرجاء تسجيل الدخول مجدداً');
    }

    return response;
  };
}

// ── Storage keys ──────────────────────────────────────────────────────────────
const LS_TOKEN = 'b2_jwt_token';
const LS_USER  = 'b2_user';
const LS_SUB   = 'b2_subscription';

export default function App() {
  const [token,        setToken]        = useState(() => localStorage.getItem(LS_TOKEN) || null);
  const [user,         setUser]         = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_USER)); } catch { return null; }
  });
  const [subscription, setSubscription] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_SUB)); } catch { return null; }
  });

  const [phone,    setPhone]    = useState('');
  const [memberId, setMemberId] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications,     setNotifications]     = useState([]);

  // ── Auth-error handler (shared across all components) ──────────────────────
  const handleAuthError = useCallback((reason) => {
    clearSession();
    if (reason === 'session_expired') {
      setError('انتهت مدة الجلسة، يرجى تسجيل الدخول مجدداً.');
    }
  }, []);

  // ── authFetch is memoized and recreated when token changes ─────────────────
  const authFetch = useCallback(
    (url, options) => createAuthFetch(token, handleAuthError)(url, options),
    [token, handleAuthError]
  );

  // ── Fetch notifications for active members ─────────────────────────────────
  useEffect(() => {
    if (user?.role === 'member' && token) {
      authFetch('/api/notifications')
        .then(res => res.ok ? res.json() : [])
        .then(data => setNotifications(data))
        .catch(() => {}); // silent — notifications are non-critical
    }
  }, [user, token]);

  // ── Login handler ──────────────────────────────────────────────────────────
  const handleLogin = async (e, demoPhone = null, demoId = null) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');

    const loginPhone = demoPhone || phone;
    const loginId    = demoId    || memberId;

    if (!loginPhone || !loginId) {
      setError('الرجاء إدخال رقم الهاتف ورقم المشترك');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: loginPhone, member_id: loginId.trim().toUpperCase() })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'فشل تسجيل الدخول');

      // Persist JWT + user data in localStorage
      localStorage.setItem(LS_TOKEN, data.token);
      localStorage.setItem(LS_USER,  JSON.stringify(data.user));
      if (data.subscription) {
        localStorage.setItem(LS_SUB, JSON.stringify(data.subscription));
      } else {
        localStorage.removeItem(LS_SUB);
      }

      setToken(data.token);
      setUser(data.user);
      setSubscription(data.subscription);
    } catch (err) {
      setError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  // ── Logout / clear session ─────────────────────────────────────────────────
  function clearSession() {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USER);
    localStorage.removeItem(LS_SUB);
    setToken(null);
    setUser(null);
    setSubscription(null);
    setPhone('');
    setMemberId('');
    setNotifications([]);
  }

  const handleLogout = () => {
    clearSession();
  };

  // ── Subscription state sync (used by MemberView) ───────────────────────────
  const updateSubscriptionState = (newSub) => {
    setSubscription(newSub);
    if (newSub) {
      localStorage.setItem(LS_SUB, JSON.stringify(newSub));
    } else {
      localStorage.removeItem(LS_SUB);
    }
  };

  const getRoleArabic = (role) => {
    switch (role) {
      case 'admin':  return 'المدير العام';
      case 'receptionist': return 'موظف الاستقبال';
      case 'member':       return 'مشترك';
      default:             return role;
    }
  };

  // ── LOGIN SCREEN ───────────────────────────────────────────────────────────
  if (!user || !token) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', padding: '20px', minHeight: '100vh', background: 'radial-gradient(circle at center, #1F2833 0%, #0B0C10 100%)' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(173,255,47,0.1)', border: '1.5px solid var(--accent-neon)', borderRadius: '24px', padding: '16px', marginBottom: '16px', boxShadow: '0 0 20px rgba(173,255,47,0.15)' }}>
            <Dumbbell size={48} color="var(--accent-neon)" style={{ filter: 'drop-shadow(0 0 8px var(--accent-neon))' }} />
          </div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', background: 'linear-gradient(90deg, var(--accent-neon), var(--accent-cyan))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '6px' }}>B2 Gym</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>بوابة اللياقة البدنية والاشتراكات الذكية</p>
        </div>

        <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '20px', textAlign: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
            تسجيل الدخول للمشتركين والإدارة
          </h2>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">رقم الهاتف</label>
              <input
                type="text"
                className="form-input"
                placeholder="أدخل رقم الهاتف (مثال: 0511111111)"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '28px' }}>
              <label className="form-label">رمز الدخول / رقم المشترك</label>
              <input
                type="password"
                className="form-input"
                placeholder="أدخل رمز الدخول أو رقم المشترك"
                value={memberId}
                onChange={e => setMemberId(e.target.value)}
                disabled={loading}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '16px' }} disabled={loading}>
              {loading ? 'جاري التحقق...' : 'تسجيل الدخول'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── AUTHENTICATED APP SHELL ────────────────────────────────────────────────
  return (
    <div className="app-container">
      {/* Main Header */}
      <header className="main-header">
        <div className="header-content">
          <div className="brand">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(173,255,47,0.08)', border: '1px solid var(--accent-neon)', borderRadius: '10px', padding: '6px' }}>
              <Dumbbell size={24} color="var(--accent-neon)" />
            </div>
            <span className="brand-name">B2 Gym</span>
          </div>

          <div className="user-nav-status">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'right' }}>
              <span style={{ fontSize: '14px', fontWeight: '700' }}>{user.name}</span>
              <span className="badge badge-role" style={{ fontSize: '10px', marginTop: '2px', padding: '2px 8px' }}>
                {getRoleArabic(user.role)}
              </span>
            </div>

            {/* Notifications Bell — members only */}
            {user.role === 'member' && (
              <div style={{ position: 'relative' }}>
                <button
                  className="btn btn-secondary btn-icon-only"
                  onClick={() => setShowNotifications(!showNotifications)}
                  style={{ position: 'relative', borderRadius: '50%' }}
                >
                  <Bell size={18} />
                  {notifications.length > 0 && (
                    <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: 'var(--accent-orange)', width: '8px', height: '8px', borderRadius: '50%' }} />
                  )}
                </button>
                {showNotifications && (
                  <div className="card" style={{ position: 'absolute', left: 0, top: '48px', width: '320px', zIndex: 100, padding: '16px', background: 'var(--bg-secondary)' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '6px' }}>الإشعارات والتنبيهات</h4>
                    {notifications.length === 0 ? (
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>لا توجد إشعارات حالية.</p>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className={`notification-item ${n.type}`}>
                          <h5 style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>{n.title}</h5>
                          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            <button onClick={handleLogout} className="btn btn-secondary btn-icon-only" title="تسجيل الخروج" style={{ borderRadius: '50%' }}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Role-based content */}
      <main style={{ flex: 1, padding: '24px 16px', maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
        {user.role === 'admin' && (
          <AdminDashboard currentUser={user} authFetch={authFetch} />
        )}
        {user.role === 'receptionist' && (
          <ReceptionScanner currentUser={user} authFetch={authFetch} />
        )}
        {user.role === 'member' && (
          <MemberView
            currentUser={user}
            subscription={subscription}
            authFetch={authFetch}
            onSubscriptionUpdate={updateSubscriptionState}
          />
        )}
      </main>

      <footer style={{ borderTop: '1px solid var(--glass-border)', padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', background: '#07080a' }}>
        &copy; {new Date().getFullYear()} B2 Gym. جميع الحقوق محفوظة. صُمم بكل احترافية باللغة العربية.
      </footer>
    </div>
  );
}
