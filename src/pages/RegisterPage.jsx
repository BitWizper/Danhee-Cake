import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthRateLimit } from '../hooks/useAuthRateLimit';
import { getApiUrl } from '../config/api';
import Button from '../components/ui/Button';
import './LoginPage.css';

const RegisterPage = () => {
  const navigate = useNavigate();
  const { blocked, countdown, remaining, total, checkBeforeSubmit, recordAttempt, handleServer429 } = useAuthRateLimit('register');
  const [userType, setUserType] = useState('cliente');
  const [form, setForm] = useState({ 
    name: '', 
    email: '', 
    password: '', 
    address: '', 
    business_name: '', 
    location: '', 
    specialty: '', 
    bio: '' 
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      setError('Por favor completa los campos obligatorios.');
      return;
    }

    const rlCheck = checkBeforeSubmit();
    if (!rlCheck.allowed) {
      setError(rlCheck.error);
      return;
    }

    recordAttempt();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(getApiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role: userType })
      });

      if (response.status === 429) {
        setError(handleServer429(response));
        return;
      }

      const result = await response.json();

      if (response.ok && result.success) {
        navigate('/login');
      } else {
        setError(result.message || 'Error al crear la cuenta. Revisa los datos ingresados.');
      }
    } catch (err) {
      console.error('Register error:', err);
      setError('Error de conexión: No se pudo contactar con el servidor. Reintenta en unos momentos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page" id="register-page">
      {/* Video de fondo */}
      <div className="auth-page__video-wrap">
        <video
          className="auth-page__video"
          src="/cake-with-candles.mp4"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="auth-page__overlay" />
      </div>

      <div className="auth-page__card glass" style={{ maxWidth: 480 }}>
        <div className="auth-page__brand">
          <span className="auth-page__icon">✦</span>
          <span className="auth-page__brand-name font-serif">Danhee</span>
        </div>
        <h1 className="auth-page__title font-serif">Crear cuenta</h1>

        {/* Selector de tipo */}
        <div className="auth-type-selector">
          <button
            type="button"
            id="register-type-cliente"
            className={`auth-type-btn ${userType === 'cliente' ? 'auth-type-btn--active' : ''}`}
            onClick={() => setUserType('cliente')}
          >
            <span className="auth-type-btn__icon">🛍️</span>
            <span className="auth-type-btn__label">Cliente</span>
          </button>
          <button
            type="button"
            id="register-type-repostero"
            className={`auth-type-btn ${userType === 'repostero' ? 'auth-type-btn--active' : ''}`}
            onClick={() => setUserType('repostero')}
          >
            <span className="auth-type-btn__icon">👨‍🍳</span>
            <span className="auth-type-btn__label">Repostero</span>
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate id="register-form" aria-label="Formulario de registro">
          <div className="auth-form__field">
            <label htmlFor="register-name">{userType === 'repostero' ? 'Tu nombre' : 'Nombre completo'} *</label>
            <input 
              id="register-name" 
              type="text" 
              name="name" 
              placeholder="Tu nombre" 
              value={form.name} 
              onChange={handleChange}
              aria-invalid={!!error}
              aria-describedby={error ? "register-error" : undefined}
              required
            />
          </div>
          <div className="auth-form__field">
            <label htmlFor="register-email">Correo electrónico *</label>
            <input 
              id="register-email" 
              type="email" 
              name="email" 
              placeholder="tu@correo.com" 
              value={form.email} 
              onChange={handleChange}
              aria-invalid={!!error}
              aria-describedby={error ? "register-error" : undefined}
              required
            />
          </div>
          <div className="auth-form__field">
            <label htmlFor="register-password">Contraseña *</label>
            <input 
              id="register-password" 
              type="password" 
              name="password" 
              placeholder="••••••••" 
              value={form.password} 
              onChange={handleChange}
              aria-invalid={!!error}
              aria-describedby={error ? "register-error" : undefined}
              required
            />
          </div>

          {userType === 'cliente' && (
            <div className="auth-form__field">
              <label htmlFor="register-address">Dirección</label>
              <input 
                id="register-address" 
                type="text" 
                name="address" 
                placeholder="Tu dirección" 
                value={form.address} 
                onChange={handleChange}
              />
            </div>
          )}

          {userType === 'repostero' && (
            <>
              <div className="auth-form__field">
                <label htmlFor="register-business">Nombre del negocio</label>
                <input 
                  id="register-business" 
                  type="text" 
                  name="business_name" 
                  placeholder="Ej. Atelier Dulce" 
                  value={form.business_name} 
                  onChange={handleChange}
                />
              </div>
              <div className="auth-form__field">
                <label htmlFor="register-location">Ubicación</label>
                <input 
                  id="register-location" 
                  type="text" 
                  name="location" 
                  placeholder="Ciudad, Estado" 
                  value={form.location} 
                  onChange={handleChange}
                />
              </div>
              <div className="auth-form__field">
                <label htmlFor="register-specialty">Especialidad</label>
                <input 
                  id="register-specialty" 
                  type="text" 
                  name="specialty" 
                  placeholder="Ej. Fondant, Naked Cakes..." 
                  value={form.specialty} 
                  onChange={handleChange}
                />
              </div>
            </>
          )}

          {error && (
            <p 
              id="register-error"
              className={`auth-form__error ${blocked ? 'auth-form__error--blocked' : ''}`}
              role="alert"
              aria-live="polite"
            >
              {error}
              {blocked && countdown && <span className="auth-form__countdown"> ({countdown})</span>}
            </p>
          )}

          {!blocked && remaining < total && (
            <p className="auth-form__rate-hint">
              Intentos restantes: {remaining}/{total}
            </p>
          )}

          <Button type="submit" fullWidth id="register-submit" disabled={loading || blocked}>
            {loading ? 'Creando cuenta...' : blocked ? `Bloqueado (${countdown})` : 'Crear cuenta'}
          </Button>
        </form>

        <p className="auth-page__switch">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" id="register-go-login">Inicia sesión</Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
