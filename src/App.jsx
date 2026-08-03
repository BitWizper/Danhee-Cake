import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ChatBot from "./components/chatbot/ChatBot";

// Layout
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';

// Páginas
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ExplorePage from './pages/ExplorePage';
import BakerProfilePage from './pages/BakerProfilePage';
import CakeDesignerPage from './pages/CakeDesignerPage';
import AppointmentPage from './pages/AppointmentPage';
import BakerDashboardPage from './pages/BakerDashboardPage';
import UI_editproduct from './pages/editProduct/UI_editproduct';
import UIWedding from './pages/wedding/UI_wedding';
import UIAnniversary from './pages/Anniversary/UI_Anniversary';
import UICorporate from './pages/Corporate/UI_Corporate';
import UIBabyShower from './pages/BabyShower/UI_BabyShower';
import UIBirthday from './pages/Birthday/UI_Cumple';
import UIGraduation from './pages/Graduation/UI_Graduation';
import UIXV from './pages/XV/UI_xv';
import CakeDetailPage from './pages/CakeDetailPage';
import UICart from './pages/cart/UI_cart';
import UICheckout from './pages/checkout/UI_checkout_process';
import MyAppointmentsPage from './pages/MyAppointmentsPage';

import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import CursorGlow from './components/ui/CursorGlow';
import PrivateRoute from './components/ui/PrivateRoute';

// Estilos globales
import './index.css';
import './App.css';

/**
 * Banner para mostrar mensajes de sesión terminada
 * (cuenta desactivada, eliminada, etc.)
 */
const SessionBanner = () => {
  const { sessionMessage } = useAuth();
  if (!sessionMessage) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        top: 'var(--navbar-height, 72px)',
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'rgba(220, 38, 38, 0.92)',
        backdropFilter: 'blur(8px)',
        color: '#fff',
        textAlign: 'center',
        padding: '0.75rem 1.5rem',
        fontSize: '0.9rem',
        fontFamily: 'var(--font-sans, sans-serif)',
        letterSpacing: '0.03em',
      }}
    >
      {sessionMessage}
    </div>
  );
};

const ChatBotWrapper = () => {
  const { user } = useAuth();
  if (!user || user.role !== 'cliente') return null;
  return <ChatBot />;
};

const App = () => {
  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
          <CursorGlow />
          {/* Navbar fijo en todas las páginas */}
          <Navbar />
          {/* Banner de mensajes de sesión */}
          <SessionBanner />

          {/* Rutas principales */}
          <Routes>
            {/* RQF04 – Home con pasteles destacados y hero */}
            <Route path="/" element={<HomePage />} />

            {/* RQF03 – Autenticación */}
            <Route path="/login" element={<LoginPage />} />

            {/* RQF01 / RQF02 – Registro cliente y repostero */}
            <Route path="/registro" element={<RegisterPage />} />

            {/* RQF04.1 – Explorar / Buscar reposteros (público) */}
            <Route path="/explorar" element={<ExplorePage />} />

            {/* RQF05 / RQF06 – Perfil del repostero, portafolio y reseñas (público) */}
            <Route path="/repostero/:id" element={<BakerProfilePage />} />

            {/* RQF04.3 – Diseñador de pastel personalizado (público) */}
            <Route path="/diseñador" element={<CakeDesignerPage />} />

            {/* Rutas de Categorías de Pasteles (públicas) */}
            <Route path="/wedding" element={<UIWedding />} />
            <Route path="/anniversary" element={<UIAnniversary />} />
            <Route path="/corporate" element={<UICorporate />} />
            <Route path="/graduation" element={<UIGraduation />} />
            <Route path="/xv" element={<UIXV />} />
            <Route path="/birthday" element={<UIBirthday />} />
            <Route path="/babyshower" element={<UIBabyShower />} />

            {/* Detalle del pastel individual (público) */}
            <Route path="/pastel/:id" element={<CakeDetailPage />} />

            {/* ── Rutas protegidas: requieren cuenta registrada (cliente o repostero) ── */}

            {/* Carrito y checkout */}
            <Route path="/carrito" element={
              <PrivateRoute>
                <UICart />
              </PrivateRoute>
            } />
            <Route path="/checkout" element={
              <PrivateRoute>
                <UICheckout />
              </PrivateRoute>
            } />

            {/* RQF04.2 – Agendar cita con repostero */}
            <Route path="/agenda/:id" element={
              <PrivateRoute>
                <AppointmentPage />
              </PrivateRoute>
            } />
            <Route path="/agenda" element={
              <PrivateRoute>
                <AppointmentPage />
              </PrivateRoute>
            } />

            {/* Mis Citas (solo clientes con cuenta) */}
            <Route path="/mis-citas" element={
              <PrivateRoute>
                <MyAppointmentsPage />
              </PrivateRoute>
            } />

            {/* Dashboard y edición de productos (solo reposteros) */}
            <Route path="/dashboard" element={
              <PrivateRoute roles={['repostero']}>
                <BakerDashboardPage />
              </PrivateRoute>
            } />
            <Route path="/edit-product" element={
              <PrivateRoute roles={['repostero']}>
                <UI_editproduct />
              </PrivateRoute>
            } />

            {/* 404 fallback */}
            <Route path="*" element={
              <div style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
                paddingTop: 'var(--navbar-height)',
                fontFamily: 'var(--font-serif)',
              }}>
                <span style={{ fontSize: '4rem' }}>🎂</span>
                <h1 style={{ fontSize: '2.5rem', fontWeight: 300, color: 'var(--color-cream)' }}>
                  Página no encontrada
                </h1>
                <a href="/" style={{ color: 'var(--color-gold)' }}>← Volver al inicio</a>
              </div>
            } />
          </Routes>

          {/* Footer en todas las páginas */}
          <Footer />
          <ChatBotWrapper />
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  );
};

export default App;