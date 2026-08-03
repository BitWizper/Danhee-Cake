import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const loginMock = vi.fn();

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    login: loginMock,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({ children }) => children,
  };
});

vi.mock('../hooks/useAuthRateLimit', () => ({
  useAuthRateLimit: () => ({
    blocked: false,
    countdown: null,
    remaining: 5,
    total: 5,
    checkBeforeSubmit: () => ({ allowed: true }),
    recordAttempt: vi.fn(),
    handleServer429: () => 'Too many requests',
  }),
}));

import LoginPage from '../pages/LoginPage.jsx';

describe('LoginPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const pathname = String(url).toLowerCase();
      if (pathname.includes('/api/auth/csrf-token')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ csrf_token: 'test-csrf-token' })
        });
      }
      if (pathname.includes('/api/auth/login')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json; charset=utf-8']]),
          json: async () => ({ success: true, user: { name: 'Test User', role: 'cliente', email: 'test@example.com' }, token: 'cookie-based' })
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('submits login successfully and calls login callback', async () => {
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/correo electrónico/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'Password123');

    userEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com', role: 'cliente' }),
        'cookie-based'
      );
    });

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/auth/csrf-token'), expect.objectContaining({ method: 'GET', credentials: 'include' }));
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/auth/login'), expect.objectContaining({ method: 'POST', credentials: 'include' }));
  });

  it('shows error when CSRF token is invalid', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const pathname = String(url).toLowerCase();
      if (pathname.includes('/api/auth/csrf-token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json; charset=utf-8']]),
          json: async () => ({ csrf_token: 'test-csrf-token' })
        });
      }
      if (pathname.includes('/api/auth/login')) {
        return Promise.resolve({
          ok: false,
          status: 403,
          headers: new Map([['content-type', 'application/json; charset=utf-8']]),
          json: async () => ({ success: false, message: 'Token CSRF inválido' })
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    }));

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/correo electrónico/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'Password123');

    userEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByText(/token csrf inválido/i)).toBeInTheDocument();
    });
  });
});