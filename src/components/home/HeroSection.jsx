import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import './HeroSection.css';

/* Partículas de pastel flotantes (SVG inline) */
const CakeParticle = ({ style, emoji }) => (
  <span className="hero__particle" style={style}>{emoji}</span>
);

const particles = [
  { emoji: '🎂', style: { top: '15%', left: '8%',  animationDelay: '0s',   animationDuration: '7s',  fontSize: '2.2rem', opacity: 0.18 } },
  { emoji: '🍰', style: { top: '30%', right: '10%', animationDelay: '1.5s', animationDuration: '9s',  fontSize: '1.6rem', opacity: 0.14 } },
  { emoji: '✨', style: { top: '60%', left: '5%',   animationDelay: '3s',   animationDuration: '6s',  fontSize: '1.2rem', opacity: 0.2  } },
  { emoji: '🌸', style: { top: '75%', right: '7%',  animationDelay: '0.8s', animationDuration: '8s',  fontSize: '1.4rem', opacity: 0.15 } },
  { emoji: '🎂', style: { top: '50%', left: '88%',  animationDelay: '2s',   animationDuration: '10s', fontSize: '1rem',   opacity: 0.12 } },
  { emoji: '💫', style: { top: '20%', left: '75%',  animationDelay: '4s',   animationDuration: '7.5s',fontSize: '1.3rem', opacity: 0.18 } },
];

const HeroSection = () => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = 0.75;
    }
  }, []);

  return (
    <section className="hero" id="hero">
      {/* Video de fondo */}
      <div className="hero__video-wrap">
        <video
          ref={videoRef}
          className="hero__video"
          src="/festive-cake.mp4"
          autoPlay
          muted
          loop
          playsInline
          poster="/hero-poster.jpg"
        />
        {/* Overlay degradado */}
        <div className="hero__overlay" />
      </div>

      {/* Partículas flotantes */}
      {particles.map((p, i) => (
        <CakeParticle key={i} {...p} />
      ))}

      {/* Contenido principal */}
      <div className="hero__content container">
        {/* Badge superior */}
        <div className="hero__badge animate-fadeUp" style={{ animationDelay: '0.2s' }}>
          <span className="hero__badge-dot" />
          Pastelería personalizada de élite
        </div>

        {/* Título principal */}
        <h1 className="hero__title animate-fadeUp" style={{ animationDelay: '0.4s' }}>
          Cada pastel,<br />
          <span className="gradient-text">una obra de arte</span>
        </h1>

        {/* Subtítulo */}
        <p className="hero__subtitle animate-fadeUp" style={{ animationDelay: '0.6s' }}>
          Conectamos tus sueños con los mejores reposteros.<br />
          Diseña, personaliza y vive la experiencia más dulce.
        </p>

        {/* Línea decorativa */}
        <div className="hero__divider animate-fadeIn" style={{ animationDelay: '0.8s' }}>
          <span className="hero__divider-line" />
          <span className="hero__divider-icon">✦</span>
          <span className="hero__divider-line" />
        </div>

        {/* CTAs */}
        <div className="hero__ctas animate-fadeUp" style={{ animationDelay: '0.9s' }}>
          <Link to="/diseñador" className="hero__cta hero__cta--primary" id="hero-cta-designer">
            Diseña tu Pastel
          </Link>
          <Link to="/explorar" className="hero__cta hero__cta--secondary" id="hero-cta-explore">
            Explorar Reposteros
          </Link>
        </div>

        {/* Stats */}
        <div className="hero__stats animate-fadeUp" style={{ animationDelay: '1.1s' }}>
          {[
            { value: '500+', label: 'Reposteros' },
            { value: '12K+', label: 'Pasteles creados' },
            { value: '4.9★', label: 'Calificación' },
          ].map(stat => (
            <div key={stat.label} className="hero__stat">
              <span className="hero__stat-value">{stat.value}</span>
              <span className="hero__stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Indicador de scroll */}
      <div className="hero__scroll-hint">
        <span className="hero__scroll-line" />
        <span className="hero__scroll-text">Scroll</span>
      </div>
    </section>
  );
};

export default HeroSection;
