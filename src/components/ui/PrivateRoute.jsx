import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * PrivateRoute – protege rutas que requieren autenticación.
 *
 * Props:
 *   children   – el componente/página a renderizar si el usuario está autorizado
 *   roles      – array opcional de roles permitidos, ej. ['repostero']
 *                Si se omite, cualquier usuario autenticado puede acceder.
 *
 * Comportamiento:
 *   - Si la sesión está cargando → muestra pantalla de espera (no redirige prematuramente)
 *   - Si no hay sesión → redirige a /login guardando la ruta intentada en state
 *   - Si hay sesión pero el rol no está permitido → redirige a / con aviso
 */
const PrivateRoute = ({ children, roles = [] }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Esperar a que AuthContext verifique la sesión con el servidor
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg, #0a0a0a)',
          color: 'var(--color-text-muted, #ccc)',
          gap: '1rem',
          fontFamily: 'var(--font-serif, serif)',
        }}
        aria-live="polite"
        aria-label="Verificando sesión"
      >
        <span style={{ fontSize: '2rem', animation: 'pulse 1.5s infinite' }}>✦</span>
        <p style={{ letterSpacing: '0.1em', fontSize: '0.95rem' }}>Verificando sesión…</p>
      </div>
    );
  }

  // No autenticado → redirigir a /login, guardando la ruta destino
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Rol no autorizado → redirigir a la raíz
  if (roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default PrivateRoute;
