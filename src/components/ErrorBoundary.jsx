import React from 'react';
import B2Logo from './B2Logo.jsx';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('🚨 B2 Gym ErrorBoundary caught an exception:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '24px',
          background: 'radial-gradient(circle at center, #1F2833 0%, #0B0C10 100%)',
          color: '#fff',
          textAlign: 'center'
        }}>
          <B2Logo size="xl" style={{ marginBottom: '16px' }} />
          <h2 style={{ fontSize: '22px', fontWeight: '800', marginBottom: '12px', color: 'var(--accent-neon)' }}>
            حدث خطأ غير متوقع في الواجهة
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '460px', marginBottom: '24px', lineHeight: '1.6' }}>
            {this.state.error?.message || 'واجه النظام مشكلة أثناء تحميل الواجهة. يرجى إعادة تحديث الصفحة.'}
          </p>
          <button
            className="btn btn-primary"
            style={{ padding: '12px 28px', fontSize: '15px', fontWeight: '700' }}
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            إعادة تحميل الصفحة ↻
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
