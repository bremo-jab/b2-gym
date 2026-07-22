import React, { useState } from 'react';
import { Dumbbell } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export default function PublicRegister() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPhoneError('');
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

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/public/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim()
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'فشل التسجيل');
      }

      setStatus({ type: 'success', message: 'تم تسجيل الطلب بنجاح! يرجى مراجعة موظف الاستقبال لتفعيل الاشتراك.' });
      setIsSuccess(true);
      setName('');
      setPhone('');
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
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(173,255,47,0.1)', border: '1.5px solid var(--accent-neon)', borderRadius: '24px', padding: '16px', marginBottom: '16px', boxShadow: '0 0 20px rgba(173,255,47,0.15)' }}>
            <Dumbbell size={48} color="var(--accent-neon)" style={{ filter: 'drop-shadow(0 0 8px var(--accent-neon))' }} />
          </div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', background: 'linear-gradient(90deg, var(--accent-neon), var(--accent-cyan))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '6px' }}>B2 Gym</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>بوابة تسجيل الأعضاء الجدد</p>
        </div>

        {status && (
          <div className={`alert ${status.type === 'success' ? 'alert-success' : 'alert-error'}`}>
            {status.message}
          </div>
        )}

        {!isSuccess ? (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">الاسم بالكامل</label>
              <input
                type="text"
                className="form-input"
                placeholder="مثال: عبد الله بن خالد"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: '28px' }}>
              <label className="form-label">رقم الهاتف الجوال</label>
              <input
                type="tel"
                className="form-input"
                placeholder="مثال: 0512345678"
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

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '16px' }} disabled={loading}>
              {loading ? 'جاري التسجيل...' : 'تسجيل عضوية جديدة'}
            </button>
          </form>
        ) : (
          <div className="success-box" style={{ textAlign: 'center', padding: '16px 0' }}>
            <h2 style={{ color: '#6EE7B7', fontSize: '22px', marginBottom: '16px' }}>✅ تم تسجيل الطلب بنجاح!</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px', lineHeight: '1.6' }}>
              يرجى مراجعة موظف الاستقبال لتفعيل الاشتراك.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
