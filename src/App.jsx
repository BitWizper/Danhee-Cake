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
import UIWedding from './pages/wedding/UI_wedding';
import UIAnniversary from './pages/Anniversary/UI_Anniversary';
import UICorporate from './pages/Corporate/UI_Corporate';
import UIBabyShower from './pages/BabyShower/UI_BabyShower';
import UIBirthday from './pages/Birthday/UI_Cumple';
import UIGraduation from './pages/Graduation/UI_Graduation';
import UIXV from './pages/XV/UI_xv';
import CakeDetailPage from './pages/CakeDetailPage';
import UICart from './pages/cart/UI_cart';

import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import CursorGlow from './components/ui/CursorGlow';

// Estilos globales
import './index.css';
import './App.css';

const App = () => {
  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
          <CursorGlow />
          {/* Navbar fijo en todas las páginas */}
          <Navbar />

          {/* Rutas principales */}
          <Routes>
            {/* RQF04 – Home con pasteles destacados y hero */}
            <Route path="/" element={<HomePage />} />

            {/* RQF03 – Autenticación */}
            <Route path="/login" element={<LoginPage />} />

            {/* RQF01 / RQF02 – Registro cliente y repostero */}
            <Route path="/registro" element={<RegisterPage />} />

            {/* RQF04.1 – Explorar / Buscar reposteros */}
            <Route path="/explorar" element={<ExplorePage />} />

            {/* RQF05 / RQF06 – Perfil del repostero, portafolio y reseñas */}
            <Route path="/repostero/:id" element={<BakerProfilePage />} />

            {/* RQF04.3 – Diseñador de pastel personalizado */}
            <Route path="/diseñador" element={<CakeDesignerPage />} />

            {/* Rutas de Categorías de Pasteles */}
            <Route path="/wedding" element={<UIWedding />} />
            <Route path="/anniversary" element={<UIAnniversary />} />
            <Route path="/corporate" element={<UICorporate />} />
            <Route path="/graduation" element={<UIGraduation />} />
            <Route path="/xv" element={<UIXV />} />
            <Route path="/birthday" element={<UIBirthday />} />      {/* ✅ Corregido: UIBirthday */}
            <Route path="/babyshower" element={<UIBabyShower />} />  {/* ✅ Correcto */}

            {/* Carrito de Compras */}
            <Route path="/carrito" element={<UICart />} />

            {/* Detalle del pastel individual */}
            <Route path="/pastel/:id" element={<CakeDetailPage />} />

            {/* RQF04.2 – Agendar cita con repostero */}
            <Route path="/agenda/:id" element={<AppointmentPage />} />
            <Route path="/agenda" element={<AppointmentPage />} />

            {/* Dashboard de repostero */}
            <Route path="/dashboard" element={<BakerDashboardPage />} />

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
        <ChatBot />
      </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  );
};

export default App;