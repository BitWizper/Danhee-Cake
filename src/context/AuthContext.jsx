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
          // Actualizar estado con datos frescos de la BD
          setUser(data.user);
          setToken('cookie-based');
          localStorage.setItem('user', JSON.stringify(data.user));
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.log('[AuthContext] ❌ Sesión inválida (status:', response.status, ')', errorData);

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
        // Error de red — mantener el estado local para no bloquear al usuario offline
        setLoading(false);
        return;
      } finally {
        setLoading(false);
        console.log('[AuthContext] ========== FIN CHECK SESSION ==========');
      }
    };

    checkSession();
  }, [clearSession]);

  const login = (userData, userToken) => {
    console.log('[AuthContext] login() llamado con usuario:', userData?.email, 'Rol:', userData?.role);
    const normalizedToken = userToken || 'cookie-based';
    setUser(userData);
    setToken(normalizedToken);
    setSessionMessage(null);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', normalizedToken);
    localStorage.setItem('auth_mode', normalizedToken);
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
      clearSession();
      console.log('[AuthContext] ✅ Logout completado');
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

