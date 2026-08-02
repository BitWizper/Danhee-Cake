import { createContext, useState, useEffect, useContext } from 'react';
import { getApiUrl } from '../config/api';
import { addCsrfToHeaders, getCsrfToken } from '../utils/csrfHelper';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verificar sesión llamando al endpoint de usuario actual
    const checkSession = async () => {
      // Preload CSRF token to ensure cookie and header are available for subsequent mutating requests
      try {
        await getCsrfToken();
      } catch (err) {
        console.warn('No se pudo obtener CSRF token durante init:', err);
      }
      try {
        const response = await fetch(getApiUrl('/api/auth/me'), {
          method: 'GET',
          credentials: 'include', // Importante para enviar cookies httpOnly
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          setToken('cookie-based'); // Indicar que usamos cookies
        } else {
          setUser(null);
          setToken(null);
        }
      } catch (error) {
        console.error('Error verificando sesión:', error);
        setUser(null);
        setToken(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const login = async (userData, userToken) => {
    // Guardar datos del usuario en localStorage (solo datos no sensibles)
    setUser(userData);
    setToken(userToken || 'cookie-based');
    localStorage.setItem('user', JSON.stringify(userData));
    // NO guardar el token en localStorage - ahora está en cookie httpOnly
  };

  const logout = async () => {
    try {
      // Llamar al endpoint de logout para limpiar cookies en el servidor
      const headers = await addCsrfToHeaders({ 'Content-Type': 'application/json' });
      await fetch(getApiUrl('/api/auth/logout'), {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ refresh_token: 'from_cookie' }),
      });
    } catch (error) {
      console.error('Error en logout:', error);
    } finally {
      setUser(null);
      setToken(null);
      localStorage.removeItem('user');
      localStorage.removeItem('conversation_id');
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
};
