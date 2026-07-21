import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AppointmentPage.css';

const TIME_SLOTS = [
  { value: '10:00:00', label: '10:00 AM', icon: '🌅' },
  { value: '11:00:00', label: '11:00 AM', icon: '☀️' },
  { value: '12:00:00', label: '12:00 PM', icon: '🌤️' },
  { value: '16:00:00', label: '04:00 PM', icon: '🌇' },
  { value: '17:00:00', label: '05:00 PM', icon: '🌆' },
];

const STEPS = ['Fecha', 'Horario', 'Detalles', 'Confirmar'];

const AppointmentPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, token, isAuthenticated, loading: authLoading } = useAuth();

  const [baker, setBaker] = useState(null);
  const [form, setForm] = useState({ date: '', time_slot: '', notes: '' });
  const [step, setStep] = useState(0); // 0=fecha, 1=horario, 2=notas, 3=confirm
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [takenSlots, setTakenSlots] = useState([]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { navigate('/login'); return; }

    const fetchBaker = async () => {
      try {
        const response = await fetch(`/api/bakers/${id}`);
        const result = await response.json();
        if (result.success) setBaker(result.data);
      } catch (err) {
        console.error('Error fetching baker:', err);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchBaker();
    else setLoading(false);
  }, [id, isAuthenticated, authLoading, navigate]);

  // Obtener horarios ocupados al elegir fecha
  useEffect(() => {
    if (!form.date || !id) return;
    const fetchAvailability = async () => {
      try {
        const res = await fetch(`/api/appointments/baker/${id}/date/${form.date}`);
        const data = await res.json();
        if (data.success) setTakenSlots(data.horarios_ocupados || []);
      } catch { setTakenSlots([]); }
    };
    fetchAvailability();
  }, [form.date, id]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ baker_id: id, ...form })
      });
      const result = await response.json();
      if (result.success) {
        setSuccess(true);
      } else {
        alert(result.message || 'Error al agendar cita.');
      }
    } catch {
      alert('Error de conexión.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d + 'T00:00:00');
    return date.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const selectedSlot = TIME_SLOTS.find(s => s.value === form.time_slot);

  if (loading) return (
    <div className="appt-page-loading">
      <div className="appts-spinner" />
    </div>
  );

  /* ── Pantalla de éxito ── */
  if (success) return (
    <div className="appt-success-screen">
      <div className="appt-success-card glass animate-scaleIn">
        <div className="appt-success-icon">🎂</div>
        <h1 className="font-serif appt-success-title">¡Cita Solicitada!</h1>
        <p className="appt-success-sub">
          Tu solicitud con <strong>{baker?.business_name}</strong> ha sido enviada.<br />
          El repostero se pondrá en contacto contigo pronto.
        </p>
        <div className="appt-success-details glass">
          <div className="appt-success-row">
            <span>📅 Fecha</span>
            <span>{formatDate(form.date)}</span>
          </div>
          <div className="appt-success-row">
            <span>🕐 Horario</span>
            <span>{selectedSlot?.label}</span>
          </div>
        </div>
        <div className="appt-success-actions">
          <button className="appt-btn-gold" onClick={() => navigate('/mis-citas')}>
            Ver mis citas
          </button>
          <button className="appt-btn-outline" onClick={() => navigate('/')}>
            Ir al inicio
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="appt-page">
      {/* Hero lateral izquierdo */}
      <div className="appt-page__side">
        <div className="appt-side__glow" />
        <div className="appt-side__content">
          <span className="appt-side__overline">Consulta Artesanal</span>
          <h2 className="appt-side__title font-serif">
            Diseña tu pastel<br />soñado
          </h2>
          <p className="appt-side__desc">
            Reúnete con tu repostero de confianza y crea algo único para tu ocasión especial.
          </p>

          {baker && (
            <div className="appt-baker-card glass">
              <div className="appt-baker-avatar-lg">🎂</div>
              <div>
                <p className="appt-baker-card__name font-serif">{baker.business_name}</p>
                {baker.specialty && <p className="appt-baker-card__spec">{baker.specialty}</p>}
                {baker.location && <p className="appt-baker-card__loc">📍 {baker.location}</p>}
              </div>
            </div>
          )}

          {/* Resumen seleccionado */}
          {(form.date || form.time_slot) && (
            <div className="appt-summary glass">
              <p className="appt-summary__title">Tu selección</p>
              {form.date && (
                <div className="appt-summary__row">
                  <span>📅</span>
                  <span>{formatDate(form.date)}</span>
                </div>
              )}
              {form.time_slot && (
                <div className="appt-summary__row">
                  <span>{selectedSlot?.icon}</span>
                  <span>{selectedSlot?.label}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Formulario derecho */}
      <div className="appt-page__form-area">
        <div className="appt-form-wrapper">
          {/* Stepper */}
          <div className="appt-stepper">
            {STEPS.map((s, i) => (
              <div
                key={i}
                className={`appt-step ${i === step ? 'appt-step--active' : ''} ${i < step ? 'appt-step--done' : ''}`}
              >
                <div className="appt-step__dot">
                  {i < step ? '✓' : i + 1}
                </div>
                <span className="appt-step__label">{s}</span>
              </div>
            ))}
          </div>

          {/* Paso 0: Fecha */}
          {step === 0 && (
            <div className="appt-step-panel animate-fadeUp">
              <h2 className="appt-step-title font-serif">¿Qué día te viene bien?</h2>
              <p className="appt-step-desc">Selecciona una fecha disponible para tu consulta.</p>
              <input
                type="date"
                className="appt-date-input"
                min={new Date().toISOString().split('T')[0]}
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value, time_slot: '' })}
              />
              <button
                className="appt-btn-gold"
                disabled={!form.date}
                onClick={() => setStep(1)}
              >
                Continuar →
              </button>
            </div>
          )}

          {/* Paso 1: Horario */}
          {step === 1 && (
            <div className="appt-step-panel animate-fadeUp">
              <h2 className="appt-step-title font-serif">Selecciona tu horario</h2>
              <p className="appt-step-desc">Horarios disponibles para el {formatDate(form.date)}.</p>
              <div className="appt-slots-grid">
                {TIME_SLOTS.map(slot => {
                  const taken = takenSlots.includes(slot.value);
                  return (
                    <button
                      key={slot.value}
                      disabled={taken}
                      className={`appt-slot-btn
                        ${form.time_slot === slot.value ? 'appt-slot-btn--active' : ''}
                        ${taken ? 'appt-slot-btn--taken' : ''}
                      `}
                      onClick={() => !taken && setForm({ ...form, time_slot: slot.value })}
                    >
                      <span className="appt-slot-btn__icon">{slot.icon}</span>
                      <span className="appt-slot-btn__label">{slot.label}</span>
                      {taken && <span className="appt-slot-btn__taken">Ocupado</span>}
                    </button>
                  );
                })}
              </div>
              <div className="appt-step-nav">
                <button className="appt-btn-outline" onClick={() => setStep(0)}>← Atrás</button>
                <button className="appt-btn-gold" disabled={!form.time_slot} onClick={() => setStep(2)}>
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {/* Paso 2: Notas */}
          {step === 2 && (
            <div className="appt-step-panel animate-fadeUp">
              <h2 className="appt-step-title font-serif">Cuéntanos más</h2>
              <p className="appt-step-desc">¿Tienes algún detalle especial para el repostero? (opcional)</p>
              <textarea
                className="appt-textarea"
                rows={5}
                placeholder="Ej: Quiero un pastel de tres pisos con flores de fondant para una boda de 80 personas, sin gluten..."
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
              />
              <div className="appt-step-nav">
                <button className="appt-btn-outline" onClick={() => setStep(1)}>← Atrás</button>
                <button className="appt-btn-gold" onClick={() => setStep(3)}>
                  Revisar →
                </button>
              </div>
            </div>
          )}

          {/* Paso 3: Confirmación */}
          {step === 3 && (
            <div className="appt-step-panel animate-fadeUp">
              <h2 className="appt-step-title font-serif">Confirma tu cita</h2>
              <p className="appt-step-desc">Revisa los detalles antes de enviar tu solicitud.</p>

              <div className="appt-confirm-summary glass">
                <div className="appt-confirm-row">
                  <span className="appt-confirm-label">Repostero</span>
                  <span className="appt-confirm-val">{baker?.business_name || '—'}</span>
                </div>
                <div className="appt-confirm-divider" />
                <div className="appt-confirm-row">
                  <span className="appt-confirm-label">Fecha</span>
                  <span className="appt-confirm-val">{formatDate(form.date)}</span>
                </div>
                <div className="appt-confirm-divider" />
                <div className="appt-confirm-row">
                  <span className="appt-confirm-label">Horario</span>
                  <span className="appt-confirm-val">{selectedSlot?.icon} {selectedSlot?.label}</span>
                </div>
                {form.notes && (
                  <>
                    <div className="appt-confirm-divider" />
                    <div className="appt-confirm-row appt-confirm-row--col">
                      <span className="appt-confirm-label">Notas</span>
                      <span className="appt-confirm-val appt-confirm-notes">{form.notes}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="appt-step-nav">
                <button className="appt-btn-outline" onClick={() => setStep(2)}>← Editar</button>
                <button
                  className="appt-btn-gold"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? 'Enviando…' : '✓ Confirmar Cita'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AppointmentPage;
