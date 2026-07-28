import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Wrapper global para adjuntar Authorization Bearer token en todas las llamadas a /api
const originalFetch = window.fetch.bind(window)
window.fetch = async (input, init = {}) => {
  try {
    const token = localStorage.getItem('token')
    let url = typeof input === 'string' ? input : input.url

    if (token && typeof url === 'string' && url.startsWith('/api')) {
      const initCopy = { ...init }
      initCopy.headers = new Headers(initCopy.headers || {})
      if (!initCopy.headers.has('Authorization')) {
        initCopy.headers.set('Authorization', `Bearer ${token}`)
      }
      return originalFetch(input, initCopy)
    }
  } catch (error) {
    console.warn('Error al aplicar token de autenticación global:', error)
  }

  return originalFetch(input, init)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
