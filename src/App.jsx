import React, { useState, useEffect, useCallback } from 'react';
import { LogOut, Dumbbell, Bell } from 'lucide-react';
import AdminDashboard from './components/AdminDashboard.jsx';
import ReceptionScanner from './components/ReceptionScanner.jsx';
import MemberView from './components/MemberView.jsx';
import PublicRegister from './components/PublicRegister.jsx';
import ForceChangePassword from './components/ForceChangePassword.jsx';

/**
 * In dev: VITE_API_BASE_URL is empty → all /api/* calls go through Vite proxy → localhost:3000
 * In production: set VITE_API_BASE_URL to backend URL (e.g. https://b2-gym.onrender.com)
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// ── JWT-aware fetch helper ─────────────────────────────────────────────────────
export function createAuthFetch(token, onAuthError) {
  return async function authFetch(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
    const response = await fetch(fullUrl, { ...options, headers });

    if (response.status === 401) {
      const data = await response.json().catch(() => ({}));
      if (onAuthError) onAuthError(data.expired ? 'session_expired' : 'unauthorized');
      throw new Error(data.error || 'انتهت الجلسة، الرجاء تسجيل الدخول مجدداً');
    }

    return response;
  };
}

// ── Storage keys ───────────────────────────────────────────────────────────────
const LS_TOKEN = 'b2_jwt_token';
const LS_USER  = 'b2_user';
const LS_SUB   = 'b2_subscription';
const LS_MCP   = 'b2_must_change_pwd';

export default function App() {
  const [token,        setToken]        = useState(() => localStorage.getItem(LS_TOKEN) || null);
  const [user,         setUser]         = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_USER)); } catch { return null; }
  });
  const [subscription, setSubscription] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_SUB)); } catch { return null; }
  });
  const [mustChangePwd, setMustChangePwd] = useState(() => localStorage.getItem(LS_MCP) === 'true');

  const [phone,    setPhone]    = useState('');
  const [memberId, setMemberId] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications,     setNotifications]     = useState([]);

  // ── Auth-error handler ────────────────────────────────────────────────────
  const handleAuthError = useCallback((reason) => {
    clearSession();
    if (reason === 'session_expired') {
      setError('انتهت مدة الجلسة، يرجى تسجيل الدخول مجدداً.');
    }
  }, []);

  const authFetch = useCallback(
    (url, options) => createAuthFetch(token, handleAuthError)(url, options),
    [token, handleAuthError]
  );

  // ── Fetch notifications for members ───────────────────────────────────────
  useEffect(() => {
    if (user?.role === 'member' && token) {
      authFetch('/api/notifications')
        .then(res => res.ok ? res.json() : [])
        .then(data => setNotifications(Array.isArray(data) ? data : []))
        .catch(() => {});
    }
  }, [user, token]);

  // ── Poll workout unlock status every 60s for members ─────────────────────
  useEffect(() => {
    if (user?.role !== 'member' || !token) return;

    const checkUnlock = () => {
      authFetch('/api/workouts/unlock-status')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) {
            setSubscription(prev => {
              if (!prev) return prev;
              const updated = { ...prev, workout_unlocked_today: data.unlocked };
              localStorage.setItem(LS_SUB, JSON.stringify(updated));
              return updated;
            });
          }
        })
        .catch(() => {});
    };

    checkUnlock();
    const interval = setInterval(checkUnlock, 60000);
    return () => clearInterval(interval);
  }, [user, token]);

  // ── Login handler ──────────────────────────────────────────────────────────
  const handleLogin = async (e, demoPhone = null, demoId = null) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');

    const loginPhone = demoPhone || phone;
    const loginId    = demoId    || memberId;

    if (!loginPhone || !loginId) {
      setError('الرجاء إدخال رقم الهاتف ورمز الدخول');
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

      localStorage.setItem(LS_TOKEN, data.token);
      localStorage.setItem(LS_USER,  JSON.stringify(data.user));
      const mcp = data.must_change_password === true;
      localStorage.setItem(LS_MCP, String(mcp));
      if (data.subscription) {
        localStorage.setItem(LS_SUB, JSON.stringify(data.subscription));
      } else {
        localStorage.removeItem(LS_SUB);
      }

      setToken(data.token);
      setUser(data.user);
      setSubscription(data.subscription);
      setMustChangePwd(mcp);
    } catch (err) {
      setError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  // ── Logout ────────────────────────────────────────────────────────────────
  function clearSession() {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USER);
    localStorage.removeItem(LS_SUB);
    localStorage.removeItem(LS_MCP);
    setToken(null);
    setUser(null);
    setSubscription(null);
    setMustChangePwd(false);
    setPhone('');
    setMemberId('');
    setNotifications([]);
  }

  const handleLogout = () => clearSession();

  const updateSubscriptionState = (newSub) => {
    setSubscription(newSub);
    if (newSub) localStorage.setItem(LS_SUB, JSON.stringify(newSub));
    else localStorage.removeItem(LS_SUB);
  };

  const getRoleArabic = (role) => {
    switch (role) {
      case 'admin':        return 'المدير العام';
      case 'receptionist': return 'موظف الاستقبال';
      case 'member':       return 'مشترك';
      default:             return role;
    }
  };

  // ── Public registration page ───────────────────────────────────────────────
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/';
  if (currentPath === '/register-member' || currentPath === '/register') {
    return <PublicRegister apiBase={API_BASE_URL} />;
  }

  // ── FORCE CHANGE PASSWORD SCREEN (first login) ─────────────────────────────
  if (user && token && mustChangePwd) {
    return (
      <ForceChangePassword
        user={user}
        token={token}
        apiBase={API_BASE_URL}
        onSuccess={(newToken, updatedUser) => {
          localStorage.setItem(LS_TOKEN, newToken);
          localStorage.setItem(LS_USER, JSON.stringify(updatedUser));
          localStorage.setItem(LS_MCP, 'false');
          setToken(newToken);
          setUser(updatedUser);
          setMustChangePwd(false);
        }}
        onLogout={clearSession}
      />
    );
  }

  // ── LOGIN SCREEN ──────────────────────────────────────────────────────────
  if (!user || !token) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', padding: '20px', minHeight: '100vh', background: 'radial-gradient(circle at center, #1F2833 0%, #0B0C10 100%)' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#1F2833', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '16px', marginBottom: '20px', boxShadow: '0 8px 24px rgba(0,0,0,0.4), 0 0 15px rgba(255,255,255,0.03)' }}>
            <img 
              src="/logo.png" 
              className="logo"
              alt="B2 Gym Logo" 
              style={{ 
                mixBlendMode: 'normal', 
                filter: 'none', 
                opacity: 1, 
                width: '200px', 
                height: 'auto', 
                objectFit: 'contain', 
                display: 'block', 
                margin: '0 auto' 
              }} 
            />
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', marginTop: '8px' }}>بوابة اللياقة البدنية والاشتراكات الذكية</p>
        </div>

        <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '20px', textAlign: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
            تسجيل الدخول
          </h2>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">رقم الهاتف</label>
              <input
                id="login-phone"
                type="text"
                className="form-input"
                placeholder="مثال: 0599988424"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '28px' }}>
              <label className="form-label">رمز الدخول (PIN)</label>
              <input
                id="login-password"
                type="password"
                className="form-input"
                placeholder="أدخل رمز الدخول المكون من 6 أرقام"
                value={memberId}
                onChange={e => setMemberId(e.target.value)}
                disabled={loading}
              />
            </div>

            <button id="login-btn" type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '16px' }} disabled={loading}>
              {loading ? 'جاري التحقق...' : 'تسجيل الدخول'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── AUTHENTICATED APP SHELL ───────────────────────────────────────────────
  return (
    <div className="app-container">
      <header className="main-header">
        <div className="header-content">
          <div className="brand">
            <img src="/logo.png" alt="B2 Gym Logo" style={{ mixBlendMode: 'normal', filter: 'none', opacity: 1, height: '52px', width: 'auto', objectFit: 'contain', display: 'inline-block', verticalAlign: 'middle' }} />
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
                  id="notifications-btn"
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

            <button id="logout-btn" onClick={handleLogout} className="btn btn-secondary btn-icon-only" title="تسجيل الخروج" style={{ borderRadius: '50%' }}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

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
        &copy; {new Date().getFullYear()} B2 Gym. جميع الحقوق محفوظة. صُمم بكل احترافية.
      </footer>
    </div>
  );
}
