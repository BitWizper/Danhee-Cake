import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAuthRateLimit } from '../hooks/useAuthRateLimit';
import { getApiUrl } from '../config/api';
import Button from '../components/ui/Button';
import './LoginPage.css';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { blocked, countdown, remaining, total, checkBeforeSubmit, recordAttempt, handleServer429 } = useAuthRateLimit('login');
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const getCsrfToken = async () => {
    // Verificar si hay un token cacheado válido
    const cachedToken = localStorage.getItem('csrf_token');
    const cachedTime = localStorage.getItem('csrf_token_time');
    const CACHE_DURATION = 60 * 60 * 1000; // 1 hora

    if (cachedToken && cachedTime) {
      const tokenAge = Date.now() - parseInt(cachedTime);
      if (tokenAge < CACHE_DURATION) {
        // Validación básica: token debe ser string de 64 caracteres hex
        if (typeof cachedToken === 'string' && cachedToken.length === 64 && /^[a-f0-9]{64}$/i.test(cachedToken)) {
          console.log('[CSRF Frontend Login] Using cached token');
          return cachedToken;
        }
      }
    }

    try {
      const response = await fetch(getApiUrl('/api/auth/csrf-token'), {
        method: 'GET',
        credentials: 'include',
      });
      const data = await response.json();
      console.log('[CSRF Frontend Login] Token received:', data.csrf_token ? data.csrf_token.substring(0, 8) + '...' : 'null');
      
      // Cachear el token
      if (data.csrf_token) {
        localStorage.setItem('csrf_token', data.csrf_token);
        localStorage.setItem('csrf_token_time', Date.now().toString());
      }
      
      return data.csrf_token;
    } catch (err) {
      console.error('[CSRF Frontend Login] Error obteniendo CSRF token:', err);
      return null;
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    console.log('[LOGIN_FRONTEND] ========== INICIO LOGIN FRONTEND ==========');
    console.log('[LOGIN_FRONTEND] Form data:', { email: form.email, hasPassword: !!form.password });
    
    if (!form.email || !form.password) {
      console.log('[LOGIN_FRONTEND] ❌ Campos faltantes');
      setError('Por favor completa todos los campos.');
      return;
    }

    const rlCheck = checkBeforeSubmit();
    if (!rlCheck.allowed) {
      console.log('[LOGIN_FRONTEND] ❌ Rate limit local:', rlCheck.error);
      setError(rlCheck.error);
      return;
    }

    recordAttempt();
    setLoading(true);
    setError('');

    try {
      console.log('[LOGIN_FRONTEND] Obteniendo CSRF token...');
      const csrfToken = await getCsrfToken();
      console.log('[LOGIN_FRONTEND] CSRF token obtenido:', csrfToken ? '✓' : '✗');
      
      const headers = { 'Content-Type': 'application/json' };
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }

      const url = getApiUrl('/api/auth/login');
      console.log('[LOGIN_FRONTEND] Haciendo request a:', url);
      console.log('[LOGIN_FRONTEND] Headers:', { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken ? 'present' : 'missing' });

      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(form)
      });

      console.log('[LOGIN_FRONTEND] Response status:', response.status);
      console.log('[LOGIN_FRONTEND] Response headers:', Object.fromEntries(response.headers.entries()));

      if (response.status === 429) {
        console.log('[LOGIN_FRONTEND] ❌ Rate limit del servidor');
        setError(handleServer429(response));
        return;
      }

      const result = await response.json();
      console.log('[LOGIN_FRONTEND] Response body:', result);

      if (response.ok && result.success) {
        console.log('[LOGIN_FRONTEND] ✅ Login exitoso, guardando token...');
        login(result.user, result.token);
        console.log('[LOGIN_FRONTEND] Token guardado en localStorage:', !!result.token);

        if (result.user.role === 'repostero') {
          console.log('[LOGIN_FRONTEND] Redirigiendo a /dashboard');
          navigate('/dashboard');
        } else {
          console.log('[LOGIN_FRONTEND] Redirigiendo a /');
          navigate('/');
        }
      } else {
        console.log('[LOGIN_FRONTEND] ❌ Login fallido:', result.message);
        setError(result.message || 'Credenciales incorrectas. Por favor intenta de nuevo.');
      }
    } catch (err) {
      console.error('[LOGIN_FRONTEND] ❌ ERROR:', err);
      setError('Error de conexión: No se pudo establecer contacto con el servidor. Verifica que el backend esté corriendo.');
    } finally {
      setLoading(false);
      console.log('[LOGIN_FRONTEND] ========== FIN LOGIN FRONTEND ==========');
    }
  };

  return (
    <div className="auth-page" id="login-page">
      {/* Video de fondo */}
      <div className="auth-page__video-wrap">
        <video
          className="auth-page__video"
          src="/chocolate.mp4"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="auth-page__overlay" />
      </div>

      <div className="auth-page__card glass">
        <div className="auth-page__brand">
          <span className="auth-page__icon">✦</span>
          <span className="auth-page__brand-name font-serif">Danhee</span>
        </div>
        <h1 className="auth-page__title font-serif">Bienvenido de vuelta</h1>
        <p className="auth-page__subtitle">Inicia sesión para continuar</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate id="login-form" aria-label="Formulario de inicio de sesión">
          <div className="auth-form__field">
            <label htmlFor="login-email">Correo electrónico</label>
            <input
              id="login-email"
              type="email"
              name="email"
              placeholder="tu@correo.com"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              aria-invalid={!!error}
              aria-describedby={error ? "login-error" : undefined}
              required
            />
          </div>
          <div className="auth-form__field">
            <label htmlFor="login-password">Contraseña</label>
            <input
              id="login-password"
              type="password"
              name="password"
              placeholder="••••••••"
              value={form.password}
              onChange={handleChange}
              autoComplete="current-password"
              aria-invalid={!!error}
              aria-describedby={error ? "login-error" : undefined}
              required
            />
          </div>

          {error && (
            <p 
              id="login-error"
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

          <Button type="submit" fullWidth id="login-submit" disabled={loading || blocked}>
            {loading ? 'Iniciando sesión...' : blocked ? `Bloqueado (${countdown})` : 'Iniciar sesión'}
          </Button>
        </form>

        <p className="auth-page__switch">
          ¿No tienes cuenta?{' '}
          <Link to="/registro" id="login-go-register">Regístrate aquí</Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
