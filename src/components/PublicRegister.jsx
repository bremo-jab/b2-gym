import React, { useState } from 'react';
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import B2Logo from './B2Logo.jsx';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export default function PublicRegister() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [pinError, setPinError] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [registeredData, setRegisteredData] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPhoneError('');
    setPinError('');
    setStatus(null);

    const cleanedPhone = phone.trim();
    if (!cleanedPhone) {
      setPhoneError('حقل رقم الهاتف مطلوب');
      return;
    }

    const phoneRegex = /^05\d{8}$/;
    if (!phoneRegex.test(cleanedPhone)) {
      setPhoneError('يرجى إدخال رقم هاتف صحيح يتكون من 10 أرقام ويبدأ بـ 05');
      return;
    }

    const cleanedPin = pin.trim();
    if (!cleanedPin || cleanedPin.length !== 6 || !/^\d{6}$/.test(cleanedPin)) {
      setPinError('الرقم السري (PIN) يجب أن يتكون من 6 أرقام فقط');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/public/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: cleanedPhone,
          pin: cleanedPin
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'فشل التسجيل');
      }

      setRegisteredData({
        name: data.name,
        phone: data.phone,
        member_id: data.member_id
      });
      setStatus({ type: 'success', message: data.message || 'تم تسجيل الحساب وتفعيله بنجاح!' });
      setName('');
      setPhone('');
      setPin('');
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'حدث خطأ أثناء التسجيل' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', padding: '20px', minHeight: '100vh', background: 'radial-gradient(circle at center, #1F2833 0%, #0B0C10 100%)' }}>
      <div className="card" style={{ maxWidth: '430px', width: '100%', padding: '32px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <B2Logo size="xl" style={{ marginBottom: '10px' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', fontWeight: '600', margin: 0 }}>بوابة تسجيل المشتركين الجدد</p>
        </div>

        {status && (
          <div className={`alert ${status.type === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '20px' }}>
            {status.message}
          </div>
        )}

        {!registeredData ? (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">الاسم بالكامل</label>
              <input
                type="text"
                className="form-input"
                placeholder="أدخل اسمك بالكامل"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: '18px' }}>
              <label className="form-label">رقم الهاتف الجوال</label>
              <input
                type="tel"
                className="form-input"
                placeholder="05XXXXXXXX"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (phoneError) setPhoneError('');
                }}
                disabled={loading}
                required
                style={{ borderColor: phoneError ? '#EF4444' : '' }}
              />
              {phoneError && (
                <div style={{ color: '#EF4444', fontSize: '13px', marginTop: '6px', fontWeight: '500' }}>
                  {phoneError}
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: '28px' }}>
              <label className="form-label">الرقم السري (6 أرقام PIN)</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  pattern="[0-9]*"
                  className="form-input"
                  placeholder="أدخل 6 أرقام كرمز سري للدخول"
                  value={pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setPin(val);
                    if (pinError) setPinError('');
                  }}
                  disabled={loading}
                  required
                  style={{ borderColor: pinError ? '#EF4444' : '', paddingLeft: '42px', letterSpacing: '4px', fontSize: '16px', fontWeight: '700' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 0
                  }}
                >
                  {showPin ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {pinError && (
                <div style={{ color: '#EF4444', fontSize: '13px', marginTop: '6px', fontWeight: '500' }}>
                  {pinError}
                </div>
              )}
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '16px' }} disabled={loading}>
              {loading ? 'جاري إنشاء الحساب...' : 'إنشاء الحساب'}
            </button>
          </form>
        ) : (
          <div className="success-box" style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ display: 'inline-flex', padding: '16px', background: 'rgba(16, 185, 129, 0.1)', border: '1.5px solid #10B981', borderRadius: '50%', marginBottom: '16px' }}>
              <CheckCircle2 size={40} color="#10B981" />
            </div>
            <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: '800', marginBottom: '12px' }}>
              تم تسجيل وحسابك مفعّل الآن!
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
              يمكنك الآن تسجيل الدخول مباشرة برقم الهاتف والرمز السري (PIN) الذي قمت بإنشائه.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '15px', fontWeight: '700' }}
              onClick={() => { window.location.href = '/'; }}
            >
              تسجيل الدخول الآن 🔑
            </button>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--glass-border)' }}>
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              window.location.href = '/';
            }}
            className="text-accent-neon hover:text-accent-cyan text-sm font-semibold transition-colors duration-200"
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
            لديك حساب بالفعل؟ تسجيل الدخول
          </a>
        </div>
      </div>
    </div>
  );
}
