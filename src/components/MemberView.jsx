/**
 * MemberView.jsx — Member portal with daily workout gate mechanic.
 * 
 * Key features:
 * 1. Real QR code via qrcode.react (encodes member_id)
 * 2. Workout tab LOCKED by default each day → unlocks after QR check-in
 * 3. Exercise library with embedded YouTube/video player
 * 4. Full workout history logging (sets/reps/weight per exercise)
 * 5. All API calls via JWT-authenticated authFetch
 */
import React, { useState, useEffect, useCallback } from 'react';
import { QrCode, ClipboardList, TrendingUp, User as UserIcon, Calendar, Trophy, AlertTriangle, Plus, Trash2, Lock, Unlock, Play, RefreshCw, Menu, X, Utensils, Apple, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import B2Logo from './B2Logo.jsx';
import { subscribeToTable } from '../supabaseClient.js';

function getYouTubeEmbedUrl(url) {
  if (!url) return '';
  const trimmed = url.trim();
  
  if (trimmed.includes('youtube.com/embed/')) {
    return trimmed;
  }
  
  let match = trimmed.match(/[?&]v=([^&#\b]+)/);
  if (match && match[1]) {
    return `https://www.youtube.com/embed/${match[1]}`;
  }
  
  match = trimmed.match(/youtu\.be\/([^?&#\b]+)/);
  if (match && match[1]) {
    return `https://www.youtube.com/embed/${match[1]}`;
  }
  
  match = trimmed.match(/youtube\.com\/shorts\/([^?&#\b]+)/);
  if (match && match[1]) {
    return `https://www.youtube.com/embed/${match[1]}`;
  }
  
  return trimmed;
}

const VALID_MEMBER_TABS = ['qr', 'workout', 'tracker', 'nutrition', 'profile'];

const getInitialMemberTab = () => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam) {
      const normalized = tabParam.toLowerCase().trim();
      if (VALID_MEMBER_TABS.includes(normalized)) return normalized;
    }
    const saved = localStorage.getItem('b2_member_tab');
    if (saved && VALID_MEMBER_TABS.includes(saved)) {
      return saved;
    }
  }
  return 'qr';
};

export default function MemberView({ currentUser, subscription, authFetch, onSubscriptionUpdate }) {
  const [activeTab, setActiveTab] = useState(getInitialMemberTab); // qr | workout | tracker | profile
  const [categories,      setCategories]      = useState([]);
  const [exercises,       setExercises]       = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [workoutLogs,     setWorkoutLogs]     = useState([]);
  const [workoutUnlocked, setWorkoutUnlocked] = useState(false);
  const [checkingUnlock,  setCheckingUnlock]  = useState(false);
  const [mobileMenuOpen,  setMobileMenuOpen]  = useState(false);

  // Sync activeTab with URL query parameter & localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('tab') !== activeTab) {
        url.searchParams.set('tab', activeTab);
        window.history.replaceState({}, '', url.toString());
      }
      localStorage.setItem('b2_member_tab', activeTab);
    }
  }, [activeTab]);

  // Workout logging state
  const [activeExerciseForLog, setActiveExerciseForLog] = useState(null);
  const [logWeight,  setLogWeight]  = useState('');
  const [logReps,    setLogReps]    = useState('');
  const [logSets,    setLogSets]    = useState('');
  const [logNotes,   setLogNotes]   = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  // Password change states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdChangeStatus, setPwdChangeStatus] = useState('');

  // Member Nutrition states
  const [activeNutritionPlan, setActiveNutritionPlan] = useState(null);
  const [availableNutritionPlans, setAvailableNutritionPlans] = useState([]);
  const [loadingNutrition, setLoadingNutrition] = useState(false);
  const [showPlanChangeModal, setShowPlanChangeModal] = useState(false);
  const [nutritionActionMsg, setNutritionActionMsg] = useState('');

  const loadMemberNutrition = useCallback(() => {
    setLoadingNutrition(true);
    authFetch('/api/member/nutrition')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setActiveNutritionPlan(data.activePlan);
          setAvailableNutritionPlans(data.availablePlans || []);
        }
      })
      .catch(err => console.error('Failed to load member nutrition:', err))
      .finally(() => setLoadingNutrition(false));
  }, [authFetch]);

  useEffect(() => {
    if (activeTab === 'nutrition') {
      loadMemberNutrition();
    }
  }, [activeTab, loadMemberNutrition]);

  const todayStr = new Date().toISOString().split('T')[0];

  // ── Subscription checks ───────────────────────────────────────────────────
  const isMonthlyExpired = !subscription
    || subscription.status === 'expired'
    || subscription.status === 'inactive'
    || subscription.status === 'cancelled'
    || (subscription.end_date && subscription.end_date < todayStr)
    || (typeof subscription.sessions_remaining === 'number' && subscription.sessions_remaining <= 0 && subscription.sessions_remaining !== null);

  // If the member has a Daily Pass active (workout unlocked today), they are not considered expired for today
  const isExpired = !workoutUnlocked && isMonthlyExpired;

  const isFrozen = subscription?.status === 'frozen';

  const getSubscriptionStatusText = () => {
    if (workoutUnlocked && isMonthlyExpired) {
      return 'حصة يومية نشطة ✓';
    }
    if (!subscription || subscription.status === 'inactive' || subscription.status === 'cancelled') {
      return 'لا يوجد اشتراك حالياً';
    }
    if (isExpired) {
      return 'منتهي — يرجى التجديد';
    }
    if (isFrozen) {
      return '❄️ مجمد';
    }
    return 'نشط ومفعل ✓';
  };

  const getSubscriptionStatusClass = () => {
    if (workoutUnlocked && isMonthlyExpired) {
      return 'badge-active';
    }
    if (isExpired) {
      return 'badge-expired';
    }
    if (isFrozen) {
      return 'badge-frozen';
    }
    return 'badge-active';
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwdChangeStatus('الرجاء تعبئة كافة الحقول');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdChangeStatus('رمز الدخول الجديد غير متطابق');
      return;
    }
    if (newPassword.length !== 6 || !/^\d{6}$/.test(newPassword)) {
      setPwdChangeStatus('رمز الدخول الجديد يجب أن يتكون من 6 أرقام فقط');
      return;
    }
    setPwdChangeStatus('جاري تغيير رمز الدخول...');
    try {
      const response = await authFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'فشل تغيير رمز الدخول');
      setPwdChangeStatus('✅ تم تغيير رمز الدخول بنجاح!');
      
      // Update local storage credentials dynamically
      const localUser = JSON.parse(localStorage.getItem('b2_user') || '{}');
      localUser.password = newPassword;
      localStorage.setItem('b2_user', JSON.stringify(localUser));

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPwdChangeStatus(''), 4000);
    } catch (err) {
      setPwdChangeStatus(`خطأ: ${err.message}`);
    }
  };

  // ── Load data on mount ────────────────────────────────────────────────────
  const loadData = useCallback(() => {
    if (!currentUser) return;

    authFetch('/api/exercises/categories')
      .then(r => r.json())
      .then(data => {
        setCategories(Array.isArray(data) ? data : []);
        if (data.length > 0 && !selectedCategory) setSelectedCategory(data[0].id);
      })
      .catch(() => {});

    authFetch('/api/exercises')
      .then(r => r.json())
      .then(data => setExercises(Array.isArray(data) ? data : []))
      .catch(() => {});

    authFetch(`/api/workouts/history/${currentUser.id}`)
      .then(r => r.json())
      .then(data => setWorkoutLogs(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [currentUser]);

  // ── Check workout unlock status ───────────────────────────────────────────
  const checkUnlockStatus = useCallback(() => {
    if (!currentUser) return;
    authFetch('/api/workouts/unlock-status')
      .then(r => r.ok ? r.json() : { unlocked: false })
      .then(data => {
        setWorkoutUnlocked(data.unlocked);
        // Sync with parent subscription state
        if (onSubscriptionUpdate && subscription) {
          onSubscriptionUpdate({ ...subscription, workout_unlocked_today: data.unlocked });
        }
      })
      .catch(() => {});
  }, [currentUser, subscription]);

  useEffect(() => {
    loadData();
    checkUnlockStatus();

    const fetchMe = () => {
      authFetch('/api/auth/me')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.subscription && onSubscriptionUpdate) {
            onSubscriptionUpdate(data.subscription);
          }
        })
        .catch(() => {});
      checkUnlockStatus();
    };

    const unsubMemberships = subscribeToTable('memberships', fetchMe, fetchMe);
    const unsubUnlocks = subscribeToTable('workout_unlocks', fetchMe, fetchMe);

    return () => {
      unsubMemberships();
      unsubUnlocks();
    };
  }, [currentUser]);

  // ── Save workout log ──────────────────────────────────────────────────────
  const handleSaveWorkoutLog = async (e) => {
    e.preventDefault();
    if (!activeExerciseForLog) return;
    if (!logSets || !logReps) {
      setSaveStatus('الرجاء إدخال عدد الجلسات والتكرار على الأقل');
      return;
    }

    setSaveStatus('جاري الحفظ...');

    try {
      const response = await authFetch('/api/workouts/log', {
        method: 'POST',
        body: JSON.stringify({
          exercise_id: activeExerciseForLog.id,
          sets: Number(logSets),
          reps: Number(logReps),
          weight: logWeight ? Number(logWeight) : null,
          notes: logNotes || null
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'فشل حفظ سجل التمرين');

      setSaveStatus('✅ تم حفظ سجل التمرين بنجاح! 💪');

      // Refresh workout history
      authFetch(`/api/workouts/history/${currentUser.id}`)
        .then(r => r.json())
        .then(data => setWorkoutLogs(Array.isArray(data) ? data : []))
        .catch(() => {});

      setTimeout(() => {
        setSaveStatus('');
        setActiveExerciseForLog(null);
        setLogWeight('');
        setLogReps('');
        setLogSets('');
        setLogNotes('');
      }, 1500);
    } catch (err) {
      setSaveStatus(`خطأ: ${err.message}`);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const categoryExercises = exercises.filter(e => e.category_id === Number(selectedCategory));

  // Group workout history by date
  const groupedLogs = workoutLogs.reduce((acc, log) => {
    const date = log.logged_at ? log.logged_at.split('T')[0] : todayStr;
    if (!acc[date]) acc[date] = [];
    acc[date].push(log);
    return acc;
  }, {});

  // Check if this exercise has a log today
  const todayLogForExercise = (exerciseId) =>
    workoutLogs.find(l => l.exercise_id === exerciseId && l.logged_at && l.logged_at.startsWith(todayStr));

  const getPlanTypeArabic = (type) => {
    switch (type) {
      case 'annual':   return 'اشتراك سنوي كامل';
      case 'monthly':  return 'اشتراك شهري كامل';
      case 'sessions': return 'باقة حصص محددة';
      default:         return type || '—';
    }
  };

  const daysUntilExpiry = () => {
    if (!subscription?.end_date) return null;
    const diff = Math.ceil((new Date(subscription.end_date + 'T00:00:00Z') - new Date(todayStr + 'T00:00:00Z')) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const daysLeft = daysUntilExpiry();

  return (
    <div>

      {/* Daily Workout Lock Banner */}
      {!isExpired && !isFrozen && !workoutUnlocked && (
        <div className="card" style={{ marginBottom: '16px', borderColor: 'rgba(173,255,47,0.3)', background: 'rgba(173,255,47,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Lock size={24} color="var(--accent-neon)" />
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: 'var(--accent-neon)' }}>التمارين مقفلة اليوم</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '12px' }}>
                  مرّر رمز QR الخاص بك عند موظف الاستقبال لفتح شاشة التمارين لهذا اليوم.
                </p>
              </div>
            </div>
            <button
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '6px 12px' }}
              disabled={checkingUnlock}
              onClick={async () => {
                setCheckingUnlock(true);
                await checkUnlockStatus();
                setCheckingUnlock(false);
              }}
            >
              <RefreshCw size={12} style={{ marginLeft: '4px' }} />
              {checkingUnlock ? 'جاري التحقق...' : 'تحديث الحالة'}
            </button>
          </div>
        </div>
      )}

      {!isExpired && !isFrozen && workoutUnlocked && (
        <div className="card" style={{ marginBottom: '16px', borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Unlock size={24} color="var(--success)" />
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: 'var(--success)' }}>✅ التمارين مفتوحة اليوم!</h3>
              <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '12px' }}>
                تم تسجيل حضورك اليوم. انتقل إلى تبويب التمارين لتسجيل وزنك وتكراراتك.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── RESPONSIVE NAVIGATION (Side Drawer on Mobile / Horizontal Pills on Desktop) ── */}
      <div className="member-nav-wrapper">
        {/* Mobile Navigation Header Bar (shown on <= 768px) */}
        <div className="member-mobile-nav-bar">
          <div className="member-mobile-active-info">
            {activeTab === 'qr' && <QrCode size={20} color="var(--accent-neon)" />}
            {activeTab === 'workout' && (!workoutUnlocked && !isExpired && !isFrozen ? <Lock size={20} color="var(--accent-neon)" /> : <ClipboardList size={20} color="var(--accent-neon)" />)}
            {activeTab === 'tracker' && <TrendingUp size={20} color="var(--accent-neon)" />}
            {activeTab === 'nutrition' && <Utensils size={20} color="var(--accent-neon)" />}
            {activeTab === 'profile' && <UserIcon size={20} color="var(--accent-neon)" />}
            <span className="member-mobile-active-label">
              {activeTab === 'qr' && 'رمز الدخول QR'}
              {activeTab === 'workout' && 'شاشة التمارين'}
              {activeTab === 'tracker' && 'سجل الأوزان'}
              {activeTab === 'nutrition' && 'الأنظمة الغذائية'}
              {activeTab === 'profile' && 'حسابي'}
            </span>
          </div>

          <button
            type="button"
            className="member-hamburger-btn"
            onClick={() => setMobileMenuOpen(prev => !prev)}
            aria-label="قائمة التبويبات"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            <span style={{ fontSize: '13px', fontWeight: '700' }}>
              {mobileMenuOpen ? 'إغلاق' : 'القائمة'}
            </span>
          </button>
        </div>

        {/* Mobile Side Drawer / Overlay (shown on <= 768px when open) */}
        {mobileMenuOpen && (
          <div className="member-mobile-drawer-overlay" onClick={() => setMobileMenuOpen(false)}>
            <div className="member-mobile-drawer" onClick={e => e.stopPropagation()}>
              <div className="member-mobile-drawer-header">
                <B2Logo size="sm" />
                <button
                  type="button"
                  className="btn-icon-close"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="member-mobile-drawer-list">
                <button
                  type="button"
                  className={`member-mobile-drawer-item ${activeTab === 'qr' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('qr');
                    setMobileMenuOpen(false);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <QrCode size={20} color={activeTab === 'qr' ? 'var(--accent-neon)' : 'var(--text-secondary)'} />
                    <span style={{ fontSize: '15px', fontWeight: activeTab === 'qr' ? '700' : '500' }}>رمز الدخول QR</span>
                  </div>
                  {activeTab === 'qr' && <span className="member-active-badge">النشط</span>}
                </button>

                <button
                  type="button"
                  className={`member-mobile-drawer-item ${activeTab === 'workout' ? 'active' : ''}`}
                  disabled={isExpired || isFrozen}
                  onClick={() => {
                    if (isExpired || isFrozen || !workoutUnlocked) return;
                    setActiveTab('workout');
                    setMobileMenuOpen(false);
                  }}
                  style={{ opacity: (!workoutUnlocked && !isExpired && !isFrozen) || isExpired || isFrozen ? 0.7 : 1 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {!workoutUnlocked && !isExpired && !isFrozen ? <Lock size={20} color={activeTab === 'workout' ? 'var(--accent-neon)' : 'var(--text-secondary)'} /> : <ClipboardList size={20} color={activeTab === 'workout' ? 'var(--accent-neon)' : 'var(--text-secondary)'} />}
                    <span style={{ fontSize: '15px', fontWeight: activeTab === 'workout' ? '700' : '500' }}>شاشة التمارين</span>
                    {!workoutUnlocked && !isExpired && !isFrozen && (
                      <span style={{ fontSize: '10px', background: 'rgba(173,255,47,0.2)', color: 'var(--accent-neon)', padding: '2px 6px', borderRadius: '4px' }}>مقفل</span>
                    )}
                  </div>
                  {activeTab === 'workout' && <span className="member-active-badge">النشط</span>}
                </button>

                <button
                  type="button"
                  className={`member-mobile-drawer-item ${activeTab === 'tracker' ? 'active' : ''}`}
                  disabled={isExpired || isFrozen}
                  onClick={() => {
                    if (isExpired || isFrozen) return;
                    setActiveTab('tracker');
                    setMobileMenuOpen(false);
                  }}
                  style={{ opacity: isExpired || isFrozen ? 0.7 : 1 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <TrendingUp size={20} color={activeTab === 'tracker' ? 'var(--accent-neon)' : 'var(--text-secondary)'} />
                    <span style={{ fontSize: '15px', fontWeight: activeTab === 'tracker' ? '700' : '500' }}>سجل الأوزان</span>
                  </div>
                  {activeTab === 'tracker' && <span className="member-active-badge">النشط</span>}
                </button>

                <button
                  type="button"
                  className={`member-mobile-drawer-item ${activeTab === 'nutrition' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('nutrition');
                    setMobileMenuOpen(false);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Utensils size={20} color={activeTab === 'nutrition' ? 'var(--accent-neon)' : 'var(--text-secondary)'} />
                    <span style={{ fontSize: '15px', fontWeight: activeTab === 'nutrition' ? '700' : '500' }}>الأنظمة الغذائية</span>
                  </div>
                  {activeTab === 'nutrition' && <span className="member-active-badge">النشط</span>}
                </button>

                <button
                  type="button"
                  className={`member-mobile-drawer-item ${activeTab === 'profile' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('profile');
                    setMobileMenuOpen(false);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <UserIcon size={20} color={activeTab === 'profile' ? 'var(--accent-neon)' : 'var(--text-secondary)'} />
                    <span style={{ fontSize: '15px', fontWeight: activeTab === 'profile' ? '700' : '500' }}>حسابي</span>
                  </div>
                  {activeTab === 'profile' && <span className="member-active-badge">النشط</span>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Desktop Tabs Header (shown on > 768px) */}
        <div className="admin-tabs-desktop member-tabs-desktop">
          <button id="member-tab-qr" className={`tab-btn ${activeTab === 'qr' ? 'active' : ''}`} onClick={() => setActiveTab('qr')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><QrCode size={18} /><span>رمز الدخول QR</span></div>
          </button>

          <button
            id="member-tab-workout"
            className={`tab-btn ${activeTab === 'workout' ? 'active' : ''}`}
            onClick={() => {
              if (isExpired || isFrozen || !workoutUnlocked) return;
              setActiveTab('workout');
            }}
            disabled={isExpired || isFrozen}
            style={{ position: 'relative', opacity: (!workoutUnlocked && !isExpired && !isFrozen) ? 0.7 : 1 }}
            title={!workoutUnlocked && !isExpired && !isFrozen ? 'يجب تسجيل الحضور أولاً لفتح التمارين' : ''}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {!workoutUnlocked && !isExpired && !isFrozen ? <Lock size={16} /> : <ClipboardList size={18} />}
              <span>شاشة التمارين</span>
              {!workoutUnlocked && !isExpired && !isFrozen && (
                <span style={{ fontSize: '10px', background: 'rgba(173,255,47,0.2)', color: 'var(--accent-neon)', padding: '2px 6px', borderRadius: '4px' }}>مقفل</span>
              )}
            </div>
          </button>

          <button
            id="member-tab-tracker"
            className={`tab-btn ${activeTab === 'tracker' ? 'active' : ''}`}
            onClick={() => { if (!isExpired && !isFrozen) setActiveTab('tracker'); }}
            disabled={isExpired || isFrozen}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><TrendingUp size={18} /><span>سجل الأوزان</span></div>
          </button>

          <button id="member-tab-nutrition" className={`tab-btn ${activeTab === 'nutrition' ? 'active' : ''}`} onClick={() => setActiveTab('nutrition')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Utensils size={18} /><span>الأنظمة الغذائية</span></div>
          </button>

          <button id="member-tab-profile" className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><UserIcon size={18} /><span>حسابي</span></div>
          </button>
        </div>
      </div>

      {/* ── TAB: QR Code ─────────────────────────────────────────────────── */}
      {activeTab === 'qr' && (
        <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <div className="card card-glow-neon" style={{ padding: '36px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <B2Logo size="md" />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#fff', marginBottom: '6px' }}>بطاقة العضوية وبوابة الدخول</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '28px' }}>
              مرّر هذا الرمز على ماسح الاستقبال لتسجيل حضورك وفتح شاشة التمارين لهذا اليوم
            </p>

            <div className="qr-container" style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
              <div style={{
                background: '#ffffff',
                padding: '20px',
                borderRadius: '16px',
                boxShadow: `0 0 40px ${isExpired ? 'rgba(239,68,68,0.25)' : 'rgba(173,255,47,0.25)'}, 0 0 80px ${isExpired ? 'rgba(239,68,68,0.08)' : 'rgba(173,255,47,0.08)'}`,
                border: `3px solid ${isExpired ? 'rgba(239,68,68,0.4)' : 'rgba(173,255,47,0.4)'}`,
                display: 'inline-block'
              }}>
                <QRCodeSVG
                  value={currentUser.member_id}
                  size={200}
                  level="H"
                  includeMargin={false}
                  fgColor="#0B0C10"
                  bgColor="#ffffff"
                />
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>الاسم:</span>
                <span style={{ fontWeight: '700' }}>{currentUser.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>رقم المشترك:</span>
                <span style={{ fontWeight: '700', color: 'var(--accent-cyan)', fontFamily: 'monospace', letterSpacing: '2px' }}>
                  {currentUser.member_id}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>تاريخ بدء الاشتراك الحالي:</span>
                <span style={{ fontWeight: '700', color: '#fff' }}>
                  {subscription?.start_date || '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>تاريخ انتهاء الاشتراك الحالي:</span>
                <span style={{ fontWeight: '700', color: isExpired ? 'var(--error)' : 'var(--accent-neon)' }}>
                  {subscription?.end_date || '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>حالة التمارين اليوم:</span>
                <span className={`badge ${workoutUnlocked ? 'badge-active' : 'badge-expired'}`}>
                  {workoutUnlocked ? '🔓 مفتوحة' : '🔒 مقفلة — سجّل حضورك'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Workout Library ─────────────────────────────────────────── */}
      {!isExpired && !isFrozen && activeTab === 'workout' && (
        <div>
          {!workoutUnlocked ? (
            <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
              <Lock size={64} color="var(--accent-neon)" style={{ margin: '0 auto 24px', display: 'block', opacity: 0.7 }} />
              <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#fff', marginBottom: '12px' }}>التمارين مقفلة اليوم</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '15px', maxWidth: '440px', margin: '0 auto 24px' }}>
                لفتح شاشة التمارين، قم بتمرير رمز QR الخاص بك على موظف الاستقبال عند دخول الصالة. سيتم فتح التمارين فوراً بعد تسجيل الحضور.
              </p>
              <button
                className="btn btn-primary"
                style={{ display: 'inline-flex', gap: '8px' }}
                onClick={() => setActiveTab('qr')}
              >
                <QrCode size={18} />
                عرض رمز QR للمسح
              </button>
            </div>
          ) : (
            <div>
              {/* Category tabs */}
              <div className="category-tabs" style={{ marginBottom: '20px' }}>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    className={`category-tab ${selectedCategory === cat.id ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat.id)}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              {/* Exercise cards */}
              <div className="grid-2">
                {categoryExercises.length === 0 ? (
                  <div className="card" style={{ gridColumn: 'span 2', textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                    لا توجد تمارين مضافة في هذا القسم حالياً.
                  </div>
                ) : (
                  categoryExercises.map(ex => {
                    const todayLog = todayLogForExercise(ex.id);
                    return (
                      <div key={ex.id} className="card">
                        <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent-cyan)', marginBottom: '10px' }}>
                          {ex.name}
                        </h3>
                        {ex.description && (
                          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.6' }}>
                            {ex.description}
                          </p>
                        )}

                        {/* Embedded Video Player */}
                        {ex.video_url && (
                          <div className="video-wrapper" style={{ marginBottom: '16px' }}>
                            <iframe
                              src={getYouTubeEmbedUrl(ex.video_url)}
                              title={ex.name}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              loading="lazy"
                            />
                          </div>
                        )}

                        {/* Today's log indicator */}
                        {todayLog && (
                          <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', padding: '10px 14px', borderRadius: '10px', marginBottom: '12px' }}>
                            <h4 style={{ fontSize: '12px', color: 'var(--success)', fontWeight: '700', marginBottom: '4px' }}>✅ سُجّل اليوم:</h4>
                            <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                              {todayLog.sets} جلسات × {todayLog.reps} تكرار
                              {todayLog.weight ? ` @ ${todayLog.weight} كجم` : ''}
                              {todayLog.notes ? ` — ${todayLog.notes}` : ''}
                            </div>
                          </div>
                        )}

                        <button
                          className="btn btn-secondary"
                          style={{ width: '100%' }}
                          onClick={() => {
                            setActiveExerciseForLog(ex);
                            if (todayLog) {
                              setLogSets(String(todayLog.sets || ''));
                              setLogReps(String(todayLog.reps || ''));
                              setLogWeight(String(todayLog.weight || ''));
                              setLogNotes(todayLog.notes || '');
                            } else {
                              setLogSets('');
                              setLogReps('');
                              setLogWeight('');
                              setLogNotes('');
                            }
                          }}
                        >
                          {todayLog ? 'تحديث تسجيل الأوزان' : 'تسجيل الأوزان والجلسات'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Workout Tracker / History ───────────────────────────────── */}
      {!isExpired && !isFrozen && activeTab === 'tracker' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '4px' }}>سجل الأداء الرياضي والأوزان</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
                  سجل جلساتك السابقة ومستوى تقدمك في الأوزان والتكرارات
                </p>
              </div>
              <button className="btn btn-secondary btn-icon-only" style={{ padding: '8px' }} onClick={loadData} title="تحديث">
                <RefreshCw size={16} />
              </button>
            </div>

            {Object.keys(groupedLogs).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <TrendingUp size={48} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }} />
                لم تقم بتسجيل أي تمارين بعد. ابدأ بالتسجيل من شاشة التمارين!
              </div>
            ) : (
              Object.keys(groupedLogs).sort((a, b) => b.localeCompare(a)).map(date => (
                <div key={date} style={{ marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-neon)', fontWeight: '700', marginBottom: '12px' }}>
                    <Calendar size={16} />
                    <span>{date === todayStr ? '📅 اليوم' : date}</span>
                  </div>
                  <div className="grid-2" style={{ gap: '12px' }}>
                    {groupedLogs[date].map(log => (
                      <div key={log.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', padding: '16px', borderRadius: '12px' }}>
                        <h4 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--accent-cyan)', marginBottom: '10px' }}>
                          {log.exercise_name || 'تمرين'}
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
                          <div style={{ background: 'rgba(102,252,241,0.05)', padding: '8px', borderRadius: '8px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>الجلسات</div>
                            <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--accent-cyan)' }}>{log.sets || '—'}</div>
                          </div>
                          <div style={{ background: 'rgba(173,255,47,0.05)', padding: '8px', borderRadius: '8px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>الوزن (كجم)</div>
                            <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--accent-neon)' }}>{log.weight || '—'}</div>
                          </div>
                          <div style={{ background: 'rgba(16,185,129,0.05)', padding: '8px', borderRadius: '8px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>التكرار</div>
                            <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--success)' }}>{log.reps || '—'}</div>
                          </div>
                        </div>
                        {log.notes && (
                          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '10px', fontStyle: 'italic' }}>
                            📝 {log.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Profile & Subscription ──────────────────────────────────── */}
      {activeTab === 'profile' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="grid-2">
            {/* Subscription Status */}
            <div className="card">
              <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '16px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                حالة اشتراك العضوية
              </h2>
              {subscription ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>نوع الباقة:</span>
                    <span style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>{subscription.plan_name || getPlanTypeArabic(subscription.plan_type)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>تاريخ البدء:</span>
                    <span style={{ fontWeight: '700' }}>{subscription.start_date}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>تاريخ الانتهاء:</span>
                    <span style={{ fontWeight: '700', color: isExpired ? 'var(--error)' : 'var(--text-primary)' }}>
                      {subscription.end_date || 'غير محدد'}
                    </span>
                  </div>
                  {subscription.sessions_remaining !== null && subscription.sessions_remaining !== undefined && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>الحصص المتبقية:</span>
                      <span style={{ fontWeight: '700', color: subscription.sessions_remaining <= 2 ? 'var(--error)' : 'var(--text-primary)' }}>
                        {subscription.sessions_remaining} حصص
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--glass-border)', paddingTop: '14px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: '700' }}>حالة البطاقة:</span>
                    <span className={`badge ${isExpired ? 'badge-expired' : isFrozen ? 'badge-frozen' : 'badge-active'}`}>
                      {isExpired ? '❌ منتهي الصلاحية' : isFrozen ? '❄️ مجمد' : '✅ نشط ومفعل'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: '700' }}>تمارين اليوم:</span>
                    <span className={`badge ${workoutUnlocked ? 'badge-active' : 'badge-expired'}`}>
                      {workoutUnlocked ? '🔓 مفتوحة' : '🔒 مقفلة'}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)' }}>
                  لا يوجد اشتراك مسجل حالياً. يرجى التوجه للاستقبال لتفعيل باقة الاشتراك.
                </div>
              )}
            </div>

            {/* Personal Profile */}
            <div className="card">
              <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '16px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                الملف الشخصي
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>الاسم الكامل:</span>
                  <span style={{ fontWeight: '700' }}>{currentUser.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>رقم الجوال:</span>
                  <span style={{ fontWeight: '700', direction: 'ltr' }}>{currentUser.phone}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>رقم المشترك (Member ID):</span>
                  <span style={{ fontWeight: '700', color: 'var(--accent-cyan)', fontFamily: 'monospace' }}>{currentUser.member_id}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>تاريخ الانضمام:</span>
                  <span style={{ fontWeight: '700' }}>
                    {currentUser.created_at ? new Date(currentUser.created_at).toLocaleDateString('ar-SA') : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>إجمالي التمارين المسجلة:</span>
                  <span style={{ fontWeight: '700', color: 'var(--accent-neon)' }}>{workoutLogs.length} جلسة</span>
                </div>
              </div>

              <div style={{ marginTop: '24px', background: 'rgba(173,255,47,0.05)', border: '1px solid rgba(173,255,47,0.2)', padding: '16px', borderRadius: '12px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <Trophy color="var(--accent-neon)" size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginBottom: '4px' }}>تلميحة اليوم لبناء القوة:</h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    الانتظام التدريبي وتدوين الأوزان هو المفتاح الأساسي للتطور الرياضي المستمر. احرص على تدوين نتائج تمرينك اليوم!
                  </p>
                </div>
              </div>
            </div>

            {/* Change Password Card */}
            <div className="card" style={{ gridColumn: 'span 2' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '16px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                تغيير رمز الدخول (PIN)
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
                قم بتحديث رمز الدخول المكون من 6 أرقام لحماية حسابك
              </p>

              {pwdChangeStatus && (
                <div className={`alert ${pwdChangeStatus.includes('نجاح') || pwdChangeStatus.includes('✅') ? 'alert-success' : 'alert-info'}`}>
                  {pwdChangeStatus}
                </div>
              )}

              <form onSubmit={handleChangePassword} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">رمز الدخول الحالي</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="رمز الدخول الحالي"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">رمز الدخول الجديد (6 أرقام)</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="6 أرقام جديدة"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    maxLength={6}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">تأكيد رمز الدخول الجديد</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="أعد إدخال الرمز الجديد"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    maxLength={6}
                    required
                  />
                </div>
                <div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                    تحديث رمز الدخول
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Nutrition & Meal Plans ────────────────────────────────────── */}
      {activeTab === 'nutrition' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Header Banner */}
          <div className="card" style={{ background: 'linear-gradient(135deg, rgba(31, 40, 51, 0.9) 0%, rgba(11, 12, 16, 0.95) 100%)', border: '1px solid var(--glass-border)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Utensils size={22} color="var(--accent-neon)" />
                  <span>برنامجك الغذائي اليومي والوجبات</span>
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '6px 0 0 0' }}>
                  تابِع وجباتك اليومية، المكونات الدقيقة، والسعرات الحرارية المقترحة لهدفك الرياضي.
                </p>
              </div>

              {activeNutritionPlan && (
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '13px', fontWeight: '700', padding: '10px 18px' }}
                  onClick={() => setShowPlanChangeModal(true)}
                >
                  <RefreshCw size={16} />
                  <span>تغيير النظام الغذائي</span>
                </button>
              )}
            </div>
          </div>

          {nutritionActionMsg && (
            <div className="alert alert-success">{nutritionActionMsg}</div>
          )}

          {loadingNutrition ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              <RefreshCw size={32} className="spin" style={{ margin: '0 auto 12px', display: 'block' }} />
              جاري تحميل خطتك الغذائية...
            </div>
          ) : activeNutritionPlan ? (
            /* Active Plan View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Active Plan Overview Card */}
              <div className="card" style={{ border: '1.5px solid rgba(173, 255, 47, 0.3)', background: 'rgba(173, 255, 47, 0.03)', boxShadow: '0 0 20px rgba(173, 255, 47, 0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <span style={{ fontSize: '11px', background: 'rgba(173,255,47,0.2)', color: 'var(--accent-neon)', padding: '3px 10px', borderRadius: '6px', fontWeight: '700' }}>
                      نظامك المفعّل حالياً ✓
                    </span>
                    <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#fff', marginTop: '8px', marginBottom: 0 }}>
                      {activeNutritionPlan.title}
                    </h3>
                  </div>
                  <span className="badge badge-active" style={{ fontSize: '12px' }}>{activeNutritionPlan.goal}</span>
                </div>

                {/* Macros summary grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--glass-border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>🔥 المستهدف اليومي</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--accent-neon)', marginTop: '2px' }}>
                      {activeNutritionPlan.total_calories} kcal
                    </div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--glass-border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>🍱 عدد الوجبات</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#fff', marginTop: '2px' }}>
                      {activeNutritionPlan.meals ? activeNutritionPlan.meals.length : activeNutritionPlan.meals_count} وجبات
                    </div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--glass-border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>🍗 إجمالي البروتين</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--accent-cyan)', marginTop: '2px' }}>
                      {(activeNutritionPlan.meals || []).reduce((acc, m) => acc + (parseInt(m.protein) || 0), 0)}g
                    </div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--glass-border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>🍚 إجمالي الكارب</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#f59e0b', marginTop: '2px' }}>
                      {(activeNutritionPlan.meals || []).reduce((acc, m) => acc + (parseInt(m.carbs) || 0), 0)}g
                    </div>
                  </div>
                </div>

                {activeNutritionPlan.notes && (
                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    💡 <strong>إرشادات المدرب:</strong> {activeNutritionPlan.notes}
                  </div>
                )}
              </div>

              {/* Meals list breakdown */}
              <h3 style={{ fontSize: '17px', fontWeight: '800', color: '#fff', margin: '8px 0 0 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Apple size={20} color="var(--accent-neon)" />
                <span>تفاصيل الوجبات اليومية</span>
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                {(activeNutritionPlan.meals || []).map((meal, index) => (
                  <div key={meal.id || index} className="card" style={{ border: '1px solid var(--glass-border)', background: 'rgba(31, 40, 51, 0.5)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                        <h4 style={{ fontSize: '16px', fontWeight: '800', color: '#fff', margin: 0 }}>
                          {meal.meal_name}
                        </h4>
                        {meal.suggested_time && (
                          <span style={{ fontSize: '11px', background: 'rgba(102, 252, 241, 0.12)', color: 'var(--accent-cyan)', padding: '3px 8px', borderRadius: '6px', fontWeight: '700', border: '1px solid rgba(102, 252, 241, 0.25)' }}>
                            ⏰ {meal.suggested_time}
                          </span>
                        )}
                      </div>

                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '16px', background: 'rgba(0,0,0,0.25)', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)' }}>
                        {meal.ingredients || 'المكونات حسب رغبة المشترك'}
                      </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '8px', fontSize: '11px' }}>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>سعرات</div>
                        <div style={{ color: 'var(--accent-neon)', fontWeight: '700' }}>{meal.calories}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>بروتين</div>
                        <div style={{ color: 'var(--accent-cyan)', fontWeight: '700' }}>{meal.protein}g</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>كارب</div>
                        <div style={{ color: '#f59e0b', fontWeight: '700' }}>{meal.carbs}g</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>دهون</div>
                        <div style={{ color: '#ec4899', fontWeight: '700' }}>{meal.fats}g</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* No Active Plan Selection View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="alert alert-info" style={{ fontSize: '14px', padding: '14px 18px' }}>
                لم تقم بتفعيل أي نظام غذائي بعد. اختر النظام الذي يتناسب مع هدفك الرياضي (تضخيم، تنشيف، أو توازن) للبدء.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                {availableNutritionPlans.map(plan => (
                  <div key={plan.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid var(--glass-border)', background: 'rgba(31, 40, 51, 0.4)' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', margin: 0 }}>{plan.title}</h3>
                        <span className="badge badge-active" style={{ fontSize: '11px' }}>{plan.goal}</span>
                      </div>

                      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '13px', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: '10px' }}>
                        <div><strong>🔥 السعرات:</strong> <span style={{ color: 'var(--accent-neon)', fontWeight: '700' }}>{plan.total_calories} kcal</span></div>
                        <div><strong>🍱 الوجبات:</strong> <span style={{ color: '#fff', fontWeight: '700' }}>{plan.meals ? plan.meals.length : plan.meals_count} وجبات</span></div>
                      </div>

                      {plan.notes && (
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
                          💡 {plan.notes}
                        </p>
                      )}
                    </div>

                    <button
                      className="btn btn-primary"
                      style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: '700', marginTop: '14px' }}
                      onClick={async () => {
                        try {
                          const res = await authFetch('/api/member/nutrition/activate', {
                            method: 'POST',
                            body: JSON.stringify({ plan_id: plan.id })
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error || 'فشل التفعيل');
                          setNutritionActionMsg(`تم تفعيل نظام [${plan.title}] بنجاح!`);
                          loadMemberNutrition();
                          setTimeout(() => setNutritionActionMsg(''), 4000);
                        } catch (err) {
                          alert(err.message);
                        }
                      }}
                    >
                      <Check size={18} />
                      <span>تفعيل هذا النظام</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Modal to Switch/Change Plan */}
          {showPlanChangeModal && (
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
                maxWidth: '650px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                background: '#19212B',
                border: '1px solid var(--glass-border)',
                borderRadius: '20px',
                padding: '24px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', margin: 0 }}>اختر النظام الغذائي البديل</h3>
                  <button className="btn-icon-close" onClick={() => setShowPlanChangeModal(false)}><X size={18} /></button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
                  {availableNutritionPlans.map(plan => {
                    const isCurrent = activeNutritionPlan && activeNutritionPlan.plan_id === plan.id;
                    return (
                      <div key={plan.id} className="card" style={{ border: isCurrent ? '1.5px solid var(--accent-neon)' : '1px solid var(--glass-border)', background: 'rgba(31, 40, 51, 0.6)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <h4 style={{ fontSize: '15px', fontWeight: '800', color: '#fff', margin: 0 }}>{plan.title}</h4>
                          {isCurrent && <span style={{ fontSize: '10px', background: 'rgba(173,255,47,0.2)', color: 'var(--accent-neon)', padding: '2px 6px', borderRadius: '4px' }}>النشط</span>}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                          🔥 {plan.total_calories} kcal | 🍱 {plan.meals_count} وجبات
                        </div>
                        <button
                          className={`btn ${isCurrent ? 'btn-secondary' : 'btn-primary'}`}
                          style={{ width: '100%', padding: '8px', fontSize: '12px' }}
                          disabled={isCurrent}
                          onClick={async () => {
                            try {
                              const res = await authFetch('/api/member/nutrition/activate', {
                                method: 'POST',
                                body: JSON.stringify({ plan_id: plan.id })
                              });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data.error || 'فشل التغيير');
                              setShowPlanChangeModal(false);
                              setNutritionActionMsg(`تم تغيير نظامك الغذائي إلى [${plan.title}]!`);
                              loadMemberNutrition();
                              setTimeout(() => setNutritionActionMsg(''), 4000);
                            } catch (err) {
                              alert(err.message);
                            }
                          }}
                        >
                          {isCurrent ? 'النظام الحالي' : 'تفعيل هذا النظام'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Workout Logger Modal ─────────────────────────────────────────── */}
      {activeExerciseForLog && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent-cyan)' }}>
                تسجيل تمرين: {activeExerciseForLog.name}
              </h3>
              <button className="btn btn-secondary btn-icon-only" style={{ padding: '4px 8px' }} onClick={() => setActiveExerciseForLog(null)}>إغلاق</button>
            </div>

            <form onSubmit={handleSaveWorkoutLog}>
              {saveStatus && (
                <div className={`alert ${saveStatus.includes('بنجاح') || saveStatus.includes('✅') ? 'alert-success' : 'alert-info'}`}>
                  {saveStatus}
                </div>
              )}

              <div className="grid-2" style={{ gap: '12px', marginBottom: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">عدد الجلسات (Sets) *</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="مثال: 3"
                    value={logSets}
                    onChange={e => setLogSets(e.target.value)}
                    min="1"
                    required
                    style={{ textAlign: 'center', fontSize: '18px', fontWeight: '700' }}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">التكرار لكل جلسة (Reps) *</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="مثال: 12"
                    value={logReps}
                    onChange={e => setLogReps(e.target.value)}
                    min="1"
                    required
                    style={{ textAlign: 'center', fontSize: '18px', fontWeight: '700' }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">الوزن المستخدم (كجم) — اختياري</label>
                <input
                  type="number"
                  step="0.5"
                  className="form-input"
                  placeholder="مثال: 60"
                  value={logWeight}
                  onChange={e => setLogWeight(e.target.value)}
                  style={{ textAlign: 'center', fontSize: '18px', fontWeight: '700' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">ملاحظات — اختياري</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="مثال: شعرت بضغط جيد في العضلة"
                  value={logNotes}
                  onChange={e => setLogNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  💪 حفظ التمرين
                </button>
                <button type="button" className="btn btn-secondary" style={{ flex: 0.5 }} onClick={() => setActiveExerciseForLog(null)}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
