import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Navbar.css';

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => setMenuOpen(false), [location]);

  const { user, isAuthenticated, logout } = useAuth();

  const navLinks = [
    { to: '/', label: 'Inicio' },
    { to: '/explorar', label: 'Explorar' },
    ...(user?.role !== 'repostero' ? [{ to: '/diseñador', label: 'Diseña tu Pastel' }] : []),
  ];

  return (
    <header id="navbar" className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`}>
      <div className="navbar__inner container">
        {/* Logo */}
        <Link to="/" className="navbar__logo" id="navbar-logo">
          <span className="navbar__logo-icon">✦</span>
          <span className="navbar__logo-text">Danhee</span>
        </Link>

        {/* Nav links */}
        <nav className={`navbar__links ${menuOpen ? 'navbar__links--open' : ''}`} id="navbar-links">
          {navLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={`navbar__link ${location.pathname === link.to ? 'navbar__link--active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Auth buttons */}
        <div className="navbar__actions">
          {isAuthenticated ? (
            <div className="navbar__user-info">
              {user.role === 'repostero' && (
                <Link to="/dashboard" className="navbar__link" style={{ marginRight: 'var(--space-2)' }}>
                  Panel de Control
                </Link>
              )}
              <span className="navbar__user-name">Hola, {user?.name?.split(' ')[0]}</span>
              <button onClick={logout} className="navbar__btn navbar__btn--outline" id="navbar-logout">
                Cerrar sesión
              </button>
            </div>
          ) : (
            <>
              <Link to="/login" className="navbar__btn navbar__btn--outline" id="navbar-login">
                Iniciar sesión
              </Link>
              <Link to="/registro" className="navbar__btn navbar__btn--gold" id="navbar-register">
                Registrarse
              </Link>
            </>
          )}
        </div>

        {/* Hamburger */}
        <button
          id="navbar-hamburger"
          className={`navbar__hamburger ${menuOpen ? 'navbar__hamburger--open' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Abrir menú"
        >
          <span /><span /><span />
        </button>
      </div>
    </header>
  );
};

export default Navbar;
