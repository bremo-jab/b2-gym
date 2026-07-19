/**
 * MemberView.jsx — Member portal (Refactored)
 * Key changes:
 *  1. Replaced fake SVG QR renderer with real qrcode.react <QRCodeSVG> component.
 *     The QR encodes the member_id string — any physical USB/serial scanner can read it.
 *  2. All fetch() calls replaced with authFetch() prop — JWT Bearer token injected automatically.
 *  3. Timezone: log_date uses UTC date strings consistently.
 */
import React, { useState, useEffect } from 'react';
import { QrCode, ClipboardList, TrendingUp, User as UserIcon, Calendar, Trophy, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function MemberView({ currentUser, subscription, authFetch, onSubscriptionUpdate }) {
  const [activeTab, setActiveTab] = useState('qr'); // qr | workout | tracker | profile
  const [categories, setCategories] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [assignedExercises, setAssignedExercises] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [workoutLogs, setWorkoutLogs] = useState([]);

  // Logging overlay state
  const [activeExerciseForLog, setActiveExerciseForLog] = useState(null);
  const [setsInput, setSetsInput]   = useState([{ set_num: 1, weight: '', reps: '' }]);
  const [saveStatus, setSaveStatus] = useState('');
  const [exerciseMode, setExerciseMode] = useState('assigned'); // 'assigned' | 'general'

  // UTC today string — consistent with server
  const todayStr = new Date().toISOString().split('T')[0];

  // Determine subscription expiry using UTC date comparison
  const isExpired = !subscription
    || subscription.status === 'expired'
    || (subscription.end_date && subscription.end_date < todayStr)
    || (subscription.total_sessions_allowed > 0 && subscription.sessions_used >= subscription.total_sessions_allowed);

  // Keep the QR identity visible even on expired subscriptions. The profile view
  // will show the status badge without hiding the QR for door scanning.

  // Load all data via JWT-authenticated fetch
  useEffect(() => {
    if (!currentUser) return;

    authFetch('/api/exercises/categories')
      .then(r => r.json())
      .then(data => {
        setCategories(data);
        if (data.length > 0) setSelectedCategory(data[0].id);
      })
      .catch(() => {});

    authFetch('/api/exercises')
      .then(r => r.json())
      .then(setExercises)
      .catch(() => {});

    authFetch(`/api/workouts/assigned/${currentUser.id}`)
      .then(r => r.json())
      .then(setAssignedExercises)
      .catch(() => {});

    authFetch(`/api/workouts/history/${currentUser.id}`)
      .then(r => r.json())
      .then(setWorkoutLogs)
      .catch(() => {});
  }, [currentUser]);

  // ── Set input handlers ──────────────────────────────────────────────────────
  const handleAddSetInput = () => {
    setSetsInput([...setsInput, { set_num: setsInput.length + 1, weight: '', reps: '' }]);
  };

  const handleRemoveSetInput = (index) => {
    if (setsInput.length === 1) return;
    setSetsInput(setsInput.filter((_, i) => i !== index).map((s, idx) => ({ ...s, set_num: idx + 1 })));
  };

  const handleSetChange = (index, field, value) => {
    const updated = [...setsInput];
    updated[index][field] = value;
    setSetsInput(updated);
  };

  // ── Save workout log via JWT fetch ──────────────────────────────────────────
  const handleSaveWorkoutLog = async (e) => {
    e.preventDefault();
    if (!activeExerciseForLog) return;

    const validSets = setsInput
      .filter(s => s.weight !== '' && s.reps !== '')
      .map(s => ({ set_num: s.set_num, weight: Number(s.weight), reps: Number(s.reps) }));

    if (validSets.length === 0) {
      setSaveStatus('الرجاء إدخال الوزن والتكرار لجلسة واحدة على الأقل');
      return;
    }

    setSaveStatus('جاري الحفظ...');

    try {
      const response = await authFetch('/api/workouts/log', {
        method: 'POST',
        body: JSON.stringify({
          exercise_id: activeExerciseForLog.id,
          sets: validSets,
          log_date: todayStr   // UTC date string
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'فشل حفظ سجل التمرين');

      setSaveStatus('تم حفظ سجل التمرين بنجاح! 💪');

      // Optimistically update local log state
      setWorkoutLogs(prev => {
        const idx = prev.findIndex(l => l.exercise_id === activeExerciseForLog.id && l.log_date === todayStr);
        return idx !== -1
          ? prev.map((l, i) => i === idx ? data : l)
          : [...prev, data];
      });

      setTimeout(() => {
        setSaveStatus('');
        setActiveExerciseForLog(null);
        setSetsInput([{ set_num: 1, weight: '', reps: '' }]);
      }, 1500);
    } catch (err) {
      setSaveStatus(`خطأ: ${err.message}`);
    }
  };

  // ── Display helpers ─────────────────────────────────────────────────────────
  const currentExercisesToDisplay = exercises.filter(e => e.category_id === Number(selectedCategory));
  const currentAssignedToDisplay  = assignedExercises
    .filter(ae => ae.exercise && ae.exercise.category_id === Number(selectedCategory))
    .map(ae => ae.exercise);

  const groupedLogs = workoutLogs.reduce((acc, log) => {
    const date = log.log_date;
    if (!acc[date]) acc[date] = [];
    const ex = exercises.find(e => e.id === log.exercise_id);
    acc[date].push({ ...log, exercise: ex || { title: 'تمرين غير معروف' } });
    return acc;
  }, {});

  const getPlanTypeArabic = (type) => {
    switch (type) {
      case 'annual':   return 'اشتراك سنوي كامل';
      case 'monthly':  return 'اشتراك شهري كامل';
      case 'sessions': return 'باقة حصص محددة';
      default:         return type;
    }
  };

  return (
    <div>
      {/* Expired status notice — QR remains visible for the receptionist scan flow */}
      {isExpired && (
        <div className="card" style={{ marginBottom: '16px', borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertTriangle size={24} color="var(--accent-orange)" />
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '800', margin: 0 }}>الاشتراك منتهي - يرجى التجديد</h3>
              <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>سيظل رمزك الشخصي مرئياً لعمليات الدخول حتى يتم تجديد الاشتراك من الاستقبال.</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <div className="tabs-header">
        <button className={`tab-btn ${activeTab === 'qr' ? 'active' : ''}`} onClick={() => setActiveTab('qr')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><QrCode size={18} /><span>رمز الدخول QR</span></div>
        </button>
        <button className={`tab-btn ${activeTab === 'workout' ? 'active' : ''}`} onClick={() => !isExpired && setActiveTab('workout')} disabled={isExpired}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><ClipboardList size={18} /><span>شاشة التمارين</span></div>
        </button>
        <button className={`tab-btn ${activeTab === 'tracker' ? 'active' : ''}`} onClick={() => !isExpired && setActiveTab('tracker')} disabled={isExpired}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><TrendingUp size={18} /><span>مستودع الأوزان</span></div>
        </button>
        <button className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><UserIcon size={18} /><span>حسابي والاشتراك</span></div>
        </button>
      </div>

      {/* ── TAB: QR Code (Real ISO-compliant QR via qrcode.react) ── */}
      {activeTab === 'qr' && (
        <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <div className="card card-glow-neon" style={{ padding: '40px 24px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#fff', marginBottom: '8px' }}>بوابة الدخول الذكية</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '32px' }}>
              امسح هذا الرمز بالماسح الضوئي عند البوابة أو بكاميرا هاتفك لتسجيل الحضور اليومي
            </p>

            {/* ── Real QR Code — member_id is the payload ── */}
            <div className="qr-container" style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
              <div style={{
                background: '#ffffff',
                padding: '20px',
                borderRadius: '16px',
                boxShadow: '0 0 40px rgba(173,255,47,0.25), 0 0 80px rgba(173,255,47,0.08)',
                border: '3px solid rgba(173,255,47,0.4)',
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
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>الاسم:</span>
                <span style={{ fontWeight: '700' }}>{currentUser.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>رقم المشترك (محتوى QR):</span>
                <span style={{ fontWeight: '700', color: 'var(--accent-cyan)', fontFamily: 'monospace', letterSpacing: '2px' }}>
                  {currentUser.member_id}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>حالة الاشتراك:</span>
                <span className={`badge ${isExpired ? 'badge-expired' : subscription?.status === 'frozen' ? 'badge-frozen' : 'badge-active'}`}>
                  {isExpired ? 'الاشتراك منتهي - يرجى التجديد' : subscription?.status === 'frozen' ? 'مجمد' : 'نشط ومفعل ✓'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Workout ── */}
      {!isExpired && activeTab === 'workout' && (
        <div>
          {/* Sub-tabs: assigned vs general */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: 'rgba(255,255,255,0.02)', padding: '4px', borderRadius: '12px', width: 'fit-content' }}>
            <button className="btn" style={{ padding: '8px 16px', fontSize: '14px', background: exerciseMode === 'assigned' ? 'var(--accent-cyan)' : 'transparent', color: exerciseMode === 'assigned' ? '#0b0c10' : 'var(--text-secondary)' }} onClick={() => setExerciseMode('assigned')}>
              الجدول التدريبي المخصص لي ({assignedExercises.length})
            </button>
            <button className="btn" style={{ padding: '8px 16px', fontSize: '14px', background: exerciseMode === 'general' ? 'var(--accent-cyan)' : 'transparent', color: exerciseMode === 'general' ? '#0b0c10' : 'var(--text-secondary)' }} onClick={() => setExerciseMode('general')}>
              دليل التمارين العام
            </button>
          </div>

          {/* Category tabs */}
          <div className="category-tabs">
            {categories.map(cat => (
              <button key={cat.id} className={`category-tab ${selectedCategory === cat.id ? 'active' : ''}`} onClick={() => setSelectedCategory(cat.id)}>
                {cat.name}
              </button>
            ))}
          </div>

          {/* Exercise cards */}
          <div className="grid-2">
            {(exerciseMode === 'assigned' ? currentAssignedToDisplay : currentExercisesToDisplay).length === 0 ? (
              <div className="card" style={{ gridColumn: 'span 2', textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                لا توجد تمارين مضافة في هذا القسم حالياً.
              </div>
            ) : (
              (exerciseMode === 'assigned' ? currentAssignedToDisplay : currentExercisesToDisplay).map(ex => {
                const todayLog = workoutLogs.find(l => l.exercise_id === ex.id && l.log_date === todayStr);
                return (
                  <div key={ex.id} className="card">
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent-cyan)', marginBottom: '10px' }}>{ex.title}</h3>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', minHeight: '60px' }}>{ex.description}</p>

                    {ex.video_url && (
                      <div className="video-wrapper">
                        <iframe src={ex.video_url} title={ex.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                      </div>
                    )}

                    {todayLog && (
                      <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', padding: '12px', borderRadius: '10px', marginBottom: '16px' }}>
                        <h4 style={{ fontSize: '13px', color: 'var(--success)', fontWeight: '700', marginBottom: '6px' }}>تم تسجيله اليوم:</h4>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                          {todayLog.sets.map((set, sIdx) => (
                            <span key={sIdx} style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                              ج {set.set_num}: <strong>{set.weight} كجم</strong> × <strong>{set.reps} تكرار</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => {
                      setActiveExerciseForLog(ex);
                      setSetsInput(todayLog ? todayLog.sets.map(s => ({ ...s })) : [{ set_num: 1, weight: '', reps: '' }]);
                    }}>
                      {todayLog ? 'تحديث تسجيل الأوزان اليوم' : 'تسجيل الأوزان والجلسات'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Tracker / History ── */}
      {!isExpired && activeTab === 'tracker' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="card">
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '8px' }}>تاريخ الأداء الرياضي ومفكرة الأوزان</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>استعرض سجل الجلسات، التكرارات، والأوزان السابقة لجميع التمارين التي قمت بتأديتها</p>

            {Object.keys(groupedLogs).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                لم تقم بتسجيل أي تمارين بعد. ابدأ بالتسجيل من شاشة التمارين!
              </div>
            ) : (
              Object.keys(groupedLogs).sort((a, b) => b.localeCompare(a)).map(date => (
                <div key={date} style={{ marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-neon)', fontWeight: '700', marginBottom: '12px' }}>
                    <Calendar size={16} />
                    <span>{date === todayStr ? 'اليوم' : date}</span>
                  </div>
                  <div className="grid-2" style={{ gap: '16px' }}>
                    {groupedLogs[date].map(log => (
                      <div key={log.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', padding: '16px', borderRadius: '12px' }}>
                        <h4 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--accent-cyan)', marginBottom: '10px' }}>{log.exercise.title}</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px', marginBottom: '6px', fontWeight: '700', color: 'var(--text-secondary)' }}>
                          <span>الجلسة</span><span>الوزن</span><span>التكرار</span>
                        </div>
                        {log.sets.map((set, sIdx) => (
                          <div key={sIdx} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center', fontSize: '13px', padding: '4px 0' }}>
                            <span>{set.set_num}</span>
                            <span style={{ fontWeight: '700' }}>{set.weight} كجم</span>
                            <span>{set.reps}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Profile & Subscription ── */}
      {activeTab === 'profile' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="grid-2">
            <div className="card">
              <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '16px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>حالة اشتراك العضوية</h2>
              {subscription ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>نوع الباقة:</span>
                    <span style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>{getPlanTypeArabic(subscription.plan_type)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>تاريخ البدء:</span>
                    <span style={{ fontWeight: '700' }}>{subscription.start_date}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>تاريخ الانتهاء:</span>
                    <span style={{ fontWeight: '700' }}>{subscription.end_date || 'غير محدد'}</span>
                  </div>
                  {subscription.total_sessions_allowed > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>الحصص المستهلكة:</span>
                      <span style={{ fontWeight: '700' }}>{subscription.sessions_used} / {subscription.total_sessions_allowed}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>المبلغ المدفوع:</span>
                    <span style={{ fontWeight: '700', color: 'var(--accent-neon)' }}>{subscription.price_paid} شيكل</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: '700' }}>حالة البطاقة:</span>
                    <span className={`badge ${isExpired ? 'badge-expired' : subscription.status === 'frozen' ? 'badge-frozen' : 'badge-active'}`}>
                      {isExpired ? 'منتهي الصلاحية' : subscription.status === 'frozen' ? 'مجمد' : 'نشط ومفعل'}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)' }}>
                  لا يوجد اشتراك مسجل حالياً. يرجى التوجه للاستقبال لتفعيل باقة الاشتراك الخاصة بك.
                </div>
              )}
            </div>

            <div className="card">
              <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '16px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>الملف الشخصي للاعب</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>الاسم الكامل:</span>
                  <span style={{ fontWeight: '700' }}>{currentUser.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>رقم الجوال:</span>
                  <span style={{ fontWeight: '700' }}>{currentUser.phone}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>الرقم التعريفي (Member ID):</span>
                  <span style={{ fontWeight: '700', color: 'var(--accent-cyan)', fontFamily: 'monospace' }}>{currentUser.member_id}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>تاريخ الانضمام للنادي:</span>
                  <span style={{ fontWeight: '700' }}>{new Date(currentUser.created_at).toLocaleDateString('ar-SA')}</span>
                </div>
              </div>
              <div style={{ marginTop: '24px', background: 'rgba(173,255,47,0.05)', border: '1px solid rgba(173,255,47,0.2)', padding: '16px', borderRadius: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <Trophy color="var(--accent-neon)" size={24} />
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#fff' }}>تلميحة اليوم لبناء القوة:</h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    الانتظام التدريبي وتدوين الأوزان هو المفتاح الأساسي للتطور الرياضي المستمر. احرص على تدوين نتائج تمرينك اليوم!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Workout Logger Overlay ── */}
      {activeExerciseForLog && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent-cyan)' }}>تسجيل تمرين: {activeExerciseForLog.title}</h3>
              <button className="btn btn-secondary btn-icon-only" style={{ padding: '4px 8px' }} onClick={() => setActiveExerciseForLog(null)}>إغلاق</button>
            </div>

            <form onSubmit={handleSaveWorkoutLog}>
              {saveStatus && (
                <div className={`alert ${saveStatus.includes('بنجاح') ? 'alert-success' : 'alert-info'}`}>{saveStatus}</div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr auto', gap: '8px', marginBottom: '8px', fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', textAlign: 'center' }}>
                <span>الجلسة</span><span>الوزن (كجم)</span><span>التكرار</span><span>حذف</span>
              </div>

              <div style={{ maxHeight: '250px', overflowY: 'auto', marginBottom: '20px' }}>
                {setsInput.map((set, index) => (
                  <div key={index} className="workout-set-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1.2 }}>
                      <span className="workout-set-badge">{set.set_num}</span>
                      <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>الجلسة</span>
                    </div>
                    <input type="number" step="any" placeholder="الوزن" className="form-input" value={set.weight} onChange={e => handleSetChange(index, 'weight', e.target.value)} required style={{ flex: 1, padding: '8px 10px', textAlign: 'center' }} />
                    <input type="number" placeholder="التكرار" className="form-input" value={set.reps} onChange={e => handleSetChange(index, 'reps', e.target.value)} required style={{ flex: 1, padding: '8px 10px', textAlign: 'center' }} />
                    <button type="button" className="btn btn-secondary btn-icon-only" onClick={() => handleRemoveSetInput(index)} style={{ padding: '8px', color: 'var(--error)' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <button type="button" className="btn btn-secondary" style={{ width: '100%', marginBottom: '16px', display: 'flex', gap: '6px' }} onClick={handleAddSetInput}>
                <Plus size={16} /><span>إضافة جلسة جديدة</span>
              </button>
              <button type="submit" className="btn btn-neon" style={{ width: '100%' }}>حفظ التمرين</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
