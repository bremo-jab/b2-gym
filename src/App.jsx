import React, { useState, useEffect, useCallback } from 'react';
import { LogOut, Bell, Smartphone, Download, Share2 } from 'lucide-react';
import AdminDashboard from './components/AdminDashboard.jsx';
import ReceptionScanner from './components/ReceptionScanner.jsx';
import MemberView from './components/MemberView.jsx';
import PublicRegister from './components/PublicRegister.jsx';
import ForceChangePassword from './components/ForceChangePassword.jsx';
import B2Logo from './components/B2Logo.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import PullToRefresh from './components/PullToRefresh.jsx';

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

  // ── PWA Install prompt states ─────────────────────────────────────────────
  const [deferredPrompt,   setDeferredPrompt]   = useState(null);
  const [isStandalone,     setIsStandalone]     = useState(false);
  const [isMobile,         setIsMobile]         = useState(false);
  const [isIOS,            setIsIOS]            = useState(false);
  const [showIOSModal,     setShowIOSModal]     = useState(false);
  const [installedSuccess, setInstalledSuccess] = useState(false);

  useEffect(() => {
    // Check standalone mode
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    setIsStandalone(standalone);

    // Detect Mobile screen or userAgent
    const checkIsMobile = () => {
      const userAgent = (window.navigator.userAgent || '').toLowerCase();
      const mobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      const smallScreen = typeof window !== 'undefined' && window.innerWidth <= 768;
      return mobileUA || smallScreen;
    };

    setIsMobile(checkIsMobile());

    const handleResize = () => {
      setIsMobile(checkIsMobile());
    };
    window.addEventListener('resize', handleResize);

    // Detect iOS device
    const userAgent = (window.navigator.userAgent || '').toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setInstalledSuccess(true);
      setTimeout(() => setInstalledSuccess(false), 5000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallPWA = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstalledSuccess(true);
      }
      setDeferredPrompt(null);
    } else if (isIOS) {
      setShowIOSModal(true);
    }
  };

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
  }, [user?.id, token]);

  // ── Poll workout unlock status every 60s for members ─────────────────────
  useEffect(() => {
    if (user?.role !== 'member' || !token) return;

    const checkUnlock = () => {
      authFetch('/api/workouts/unlock-status')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) {
            setSubscription(prev => {
              if (!prev || prev.workout_unlocked_today === data.unlocked) return prev;
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
  }, [user?.id, token]);

  // ── Re-fetch user profile and subscription on mount / page load ────────────
  useEffect(() => {
    if (token) {
      authFetch('/api/auth/me')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) {
            if (data.user) {
              setUser(prev => {
                if (prev && JSON.stringify(prev) === JSON.stringify(data.user)) return prev;
                localStorage.setItem(LS_USER, JSON.stringify(data.user));
                return data.user;
              });

              const mcp = data.user.must_change_password === true;
              setMustChangePwd(mcp);
              localStorage.setItem(LS_MCP, String(mcp));
            }
            if (data.subscription !== undefined) {
              setSubscription(prev => {
                if (JSON.stringify(prev) === JSON.stringify(data.subscription)) return prev;
                if (data.subscription) {
                  localStorage.setItem(LS_SUB, JSON.stringify(data.subscription));
                } else {
                  localStorage.removeItem(LS_SUB);
                }
                return data.subscription;
              });
            }
          }
        })
        .catch(err => {
          console.error('Failed to load profile on mount:', err);
        });
    }
  }, [token]);

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
      <PullToRefresh>
        <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', padding: '20px', minHeight: '100vh', background: 'radial-gradient(circle at center, #1F2833 0%, #0B0C10 100%)' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <B2Logo size="xl" style={{ marginBottom: '8px' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', fontWeight: '600', margin: 0 }}>بوابة اللياقة البدنية والاشتراكات الذكية</p>
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
                value={memberId}
                onChange={e => setMemberId(e.target.value)}
                disabled={loading}
              />
            </div>

            <button id="login-btn" type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '16px' }} disabled={loading}>
              {loading ? 'جاري التحقق...' : 'تسجيل الدخول'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--glass-border)' }}>
            <a
              href="/register-member"
              onClick={(e) => {
                e.preventDefault();
                window.location.href = '/register-member';
              }}
              className="text-accent-neon hover:text-accent-cyan text-sm font-semibold transition-colors duration-200 hover:underline"
              style={{
                color: 'var(--accent-neon)',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'color 0.2s ease'
              }}
              onMouseOver={(e) => e.target.style.color = 'var(--accent-cyan)'}
              onMouseOut={(e) => e.target.style.color = 'var(--accent-neon)'}
            >
              مشترك جديد؟ سجل حسابك الآن
            </a>
          </div>

          {/* PWA Install Button Section - Mobile Only & Non-Standalone */}
          {isMobile && !isStandalone && (deferredPrompt || isIOS) && (
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px dashed rgba(255,255,255,0.12)' }}>
              <button
                type="button"
                onClick={handleInstallPWA}
                style={{
                  width: '100%',
                  padding: '12px 18px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, rgba(173, 255, 47, 0.12) 0%, rgba(102, 252, 241, 0.12) 100%)',
                  border: '1.5px solid var(--accent-neon)',
                  color: '#fff',
                  fontWeight: '700',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  boxShadow: '0 0 20px rgba(173, 255, 47, 0.2)',
                  transition: 'all 0.3s ease'
                }}
              >
                <Smartphone size={20} color="var(--accent-neon)" />
                <span>تثبيت تطبيق B2 Gym على الهاتف 📲</span>
              </button>
            </div>
          )}

          {installedSuccess && (
            <div className="alert alert-success" style={{ marginTop: '16px', fontSize: '13px', textAlign: 'center' }}>
              🎉 تم تثبيت تطبيق B2 Gym على هاتفك بنجاح!
            </div>
          )}
        </div>

        {/* iOS Safari Installation Guide Modal */}
        {showIOSModal && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(11, 12, 16, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
            direction: 'rtl'
          }}>
            <div className="card" style={{
              maxWidth: '420px',
              width: '100%',
              background: '#19212B',
              border: '1.5px solid var(--glass-border)',
              borderRadius: '20px',
              padding: '28px',
              textAlign: 'center',
              boxShadow: '0 10px 40px rgba(0,0,0,0.6)'
            }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(102, 252, 241, 0.1)', border: '1.5px solid var(--accent-cyan)', borderRadius: '50%', padding: '16px', marginBottom: '16px' }}>
                <Smartphone size={34} color="var(--accent-cyan)" />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', marginBottom: '14px' }}>
                تثبيت التطبيق على آيفون (iOS) 📲
              </h3>
              
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '18px', textAlign: 'right', fontSize: '13px', lineHeight: '1.8', color: 'var(--text-secondary)', marginBottom: '22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ background: 'rgba(173,255,47,0.15)', border: '1px solid var(--accent-neon)', borderRadius: '8px', padding: '6px', display: 'flex', flexShrink: 0 }}>
                    <Share2 size={18} color="var(--accent-neon)" />
                  </div>
                  <div>
                    <strong>1. زر المشاركة:</strong> اضغط على أيقونة المشاركة <strong>(Share ⎘)</strong> في شريط متصفح Safari.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ background: 'rgba(102,252,241,0.15)', border: '1px solid var(--accent-cyan)', borderRadius: '8px', padding: '6px 10px', display: 'flex', flexShrink: 0 }}>
                    <span style={{ fontSize: '15px', lineHeight: 1, fontWeight: 'bold', color: 'var(--accent-cyan)' }}>➕</span>
                  </div>
                  <div>
                    <strong>2. الشاشة الرئيسية:</strong> اختر <strong>"إضافة إلى الشاشة الرئيسية" (Add to Home Screen)</strong>.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid #fff', borderRadius: '8px', padding: '4px 8px', display: 'flex', flexShrink: 0 }}>
                    <span style={{ fontSize: '12px', fontWeight: '800', color: '#fff' }}>Add</span>
                  </div>
                  <div>
                    <strong>3. تأكيد التثبيت:</strong> اضغط على <strong>"إضافة" (Add)</strong> في أعلى الزاوية.
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: '700' }}
                onClick={() => setShowIOSModal(false)}
              >
                حسناً، فهمت 👍
              </button>
            </div>
          </div>
        )}
      </div>
      </PullToRefresh>
    );
  }

  // ── AUTHENTICATED APP SHELL ───────────────────────────────────────────────
  return (
    <PullToRefresh>
      <div className="app-container">
        <header className="main-header">
          <div className="header-content">
            <div className="brand" style={{ cursor: 'pointer' }} onClick={() => window.location.reload()}>
              <B2Logo size="md" />
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
          <ErrorBoundary>
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
                onUserUpdate={(updatedUser) => {
                  setUser(updatedUser);
                  localStorage.setItem(LS_USER, JSON.stringify(updatedUser));
                }}
              />
            )}
          </ErrorBoundary>
        </main>

        <footer style={{ borderTop: '1px solid var(--glass-border)', padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', background: '#07080a' }}>
          &copy; {new Date().getFullYear()} B2 Gym. جميع الحقوق محفوظة. صُمم بكل احترافية.
        </footer>
      </div>
    </PullToRefresh>
  );
}
