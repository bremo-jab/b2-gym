import React, { useState, useEffect, useRef } from 'react';
import { Camera, UserPlus, CheckCircle, XCircle, Search, RefreshCw, CreditCard, Play, Snowflake, Users, AlertCircle } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

export default function ReceptionScanner({ currentUser, authFetch }) {
  const [activeSubTab, setActiveSubTab] = useState('scanner'); // 'scanner', 'register', 'freeze'
  const [users,  setUsers]  = useState([]);
  const [plans,  setPlans]  = useState([]);

  // ── Check-in states ───────────────────────────────────────────────────────
  const [manualMemberId, setManualMemberId] = useState('');
  const [checkinResult,  setCheckinResult]  = useState(null);
  const [checkingIn,     setCheckingIn]     = useState(false);

  // ── Registration states ────────────────────────────────────────────────────
  const [regName,      setRegName]      = useState('');
  const [regPhone,     setRegPhone]     = useState('');
  const [regPlanId,    setRegPlanId]    = useState('');
  const [regStartDate, setRegStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [regStatus,    setRegStatus]    = useState('');
  const [createdCredentials, setCreatedCredentials] = useState(null);

  // ── Renewal states ────────────────────────────────────────────────────────
  const [selectedUserForRenew, setSelectedUserForRenew] = useState(null);
  const [renewPlanId,          setRenewPlanId]          = useState('');
  const [renewStartDate,       setRenewStartDate]       = useState(new Date().toISOString().split('T')[0]);
  const [renewStatus,          setRenewStatus]          = useState('');

  // ── Freeze states ─────────────────────────────────────────────────────────
  const [freezeSearchQuery, setFreezeSearchQuery] = useState('');
  const [freezeStatus,      setFreezeStatus]      = useState('');

  // Custom dialog states
  const [customAlert, setCustomAlert] = useState(null);
  const [customConfirm, setCustomConfirm] = useState(null);
  const [activationConfirmUser, setActivationConfirmUser] = useState(null);
  const [activationSuccessData, setActivationSuccessData] = useState(null);

  const showCustomAlert = (message) => {
    setCustomAlert({ message });
  };

  const showCustomConfirm = (message, onConfirm) => {
    setCustomConfirm({ message, onConfirm });
  };

  // ── Camera QR Scanner ─────────────────────────────────────────────────────
  const scannerRef = useRef(null);
  const [scannerActive, setScannerActive] = useState(false);

  // ── Search filter ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  const todayStr = new Date().toISOString().split('T')[0];

  // ── Calendar-based end date calculator ────────────────────────────────────
  function calcEndDate(startDateStr, planType, durationDays) {
    if (!startDateStr || !planType) return '';
    const start = new Date(startDateStr + 'T00:00:00Z');
    const day   = start.getUTCDate();

    if (planType === 'monthly') {
      const next = new Date(start);
      next.setUTCMonth(next.getUTCMonth() + 1);
      if (next.getUTCDate() !== day) next.setUTCDate(0);
      else next.setUTCDate(next.getUTCDate() - 1);
      return next.toISOString().split('T')[0];
    }
    if (planType === 'annual') {
      const next = new Date(start);
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      if (next.getUTCDate() !== day) next.setUTCDate(0);
      else next.setUTCDate(next.getUTCDate() - 1);
      return next.toISOString().split('T')[0];
    }
    const fallback = new Date(start);
    fallback.setUTCDate(fallback.getUTCDate() + (durationDays || 30));
    return fallback.toISOString().split('T')[0];
  }

  const selectedRegPlan   = plans.find(p => p.id === Number(regPlanId));
  const selectedRenewPlan = plans.find(p => p.id === Number(renewPlanId));

  // A "Daily Pass" = sessions plan with exactly 1 duration day
  const isDailyRenewPlan  = selectedRenewPlan?.type === 'sessions' && Number(selectedRenewPlan?.duration_days) === 1;
  const isDailyRegPlan    = selectedRegPlan?.type === 'sessions'   && Number(selectedRegPlan?.duration_days)   === 1;

  const regEndDate   = regPlanId   && regStartDate   && !isDailyRegPlan   ? calcEndDate(regStartDate,   selectedRegPlan?.type,   selectedRegPlan?.duration_days)   : '';
  const renewEndDate = renewPlanId && renewStartDate  && !isDailyRenewPlan ? calcEndDate(renewStartDate, selectedRenewPlan?.type, selectedRenewPlan?.duration_days) : '';

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadData = () => {
    authFetch('/api/users')
      .then(res => res.ok ? res.json() : [])
      .then(data => setUsers(data))
      .catch(err => console.error('Failed to load users', err));

    authFetch('/api/plans')
      .then(res => res.ok ? res.json() : [])
      .then(data => setPlans(data))
      .catch(err => console.error('Failed to load plans', err));
  };

  useEffect(() => { loadData(); }, [currentUser]);

  // ── Camera QR Scanner ─────────────────────────────────────────────────────
  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      try { await scannerRef.current.clear(); } catch {}
      scannerRef.current = null;
      setScannerActive(false);
    }
  };

  const startScanner = async () => {
    try {
      await stopScanner();
      const scanner = new Html5Qrcode('reception-qr-reader');
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
      showCustomAlert('تعذر فتح الكاميرا. يرجى التأكد من منح صلاحية الكاميرا في المتصفح.');
    }
  };

  useEffect(() => () => { stopScanner(); }, []);

  // ── Check-in handler ──────────────────────────────────────────────────────
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

      const text = await response.text();
      let data = {};
      try { data = JSON.parse(text); } catch { data = { message: text }; }

      const responseStatus = data?.status || (response.ok ? 'success' : 'error');

      if (!response.ok) {
        setCheckinResult({
          success: false,
          status: responseStatus === 'subscription_expired' ? 'expired' : responseStatus,
          user: data?.user,
          subscription: data?.subscription,
          message: data?.message || data?.error || 'حدث خطأ أثناء فحص الكود'
        });
        return;
      }

      setCheckinResult(data);
      if (responseStatus === 'success') {
        loadData();
        setTimeout(() => setCheckinResult(null), 7000);
      } else if (responseStatus !== 'already_checked_in') {
        setTimeout(() => setCheckinResult(null), 7000);
      }

    } catch (err) {
      setCheckinResult({
        status: 'error',
        message: /Failed to fetch|NetworkError/i.test(err?.message || '')
          ? 'تعذر الاتصال بالخادم. يرجى التأكد من تشغيل الخادم.'
          : (err?.message || 'حدث خطأ غير متوقع')
      });
    } finally {
      setCheckingIn(false);
      setManualMemberId('');
    }
  };

  // ── Register new member ───────────────────────────────────────────────────
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
      if (!response.ok) throw new Error(data.error || 'فشل تسجيل العضو');

      setRegStatus(`✅ تم تسجيل المشترك بنجاح! رقم المشترك: ${data.member_id}`);
      setCreatedCredentials({
        name: data.name,
        phone: data.phone,
        password: data.generated_password
      });
      setRegName('');
      setRegPhone('');
      setRegPlanId('');
      loadData();
      setTimeout(() => setRegStatus(''), 6000);
    } catch (err) {
      setRegStatus(`خطأ: ${err.message}`);
    }
  };

  const handleActivateUser = (member) => {
    setActivationConfirmUser(member);
  };

  const confirmActivation = async () => {
    if (!activationConfirmUser) return;
    const member = activationConfirmUser;
    setActivationConfirmUser(null);
    try {
      const response = await authFetch(`/api/users/${member.id}/activate`, {
        method: 'POST'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'فشل تفعيل اللاعب');
      
      loadData();
      setActivationSuccessData({
        name: member.name,
        phone: member.phone,
        password: data.generated_password
      });
    } catch (err) {
      showCustomAlert(`خطأ: ${err.message}`);
    }
  };

  // ── Renewal handler ───────────────────────────────────────────────────────
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
      if (!response.ok) throw new Error(data.error || 'فشل تجديد الاشتراك');

      setRenewStatus('✅ تم تجديد الاشتراك كاش وتفعيله بنجاح! 💳');
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

  // ── Freeze / Unfreeze ─────────────────────────────────────────────────────
  const handleFreeze = async (userId) => {
    setFreezeStatus('جاري تجميد الاشتراك...');
    try {
      const response = await authFetch('/api/subscriptions/freeze', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'فشل تجميد الاشتراك');
      setFreezeStatus('✅ تم تجميد الاشتراك بنجاح');
      loadData();
      setTimeout(() => setFreezeStatus(''), 3000);
    } catch (err) {
      setFreezeStatus(`خطأ: ${err.message}`);
    }
  };

  const handleUnfreeze = async (userId) => {
    setFreezeStatus('جاري إلغاء تجميد الاشتراك...');
    try {
      const response = await authFetch('/api/subscriptions/unfreeze', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'فشل إلغاء التجميد');
      setFreezeStatus('✅ تم إلغاء التجميد وتمديد المدة بنجاح');
      loadData();
      setTimeout(() => setFreezeStatus(''), 3000);
    } catch (err) {
      setFreezeStatus(`خطأ: ${err.message}`);
    }
  };

  // ── Filtered lists ────────────────────────────────────────────────────────
  const filteredUsers = users.filter(u =>
    u.role === 'member' &&
    (u.name.includes(searchQuery) || u.phone.includes(searchQuery) || u.member_id.includes(searchQuery))
  );

  const freezeFilteredUsers = users.filter(u =>
    u.role === 'member' &&
    (u.name.includes(freezeSearchQuery) || u.phone.includes(freezeSearchQuery) || u.member_id.includes(freezeSearchQuery))
  );

  return (
    <div>
      {/* Tab Navigation */}
      <div className="tabs-header">
        <button id="tab-scanner" className={`tab-btn ${activeSubTab === 'scanner' ? 'active' : ''}`} onClick={() => setActiveSubTab('scanner')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={18} /><span>ماسح الدخول QR</span>
          </div>
        </button>
        <button id="tab-register" className={`tab-btn ${activeSubTab === 'register' ? 'active' : ''}`} onClick={() => setActiveSubTab('register')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserPlus size={18} /><span>تسجيل وتجديد</span>
          </div>
        </button>
        <button id="tab-freeze" className={`tab-btn ${activeSubTab === 'freeze' ? 'active' : ''}`} onClick={() => setActiveSubTab('freeze')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Snowflake size={18} /><span>تجميد الاشتراكات</span>
          </div>
        </button>
      </div>

      {/* ── TAB: Scanner & Check-In ───────────────────────────────────────── */}
      {activeSubTab === 'scanner' && (
        <div className="grid-2">
          {/* Camera Scanner Card */}
          <div className="card">
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>ماسح الرمز السريع QR</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
              افتح الكاميرا لمسح كود اللاعب أو أدخل الرقم التعريفي يدوياً
            </p>

            {/* Camera viewport */}
            <div style={{ position: 'relative', width: '100%', height: '280px', background: '#000', borderRadius: '12px', border: '2px dashed var(--accent-cyan)', overflow: 'hidden', marginBottom: '16px' }}>
              <div id="reception-qr-reader" style={{ width: '100%', height: '100%' }}></div>
              <div style={{ position: 'absolute', inset: '10px', border: '1px solid rgba(102, 252, 241, 0.35)', borderRadius: '10px', pointerEvents: 'none' }}></div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
              <button id="start-camera-btn" className="btn btn-primary" onClick={startScanner} disabled={scannerActive || checkingIn}>
                <Camera size={14} /><span>تشغيل الكاميرا</span>
              </button>
              <button className="btn btn-secondary" onClick={stopScanner} disabled={!scannerActive}>
                <RefreshCw size={14} /><span>إيقاف الكاميرا</span>
              </button>
            </div>

            {/* Manual ID input */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label">الرقم التعريفي للاعب (Manual Entry)</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="manual-member-id-input"
                  type="text"
                  className="form-input"
                  placeholder="مثال: MEM001"
                  value={manualMemberId}
                  onChange={e => setManualMemberId(e.target.value.toUpperCase())}
                  style={{ textTransform: 'uppercase', flex: 1, letterSpacing: '1px' }}
                />
                <button
                  id="checkin-btn"
                  className="btn btn-primary"
                  onClick={() => handleCheckin(null)}
                  disabled={checkingIn || !manualMemberId}
                >
                  فحص وتدقيق
                </button>
              </div>
            </div>

            {/* Quick simulation list */}
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

          {/* Check-in Result Display */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div id="checkin-result-card" className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '340px' }}>
              {!checkinResult ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                  <Play size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px auto', display: 'block' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', marginBottom: '6px' }}>في انتظار فحص كود اللاعب</h3>
                  <p style={{ fontSize: '12px' }}>بمجرد تمرير كود QR أو إدخال الرقم يدوياً، ستظهر هنا حالة الاشتراك فوراً.</p>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  {/* SUCCESS */}
                  {(checkinResult.status === 'success') && (
                    <div>
                      <CheckCircle size={80} color={checkinResult.status === 'already_checked_in' ? 'var(--accent-orange)' : 'var(--success)'}
                        style={{ margin: '0 auto 16px auto', display: 'block', filter: 'drop-shadow(0 0 10px rgba(16,185,129,0.3))' }} />
                      <div className={`alert ${checkinResult.status === 'already_checked_in' ? 'alert-warning' : 'alert-success'}`}
                        style={{ justifyContent: 'center', fontSize: '16px', fontWeight: '700', padding: '16px 20px' }}>
                        {checkinResult.message}
                      </div>
                      {checkinResult.user && (
                        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)', display: 'inline-block', minWidth: '280px', marginTop: '16px', textAlign: 'right' }}>
                          <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>المشترك:</strong> {checkinResult.user.name}</p>
                          <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>رقم الهاتف:</strong> {checkinResult.user.phone}</p>
                          {checkinResult.subscription && (
                            <>
                              <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>الاشتراك:</strong> {checkinResult.subscription.plan_name || 'اشتراك نشط'}</p>
                              <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>تاريخ الانتهاء:</strong> {checkinResult.subscription.end_date}</p>
                            </>
                          )}
                          {checkinResult.workout_unlocked && (
                            <div style={{ marginTop: '8px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', padding: '8px', borderRadius: '8px' }}>
                              <p style={{ fontSize: '12px', color: 'var(--success)', margin: 0 }}>✅ تم فتح شاشة التمارين لهذا اليوم!</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* EXPIRED / ERROR */}
                  {(checkinResult.status === 'expired' || checkinResult.status === 'error') && (
                    <div>
                      <XCircle size={80} color="var(--error)" style={{ margin: '0 auto 16px auto', display: 'block', filter: 'drop-shadow(0 0 10px rgba(239,68,68,0.3))' }} />
                      <div className="alert alert-error" style={{ justifyContent: 'center', fontSize: '16px', fontWeight: '700', padding: '16px 20px' }}>
                        {checkinResult.message}
                      </div>
                      {checkinResult.user && (
                        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)', display: 'inline-block', minWidth: '280px', marginTop: '16px', textAlign: 'right' }}>
                          <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>المشترك:</strong> {checkinResult.user.name}</p>
                          <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>رقم الهاتف:</strong> {checkinResult.user.phone}</p>
                          <button
                            className="btn btn-primary"
                            style={{ width: '100%', marginTop: '12px', fontSize: '13px', padding: '8px' }}
                            onClick={() => {
                              setSelectedUserForRenew(checkinResult.user);
                              setRenewPlanId('');
                              setRenewStartDate(new Date().toISOString().split('T')[0]);
                              setRenewStatus('');
                            }}
                          >
                            تجديد الاشتراك كاش فوراً
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* FROZEN */}
                  {checkinResult.status === 'frozen' && (
                    <div>
                      <AlertCircle size={80} color="var(--accent-orange)"
                        style={{ margin: '0 auto 16px auto', display: 'block', filter: 'drop-shadow(0 0 10px rgba(245,158,11,0.3))' }} />
                      <div className="alert alert-warning" style={{ justifyContent: 'center', fontSize: '16px', fontWeight: '700', padding: '16px 20px' }}>
                        {checkinResult.message}
                      </div>
                      {checkinResult.user && (
                        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)', display: 'inline-block', minWidth: '280px', marginTop: '16px', textAlign: 'right' }}>
                          <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>المشترك:</strong> {checkinResult.user.name}</p>
                          <button
                            className="btn btn-secondary"
                            style={{ width: '100%', marginTop: '12px', fontSize: '13px', padding: '8px', color: 'var(--accent-cyan)' }}
                            onClick={async () => {
                              await authFetch('/api/subscriptions/unfreeze', {
                                method: 'POST',
                                body: JSON.stringify({ user_id: checkinResult.user.id })
                              });
                              setCheckinResult(null);
                              handleCheckin(checkinResult.user.member_id);
                            }}
                          >
                            إلغاء التجميد ومحاولة الدخول مرة أخرى
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Register & Renewals ──────────────────────────────────────── */}
      {activeSubTab === 'register' && (
        <div className="grid-2">
          {/* New Member Registration */}
          <div className="card">
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>تسجيل لاعب جديد</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
              أدخل بيانات اللاعب الجديد وربطه بباقة اشتراك مدفوعة كاش مباشرة
            </p>

            {regStatus && (
              <div className={`alert ${regStatus.includes('بنجاح') || regStatus.includes('✅') ? 'alert-success' : 'alert-info'}`}>
                {regStatus}
              </div>
            )}

            {createdCredentials && (
              <div className="card" style={{ background: 'rgba(102,252,241,0.05)', border: '1px solid rgba(102,252,241,0.2)', padding: '16px', borderRadius: '12px', marginBottom: '20px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>بيانات دخول المشترك الجديد:</h4>
                <p style={{ fontSize: '13px', margin: '4px 0' }}>الاسم: <strong>{createdCredentials.name}</strong></p>
                <p style={{ fontSize: '13px', margin: '4px 0' }}>رقم الهاتف: <strong>{createdCredentials.phone}</strong></p>
                <p style={{ fontSize: '13px', margin: '4px 0' }}>رمز الدخول (PIN): <strong style={{ color: 'var(--accent-neon)', fontSize: '16px' }}>{createdCredentials.password}</strong></p>
                
                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                  <a
                    href={`https://wa.me/${createdCredentials.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`مرحباً ${createdCredentials.name}! بيانات دخولك لنادي B2 Gym: رقم الهاتف: ${createdCredentials.phone} | رمز الدخول (PIN): ${createdCredentials.password}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{ flex: 1, textDecoration: 'none', padding: '8px 12px', fontSize: '13px' }}
                  >
                    💬 إرسال عبر واتساب
                  </a>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '8px 12px', fontSize: '13px' }}
                    onClick={() => setCreatedCredentials(null)}
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            )}

            <form id="register-member-form" onSubmit={handleRegister}>
              <div className="form-group">
                <label className="form-label">الاسم بالكامل (عربي)</label>
                <input
                  id="reg-name-input"
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
                  id="reg-phone-input"
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
                <select id="reg-plan-select" className="form-select" value={regPlanId} onChange={e => setRegPlanId(e.target.value)}>
                  <option value="">-- بدون باقة (تسجيل ملف فقط) --</option>
                  {plans.filter(p => p.is_active).map(plan => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} - {plan.price} ₪
                      ({plan.type === 'monthly' ? 'شهري' : plan.type === 'annual' ? 'سنوي' : `${plan.sessions_count} حصص / ${plan.duration_days} يوم`})
                    </option>
                  ))}
                </select>
              </div>

              {selectedRegPlan && (
                <>
                  <div className="form-group">
                    <label className="form-label">تاريخ بدء الاشتراك</label>
                    <input type="date" className="form-input" value={regStartDate} onChange={e => setRegStartDate(e.target.value)} />
                  </div>
                  {regEndDate && (
                    <div className="form-group">
                      <label className="form-label">تاريخ الانتهاء (محسوب تلقائياً)</label>
                      <div className="form-input" style={{ background: 'rgba(102,252,241,0.05)', border: '1px solid rgba(102,252,241,0.2)', color: 'var(--accent-cyan)', fontWeight: '700', direction: 'ltr', textAlign: 'center' }}>
                        {regEndDate}
                      </div>
                    </div>
                  )}
                </>
              )}

              <button id="register-member-btn" type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }}>
                تسجيل العضو الجديد وتفعيل حسابه
              </button>
            </form>
          </div>

          {/* Members Directory & Renewals */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800' }}>دليل اللاعبين والاشتراكات</h2>
              <button className="btn btn-secondary btn-icon-only" style={{ padding: '6px' }} onClick={loadData} title="تحديث">
                <RefreshCw size={16} />
              </button>
            </div>

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
                    <tr><td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>لا يوجد لاعبون مطابقون</td></tr>
                  ) : (
                    filteredUsers.map(member => {
                      const sub = member.subscription;
                      const isExpired = !sub || sub.status === 'expired' || (sub.end_date && sub.end_date < todayStr);
                      return (
                        <tr key={member.id}>
                          <td>
                            <div style={{ fontWeight: '700' }}>{member.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{member.phone}</div>
                          </td>
                          <td style={{ fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>{member.member_id}</td>
                          <td>
                            {member.status === 'pending' ? (
                              <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', border: '1px solid rgba(245, 158, 11, 0.2)', fontSize: '11px' }}>
                                غير مفعل
                              </span>
                            ) : (
                              <span className={`badge ${!sub || isExpired ? 'badge-expired' : sub.status === 'frozen' ? 'badge-frozen' : 'badge-active'}`}>
                              {!sub ? 'لا يوجد' : isExpired ? 'منتهي' : sub.status === 'frozen' ? 'مجمد' : 'نشط'}
                            </span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {member.status === 'pending' ? (
                                <button
                                  className="btn btn-primary"
                                  style={{ padding: '4px 12px', fontSize: '12px' }}
                                  onClick={() => handleActivateUser(member)}
                                >
                                  تفعيل ⚡
                                </button>
                              ) : (
                                <>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '4px 10px', fontSize: '12px' }}
                                onClick={() => {
                                  setSelectedUserForRenew(member);
                                  setRenewPlanId('');
                                  setRenewStartDate(new Date().toISOString().split('T')[0]);
                                  setRenewStatus('');
                                }}
                              >
                                تجديد كاش
                              </button>
                              {member.password && (
                                <a 
                                  href={`https://wa.me/${member.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`مرحباً ${member.name}! بيانات دخولك لنادي B2 Gym: رقم الهاتف: ${member.phone} | رمز الدخول (PIN): ${member.password}`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-secondary btn-icon-only"
                                  style={{ padding: '4px 8px', color: '#25D366', textDecoration: 'none', fontSize: '12px' }}
                                  title="إرسال بيانات الدخول واتساب"
                                >
                                  💬
                                </a>
                              )}
                                </>
                              )}
                            </div>
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

      {/* ── TAB: Freeze Management ────────────────────────────────────────── */}
      {activeSubTab === 'freeze' && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <Snowflake size={24} color="var(--accent-cyan)" />
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>إدارة تجميد الاشتراكات</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                جمّد اشتراك العضو مؤقتاً بسبب سفر أو مرض. يتم تمديد المدة تلقائياً عند إلغاء التجميد.
              </p>
            </div>
          </div>

          {freezeStatus && (
            <div className={`alert ${freezeStatus.includes('✅') ? 'alert-success' : 'alert-info'}`} style={{ marginBottom: '16px' }}>
              {freezeStatus}
            </div>
          )}

          <div className="form-group" style={{ position: 'relative', marginBottom: '16px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="ابحث باسم اللاعب، الجوال أو رقم العضوية..."
              value={freezeSearchQuery}
              onChange={e => setFreezeSearchQuery(e.target.value)}
              style={{ paddingRight: '40px' }}
            />
            <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', right: '12px', top: '14px' }} />
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>اسم اللاعب</th>
                  <th>رقم العضوية</th>
                  <th>الباقة الحالية</th>
                  <th>تاريخ الانتهاء</th>
                  <th>الحالة</th>
                  <th>إجراء التجميد</th>
                </tr>
              </thead>
              <tbody>
                {freezeFilteredUsers.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>لا يوجد لاعبون مطابقون</td></tr>
                ) : (
                  freezeFilteredUsers.map(member => {
                    const sub = member.subscription;
                    const isExpired = !sub || sub.status === 'expired' || (sub.end_date && sub.end_date < todayStr);
                    return (
                      <tr key={member.id}>
                        <td style={{ fontWeight: '700' }}>{member.name}</td>
                        <td style={{ fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>{member.member_id}</td>
                        <td style={{ fontSize: '12px' }}>{sub?.plan_name || '—'}</td>
                        <td style={{ fontSize: '12px', color: isExpired ? 'var(--error)' : 'var(--text-primary)' }}>{sub?.end_date || '—'}</td>
                        <td>
                          <span className={`badge ${!sub || isExpired ? 'badge-expired' : sub.status === 'frozen' ? 'badge-frozen' : 'badge-active'}`} style={{ fontSize: '11px' }}>
                            {!sub ? 'لا يوجد اشتراك' : isExpired ? 'منتهي' : sub.status === 'frozen' ? 'مجمد ❄️' : 'نشط ✅'}
                          </span>
                        </td>
                        <td>
                          {sub && !isExpired ? (
                            sub.status === 'frozen' ? (
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '4px 12px', fontSize: '12px', color: 'var(--accent-cyan)' }}
                                onClick={() => handleUnfreeze(member.id)}
                              >
                                إلغاء التجميد ✅
                              </button>
                            ) : (
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '4px 12px', fontSize: '12px', color: 'var(--accent-cyan)' }}
                                onClick={() => handleFreeze(member.id)}
                              >
                                تجميد ❄️
                              </button>
                            )
                          ) : (
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>غير متاح</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── RENEWAL MODAL ─────────────────────────────────────────────────── */}
      {selectedUserForRenew && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent-cyan)' }}>تجديد اشتراك اللاعب كاش</h3>
              <button className="btn btn-secondary btn-icon-only" style={{ padding: '4px 8px' }} onClick={() => setSelectedUserForRenew(null)}>إغلاق</button>
            </div>

            {renewStatus && (
              <div className={`alert ${renewStatus.includes('بنجاح') || renewStatus.includes('✅') ? 'alert-success' : 'alert-info'}`}>
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
                <select
                  className="form-select"
                  value={renewPlanId}
                  onChange={e => {
                    setRenewPlanId(e.target.value);
                    // Always reset start date to today when plan changes to avoid stale dates
                    setRenewStartDate(new Date().toISOString().split('T')[0]);
                    setRenewStatus('');
                  }}
                  required
                >
                  <option value="">-- اختر باقة الاشتراك --</option>
                  {plans.filter(p => p.is_active).map(plan => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} - {plan.price} ₪
                      ({plan.type === 'monthly' ? 'شهري' : plan.type === 'annual' ? 'سنوي' : `${plan.sessions_count} حصص / ${plan.duration_days} يوم`})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date fields — hidden for daily/1-day passes; shown for all other plans */}
              {renewPlanId && (
                isDailyRenewPlan ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    background: 'rgba(102,252,241,0.06)',
                    border: '1px solid rgba(102,252,241,0.22)',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    marginBottom: '4px'
                  }}>
                    <span style={{ fontSize: '20px', lineHeight: 1 }}>📅</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent-cyan)', marginBottom: '4px' }}>
                        تذكرة يوم واحد
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        التفعيل صالح ليوم واحد فقط — يبدأ وينتهي اليوم تلقائياً
                        <br />
                        <strong style={{ color: 'var(--accent-neon)', direction: 'ltr', display: 'inline-block', marginTop: '2px' }}>
                          {todayStr}
                        </strong>
                      </div>
                    </div>
                  </div>
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
                        <label className="form-label">تاريخ الانتهاء (محسوب تلقائياً)</label>
                        <div className="form-input" style={{ background: 'rgba(102,252,241,0.05)', border: '1px solid rgba(102,252,241,0.2)', color: 'var(--accent-cyan)', fontWeight: '700', direction: 'ltr', textAlign: 'center' }}>
                          {renewEndDate}
                        </div>
                      </div>
                    )}
                  </>
                )
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  تفعيل وحفظ الدفعة كاش 💳
                </button>
                <button type="button" className="btn btn-secondary" style={{ flex: 0.5 }} onClick={() => setSelectedUserForRenew(null)}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── CUSTOM MODALS ─── */}
      
      {/* 1. Custom Alert Modal */}
      {customAlert && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(11, 12, 16, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          direction: 'rtl'
        }}>
          <div className="card" style={{
            background: '#1F2833',
            border: '1px solid rgba(102, 252, 241, 0.2)',
            borderRadius: '20px',
            padding: '32px',
            maxWidth: '420px',
            width: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
            textAlign: 'center'
          }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(102, 252, 241, 0.1)', border: '1.5px solid var(--accent-cyan)', borderRadius: '50%', padding: '16px', marginBottom: '20px' }}>
              <AlertCircle size={36} color="var(--accent-cyan)" />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', marginBottom: '12px' }}>تنبيه</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
              {customAlert.message}
            </p>
            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: '700' }}
              onClick={() => setCustomAlert(null)}
            >
              موافق
            </button>
          </div>
        </div>
      )}

      {/* 2. Custom Confirm Modal */}
      {customConfirm && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(11, 12, 16, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          direction: 'rtl'
        }}>
          <div className="card" style={{
            background: '#1F2833',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: '20px',
            padding: '32px',
            maxWidth: '420px',
            width: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
            textAlign: 'center'
          }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(245, 158, 11, 0.1)', border: '1.5px solid #F59E0B', borderRadius: '50%', padding: '16px', marginBottom: '20px' }}>
              <AlertCircle size={36} color="#F59E0B" />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', marginBottom: '12px' }}>تأكيد الإجراء</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
              {customConfirm.message}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, padding: '12px', fontSize: '14px', fontWeight: '700', background: 'linear-gradient(135deg, #F59E0B, #D97706)', border: 'none', color: '#fff' }}
                onClick={() => {
                  customConfirm.onConfirm();
                  setCustomConfirm(null);
                }}
              >
                تأكيد
              </button>
              <button
                className="btn btn-secondary"
                style={{ flex: 1, padding: '12px', fontSize: '14px', fontWeight: '700' }}
                onClick={() => setCustomConfirm(null)}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Activation Confirm Modal */}
      {activationConfirmUser && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(11, 12, 16, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          direction: 'rtl'
        }}>
          <div className="card" style={{
            background: '#1F2833',
            border: '1px solid rgba(102, 252, 241, 0.25)',
            borderRadius: '20px',
            padding: '32px',
            maxWidth: '430px',
            width: '90%',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.65)',
            textAlign: 'center'
          }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(102, 252, 241, 0.1)', border: '1.5px solid var(--accent-cyan)', borderRadius: '50%', padding: '16px', marginBottom: '20px' }}>
              <UserPlus size={36} color="var(--accent-cyan)" />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', marginBottom: '12px' }}>تفعيل حساب المشترك</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
              هل أنت متأكد من تفعيل حساب المشترك <span style={{ color: 'var(--accent-cyan)', fontWeight: '700' }}>[{activationConfirmUser.name}]</span>؟
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, padding: '12px', fontSize: '14px', fontWeight: '700' }}
                onClick={confirmActivation}
              >
                تأكيد التفعيل ⚡
              </button>
              <button
                className="btn btn-secondary"
                style={{ flex: 1, padding: '12px', fontSize: '14px', fontWeight: '700' }}
                onClick={() => setActivationConfirmUser(null)}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Activation Success & WhatsApp Modal */}
      {activationSuccessData && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(11, 12, 16, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          direction: 'rtl'
        }}>
          <div className="card" style={{
            background: '#1F2833',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '20px',
            padding: '32px',
            maxWidth: '430px',
            width: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.65)',
            textAlign: 'center'
          }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16, 185, 129, 0.1)', border: '1.5px solid #10B981', borderRadius: '50%', padding: '16px', marginBottom: '20px' }}>
              <CheckCircle size={36} color="#10B981" />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#10B981', marginBottom: '8px' }}>تم تفعيل الحساب بنجاح!</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
              تم تفعيل ملف اللاعب وتوليد رمز الدخول بنجاح.
            </p>
            
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '24px',
              textAlign: 'right'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>👤 الاسم بالكامل:</div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginBottom: '12px' }}>{activationSuccessData.name}</div>
              
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>🔑 رمز الدخول الخاص بك (PIN):</div>
              <div style={{ fontSize: '22px', fontWeight: '800', fontFamily: 'monospace', color: 'var(--accent-neon)', letterSpacing: '2px' }}>
                {activationSuccessData.password}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, padding: '12px', fontSize: '13px', fontWeight: '700', background: 'linear-gradient(135deg, #25D366, #128C7E)', border: 'none', color: '#fff' }}
                onClick={() => {
                  const template = `🏋️‍♂️ *أهلاً بك في B2 Gym!* 🏋️‍♂️\n\nتم تفعيل حسابك بنجاح ✨\n👤 *الاسم:* ${activationSuccessData.name}\n🔑 *رمز الدخول الخاص بك:* \`${activationSuccessData.password}\`\n\nيمكنك استخدام هذا الرمز لتسجيل الدخول وتسجيل الحضور عند بوابة النادي.\nنتمنى لك رحلة رياضية ممتعة! 🚀`;
                  const waUrl = `https://wa.me/${activationSuccessData.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(template)}`;
                  window.open(waUrl, '_blank');
                }}
              >
                💬 إرسال عبر الواتساب
              </button>
              <button
                className="btn btn-secondary"
                style={{ flex: 1, padding: '12px', fontSize: '13px', fontWeight: '700' }}
                onClick={() => setActivationSuccessData(null)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Duplicate Check-in Modal Overlay */}
      {checkinResult && checkinResult.status === 'already_checked_in' && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div className="card" style={{
            maxWidth: '500px',
            width: '100%',
            border: '2px solid rgba(245, 158, 11, 0.45)',
            boxShadow: '0 0 30px rgba(245, 158, 11, 0.25)',
            textAlign: 'center',
            padding: '30px',
            background: '#121214',
            borderRadius: '16px'
          }}>
            <AlertCircle size={64} color="var(--accent-orange)" style={{ margin: '0 auto 16px auto', display: 'block' }} />
            <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#fff', marginBottom: '14px' }}>حضور مكرر اليوم</h3>
            <div className="alert alert-warning" style={{ justifyContent: 'center', fontSize: '15px', fontWeight: '700', padding: '12px 16px', marginBottom: '24px', textAlign: 'center' }}>
              {checkinResult.message}
            </div>
            {checkinResult.user && (
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '12px', border: '1px solid var(--glass-border)', marginBottom: '24px', textAlign: 'right' }}>
                <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>المشترك:</strong> {checkinResult.user.name}</p>
                <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>رقم الهاتف:</strong> {checkinResult.user.phone}</p>
                {checkinResult.subscription && (
                  <p style={{ fontSize: '13px', margin: '4px 0' }}><strong>الاشتراك:</strong> {checkinResult.subscription.plan_name || 'اشتراك نشط'}</p>
                )}
              </div>
            )}
            <button
              className="btn"
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, var(--accent-orange) 0%, #d97706 100%)',
                color: '#fff',
                fontWeight: '700',
                padding: '12px 24px',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(245, 158, 11, 0.3)'
              }}
              onClick={() => setCheckinResult(null)}
            >
              حسناً، فهمت
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
