import React, { useState } from 'react';
import { ShieldAlert, Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';

/**
 * ForceChangePassword — locked screen shown on first login when must_change_password is true.
 * The user CANNOT navigate anywhere until they set a new PIN.
 */
export default function ForceChangePassword({ user, token, apiBase, onSuccess, onLogout }) {
  const [newPin,      setNewPin]      = useState('');
  const [confirmPin,  setConfirmPin]  = useState('');
  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
      setError('رمز الدخول يجب أن يتكون من 6 أرقام فقط');
      return;
    }
    if (newPin !== confirmPin) {
      setError('رمز الدخول الجديد وتأكيده غير متطابقان');
      return;
    }

    setLoading(true);
    try {
      const fullUrl = `${apiBase}/api/auth/force-change-password`;
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword: newPin, confirmPassword: confirmPin })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'فشل تغيير رمز الدخول');

      setSuccess('تم تغيير رمز الدخول بنجاح! جاري التحويل إلى لوحة التحكم...');
      setTimeout(() => {
        onSuccess(data.token, data.user);
      }, 1500);
    } catch (err) {
      setError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'radial-gradient(circle at 30% 20%, rgba(255,100,50,0.08) 0%, transparent 60%), radial-gradient(circle at 70% 80%, rgba(102,252,241,0.05) 0%, transparent 60%), #0B0C10'
      }}
    >
      {/* Animated warning icon */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        background: 'rgba(255,100,50,0.1)',
        border: '2px solid rgba(255,100,50,0.3)',
        marginBottom: '24px',
        animation: 'pulse 2s ease-in-out infinite'
      }}>
        <ShieldAlert size={40} color="var(--accent-orange, #ff6432)" />
      </div>

      <h1 style={{
        fontSize: '22px',
        fontWeight: '800',
        color: '#fff',
        marginBottom: '8px',
        textAlign: 'center'
      }}>
        مرحباً بك، {user?.name}
      </h1>
      <p style={{
        color: 'var(--text-secondary, #a8b2c1)',
        fontSize: '14px',
        textAlign: 'center',
        marginBottom: '32px',
        maxWidth: '380px',
        lineHeight: 1.7
      }}>
        لديك رمز دخول مؤقت. يجب عليك تعيين رمز دخول شخصي جديد قبل المتابعة. لن تتمكن من الوصول إلى أي جزء من النظام حتى تُكمل هذه الخطوة.
      </p>

      {/* Lock card */}
      <div className="card" style={{ maxWidth: '420px', width: '100%', padding: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <Lock size={20} color="var(--accent-cyan, #66fcf1)" />
          <h2 style={{ fontSize: '17px', fontWeight: '700', color: '#fff', margin: 0 }}>
            تعيين رمز دخول جديد
          </h2>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '16px' }}>
            {error}
          </div>
        )}
        {success && (
          <div className="alert alert-success" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={16} />
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* New PIN */}
          <div className="form-group">
            <label className="form-label">رمز الدخول الجديد (6 أرقام)</label>
            <div style={{ position: 'relative' }}>
              <input
                id="fcp-new-pin"
                type={showNew ? 'text' : 'password'}
                className="form-input"
                placeholder="000000"
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                inputMode="numeric"
                disabled={loading || !!success}
                style={{ paddingLeft: '44px', direction: 'ltr', textAlign: 'center', letterSpacing: '8px', fontSize: '22px' }}
              />
              <button
                type="button"
                onClick={() => setShowNew(v => !v)}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted, #6b7a8d)',
                  padding: '4px'
                }}
                tabIndex={-1}
              >
                {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {/* PIN strength dots */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', justifyContent: 'center' }}>
              {[0,1,2,3,4,5].map(i => (
                <div
                  key={i}
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: newPin.length > i ? 'var(--accent-cyan, #66fcf1)' : 'rgba(255,255,255,0.1)',
                    transition: 'background 0.2s'
                  }}
                />
              ))}
            </div>
          </div>

          {/* Confirm PIN */}
          <div className="form-group" style={{ marginBottom: '28px' }}>
            <label className="form-label">تأكيد رمز الدخول الجديد</label>
            <div style={{ position: 'relative' }}>
              <input
                id="fcp-confirm-pin"
                type={showConfirm ? 'text' : 'password'}
                className="form-input"
                placeholder="000000"
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                inputMode="numeric"
                disabled={loading || !!success}
                style={{
                  paddingLeft: '44px',
                  direction: 'ltr',
                  textAlign: 'center',
                  letterSpacing: '8px',
                  fontSize: '22px',
                  borderColor: confirmPin.length === 6
                    ? (confirmPin === newPin ? 'rgba(102,252,241,0.5)' : 'rgba(255,80,60,0.5)')
                    : undefined
                }}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted, #6b7a8d)',
                  padding: '4px'
                }}
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            id="fcp-submit-btn"
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: '15px' }}
            disabled={loading || newPin.length !== 6 || confirmPin.length !== 6 || !!success}
          >
            {loading ? 'جاري الحفظ...' : 'تعيين رمز الدخول الجديد والمتابعة'}
          </button>
        </form>

        {/* Subtle logout escape hatch */}
        <div style={{ marginTop: '20px', textAlign: 'center', borderTop: '1px solid var(--glass-border, rgba(255,255,255,0.06))', paddingTop: '16px' }}>
          <button
            onClick={onLogout}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #6b7a8d)',
              fontSize: '12px',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            تسجيل الخروج
          </button>
        </div>
      </div>

      <p style={{ color: 'var(--text-muted, #6b7a8d)', fontSize: '11px', marginTop: '24px', textAlign: 'center' }}>
        B2 Gym — النظام الآمن لإدارة اللياقة البدنية
      </p>
    </div>
  );
}
