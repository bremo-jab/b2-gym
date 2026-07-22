import React, { useState, useEffect, useRef } from 'react';
import { Users, DollarSign, Calendar, TrendingUp, Plus, Trash2, Edit2, AlertCircle, RefreshCw, Eye, UserPlus, Search, QrCode, Camera, CheckCircle, XCircle, Play, Smartphone, Dumbbell } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';

export default function AdminDashboard({ currentUser, authFetch }) {
  const [stats, setStats] = useState(null);
  const [plans, setPlans] = useState([]);
  const [users, setUsers] = useState([]);
  const [exercises,   setExercises]   = useState([]);
  const [categories,  setCategories]  = useState([]);
  const [activeAdminTab, setActiveAdminTab] = useState('analytics'); // analytics, plans, staff, members, exercises

  // Exercise library states
  const [exCatName,     setExCatName]     = useState('');
  const [exCatStatus,   setExCatStatus]   = useState('');
  const [exName,        setExName]        = useState('');
  const [exDesc,        setExDesc]        = useState('');
  const [exVideo,       setExVideo]       = useState('');
  const [exCategoryId,  setExCategoryId]  = useState('');
  const [exStatus,      setExStatus]      = useState('');
  const [editingEx,     setEditingEx]     = useState(null);

  // CRUD Subscription Plans states
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState({ name: '', type: 'monthly', price: '', duration_days: '', total_sessions: '', is_active: true });
  const [planStatus, setPlanStatus] = useState('');

  // CRUD Staff/Members states
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({ name: '', phone: '', role: 'receptionist' });
  const [userPhoneError, setUserPhoneError] = useState('');
  const [userStatus, setUserStatus] = useState('');
  const [staffCreatedCredentials, setStaffCreatedCredentials] = useState(null);

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

  // QR camera check-in state
  const scannerRef = useRef(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [manualMemberId, setManualMemberId] = useState('');
  const [scannerResult, setScannerResult] = useState(null);
  const [scanningCheckIn, setScanningCheckIn] = useState(false);

  // authFetch is provided by App.jsx — JWT Bearer token injected automatically

  const loadData = () => {
    // Stats analytics
    authFetch('/api/dashboard/stats')
      .then(res => res.ok ? res.json() : null)
      .then(data => setStats(data))
      .catch(err => console.error('Failed to load stats', err));

    // Plans
    authFetch('/api/plans')
      .then(res => res.ok ? res.json() : [])
      .then(data => setPlans(data))
      .catch(err => console.error('Failed to load plans', err));

    // All Users
    authFetch('/api/users')
      .then(res => res.ok ? res.json() : [])
      .then(data => setUsers(data))
      .catch(err => console.error('Failed to load users', err));

    // Exercises
    authFetch('/api/exercises')
      .then(res => res.ok ? res.json() : [])
      .then(data => setExercises(data))
      .catch(err => console.error('Failed to load exercises', err));

    // Categories
    authFetch('/api/exercises/categories')
      .then(res => res.ok ? res.json() : [])
      .then(data => setCategories(data))
      .catch(err => console.error('Failed to load categories', err));
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

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

  const startScanner = async () => {
    try {
      await stopScanner();
      const scanner = new Html5Qrcode('dashboard-qr-reader');
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

  const playWarningTone = () => {
    if (typeof window === 'undefined') return;

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;

    const audioContext = new AudioContextCtor();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(620, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.36);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.4);
  };

  const parseJsonBody = async (response) => {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  };

  const handleCheckin = async (memberIdToScan) => {
    const idToUse = String(memberIdToScan || manualMemberId || '').trim().toUpperCase();
    if (!idToUse) return;

    setScanningCheckIn(true);
    setScannerResult(null);

    try {
      const response = await authFetch('/api/checkin', {
        method: 'POST',
        body: JSON.stringify({ member_id: idToUse })
      });

      const data = await parseJsonBody(response);
      const responseStatus = data?.status || 'success';

      if (!response.ok) {
        if (responseStatus === 'expired' || responseStatus === 'subscription_expired' || responseStatus === 'frozen') {
          setScannerResult({
            success: false,
            status: responseStatus === 'subscription_expired' ? 'expired' : responseStatus,
            message: data?.message || 'عذراً، اشتراك هذا اللاعب منتهٍ!'
          });
          return;
        }

        setScannerResult({
          status: 'error',
          message: data?.error || data?.message || 'حدث خطأ أثناء فحص الكود'
        });
        return;
      }

      setScannerResult(data);
      if (responseStatus === 'already_checked_in') {
        playWarningTone();
      }
      if (responseStatus === 'success') {
        loadData();
      }
      setTimeout(() => setScannerResult(null), 7000);
    } catch (err) {
      const errorMessage = err && err.message ? err.message : 'حدث خطأ أثناء فحص الكود';
      setScannerResult({
        status: 'error',
        message: /Failed to fetch|NetworkError/i.test(errorMessage)
          ? 'تمت معالجة الطلب على الخادم، ولكن واجهت الشاشة خطأ في قراءة الاستجابة. يرجى تحديث الصفحة والمحاولة مرة أخرى.'
          : errorMessage
      });
    } finally {
      setManualMemberId('');
      setScanningCheckIn(false);
    }
  };

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  // Plan CRUD handlers
  const handleSavePlan = async (e) => {
    e.preventDefault();
    if (!planForm.name || !planForm.type || planForm.price === '') {
      setPlanStatus('الرجاء ملء كافة الحقول المطلوبة');
      return;
    }
    if (planForm.type === 'sessions' && !planForm.duration_days) {
      setPlanStatus('يرجى تحديد مدة الصلاحية لباقة الحصص');
      return;
    }
    setPlanStatus('جاري الحفظ...');

    const method = editingPlan ? 'PUT' : 'POST';
    const url = editingPlan ? `/api/plans/${editingPlan.id}` : '/api/plans';

    try {
      const response = await authFetch(url, {
        method,
        body: JSON.stringify({
          ...planForm,
          price: Number(planForm.price),
          duration_days: planForm.type === 'sessions' ? Number(planForm.duration_days) : null,
          sessions_count: planForm.type === 'sessions' ? Number(planForm.total_sessions || 0) : 0
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'فشل حفظ الباقة');
      }

      setPlanStatus(editingPlan ? 'تم تحديث باقة الاشتراك بنجاح!' : 'تم إضافة باقة اشتراك جديدة بنجاح!');
      setPlanForm({ name: '', type: 'monthly', price: '', duration_days: '', total_sessions: '', is_active: true });
      setEditingPlan(null);
      loadData();
      setTimeout(() => setPlanStatus(''), 3000);
    } catch (err) {
      setPlanStatus(`خطأ: ${err.message}`);
    }
  };

  const handleDeletePlan = (planId) => {
    showCustomConfirm('هل أنت متأكد من رغبتك في حذف باقة الاشتراك هذه نهائياً؟', async () => {
      try {
        const response = await authFetch(`/api/plans/${planId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('فشل حذف الباقة');
        loadData();
      } catch (err) {
        showCustomAlert(err.message);
      }
    });
  };

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

  // Member search
  const [searchQuery, setSearchQuery] = useState('');

  const filteredMembers = users.filter(u => 
    u.role === 'member' && 
    (u.name.includes(searchQuery) || u.phone.includes(searchQuery) || u.member_id.includes(searchQuery))
  );

  // Member Registration states
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPhoneError, setRegPhoneError] = useState('');
  const [regPlanId, setRegPlanId] = useState('');
  const [regStartDate, setRegStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [regStatus, setRegStatus] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState(null);

  const selectedRegPlan = plans.find(p => p.id === Number(regPlanId));
  const memberEndDate = regPlanId && regStartDate
    ? calcEndDate(regStartDate, selectedRegPlan?.type, selectedRegPlan?.duration_days)
    : '';

  // Renewal states
  const [renewMember, setRenewMember] = useState(null);
  const [renewPlanId, setRenewPlanId] = useState('');
  const [renewStartDate, setRenewStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [renewStatus, setRenewStatus] = useState('');

  const selectedRenewPlan = plans.find(p => p.id === Number(renewPlanId));

  // A "Daily Pass" = sessions plan with exactly 1 duration day
  const isDailyRenewPlan = selectedRenewPlan?.type === 'sessions' && Number(selectedRenewPlan?.duration_days) === 1;

  const renewEndDate = renewPlanId && renewStartDate && !isDailyRenewPlan
    ? calcEndDate(renewStartDate, selectedRenewPlan?.type, selectedRenewPlan?.duration_days)
    : '';

  const handleRenewMember = async (e) => {
    if (e) e.preventDefault();
    if (!renewMember || !renewPlanId) {
      setRenewStatus('الرجاء تعبئة بيانات التجديد');
      return;
    }
    setRenewStatus('جاري معالجة الدفع كاش والتفعيل...');

    try {
      const response = await authFetch('/api/subscriptions/renew', {
        method: 'POST',
        body: JSON.stringify({
          user_id: renewMember.id,
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
        setRenewMember(null);
        setRenewPlanId('');
      }, 2000);
    } catch (err) {
      setRenewStatus(`خطأ: ${err.message}`);
    }
  };

  const handleRegisterMember = async (e) => {
    e.preventDefault();
    setRegPhoneError('');
    if (!regName || !regPhone) {
      setRegStatus('الرجاء إدخال الاسم ورقم الهاتف على الأقل');
      return;
    }

    const cleanedPhone = regPhone.trim();
    const phoneRegex = /^05\d{8}$/;
    if (!phoneRegex.test(cleanedPhone)) {
      setRegPhoneError('يرجى إدخال رقم هاتف صحيح يتكون من 10 أرقام ويبدأ بـ 05');
      setRegStatus('خطأ: رقم الهاتف غير صالح');
      return;
    }

    setRegStatus('جاري تسجيل العضو...');

    try {
      const response = await authFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: regName.trim(),
          phone: cleanedPhone,
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
      setCreatedCredentials({
        name: data.name,
        phone: data.phone,
        password: data.generated_password
      });
      setRegName('');
      setRegPhone('');
      setRegPhoneError('');
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

  // User CRUD handlers
  const handleSaveUser = async (e) => {
    e.preventDefault();
    setUserPhoneError('');
    if (!userForm.name || !userForm.phone) {
      setUserStatus('الرجاء إدخال الاسم ورقم الهاتف');
      return;
    }

    const cleanedPhone = userForm.phone.trim();
    const phoneRegex = /^05\d{8}$/;
    if (!phoneRegex.test(cleanedPhone)) {
      setUserPhoneError('يرجى إدخال رقم هاتف صحيح يتكون من 10 أرقام ويبدأ بـ 05');
      setUserStatus('خطأ: رقم الهاتف غير صالح');
      return;
    }

    setUserStatus('جاري الحفظ...');
    setStaffCreatedCredentials(null);

    const method = editingUser ? 'PUT' : 'POST';
    const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';

    try {
      const response = await authFetch(url, {
        method,
        body: JSON.stringify({
          ...userForm,
          name: userForm.name.trim(),
          phone: cleanedPhone
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'فشل حفظ بيانات الحساب');
      }

      const data = await response.json();

      if (!editingUser && data.generated_password) {
        // New staff account — show credential card with WhatsApp link
        setStaffCreatedCredentials({
          name: data.name,
          phone: data.phone,
          member_id: data.member_id,
          password: data.generated_password,
          role: data.role
        });
        setUserStatus('تم إنشاء حساب الموظف بنجاح! يرجى إرسال بيانات الدخول المؤقتة للموظف.');
      } else {
        setUserStatus(editingUser ? 'تم تحديث بيانات الحساب بنجاح!' : 'تم إضافة الحساب الجديد بنجاح!');
        setTimeout(() => setUserStatus(''), 3000);
      }

      setUserForm({ name: '', phone: '', role: 'receptionist' });
      setUserPhoneError('');
      setEditingUser(null);
      loadData();
    } catch (err) {
      setUserStatus(`خطأ: ${err.message}`);
    }
  };

  const handleDeleteUser = (userId) => {
    showCustomConfirm('هل أنت متأكد من حذف هذا المشترك/الموظف بكامل سجلاته التدريبية والحضور؟', async () => {
      try {
        const response = await authFetch(`/api/users/${userId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('فشل حذف المستخدم');
        loadData();
      } catch (err) {
        showCustomAlert(err.message);
      }
    });
  };

  // Pure SVG Chart Builder for Daily Peak Hours (gorgeous neon curves/bars)
  const drawPeakHoursChart = () => {
    if (!stats || !stats.peakHoursChart) return null;

    // Filter to standard operational hours for cleaner visualization (6:00 AM to 11:00 PM)
    const operationalHours = stats.peakHoursChart.filter(item => {
      const hr = parseInt(item.hour);
      return hr >= 6 && hr <= 23;
    });

    const maxCount = Math.max(...operationalHours.map(o => o.count), 4); // limit minimum height to 4
    const chartHeight = 200;
    const chartWidth = 500;
    const padding = 30;
    
    const usableWidth = chartWidth - padding * 2;
    const usableHeight = chartHeight - padding * 2;
    
    const barWidth = usableWidth / operationalHours.length - 8;

    return (
      <svg width="100%" height="250" viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ background: 'rgba(0,0,0,0.1)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((r, idx) => {
          const y = padding + usableHeight * (1 - r);
          return (
            <g key={idx}>
              <line x1={padding} y1={y} x2={chartWidth - padding} y2={y} className="chart-grid-line" />
              <text x={padding - 6} y={y + 4} fill="var(--text-muted)" fontSize="9" textAnchor="end">
                {Math.round(maxCount * r)}
              </text>
            </g>
          );
        })}

        {/* Bar drawing */}
        {operationalHours.map((item, idx) => {
          const hr = parseInt(item.hour);
          const formattedHour = hr >= 12 
            ? `${hr === 12 ? 12 : hr - 12} م` 
            : `${hr} ص`;

          const x = padding + idx * (usableWidth / operationalHours.length) + 4;
          const pct = item.count / maxCount;
          const barHeight = usableHeight * pct;
          const y = padding + usableHeight - barHeight;

          return (
            <g key={idx}>
              <rect 
                x={x} 
                y={y} 
                width={barWidth} 
                height={barHeight} 
                rx="4"
                className="chart-bar"
              >
                <title>{`الساعة: ${formattedHour} - عدد الحضور: ${item.count}`}</title>
              </rect>
              {/* Display text count on top of bar if > 0 */}
              {item.count > 0 && (
                <text 
                  x={x + barWidth / 2} 
                  y={y - 6} 
                  fill="var(--accent-cyan)" 
                  fontSize="9" 
                  fontWeight="bold" 
                  textAnchor="middle"
                >
                  {item.count}
                </text>
              )}
              {/* X Axis Labels */}
              <text 
                x={x + barWidth / 2} 
                y={chartHeight - 8} 
                className="chart-text"
              >
                {formattedHour}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div>
      {/* Admin Tab buttons */}
      <div className="tabs-header">
        <button className={`tab-btn ${activeAdminTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveAdminTab('analytics')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={18} />
            <span>لوحة التحكم والتحليلات</span>
          </div>
        </button>

        <button className={`tab-btn ${activeAdminTab === 'plans' ? 'active' : ''}`} onClick={() => setActiveAdminTab('plans')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <DollarSign size={18} />
            <span>إعدادات باقات الاشتراك</span>
          </div>
        </button>

        <button className={`tab-btn ${activeAdminTab === 'staff' ? 'active' : ''}`} onClick={() => setActiveAdminTab('staff')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={18} />
            <span>إدارة حسابات الاستقبال</span>
          </div>
        </button>

        <button className={`tab-btn ${activeAdminTab === 'members' ? 'active' : ''}`} onClick={() => setActiveAdminTab('members')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserPlus size={18} />
            <span>إدارة الأعضاء واللاعبين</span>
          </div>
        </button>

        <button id="admin-tab-exercises" className={`tab-btn ${activeAdminTab === 'exercises' ? 'active' : ''}`} onClick={() => setActiveAdminTab('exercises')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Dumbbell size={18} />
            <span>مكتبة التمارين</span>
          </div>
        </button>
      </div>

      {/* VIEW: Analytics & KPIs Dashboard */}
      {activeAdminTab === 'analytics' && stats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Camera size={24} color="var(--accent-cyan)" />
                <h3 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>ماسح الـ QR Code لتسجيل الحضور</h3>
              </div>
              <span className="badge" style={{ background: 'rgba(102,252,241,0.12)', color: 'var(--accent-cyan)' }}>الدخول السريع</span>
            </div>

            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px' }}>
              افتح الكاميرا مباشرة من هذه الشاشة وسجل حضور اللاعب في ثوانٍ مع عرض واضح للحالة: نجاح أو انتهت صلاحية الاشتراك.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '16px',
                alignItems: 'stretch',
                animation: scannerResult?.status === 'already_checked_in' ? 'pulse 0.8s infinite alternate' : 'none'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <div style={{ width: '100%', maxWidth: '420px', margin: '0 auto', borderRadius: '18px', overflow: 'hidden', background: '#000', border: '2px dashed rgba(102, 252, 241, 0.45)', boxShadow: '0 0 30px rgba(102,252,241,0.12)' }}>
                  <div id="dashboard-qr-reader" style={{ width: '100%', minHeight: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}></div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button className="btn btn-primary" onClick={startScanner} disabled={scannerActive || scanningCheckIn}>
                    <Camera size={14} />
                    <span>تشغيل الكاميرا</span>
                  </button>
                  <button className="btn btn-secondary" onClick={stopScanner} disabled={!scannerActive}>
                    <RefreshCw size={14} />
                    <span>إيقاف الكاميرا</span>
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'center' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">أو أدخل رمز المشترك يدويًا</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="مثال: MEM001"
                    value={manualMemberId}
                    onChange={(e) => setManualMemberId(e.target.value.toUpperCase())}
                    style={{ textTransform: 'uppercase', letterSpacing: '1px' }}
                  />
                </div>

                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => handleCheckin(null)} disabled={scanningCheckIn || !manualMemberId}>
                  <Play size={14} />
                  <span>فحص الدخول</span>
                </button>

                <div style={{ minHeight: '120px' }}>
                  {!scannerResult ? (
                    <div className="alert alert-info" style={{ justifyContent: 'center', textAlign: 'center', fontSize: '12px' }}>
                      <Smartphone size={18} />
                      <span>جاهز لاستقبال كود الدخول من هاتف الموظف مباشرة.</span>
                    </div>
                  ) : scannerResult.status === 'success' ? (
                    <div className="alert alert-success" style={{ justifyContent: 'center', textAlign: 'center', fontSize: '14px', fontWeight: '700' }}>
                      <CheckCircle size={20} />
                      <span>{scannerResult.message}</span>
                    </div>
                  ) : scannerResult.status === 'expired' ? (
                    <div className="alert alert-error" style={{ justifyContent: 'center', textAlign: 'center', fontSize: '14px', fontWeight: '700', background: 'rgba(239,68,68,0.18)', borderColor: 'rgba(239,68,68,0.55)' }}>
                      <XCircle size={20} />
                      <span>{scannerResult.message}</span>
                    </div>
                  ) : scannerResult.status === 'already_checked_in' ? (
                    <div className="alert alert-warning" style={{ justifyContent: 'center', textAlign: 'center', fontSize: '14px', fontWeight: '700' }}>
                      <AlertCircle size={20} />
                      <span>تنبيه: تم تسجيل دخول هذا اللاعب مسبقاً اليوم!</span>
                    </div>
                  ) : (
                    <div className="alert alert-error" style={{ justifyContent: 'center', textAlign: 'center', fontSize: '14px', fontWeight: '700' }}>
                      <XCircle size={20} />
                      <span>{scannerResult.message}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* KPI Cards Row */}
          <div className="grid-4">
            {/* Card 1: Active members */}
            <div className="card kpi-card">
              <div className="kpi-details">
                <p>المشتركون النشطون</p>
                <h3>{stats.kpis.activeMembersCount} لاعب</h3>
              </div>
              <div className="kpi-icon neon">
                <Users size={24} />
              </div>
            </div>

            {/* Card 2: Attendance Today */}
            <div className="card kpi-card">
              <div className="kpi-details">
                <p>حضور اليوم</p>
                <h3>{stats.kpis.attendanceTodayCount} لاعب</h3>
              </div>
              <div className="kpi-icon cyan">
                <Calendar size={24} />
              </div>
            </div>

            {/* Card 3: Monthly Revenue */}
            <div className="card kpi-card">
              <div className="kpi-details">
                <p>الدخل المالي الشهري</p>
                <h3>{stats.kpis.monthlyRevenue} ₪</h3>
              </div>
              <div className="kpi-icon success">
                <DollarSign size={24} />
              </div>
            </div>

            {/* Card 4: Subscriptions Near Expiration */}
            <div className="card kpi-card">
              <div className="kpi-details">
                <p>اشتراكات قاربت على الانتهاء</p>
                <h3>{stats.kpis.nearExpirationCount} باقات</h3>
              </div>
              <div className="kpi-icon orange">
                <AlertCircle size={24} />
              </div>
            </div>
          </div>

          {/* Charts & Engagement Row */}
          <div className="grid-2">
            {/* Peak Hours Chart */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '800' }}>معدلات الحضور اليومية وأوقات الذروة حسب الساعة</h3>
                <button className="btn btn-secondary btn-icon-only" style={{ padding: '6px' }} onClick={loadData}>
                  <RefreshCw size={14} />
                </button>
              </div>
              {drawPeakHoursChart()}
            </div>

            {/* Engagement tracker & quick stats */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyItems: 'center', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '8px', alignSelf: 'flex-start' }}>معدل تفاعل اللاعبين في تتبع أوزانهم</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px', alignSelf: 'flex-start' }}>النسبة المئوية للاعبين الذين يدونون أوزانهم بانتظام مقارنة بحضور البوابة</p>
              
              {/* Radial Glow Engagement Ring */}
              <div style={{ position: 'relative', width: '160px', height: '160px', borderRadius: '50%', background: 'radial-gradient(circle, var(--bg-secondary) 60%, transparent 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', border: '6px solid rgba(102, 252, 241, 0.15)', boxShadow: '0 0 20px rgba(102, 252, 241, 0.1)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '32px', fontWeight: '800', color: 'var(--accent-cyan)' }}>{stats.engagementRate}%</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>تفاعل نشط</span>
                </div>
              </div>
              
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '12px', border: '1px solid var(--glass-border)', borderRadius: '10px', width: '100%', textAlign: 'right', fontSize: '12px' }}>
                <p style={{ color: 'var(--text-secondary)' }}>تفاعل <strong>{stats.engagementRate}%</strong> من الأعضاء يعني قيامهم بتسجيل مجموعات التكرار والأوزان اليومية في التطبيق، مما يعكس اهتماماً أعلى بمتابعة الأداء الرياضي.</p>
              </div>
            </div>
          </div>

          {/* Public Registration QR Code Card */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <QrCode size={24} color="var(--accent-neon)" />
              <h3 style={{ fontSize: '16px', fontWeight: '800' }}>رمز تسجيل الأعضاء الجدد (بوابة الدخول)</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
              اطبع هذا الرمز وضعه على باب النادي. عند مسحه بهاتفهم، يمكن للاعبين الجدد تسجيل أنفسهم (الاسم + رقم الجوال) دون الحاجة لموظف استقبال.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <div style={{
                background: '#ffffff',
                padding: '16px',
                borderRadius: '12px',
                display: 'inline-block',
                border: '2px solid rgba(173,255,47,0.3)',
                boxShadow: '0 0 20px rgba(173,255,47,0.1)'
              }}>
                <QRCodeSVG
                  value={window.location.origin + '/register-member'}
                  size={180}
                  level="H"
                  fgColor="#0B0C10"
                  bgColor="#ffffff"
                />
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', direction: 'ltr', wordBreak: 'break-all' }}>
              {window.location.origin}/register-member
            </div>
          </div>

          {/* At-Risk Members Report */}
          <div className="card">
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--accent-orange)', marginBottom: '6px' }}>المشتركون الأكثر غياباً (لم يسجلوا حضوراً منذ أكثر من 10 أيام)</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>قائمة باللاعبين الذين يملكون اشتراكات نشطة ولكنهم لم يمرروا كود البوابة منذ أكثر من 10 أيام متتالية للتواصل معهم وتشجيعهم</p>

            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>اسم المشترك</th>
                    <th>رقم الجوال</th>
                    <th>الرمز التعريفي</th>
                    <th>آخر حضور مسجل</th>
                    <th>الإجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.atRiskMembers.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>لا يوجد مشتركين متغيبين لأكثر من 10 أيام في الوقت الحالي 👍</td>
                    </tr>
                  ) : (
                    stats.atRiskMembers.map(member => (
                      <tr key={member.id}>
                        <td style={{ fontWeight: '700' }}>{member.name}</td>
                        <td>{member.phone}</td>
                        <td style={{ fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>{member.member_id}</td>
                        <td style={{ color: 'var(--accent-orange)' }}>{member.last_check_in}</td>
                        <td>
                          <a 
                            href={`https://wa.me/966${member.phone.substring(1)}?text=${encodeURIComponent(`أهلاً بك كابتن ${member.name}، نفتقد حضورك في صالة B2 Gym الرياضية! نتمنى أن تكون بصحة جيدة وننتظرك لمتابعة تمارينك بالصالة 💪.`)}`}
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="btn btn-secondary" 
                            style={{ padding: '4px 10px', fontSize: '12px', background: 'rgba(173,255,47,0.1)', borderColor: 'rgba(173,255,47,0.3)', color: 'var(--accent-neon)' }}
                          >
                            تواصل واتساب
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: CRUD Subscription Plans Settings */}
      {activeAdminTab === 'plans' && (
        <div className="grid-2">
          {/* Plan Form Card */}
          <div className="card">
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>
              {editingPlan ? 'تعديل باقة اشتراك حالية' : 'إضافة باقة اشتراك جديدة'}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
              حدد تسعير ومدد الباقات ونوعها (شهرية، سنوية، أو بعدد الحصص الفردية) لتمكين موظف الاستقبال من استخدامها
            </p>

            {planStatus && (
              <div className={`alert ${planStatus.includes('بنجاح') ? 'alert-success' : 'alert-info'}`}>
                {planStatus}
              </div>
            )}

            <form onSubmit={handleSavePlan}>
              <div className="form-group">
                <label className="form-label">اسم الباقة (عربي)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="مثال: باقة الصيف 3 أشهر" 
                  value={planForm.name}
                  onChange={e => setPlanForm({ ...planForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid-2" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">نوع الباقة</label>
                  <select 
                    className="form-select" 
                    value={planForm.type} 
                    onChange={e => setPlanForm({ ...planForm, type: e.target.value })}
                    required
                  >
                    <option value="monthly">شهري</option>
                    <option value="annual">سنوي</option>
                    <option value="sessions">جلسات / حصص محددة</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">السعر (شيكل)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="مثال: 350" 
                    value={planForm.price}
                    onChange={e => setPlanForm({ ...planForm, price: e.target.value })}
                    required
                  />
                </div>
              </div>

              {planForm.type === 'sessions' && (
                <div className="grid-2" style={{ gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">إجمالي عدد الحصص المسموحة</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      placeholder="مثال: 12" 
                      value={planForm.total_sessions}
                      onChange={e => setPlanForm({ ...planForm, total_sessions: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">مدة صلاحية الحصص (بالأيام)</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      placeholder="مثال: 365" 
                      value={planForm.duration_days}
                      onChange={e => setPlanForm({ ...planForm, duration_days: e.target.value })}
                      required
                    />
                  </div>
                </div>
              )}

              {/* Info note about calendar-based expiration */}
              <div style={{ background: 'rgba(102,252,241,0.05)', border: '1px solid rgba(102,252,241,0.15)', borderRadius: '10px', padding: '12px 14px', marginTop: '4px', marginBottom: '10px', fontSize: '12px', color: 'var(--accent-cyan)', lineHeight: 1.7 }}>
                💡 ملاحظة: يتم حساب تاريخ انتهاء الاشتراك تلقائياً عند تسجيل اللاعب، بحيث ينتهي في نفس اليوم من الشهر (أو السنة) التالي لتاريخ البدء منقوصاً منه يوم واحد.
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                <input 
                  type="checkbox" 
                  id="is_active_check" 
                  checked={planForm.is_active}
                  onChange={e => setPlanForm({ ...planForm, is_active: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="is_active_check" style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', cursor: 'pointer' }}>إتاحة الباقة للبيع وتنشيطها في شاشة الاستقبال</label>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  {editingPlan ? 'تحديث وحفظ التعديلات' : 'حفظ الباقة الجديدة'}
                </button>
                {editingPlan && (
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => {
                      setEditingPlan(null);
                      setPlanForm({ name: '', type: 'monthly', price: '', duration_days: '', total_sessions: '', is_active: true });
                    }}
                  >
                    إلغاء التعديل
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Active plans list */}
          <div className="card">
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px' }}>باقات الاشتراك المدرجة حالياً</h2>
            
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>الباقة</th>
                    <th>السعر</th>
                    <th>المدة / الحصص</th>
                    <th>الحالة</th>
                    <th>عمليات</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map(plan => (
                    <tr key={plan.id}>
                      <td>
                        <div style={{ fontWeight: '700' }}>{plan.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {plan.type === 'sessions' ? 'جلسات مخصصة' : plan.type === 'annual' ? 'اشتراك سنوي' : 'اشتراك شهري'}
                        </div>
                      </td>
                      <td style={{ fontWeight: '700', color: 'var(--accent-neon)' }}>{plan.price} ₪</td>
                      <td>
                        {plan.type === 'monthly' && (
                          <div style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>شهري (حساب تقويمي)</div>
                        )}
                        {plan.type === 'annual' && (
                          <div style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>سنوي (حساب تقويمي)</div>
                        )}
                        {plan.type === 'sessions' && (
                          <div style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>
                            {plan.sessions_count} حصص / {plan.duration_days} يوم
                          </div>
                        )}
                        {plan.type !== 'sessions' && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5 }}>
                            💡 ينتهي في نفس اليوم منقوصاً منه يوم، ويكون الاشتراك فعالاً حتى نهاية يوم الانتهاء.
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${plan.is_active ? 'badge-active' : 'badge-expired'}`}>
                          {plan.is_active ? 'نشطة للبيع' : 'معطلة'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button 
                            className="btn btn-secondary btn-icon-only" 
                            style={{ padding: '6px' }}
                            onClick={() => {
                              setEditingPlan(plan);
                              setPlanForm({ name: plan.name, type: plan.type, price: plan.price, duration_days: plan.duration_days, total_sessions: plan.sessions_count || '', is_active: plan.is_active });
                            }}
                            title="تعديل"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button 
                            className="btn btn-secondary btn-icon-only" 
                            style={{ padding: '6px', color: 'var(--error)' }}
                            onClick={() => handleDeletePlan(plan.id)}
                            title="حذف"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: Staff & Member Accounts Management */}
      {activeAdminTab === 'staff' && (
        <div className="grid-2">
          {/* User Form Card */}
          <div className="card">
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>
              {editingUser ? 'تعديل بيانات حساب حالي' : 'إنشاء حساب استقبال جديد'}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
              قم بإنشاء حسابات الموظفين لمكتب الاستقبال لمنحهم صلاحيات فحص الحضور وعمليات البيع كاش
            </p>

            {userStatus && (
              <div className={`alert ${userStatus.includes('بنجاح') ? 'alert-success' : userStatus.startsWith('خطأ') ? 'alert-error' : 'alert-info'}`}>
                {userStatus}
              </div>
            )}

            {/* Staff credential card shown after successful creation */}
            {staffCreatedCredentials && (
              <div className="card" style={{ background: 'rgba(102,252,241,0.05)', border: '1px solid rgba(102,252,241,0.2)', padding: '16px', borderRadius: '12px', marginBottom: '20px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginBottom: '10px' }}>🔐 بيانات الدخول المؤقتة للموظف:</h4>
                <p style={{ fontSize: '13px', margin: '4px 0' }}>الاسم: <strong>{staffCreatedCredentials.name}</strong></p>
                <p style={{ fontSize: '13px', margin: '4px 0' }}>رقم الهاتف: <strong style={{ direction: 'ltr', display: 'inline-block' }}>{staffCreatedCredentials.phone}</strong></p>
                <p style={{ fontSize: '13px', margin: '4px 0' }}>رمز الحساب: <strong style={{ color: 'var(--accent-cyan)', fontFamily: 'monospace' }}>{staffCreatedCredentials.member_id}</strong></p>
                <p style={{ fontSize: '13px', margin: '4px 0' }}>رمز الدخول المؤقت: <strong style={{ color: 'var(--accent-neon)', fontSize: '18px', letterSpacing: '3px' }}>{staffCreatedCredentials.password}</strong></p>
                <div style={{ background: 'rgba(255,165,0,0.08)', border: '1px solid rgba(255,165,0,0.2)', borderRadius: '8px', padding: '10px', marginTop: '10px', fontSize: '12px', color: 'var(--accent-orange)', lineHeight: 1.6 }}>
                  ⚠️ سيُطلب من الموظف تغيير هذا الرمز عند أول تسجيل دخول.
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                  <a
                    href={`https://wa.me/${staffCreatedCredentials.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`أهلاً بك في B2 Gym! تم إنشاء حسابك بنجاح.\nرمز الدخول المؤقت الخاص بك هو: ${staffCreatedCredentials.password}\nيرجى تسجيل الدخول وتغيير الرمز فور الدخول للحفاظ على أمان حسابك.`)}`}
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
                    onClick={() => setStaffCreatedCredentials(null)}
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveUser}>
              <div className="form-group">
                <label className="form-label">الاسم بالكامل (عربي)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="مثال: محمد علي كأخصائي استقبال" 
                  value={userForm.name}
                  onChange={e => setUserForm({ ...userForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">رقم جوال الحساب</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="مثال: 0500000002" 
                  value={userForm.phone}
                  onChange={e => {
                    setUserForm({ ...userForm, phone: e.target.value });
                    if (userPhoneError) setUserPhoneError('');
                  }}
                  required
                  style={{ borderColor: userPhoneError ? '#EF4444' : '' }}
                />
                {userPhoneError && (
                  <div style={{ color: '#EF4444', fontSize: '12px', marginTop: '4px', fontWeight: '500' }}>
                    {userPhoneError}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">دور وصلاحيات الحساب</label>
                <select
                  className="form-select"
                  value={userForm.role}
                  onChange={e => setUserForm({ ...userForm, role: e.target.value })}
                  required
                >
                  <option value="receptionist">موظف استقبال (صلاحيات عمليات)</option>
                  <option value="admin">المدير العام (كامل الصلاحيات)</option>
                </select>
              </div>

              <div style={{ background: 'rgba(102,252,241,0.04)', border: '1px solid rgba(102,252,241,0.12)', borderRadius: '10px', padding: '12px 14px', marginTop: '4px', marginBottom: '16px', fontSize: '12px', color: 'var(--accent-cyan)', lineHeight: 1.7 }}>
                🔑 سيتم إنشاء رمز دخول مؤقت تلقائياً وإرساله للموظف عبر واتساب. سيُطلب منه تغييره عند أول تسجيل دخول.
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  {editingUser ? 'حفظ تعديلات الحساب' : 'إنشاء حساب موظف الاستقبال'}
                </button>
                {editingUser && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setEditingUser(null);
                      setUserForm({ name: '', phone: '', role: 'receptionist' });
                      setUserPhoneError('');
                      setStaffCreatedCredentials(null);
                    }}
                  >
                    إلغاء التعديل
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Directory of accounts list */}
          <div className="card">
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px' }}>قائمة حسابات النظام (المدير والموظفين)</h2>
            
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>رقم الجوال</th>
                    <th>الرمز الفريد</th>
                    <th>الدور</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {users.filter(u => u.role !== 'member').map(u => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: '700' }}>{u.name}</td>
                      <td>{u.phone}</td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>{u.member_id}</td>
                      <td>
                        <span className={`badge ${u.role === 'admin' ? 'badge-active' : 'badge-role'}`} style={{ fontSize: '11px' }}>
                          {u.role === 'admin' ? 'مدير عام' : 'استقبال'}
                        </span>
                      </td>
                      <td>
                        {/* Lock deletion/edit of self to avoid accidental lockouts */}
                        {currentUser.id !== u.id ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button 
                              className="btn btn-secondary btn-icon-only" 
                              style={{ padding: '6px' }}
                              onClick={() => {
                                setEditingUser(u);
                                setUserForm({ name: u.name, phone: u.phone, role: u.role });
                                setUserPhoneError('');
                                setStaffCreatedCredentials(null);
                              }}
                            >
                              <Edit2 size={13} />
                            </button>
                            <button 
                              className="btn btn-secondary btn-icon-only" 
                              style={{ padding: '6px', color: 'var(--error)' }}
                              onClick={() => handleDeleteUser(u.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>حسابك الحالي</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: Members Management (إدارة الأعضاء واللاعبين) */}
      {activeAdminTab === 'members' && (
        <div className="grid-2">
          {/* Register New Member Card */}
          <div className="card">
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>تسجيل لاعب / عضو جديد</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
              قم بإنشاء ملف لاعب جديد وربطه بباقة اشتراك (شهرية، سنوية، أو حصص) مباشرة
            </p>

            {regStatus && (
              <div className={`alert ${regStatus.includes('بنجاح') ? 'alert-success' : 'alert-info'}`}>
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

            <form onSubmit={handleRegisterMember}>
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
                  onChange={e => {
                    setRegPhone(e.target.value);
                    if (regPhoneError) setRegPhoneError('');
                  }}
                  required
                  style={{ borderColor: regPhoneError ? '#EF4444' : '' }}
                />
                {regPhoneError && (
                  <div style={{ color: '#EF4444', fontSize: '12px', marginTop: '4px', fontWeight: '500' }}>
                    {regPhoneError}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">باقة الاشتراك (اختياري — يمكن إضافته لاحقاً)</label>
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
                  {memberEndDate && (
                    <div className="form-group">
                      <label className="form-label">تاريخ انتهاء الاشتراك (محسوب تلقائياً)</label>
                      <div className="form-input" style={{ background: 'rgba(102,252,241,0.05)', border: '1px solid rgba(102,252,241,0.2)', color: 'var(--accent-cyan)', fontWeight: '700', direction: 'ltr', textAlign: 'center' }}>
                        {memberEndDate}
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

          {/* Members Directory Card */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800' }}>قائمة الأعضاء المسجلين</h2>
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

            <div className="table-container" style={{ maxHeight: '400px' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>الجوال</th>
                    <th>رقم العضوية</th>
                    <th>الباقة</th>
                    <th>الحالة</th>
                    <th>تاريخ الانتهاء</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>لا يوجد أعضاء مطابقون للبحث</td>
                    </tr>
                  ) : (
                    filteredMembers.map(member => {
                      const sub = member.subscription;
                      const todayStr = new Date().toISOString().split('T')[0];
                      const isExpired = !sub || sub.status === 'expired' || (sub.end_date && sub.end_date < todayStr);
                      return (
                        <tr key={member.id}>
                          <td style={{ fontWeight: '700' }}>{member.name}</td>
                          <td style={{ fontSize: '12px' }}>{member.phone}</td>
                          <td style={{ fontFamily: 'monospace', color: 'var(--accent-cyan)', fontSize: '12px' }}>
                            {member.status === 'pending' ? '—' : member.member_id}
                          </td>
                          <td style={{ fontSize: '12px' }}>{sub ? sub.plan_name : '—'}</td>
                          <td>
                            {member.status === 'pending' ? (
                              <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', border: '1px solid rgba(245, 158, 11, 0.2)', fontSize: '11px' }}>
                                غير مفعل
                              </span>
                            ) : (
                              <span className={`badge ${!sub ? 'badge-expired' : isExpired ? 'badge-expired' : sub.status === 'frozen' ? 'badge-frozen' : 'badge-active'}`} style={{ fontSize: '11px' }}>
                              {!sub ? 'بدون اشتراك' : isExpired ? 'منتهي' : sub.status === 'frozen' ? 'مجمد' : 'نشط'}
                            </span>
                            )}
                          </td>
                          <td style={{ fontSize: '12px', color: isExpired ? 'var(--error)' : 'var(--text-primary)' }}>
                            {sub ? sub.end_date || 'غير محدد' : '—'}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {member.status === 'pending' ? (
                                <button
                                  className="btn btn-primary"
                                  style={{ padding: '4px 12px', fontSize: '11px' }}
                                  onClick={() => handleActivateUser(member)}
                                >
                                  تفعيل ⚡
                                </button>
                              ) : (
                                <>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '4px 10px', fontSize: '11px' }}
                                onClick={() => {
                                  setRenewMember(member);
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

      {/* RENEWAL MODAL */}
      {renewMember && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent-cyan)' }}>تجديد اشتراك اللاعب كاش</h3>
              <button className="btn btn-secondary btn-icon-only" style={{ padding: '4px 8px' }} onClick={() => setRenewMember(null)}>إلغاء</button>
            </div>

            {renewStatus && (
              <div className={`alert ${renewStatus.includes('بنجاح') ? 'alert-success' : 'alert-info'}`}>
                {renewStatus}
              </div>
            )}

            <div style={{ marginBottom: '20px', background: 'rgba(255,255,255,0.02)', padding: '12px', border: '1px solid var(--glass-border)', borderRadius: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>اللاعب:</span>
                <span style={{ fontWeight: '700' }}>{renewMember.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>الرمز السريع:</span>
                <span style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>{renewMember.member_id}</span>
              </div>
            </div>

            <form onSubmit={handleRenewMember}>
              <div className="form-group">
                <label className="form-label">اختر باقة التجديد</label>
                <select
                  className="form-select"
                  value={renewPlanId}
                  onChange={e => {
                    setRenewPlanId(e.target.value);
                    // Reset start date to today when plan changes to prevent stale dates
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
                          {new Date().toISOString().split('T')[0]}
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
                        <label className="form-label">تاريخ انتهاء الاشتراك (محسوب تلقائياً)</label>
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
                  تفعيل وحفظ الدفعة كاش
                </button>
                <button type="button" className="btn btn-secondary" style={{ flex: 0.5 }} onClick={() => setRenewMember(null)}>
                  إلغاء الأمر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── TAB: Exercise Library Management ─────────────────────────── */}
      {activeAdminTab === 'exercises' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="grid-2">
            {/* Add Category */}
            <div className="card">
              <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px' }}>إضافة فئة تمارين جديدة</h2>
              {exCatStatus && (
                <div className={`alert ${exCatStatus.includes('✅') ? 'alert-success' : 'alert-info'}`}>{exCatStatus}</div>
              )}
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  id="cat-name-input"
                  type="text"
                  className="form-input"
                  placeholder="اسم الفئة (مثال: صدر، ظهر، كارديو)"
                  value={exCatName}
                  onChange={e => setExCatName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  id="add-cat-btn"
                  className="btn btn-primary"
                  style={{ whiteSpace: 'nowrap' }}
                  onClick={async () => {
                    if (!exCatName.trim()) return;
                    setExCatStatus('جاري الإضافة...');
                    try {
                      const res = await authFetch('/api/exercises/categories', {
                        method: 'POST',
                        body: JSON.stringify({ name: exCatName.trim() })
                      });
                      if (!res.ok) throw new Error('فشل الإضافة');
                      setExCatStatus('✅ تمت إضافة الفئة بنجاح');
                      setExCatName('');
                      loadData();
                      setTimeout(() => setExCatStatus(''), 2500);
                    } catch (err) {
                      setExCatStatus(`خطأ: ${err.message}`);
                    }
                  }}
                >
                  إضافة فئة
                </button>
              </div>

              <div style={{ marginTop: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '12px' }}>الفئات الحالية:</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {categories.map(cat => (
                    <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(102,252,241,0.08)', border: '1px solid rgba(102,252,241,0.2)', borderRadius: '20px', padding: '4px 12px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--accent-cyan)', fontWeight: '700' }}>{cat.name}</span>
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}
                        title="حذف الفئة"
                        onClick={() => {
                          showCustomConfirm(`حذف فئة "${cat.name}" وكل تمارينها؟`, async () => {
                            await authFetch(`/api/exercises/categories/${cat.id}`, { method: 'DELETE' });
                            loadData();
                          });
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {categories.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>لا توجد فئات بعد.</p>}
                </div>
              </div>
            </div>

            {/* Add/Edit Exercise */}
            <div className="card">
              <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px' }}>
                {editingEx ? `تعديل تمرين: ${editingEx.name}` : 'إضافة تمرين جديد'}
              </h2>
              {exStatus && (
                <div className={`alert ${exStatus.includes('✅') ? 'alert-success' : 'alert-info'}`}>{exStatus}</div>
              )}
              <form id="exercise-form" onSubmit={async (e) => {
                e.preventDefault();
                if (!exName || !exCategoryId) {
                  setExStatus('الرجاء إدخال اسم التمرين واختيار الفئة');
                  return;
                }
                setExStatus('جاري الحفظ...');
                try {
                  const payload = { name: exName, description: exDesc, video_url: exVideo, category_id: Number(exCategoryId) };
                  const url = editingEx ? `/api/exercises/${editingEx.id}` : '/api/exercises';
                  const method = editingEx ? 'PUT' : 'POST';
                  const res = await authFetch(url, { method, body: JSON.stringify(payload) });
                  if (!res.ok) throw new Error('فشل الحفظ');
                  setExStatus(`✅ تم ${editingEx ? 'تحديث' : 'إضافة'} التمرين بنجاح`);
                  setExName(''); setExDesc(''); setExVideo(''); setExCategoryId('');
                  setEditingEx(null);
                  loadData();
                  setTimeout(() => setExStatus(''), 2500);
                } catch (err) {
                  setExStatus(`خطأ: ${err.message}`);
                }
              }}>
                <div className="form-group">
                  <label className="form-label">اسم التمرين *</label>
                  <input id="ex-name-input" type="text" className="form-input" placeholder="مثال: بنش برس بالبار" value={exName} onChange={e => setExName(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">الفئة *</label>
                  <select id="ex-cat-select" className="form-select" value={exCategoryId} onChange={e => setExCategoryId(e.target.value)} required>
                    <option value="">-- اختر الفئة --</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">وصف التمرين (اختياري)</label>
                  <textarea className="form-input" rows={3} placeholder="أدخل وصفاً تفصيلياً للتمرين..." value={exDesc} onChange={e => setExDesc(e.target.value)} style={{ resize: 'vertical' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">رابط فيديو YouTube (اختياري)</label>
                  <input id="ex-video-input" type="url" className="form-input" placeholder="https://www.youtube.com/embed/..." value={exVideo} onChange={e => setExVideo(e.target.value)} style={{ direction: 'ltr' }} />
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>استخدم رابط embed من يوتيوب (مثال: https://www.youtube.com/embed/VIDEO_ID)</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button id="save-exercise-btn" type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                    {editingEx ? 'تحديث التمرين' : 'إضافة التمرين'}
                  </button>
                  {editingEx && (
                    <button type="button" className="btn btn-secondary" onClick={() => { setEditingEx(null); setExName(''); setExDesc(''); setExVideo(''); setExCategoryId(''); }}>
                      إلغاء
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>

          {/* Exercise List by Category */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800' }}>جميع التمارين المضافة ({exercises.length})</h2>
              <button className="btn btn-secondary btn-icon-only" style={{ padding: '6px' }} onClick={loadData} title="تحديث">
                <RefreshCw size={16} />
              </button>
            </div>

            {categories.map(cat => {
              const catExercises = exercises.filter(e => e.category_id === cat.id);
              if (catExercises.length === 0) return null;
              return (
                <div key={cat.id} style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--accent-cyan)', marginBottom: '12px', padding: '6px 12px', background: 'rgba(102,252,241,0.08)', borderRadius: '8px', display: 'inline-block' }}>
                    {cat.name} ({catExercises.length})
                  </h3>
                  <div className="table-container">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>اسم التمرين</th>
                          <th>الوصف</th>
                          <th>فيديو</th>
                          <th>إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catExercises.map(ex => (
                          <tr key={ex.id}>
                            <td style={{ fontWeight: '700' }}>{ex.name}</td>
                            <td style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '200px' }}>
                              {ex.description ? ex.description.substring(0, 80) + (ex.description.length > 80 ? '...' : '') : '—'}
                            </td>
                            <td>
                              {ex.video_url ? (
                                <a href={ex.video_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-cyan)', fontSize: '12px' }}>▶ مشاهدة</a>
                              ) : '—'}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: '4px 10px', fontSize: '12px' }}
                                  onClick={() => {
                                    setEditingEx(ex);
                                    setExName(ex.name);
                                    setExDesc(ex.description || '');
                                    setExVideo(ex.video_url || '');
                                    setExCategoryId(String(ex.category_id));
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button
                                  className="btn btn-danger"
                                  style={{ padding: '4px 10px', fontSize: '12px' }}
                                  onClick={() => {
                                    showCustomConfirm(`حذف تمرين "${ex.name}"؟`, async () => {
                                      await authFetch(`/api/exercises/${ex.id}`, { method: 'DELETE' });
                                      loadData();
                                    });
                                  }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {exercises.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <Dumbbell size={48} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }} />
                لا توجد تمارين مضافة حتى الآن. ابدأ بإضافة فئة ثم تمارين.
              </div>
            )}
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
    </div>
  );
}
