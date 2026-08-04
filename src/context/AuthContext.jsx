import { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { getApiUrl } from '../config/api';
import { addCsrfToHeaders, getCsrfToken } from '../utils/csrfHelper';

const AuthContext = createContext();

const STORAGE_KEYS = ['user', 'token', 'auth_mode', 'conversation_id'];

const getStoredUser = () => {
  try {
    const rawUser = localStorage.getItem('user');
    return rawUser ? JSON.parse(rawUser) : null;
  } catch (error) {
    console.warn('[AuthContext] No se pudo leer el usuario guardado:', error);
    return null;
  }
};

const clearLocalStorage = () => {
  STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
};

export const AuthProvider = ({ children }) => {
  const initialUser = getStoredUser();
  const [user, setUser] = useState(initialUser);
  const [token, setToken] = useState(initialUser ? 'cookie-based' : null);
  const [loading, setLoading] = useState(true);
  // Mensaje de sesión terminada (cuenta inactiva, eliminada, etc.)
  const [sessionMessage, setSessionMessage] = useState(null);

  // Limpiar estado de sesión (reutilizable desde logout y checkSession)
  const clearSession = useCallback((message = null) => {
    setUser(null);
    setToken(null);
    clearLocalStorage();
    if (message) setSessionMessage(message);
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        await getCsrfToken();
      } catch (err) {
        console.warn('[AuthContext] ⚠️ No se pudo obtener CSRF token durante init:', err.message);
      }
      try {
        const apiUrl = getApiUrl('/api/auth/me');
        const response = await fetch(apiUrl, {
          method: 'GET',
          credentials: 'include',
        });

        const responseText = await response.text();

        if (response.ok) {
          const data = JSON.parse(responseText);
          // Actualizar estado con datos frescos de la BD
          setUser(data.user);
          setToken('cookie-based');
          localStorage.setItem('user', JSON.stringify(data.user));
        } else {
          let errorData = {};
          try {
            errorData = JSON.parse(responseText);
          } catch (e) {
            console.warn('[AuthContext] No se pudo parsear response como JSON');
          }

          // 403 = cuenta desactivada; 401 = sin sesión / cuenta eliminada
          if (response.status === 403 && errorData.error === 'USER_INACTIVE') {
            clearSession('Tu cuenta está desactivada. Contacta al administrador.');
          } else if (response.status === 401 && errorData.error === 'USER_NOT_FOUND') {
            clearSession('Tu cuenta ya no existe. Regístrate de nuevo.');
          } else {
            // Sesión expirada o no autenticado — limpiar silenciosamente
            clearSession();
          }
        }
      } catch (error) {
        console.error('[AuthContext] ❌ ERROR verificando sesión:', error.name, error.message);
        console.error('[AuthContext] Error stack:', error.stack);
        // Error de red — mantener el estado local para no bloquear al usuario offline
        setLoading(false);
        return;
      } finally {
        setLoading(false);
      }
    };

    checkSession();
    
    // Escuchar evento de sesión expirada desde el chatbot
    const handleSessionExpired = (event) => {
      clearSession('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
    };
    
    window.addEventListener('session-expired', handleSessionExpired);
    
    return () => {
      window.removeEventListener('session-expired', handleSessionExpired);
    };
  }, [clearSession]);

  const login = (userData, userToken) => {
    const normalizedToken = userToken || 'cookie-based';
    setUser(userData);
    setToken(normalizedToken);
    setSessionMessage(null);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', normalizedToken);
    localStorage.setItem('auth_mode', normalizedToken);
  };

  const logout = async () => {
    try {
      const headers = await addCsrfToHeaders({ 'Content-Type': 'application/json' });
      const response = await fetch(getApiUrl('/api/auth/logout'), {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ refresh_token: 'from_cookie' }),
      });
      if (!response.ok) {
        await response.json().catch(() => ({}));
      }
    } catch (error) {
      console.error('[AuthContext] ❌ Error en logout:', error);
    } finally {
      clearSession();
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      login,
      logout,
      clearSession,
      sessionMessage,
      isAuthenticated: !!user
    }}>
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

