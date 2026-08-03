import { createContext, useState, useEffect, useContext } from 'react';
import { getApiUrl } from '../config/api';
import { addCsrfToHeaders, getCsrfToken } from '../utils/csrfHelper';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[AuthContext] ========== INICIANDO CHECK SESSION ==========');
    const checkSession = async () => {
      try {
        console.log('[AuthContext] Obteniendo CSRF token inicial...');
        await getCsrfToken();
        console.log('[AuthContext] CSRF token obtenido ✅');
      } catch (err) {
        console.warn('[AuthContext] ⚠️ No se pudo obtener CSRF token durante init:', err.message);
      }
      try {
        const apiUrl = getApiUrl('/api/auth/me');
        console.log('[AuthContext] Verificando sesión en:', apiUrl);
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          credentials: 'include',
        });

        console.log('[AuthContext] Response status /api/auth/me:', response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('[AuthContext] ✅ Sesión válida. Usuario:', data.user?.email, 'Rol:', data.user?.role);
          setUser(data.user);
          setToken('cookie-based');
        } else {
          console.log('[AuthContext] ❌ Sesión inválida o no autenticada (status:', response.status, ')');
          const errorData = await response.json().catch(() => ({}));
          console.log('[AuthContext] Error response:', errorData);
          setUser(null);
          setToken(null);
        }
      } catch (error) {
        console.error('[AuthContext] ❌ ERROR verificando sesión:', error);
        console.error('[AuthContext] Error details:', {
          name: error.name,
          message: error.message
        });
        setUser(null);
        setToken(null);
      } finally {
        setLoading(false);
        console.log('[AuthContext] ========== FIN CHECK SESSION ==========');
      }
    };

    checkSession();
  }, []);

  const login = async (userData, userToken) => {
    console.log('[AuthContext] login() llamado con usuario:', userData?.email, 'Rol:', userData?.role);
    setUser(userData);
    setToken(userToken || 'cookie-based');
    localStorage.setItem('user', JSON.stringify(userData));
    console.log('[AuthContext] ✅ Usuario guardado en estado y localStorage');
  };

  const logout = async () => {
    console.log('[AuthContext] logout() llamado');
    try {
      console.log('[AuthContext] Llamando a /api/auth/logout...');
      const headers = await addCsrfToHeaders({ 'Content-Type': 'application/json' });
      const response = await fetch(getApiUrl('/api/auth/logout'), {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ refresh_token: 'from_cookie' }),
      });
      console.log('[AuthContext] Logout response status:', response.status);
      if (response.ok) {
        console.log('[AuthContext] ✅ Logout exitoso en servidor');
      } else {
        const data = await response.json().catch(() => ({}));
        console.log('[AuthContext] ⚠️ Logout response no-OK:', data);
      }
    } catch (error) {
      console.error('[AuthContext] ❌ Error en logout:', error);
    } finally {
      console.log('[AuthContext] Limpiando estado local y localStorage...');
      setUser(null);
      setToken(null);
      localStorage.removeItem('user');
      localStorage.removeItem('conversation_id');
      console.log('[AuthContext] ✅ Logout completado');
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
