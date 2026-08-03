import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthProvider, useAuth } from '../context/AuthContext';

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (String(url).includes('/api/auth/csrf-token')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ csrf_token: 'test-csrf-token' })
        });
      }

      if (String(url).includes('/api/auth/me')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ user: { name: 'Test User', id: 1, role: 'cliente' } })
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({})
      });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should provide initial auth state', () => {
    const TestComponent = () => {
      const { user, token, isAuthenticated } = useAuth();
      return (
        <div>
          <div data-testid="user">{user ? user.name : 'no user'}</div>
          <div data-testid="token">{token ? 'has token' : 'no token'}</div>
          <div data-testid="authenticated">{isAuthenticated ? 'authenticated' : 'not authenticated'}</div>
        </div>
      );
    };

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('user')).toHaveTextContent('no user');
    expect(screen.getByTestId('token')).toHaveTextContent('no token');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('not authenticated');
  });

  it('should login user and set token', () => {
    const TestComponent = () => {
      const { user, token, isAuthenticated, login } = useAuth();
      return (
        <div>
          <div data-testid="user">{user ? user.name : 'no user'}</div>
          <div data-testid="token">{token ? 'has token' : 'no token'}</div>
          <div data-testid="authenticated">{isAuthenticated ? 'authenticated' : 'not authenticated'}</div>
          <button onClick={() => login({ name: 'Test User', id: 1 }, 'test-token')}>Login</button>
        </div>
      );
    };

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    const loginButton = screen.getByText('Login');
    fireEvent.click(loginButton);

    return waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('Test User');
      expect(screen.getByTestId('token')).toHaveTextContent('has token');
      expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
    });
  });

  it('should persist cookie-based session state for login', () => {
    const TestComponent = () => {
      const { login } = useAuth();
      return (
        <button onClick={() => login({ name: 'Test User', id: 1 }, 'cookie-based')}>Login</button>
      );
    };

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    const loginButton = screen.getByText('Login');
    fireEvent.click(loginButton);

    return waitFor(() => {
      expect(localStorage.getItem('token')).toBe('cookie-based');
      expect(localStorage.getItem('auth_mode')).toBe('cookie-based');
    });
  });

  it('should logout user and clear token', () => {
    const TestComponent = () => {
      const { user, token, isAuthenticated, login, logout } = useAuth();
      return (
        <div>
          <div data-testid="user">{user ? user.name : 'no user'}</div>
          <div data-testid="token">{token ? 'has token' : 'no token'}</div>
          <div data-testid="authenticated">{isAuthenticated ? 'authenticated' : 'not authenticated'}</div>
          <button onClick={() => login({ name: 'Test User', id: 1 }, 'test-token')}>Login</button>
          <button onClick={logout}>Logout</button>
        </div>
      );
    };

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    const loginButton = screen.getByText('Login');
    fireEvent.click(loginButton);

    return waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
    }).then(() => {
      const logoutButton = screen.getByText('Logout');
      fireEvent.click(logoutButton);

      return waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('no user');
        expect(screen.getByTestId('token')).toHaveTextContent('no token');
        expect(screen.getByTestId('authenticated')).toHaveTextContent('not authenticated');
      });
    });
  });

  it('should load user from localStorage on mount', () => {
    const userData = { name: 'Test User', id: 1 };
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', 'test-token');

    const TestComponent = () => {
      const { user, token, isAuthenticated } = useAuth();
      return (
        <div>
          <div data-testid="user">{user ? user.name : 'no user'}</div>
          <div data-testid="token">{token ? 'has token' : 'no token'}</div>
          <div data-testid="authenticated">{isAuthenticated ? 'authenticated' : 'not authenticated'}</div>
        </div>
      );
    };

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('user')).toHaveTextContent('Test User');
    expect(screen.getByTestId('token')).toHaveTextContent('has token');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
  });
});
