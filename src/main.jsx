import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Mantener el flujo de autenticación compatible con cookies httpOnly del backend.
// Evitamos inyectar Authorization Bearer globalmente porque el backend ya maneja
// la sesión a través de cookies y CSRF.
const originalFetch = window.fetch.bind(window)
window.fetch = async (input, init = {}) => {
  try {
    const url = typeof input === 'string' ? input : input?.url || ''
    const isApiCall = typeof url === 'string' && (
      url.startsWith('/api') ||
      url.includes('/api/') ||
      url.includes('trycloudflare.com/api/')
    )

    if (isApiCall && init?.headers) {
      const initCopy = { ...init }
      initCopy.headers = new Headers(initCopy.headers)
      if (!initCopy.headers.has('X-Requested-With')) {
        initCopy.headers.set('X-Requested-With', 'XMLHttpRequest')
      }
      return originalFetch(input, initCopy)
    }
  } catch (error) {
    console.warn('Error al preparar la petición de autenticación:', error)
  }

  return originalFetch(input, init)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
