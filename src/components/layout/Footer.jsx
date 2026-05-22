import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="footer" id="footer">
      <div className="container">
        <div className="footer__grid">
          {/* Brand */}
          <div className="footer__brand">
            <div className="footer__logo">
              <span className="footer__logo-icon">✦</span>
              <span className="footer__logo-text">Danhee</span>
            </div>
            <p className="footer__tagline">
              Pasteles únicos, momentos inolvidables.<br />Arte repostero de élite a tu medida.
            </p>
          </div>

          {/* Links plataforma */}
          <div className="footer__col">
            <h4 className="footer__heading">Plataforma</h4>
            <ul className="footer__list">
              <li><Link to="/explorar">Explorar reposteros</Link></li>
              <li><Link to="/diseñador">Diseña tu pastel</Link></li>
              <li><Link to="/registro">Registrarse</Link></li>
              <li><Link to="/login">Iniciar sesión</Link></li>
            </ul>
          </div>

          {/* Links reposteros */}
          <div className="footer__col">
            <h4 className="footer__heading">Para Reposteros</h4>
            <ul className="footer__list">
              <li><Link to="/registro?tipo=repostero">Crea tu perfil</Link></li>
              <li><Link to="/explorar">Portafolio</Link></li>
              <li><Link to="/">Agenda citas</Link></li>
            </ul>
          </div>

          {/* Contacto */}
          <div className="footer__col">
            <h4 className="footer__heading">Contacto</h4>
            <ul className="footer__list footer__list--contact">
              <li>✉ hola@danhee.com</li>
              <li>📍 México</li>
            </ul>
          </div>
        </div>

        <div className="footer__bottom">
          <span className="gold-divider" style={{ marginInline: 0, width: '100%' }} />
          <p className="footer__copy">
            © {year} Danhee – Pastelería Personalizada. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
