import React, { useState, useEffect, useRef } from 'react';
import { Camera, UserPlus, CheckCircle, XCircle, Search, RefreshCw, Clipboard, CreditCard, Play, Smartphone } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

export default function ReceptionScanner({ currentUser, authFetch }) {
  const [activeSubTab, setActiveSubTab] = useState('scanner'); // 'scanner', 'register', 'assign'
  const [users, setUsers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [exercises, setExercises] = useState([]);

  // Check-in simulator states
  const [manualMemberId, setManualMemberId] = useState('');
  const [checkinResult, setCheckinResult] = useState(null);
  const [checkingIn, setCheckingIn] = useState(false);

  // User Registration states
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPlanId, setRegPlanId] = useState('');
  const [regStartDate, setRegStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [regStatus, setRegStatus] = useState('');

  // Exercise Assignment states
  const [assignMemberId, setAssignMemberId] = useState('');
  const [assignExerciseId, setAssignExerciseId] = useState('');
  const [assignStatus, setAssignStatus] = useState('');
  const [assignedWorkouts, setAssignedWorkouts] = useState([]);

  // Camera QR Scanner state
  const scannerRef = useRef(null);
  const [scannerActive, setScannerActive] = useState(false);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // UTC today string — consistent with server
  const todayStr = new Date().toISOString().split('T')[0];

  // ── Calendar-based end date calculator (mirrors server calcEndDate) ────────
  function calcEndDate(startDateStr, planType, durationDays) {
    if (!startDateStr || !planType) return '';
    const start = new Date(startDateStr + 'T00:00:00Z');
    const day   = start.getUTCDate();

    if (planType === 'monthly') {
      const next = new Date(start);
      next.setUTCMonth(next.getUTCMonth() + 1);
      if (next.getUTCDate() !== day) {
        next.setUTCDate(0);
      } else {
        next.setUTCDate(next.getUTCDate() - 1);
      }
      return next.toISOString().split('T')[0];
    }

    if (planType === 'annual') {
      const next = new Date(start);
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      if (next.getUTCDate() !== day) {
        next.setUTCDate(0);
      } else {
        next.setUTCDate(next.getUTCDate() - 1);
      }
      return next.toISOString().split('T')[0];
    }

    // sessions or fallback
    const fallback = new Date(start);
    fallback.setUTCDate(fallback.getUTCDate() + (durationDays || 30));
    return fallback.toISOString().split('T')[0];
  }

  // Derived end dates for registration and renewal
  const selectedRegPlan = plans.find(p => p.id === Number(regPlanId));
  const regEndDate = regPlanId && regStartDate
    ? calcEndDate(regStartDate, selectedRegPlan?.type, selectedRegPlan?.duration_days)
    : '';

  const selectedRenewPlan = plans.find(p => p.id === Number(renewPlanId));
  const renewEndDate = renewPlanId && renewStartDate
    ? calcEndDate(renewStartDate, selectedRenewPlan?.type, selectedRenewPlan?.duration_days)
    : '';

  // authFetch is provided by App.jsx — JWT Bearer token injected automatically

  const loadData = () => {
    // Load Users
    authFetch('/api/users')
      .then(res => res.ok ? res.json() : [])
      .then(data => setUsers(data))
      .catch(err => console.error('Failed to load users', err));

    // Load Plans
    authFetch('/api/plans')
      .then(res => res.ok ? res.json() : [])
      .then(data => setPlans(data))
      .catch(err => console.error('Failed to load plans', err));

    // Load Exercises
    authFetch('/api/exercises')
      .then(res => res.ok ? res.json() : [])
      .then(data => setExercises(data))
      .catch(err => console.error('Failed to load exercises', err));
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  // Handle assigned exercises view for a selected member in Assignment Tab
  useEffect(() => {
    if (assignMemberId) {
      authFetch(`/api/workouts/assigned/${assignMemberId}`)
        .then(res => res.ok ? res.json() : [])
        .then(data => setAssignedWorkouts(data))
        .catch(err => console.error('Failed to load user workouts', err));
    } else {
      setAssignedWorkouts([]);
    }
  }, [assignMemberId]);

  // ── Camera QR Scanner ──────────────────────────────────────────────────────
  const startScanner = async () => {
    try {
      await stopScanner();
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      setScannerActive(true);

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        async (decodedText) => {
          const normalizedCode = decodedText.trim().toUpperCase();
          await scanner.stop();
          scannerRef.current = null;
          setScannerActive(false);
          await handleCheckin(normalizedCode);
        },
        () => {}
      );
    } catch (err) {
      console.error('Camera error:', err);
      setScannerActive(false);
      alert('تعذر فتح الكاميرا. يرجى التأكد من منح صلاحية الكاميرا في المتصفح.');
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {}
      try {
        await scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
      setScannerActive(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  // Handle Check-in simulation
  const handleCheckin = async (memberIdToScan) => {
    const idToUse = String(memberIdToScan || manualMemberId || '').trim().toUpperCase();
    if (!idToUse) return;

    setCheckingIn(true);
    setCheckinResult(null);

    try {
      const response = await authFetch('/api/checkin', {
        method: 'POST',
        body: JSON.stringify({ member_id: idToUse })
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.status === 'expired' || data.status === 'subscription_expired' || data.status === 'frozen') {
          setCheckinResult({
            success: false,
            status: data.status === 'subscription_expired' ? 'expired' : data.status,
            message: data.message || 'عذراً، اشتراك هذا اللاعب منتهٍ!'
          });
          return;
        }
        throw new Error(data.error || data.message || 'حدث خطأ أثناء فحص الكود');
      }

      setCheckinResult(data);
      if (data.status === 'success') {
        loadData(); // reload users/subscriptions data
      }
      
      // Auto clear alert in 5 seconds
      setTimeout(() => {
        setCheckinResult(null);
      }, 7000);

    } catch (err) {
      setCheckinResult({
        status: 'error',
        message: err.message
      });
    } finally {
      setCheckingIn(false);
      setManualMemberId('');
    }
  };

  // Handle Register Member
  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regName || !regPhone) {
      setRegStatus('الرجاء إدخال الاسم ورقم الهاتف على الأقل');
      return;
    }
    setRegStatus('جاري التسجيل...');

    try {
      const response = await authFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: regName,
          phone: regPhone,
          role: 'member',
          plan_id: regPlanId ? Number(regPlanId) : null,
          start_date: regStartDate
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'فشل تسجيل العضو');
      }

      setRegStatus(`تم تسجيل المشترك بنجاح! رقم المشترك: ${data.member_id}`);
      
      // Reset form
      setRegName('');
      setRegPhone('');
      setRegPlanId('');
      
      loadData(); // refresh tables

      setTimeout(() => setRegStatus(''), 4000);

    } catch (err) {
      setRegStatus(`خطأ: ${err.message}`);
    }
  };

  // Handle Renew Subcription Cash
  const handleRenew = async (e) => {
    if (e) e.preventDefault();
    if (!selectedUserForRenew || !renewPlanId) {
      setRenewStatus('الرجاء تعبئة بيانات التجديد');
      return;
    }
    setRenewStatus('جاري معالجة الدفع كاش والتفعيل...');

    try {
      const response = await authFetch('/api/subscriptions/renew', {
        method: 'POST',
        body: JSON.stringify({
          user_id: selectedUserForRenew.id,
          plan_id: Number(renewPlanId),
          start_date: renewStartDate
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'فشل تجديد الاشتراك');
      }

      setRenewStatus('تم تجديد الاشتراك كاش وتفعيله بنجاح! 💳');
      loadData();
      
      setTimeout(() => {
        setRenewStatus('');
        setSelectedUserForRenew(null);
        setRenewPlanId('');
      }, 2000);
      
    } catch (err) {
      setRenewStatus(`خطأ: ${err.message}`);
    }
  };

  // Handle Assign Exercise
  const handleAssignExercise = async (e) => {
    e.preventDefault();
    if (!assignMemberId || !assignExerciseId) {
      setAssignStatus('الرجاء اختيار العضو والتمرين');
      return;
    }
    setAssignStatus('جاري الربط...');

    try {
      const response = await authFetch('/api/workouts/assign', {
        method: 'POST',
        body: JSON.stringify({
          member_id: Number(assignMemberId),
          exercise_id: Number(assignExerciseId)
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'فشل ربط التمرين');
      }

      setAssignStatus('تم إسناد التمرين لجدول اللاعب بنجاح!');
      setAssignExerciseId('');
      
      // Refresh list
      const uWorkouts = await authFetch(`/api/workouts/assigned/${assignMemberId}`).then(res => res.json());
      setAssignedWorkouts(uWorkouts);

      setTimeout(() => setAssignStatus(''), 2000);

    } catch (err) {
      setAssignStatus(`خطأ: ${err.message}`);
    }
  };

  // Handle Unassign Exercise
  const handleUnassignExercise = async (exerciseId) => {
    try {
      const response = await authFetch('/api/workouts/unassign', {
        method: 'POST',
        body: JSON.stringify({
          member_id: Number(assignMemberId),
          exercise_id: Number(exerciseId)
        })
      });

      if (!response.ok) throw new Error('فشل إزالة التمرين');

      setAssignedWorkouts(assignedWorkouts.filter(aw => aw.exercise_id !== Number(exerciseId)));

    } catch (err) {
      alert(err.message);
    }
  };

  // Filter users based on query
  const filteredUsers = users.filter(u => 
    u.role === 'member' && 
    (u.name.includes(searchQuery) || u.phone.includes(searchQuery) || u.member_id.includes(searchQuery))
  );

  return (
    <div>
      {/* Subnavigation Tabs */}
      <div className="tabs-header">
        <button className={`tab-btn ${activeSubTab === 'scanner' ? 'active' : ''}`} onClick={() => setActiveSubTab('scanner')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={18} />
            <span>ماسح الدخول QR والعمليات</span>
          </div>
        </button>

        <button className={`tab-btn ${activeSubTab === 'register' ? 'active' : ''}`} onClick={() => setActiveSubTab('register')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserPlus size={18} />
            <span>تسجيل جديد وتجديد الاشتراك</span>
          </div>
        </button>

        <button className={`tab-btn ${activeSubTab === 'assign' ? 'active' : ''}`} onClick={() => setActiveSubTab('assign')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clipboard size={18} />
            <span>إسناد وجدول التمارين للاعبين</span>
          </div>
        </button>
      </div>

      {/* VIEW: Scanner/Check-In */}
      {activeSubTab === 'scanner' && (
        <div className="grid-2">
          {/* QR scanner simulation card */}
          <div className="card">
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>ماسح الرمز السريع QR</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>يقوم الموظف بمسح كود اللاعب عند بوابة الدخول أو كتابة الرقم التعريفي يدوياً</p>

            {/* Real mobile camera scanner */}
            <div style={{ position: 'relative', width: '100%', height: '280px', background: '#000', borderRadius: '12px', border: '2px dashed var(--accent-cyan)', overflow: 'hidden', marginBottom: '16px' }}>
              <div id="qr-reader" style={{ width: '100%', height: '100%' }}></div>
              <div style={{ position: 'absolute', inset: '10px', border: '1px solid rgba(102, 252, 241, 0.35)', borderRadius: '10px', pointerEvents: 'none' }}></div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={startScanner} disabled={scannerActive || checkingIn}>
                <Camera size={14} />
                <span>تشغيل الكاميرا</span>
              </button>
              <button className="btn btn-secondary" onClick={stopScanner} disabled={!scannerActive}>
                <RefreshCw size={14} />
                <span>إيقاف الكاميرا</span>
              </button>
            </div>

            {/* Manual member ID input fall-back */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label">الرقم التعريفي للاعب (Member ID)</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="مثال: MEM001" 
                  value={manualMemberId}
                  onChange={e => setManualMemberId(e.target.value.toUpperCase())}
                  style={{ textTransform: 'uppercase', flex: 1, letterSpacing: '1px' }}
                />
                <button 
                  className="btn btn-primary"
                  onClick={() => handleCheckin(null)}
                  disabled={checkingIn || !manualMemberId}
                >
                  فحص وتدقيق
                </button>
              </div>
            </div>

            {/* Quick click simulation list for testing */}
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--glass-border)', padding: '12px', borderRadius: '10px' }}>
              <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '700' }}>محاكاة مسح الكود (للتجربة السريعة):</h4>
              <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {users.filter(u => u.role === 'member').map(member => (
                  <div key={member.id} className="quick-member-card">
                    <span style={{ fontSize: '13px' }}>{member.name} ({member.member_id})</span>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '4px 10px', fontSize: '11px' }}
                      onClick={() => handleCheckin(member.member_id)}
                      disabled={checkingIn}
                    >
                      مسح الكود
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CHECK-IN STATE AND ALERTS DISPLAY */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyItems: 'center', justifyContent: 'center', minHeight: '340px' }}>
              {!checkinResult ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                  <Play size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px auto', display: 'block' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginBottom: '6px' }}>في انتظار فحص كود اللاعب</h3>
                  <p style={{ fontSize: '12px' }}>بمجرد تمرير كود QR أو إدخال الرقم يدوياً، ستظهر هنا حالة الاشتراك فوراً وتأكيد الدخول.</p>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  {checkinResult.status === 'success' && (
                    <div>
                      <CheckCircle size={80} color="var(--success)" style={{ margin: '0 auto 16px auto', display: 'block', filter: 'drop-shadow(0 0 10px rgba(16,185,129,0.3))' }} />
                      <div className="alert alert-success" style={{ justifyContent: 'center', fontSize: '16px', fontWeight: '700', padding: '16px 20px' }}>
                        {checkinResult.message}
                      </div>
                      <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)', display: 'inline-block', minWidth: '280px', marginTop: '16px', textAlign: 'right' }}>
                        <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>المشترك:</strong> {checkinResult.user.name}</p>
                        <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>رقم الهاتف:</strong> {checkinResult.user.phone}</p>
                        <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>الاشتراك:</strong> {checkinResult.subscription.plan_name || 'باقة اشتراك'}</p>
                        <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>تاريخ الانتهاء:</strong> {checkinResult.subscription.end_date}</p>
                      </div>
                    </div>
                  )}

                  {(checkinResult.status === 'subscription_expired' || checkinResult.status === 'expired' || checkinResult.status === 'error') && (
                    <div>
                      <XCircle size={80} color="var(--error)" style={{ margin: '0 auto 16px auto', display: 'block', filter: 'drop-shadow(0 0 10px rgba(239,68,68,0.3))' }} />
                      <div className="alert alert-error" style={{ justifyContent: 'center', fontSize: '16px', fontWeight: '700', padding: '16px 20px' }}>
                        {checkinResult.status === 'subscription_expired' ? 'عذراً، اشتراك هذا اللاعب منتهٍ!' : checkinResult.message}
                      </div>
                      {checkinResult.user && (
                        <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)', display: 'inline-block', minWidth: '280px', marginTop: '16px', textAlign: 'right' }}>
                          <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>المشترك:</strong> {checkinResult.user.name}</p>
                          <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>رقم الهاتف:</strong> {checkinResult.user.phone}</p>
                          {checkinResult.subscription && (
                            <>
                              <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>الاشتراك منتهي بتاريخ:</strong> {checkinResult.subscription.end_date}</p>
                              {checkinResult.subscription.sessions_remaining !== null && (
                                <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>الحصص المتبقية:</strong> {checkinResult.subscription.sessions_remaining}</p>
                              )}
                            </>
                          )}
                          <button 
                            className="btn btn-primary" 
                            style={{ width: '100%', marginTop: '12px', fontSize: '13px', padding: '8px' }}
                            onClick={() => setSelectedUserForRenew(checkinResult.user)}
                          >
                            تجديد الاشتراك كاش فوراً
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {checkinResult.status === 'frozen' && (
                    <div>
                      <XCircle size={80} color="var(--warning)" style={{ margin: '0 auto 16px auto', display: 'block', filter: 'drop-shadow(0 0 10px rgba(245,158,11,0.3))' }} />
                      <div className="alert alert-error" style={{ justifyContent: 'center', fontSize: '16px', fontWeight: '700', padding: '16px 20px', background: 'var(--warning-glow)', border: '1px solid rgba(245,158,11,0.3)', color: '#FCD34D' }}>
                        {checkinResult.message}
                      </div>
                      <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)', display: 'inline-block', minWidth: '280px', marginTop: '16px', textAlign: 'right' }}>
                        <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>المشترك:</strong> {checkinResult.user.name}</p>
                        <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>رقم الهاتف:</strong> {checkinResult.user.phone}</p>
                        <button 
                          className="btn btn-secondary" 
                          style={{ width: '100%', marginTop: '12px', fontSize: '13px', padding: '8px', color: 'var(--accent-cyan)' }}
                          onClick={async () => {
                            // Quick unfreeze — uses authFetch (JWT auth)
                            await authFetch(`/api/users/${checkinResult.user.id}`, {
                              method: 'PUT',
                              body: JSON.stringify({ subscription_status: 'active' })
                            });
                            setCheckinResult(null);
                            handleCheckin(checkinResult.user.member_id);
                          }}
                        >
                          تنشيط الاشتراك وإلغاء التجميد
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW: Register & Renewals */}
      {activeSubTab === 'register' && (
        <div className="grid-2">
          {/* New Member Registration Card */}
          <div className="card">
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>سجل لاعب جديد في النظام</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>املأ البيانات لإنشاء ملف لاعب وربطه بباقة اشتراك كاش مباشرة</p>

            {regStatus && (
              <div className={`alert ${regStatus.includes('بنجاح') ? 'alert-success' : 'alert-info'}`}>
                {regStatus}
              </div>
            )}

            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label className="form-label">الاسم بالكامل (عربي)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="مثال: عبد الله بن خالد" 
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">رقم الهاتف الجوال</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="مثال: 0512345678" 
                  value={regPhone}
                  onChange={e => setRegPhone(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">باقة الاشتراك المبدئية (دفع كاش)</label>
                <select className="form-select" value={regPlanId} onChange={e => setRegPlanId(e.target.value)}>
                  <option value="">-- بدون باقة (تسجيل ملف فقط) --</option>
                  {plans.filter(p => p.is_active).map(plan => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} - {plan.price} ₪ 
                      ({plan.type === 'monthly' ? 'شهري' : plan.type === 'annual' ? 'سنوي' : `${plan.sessions_count} حصص / ${plan.duration_days} يوم`})
                    </option>
                  ))}
                </select>
              </div>

              {selectedRegPlan?.type === 'sessions' ? (
                <>
                  <div className="form-group">
                    <label className="form-label">تاريخ بدء الاشتراك</label>
                    <div className="form-input" style={{ background: 'rgba(102,252,241,0.05)', border: '1px solid rgba(102,252,241,0.2)', color: 'var(--accent-cyan)', fontWeight: '700', direction: 'ltr', textAlign: 'center', opacity: 0.7 }}>
                      {regStartDate} (تلقائي — ينتهي في نفس اليوم)
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">تاريخ انتهاء الاشتراك</label>
                    <div className="form-input" style={{ background: 'rgba(102,252,241,0.05)', border: '1px solid rgba(102,252,241,0.2)', color: 'var(--accent-cyan)', fontWeight: '700', direction: 'ltr', textAlign: 'center' }}>
                      {regStartDate} (نفس اليوم)
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">تاريخ بدء الاشتراك</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={regStartDate}
                      onChange={e => setRegStartDate(e.target.value)}
                    />
                  </div>
                  {regEndDate && (
                    <div className="form-group">
                      <label className="form-label">تاريخ انتهاء الاشتراك (محسوب تلقائياً)</label>
                      <div className="form-input" style={{ background: 'rgba(102,252,241,0.05)', border: '1px solid rgba(102,252,241,0.2)', color: 'var(--accent-cyan)', fontWeight: '700', direction: 'ltr', textAlign: 'center' }}>
                        {regEndDate}
                      </div>
                    </div>
                  )}
                </>
              )}

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }}>
                تسجيل العضو الجديد وتفعيل حسابه
              </button>
            </form>
          </div>

          {/* Members search and manual renewals directory */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800' }}>دليل اللاعبين والاشتراكات كاش</h2>
              <button className="btn btn-secondary btn-icon-only" style={{ padding: '6px' }} onClick={loadData} title="تحديث البيانات">
                <RefreshCw size={16} />
              </button>
            </div>

            {/* Search inputs */}
            <div className="form-group" style={{ position: 'relative', marginBottom: '16px' }}>
              <input 
                type="text" 
                className="form-input" 
                placeholder="ابحث بالاسم، الجوال أو رقم العضوية..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ paddingRight: '40px' }}
              />
              <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', right: '12px', top: '14px' }} />
            </div>

            <div className="table-container" style={{ maxHeight: '350px' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>اللاعب</th>
                    <th>العضوية</th>
                    <th>الحالة</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>لا يوجد لاعبون مطابقون للبحث</td>
                    </tr>
                  ) : (
                    filteredUsers.map(member => {
                      const sub = member.subscription;
                      const hasSub = !!sub;
                      const isSubExpired = !hasSub || 
                        sub.status === 'expired' || 
                        (sub.end_date && new Date(sub.end_date) < new Date(todayStr)) ||
                        (sub.total_sessions_allowed > 0 && sub.sessions_used >= sub.total_sessions_allowed);
                      
                      return (
                        <tr key={member.id}>
                          <td>
                            <div style={{ fontWeight: '700' }}>{member.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{member.phone}</div>
                          </td>
                          <td style={{ fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>{member.member_id}</td>
                          <td>
                            <span className={`badge ${!hasSub || isSubExpired ? 'badge-expired' : sub.status === 'frozen' ? 'badge-frozen' : 'badge-active'}`}>
                              {!hasSub ? 'لا يوجد اشتراك' : isSubExpired ? 'منتهي' : sub.status === 'frozen' ? 'مجمد' : 'نشط'}
                            </span>
                          </td>
                          <td>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '4px 10px', fontSize: '12px' }}
                              onClick={() => {
                                setSelectedUserForRenew(member);
                                setRenewPlanId('');
                              }}
                            >
                              تجديد كاش
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: Exercise Assignment for Members */}
      {activeSubTab === 'assign' && (
        <div className="grid-2">
          {/* Link Exercises to Players Card */}
          <div className="card">
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>إسناد التمارين إلى جدول اللاعب</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>اختر المشترك التدريبي وحدد التمرين لإضافته إلى جدول التمارين المخصصة في حسابه</p>

            {assignStatus && (
              <div className={`alert ${assignStatus.includes('بنجاح') ? 'alert-success' : 'alert-info'}`}>
                {assignStatus}
              </div>
            )}

            <form onSubmit={handleAssignExercise}>
              <div className="form-group">
                <label className="form-label">اختر اللاعب التدريبي</label>
                <select className="form-select" value={assignMemberId} onChange={e => setAssignMemberId(e.target.value)} required>
                  <option value="">-- اختر العضو الرياضي --</option>
                  {users.filter(u => u.role === 'member').map(member => (
                    <option key={member.id} value={member.id}>{member.name} ({member.member_id})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">اختر التمرين المراد ربطه</label>
                <select className="form-select" value={assignExerciseId} onChange={e => setAssignExerciseId(e.target.value)} required>
                  <option value="">-- اختر التمرين من قاعدة البيانات --</option>
                  {exercises.map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.title} (أجهزة/أقسام)</option>
                  ))}
                </select>
              </div>

              <button type="submit" className="btn btn-neon" style={{ width: '100%', marginTop: '10px' }} disabled={!assignMemberId || !assignExerciseId}>
                إسناد وربط هذا التمرين باللاعب
              </button>
            </form>
          </div>

          {/* Assigned Exercises breakdown list */}
          <div className="card">
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>تمارين اللاعب المسندة حالياً</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
              {assignMemberId 
                ? `التمارين المدرجة في جدول اللاعب: ${users.find(u => u.id === Number(assignMemberId))?.name || ''}`
                : 'الرجاء اختيار لاعب من القائمة الجانبية لاستعراض جدوله الحالي وتعديله'
              }
            </p>

            {!assignMemberId ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>
                اختر لاعباً للتحكم بجدوله الرياضي المخصص وإزالة التمارين
              </div>
            ) : assignedWorkouts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>
                لا يوجد تمارين مخصصة مسندة لهذا اللاعب حالياً. يمكنك استخدام نموذج الإسناد لإضافة تمارين.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {assignedWorkouts.map(aw => (
                  <div key={aw.id} className="quick-member-card" style={{ padding: '14px 16px' }}>
                    <div>
                      <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--accent-cyan)' }}>{aw.exercise?.title}</h4>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{aw.exercise?.description?.substring(0, 80)}...</p>
                    </div>
                    <button 
                      className="btn btn-danger" 
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                      onClick={() => handleUnassignExercise(aw.exercise_id)}
                    >
                      إزالة الربط
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RENEWAL DIALOG / MODAL */}
      {selectedUserForRenew && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent-cyan)' }}>تجديد اشتراك اللاعب كاش</h3>
              <button className="btn btn-secondary btn-icon-only" style={{ padding: '4px 8px' }} onClick={() => setSelectedUserForRenew(null)}>إلغاء</button>
            </div>

            {renewStatus && (
              <div className={`alert ${renewStatus.includes('بنجاح') ? 'alert-success' : 'alert-info'}`}>
                {renewStatus}
              </div>
            )}

            <div style={{ marginBottom: '20px', background: 'rgba(255,255,255,0.02)', padding: '12px', border: '1px solid var(--glass-border)', borderRadius: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>اللاعب:</span>
                <span style={{ fontWeight: '700' }}>{selectedUserForRenew.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>الرمز السريع:</span>
                <span style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>{selectedUserForRenew.member_id}</span>
              </div>
            </div>

            <form onSubmit={handleRenew}>
              <div className="form-group">
                <label className="form-label">اختر باقة التجديد</label>
                <select className="form-select" value={renewPlanId} onChange={e => setRenewPlanId(e.target.value)} required>
                  <option value="">-- اختر باقة الاشتراك --</option>
                  {plans.filter(p => p.is_active).map(plan => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} - {plan.price} ₪ 
                      ({plan.type === 'monthly' ? 'شهري' : plan.type === 'annual' ? 'سنوي' : `${plan.sessions_count} حصص / ${plan.duration_days} يوم`})
                    </option>
                  ))}
                </select>
              </div>

              {selectedRenewPlan?.type === 'sessions' ? (
                <>
                  <div className="form-group">
                    <label className="form-label">تاريخ تفعيل الاشتراك</label>
                    <div className="form-input" style={{ background: 'rgba(102,252,241,0.05)', border: '1px solid rgba(102,252,241,0.2)', color: 'var(--accent-cyan)', fontWeight: '700', direction: 'ltr', textAlign: 'center', opacity: 0.7 }}>
                      {renewStartDate} (تلقائي — ينتهي في نفس اليوم)
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">تاريخ انتهاء الاشتراك</label>
                    <div className="form-input" style={{ background: 'rgba(102,252,241,0.05)', border: '1px solid rgba(102,252,241,0.2)', color: 'var(--accent-cyan)', fontWeight: '700', direction: 'ltr', textAlign: 'center' }}>
                      {renewStartDate} (نفس اليوم)
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">تاريخ تفعيل الاشتراك</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={renewStartDate}
                      onChange={e => setRenewStartDate(e.target.value)}
                      required
                    />
                  </div>
                  {renewEndDate && (
                    <div className="form-group">
                      <label className="form-label">تاريخ انتهاء الاشتراك (محسوب تلقائياً)</label>
                      <div className="form-input" style={{ background: 'rgba(102,252,241,0.05)', border: '1px solid rgba(102,252,241,0.2)', color: 'var(--accent-cyan)', fontWeight: '700', direction: 'ltr', textAlign: 'center' }}>
                        {renewEndDate}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  تفعيل وحفظ الدفعة كاش
                </button>
                <button type="button" className="btn btn-secondary" style={{ flex: 0.5 }} onClick={() => setSelectedUserForRenew(null)}>
                  إلغاء الأمر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
