import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import './LoginPage.css';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError('Por favor completa todos los campos.');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });

      const result = await response.json();

      if (response.ok && result.success) {
        login(result.user, result.token);
        
        // Redirección basada en rol
        if (result.user.role === 'repostero') {
          navigate('/dashboard');
        } else {
          navigate('/');
        }
      } else {
        // Manejo de errores de validación del servidor (400, 401, 409, etc)
        setError(result.message || 'Credenciales incorrectas. Por favor intenta de nuevo.');
      }
    } catch (err) {
      // Error de red (TypeError: Failed to fetch)
      console.error('Login error:', err);
      setError('Error de conexión: No se pudo establecer contacto con el servidor. Verifica que el backend esté corriendo.');
    } finally {
      setLoading(false);
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

        <form className="auth-form" onSubmit={handleSubmit} noValidate id="login-form">
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
            />
          </div>

          {error && <p className="auth-form__error">{error}</p>}

          <Button type="submit" fullWidth id="login-submit" disabled={loading}>
            {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
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
