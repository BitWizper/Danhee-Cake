import './HowItWorks.css';

const steps = [
  {
    number: '01',
    icon: '🔍',
    title: 'Explora reposteros',
    desc: 'Busca por nombre, ubicación o especialidad y descubre perfiles con portafolio real.',
  },
  {
    number: '02',
    icon: '🎨',
    title: 'Diseña tu pastel',
    desc: 'Personaliza cada detalle: bizcocho, relleno, decoraciones y más con preview en tiempo real.',
  },
  {
    number: '03',
    icon: '📅',
    title: 'Agenda tu cita',
    desc: 'Reserva una consulta o degustación directamente con el repostero elegido.',
  },
  {
    number: '04',
    icon: '✨',
    title: 'Recibe tu obra',
    desc: 'El repostero elabora tu pastel único y tú disfrutas de la experiencia más dulce.',
  },
];

const HowItWorks = () => (
  <section className="how section-sm" id="how-it-works">
    <div className="container">
      <div className="how__header">
        <span className="how__label">Proceso simple</span>
        <h2 className="how__title font-serif">
          ¿Cómo <span className="gradient-text">funciona</span>?
        </h2>
        <span className="gold-divider" />
      </div>

      <div className="how__steps">
        {steps.map((step, i) => (
          <div key={step.number} className="how__step" style={{ animationDelay: `${i * 0.12}s` }}>
            <div className="how__step-number">{step.number}</div>
            <div className="how__step-icon">{step.icon}</div>
            <h3 className="how__step-title font-serif">{step.title}</h3>
            <p className="how__step-desc">{step.desc}</p>
            {i < steps.length - 1 && <div className="how__connector" />}
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default HowItWorks;
