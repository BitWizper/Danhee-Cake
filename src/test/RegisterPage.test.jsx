import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

import RegisterPage from '../pages/RegisterPage.jsx';

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const pathname = String(url).toLowerCase();
      if (pathname.includes('/api/auth/csrf-token')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ csrf_token: 'test-csrf-token' })
        });
      }
      if (pathname.includes('/api/auth/register')) {
        return Promise.resolve({
          ok: true,
          status: 201,
          headers: new Map([['content-type', 'application/json; charset=utf-8']]),
          json: async () => ({ success: true, message: 'Usuario registrado exitosamente.' })
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('submits register successfully', async () => {
    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText(/nombre completo/i), 'Test User');
    await userEvent.type(screen.getByLabelText(/correo electrónico/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'Password123');
    await userEvent.type(screen.getByLabelText(/dirección/i), 'Calle 123');

    userEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/auth/csrf-token'), expect.objectContaining({ method: 'GET', credentials: 'include' }));
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/auth/register'), expect.objectContaining({ method: 'POST', credentials: 'include' }));
      expect(screen.queryByText(/error de conexión/i)).not.toBeInTheDocument();
    });
  });

  it('shows registration error when server returns invalid csrf', async () => {
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
      if (pathname.includes('/api/auth/register')) {
        return Promise.resolve({
          ok: false,
          status: 403,
          headers: new Map([['content-type', 'application/json; charset=utf-8']]),
          json: async () => ({ success: false, message: 'Token CSRF inválido' })
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    }));

    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText(/nombre completo/i), 'Test User');
    await userEvent.type(screen.getByLabelText(/correo electrónico/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'Password123');
    await userEvent.type(screen.getByLabelText(/dirección/i), 'Calle 123');

    userEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(screen.getByText(/token csrf inválido/i)).toBeInTheDocument();
    });
  });
});