import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AppointmentPage.css';

const STEPS = ['Fecha', 'Horario', 'Detalles', 'Confirmar'];

// Función auxiliar para parsear y generar horarios agrupados según las especificaciones del repostero
const getBakerSlotsForDate = (businessHoursStr, dateStr) => {
  if (!dateStr) return { isClosed: false, groupedSlots: [] };
  const dateObj = new Date(dateStr + 'T00:00:00');
  const dayIndex = dateObj.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado

  let startHour = 9;
  let endHour = 18;
  let isClosed = false;

  const text = (businessHoursStr || '').toLowerCase();

  // Verificar si es Domingo (0) y el horario no menciona Domingo o Todos los días
  if (dayIndex === 0) {
    if (!text.includes('domingo') && !text.includes('dom') && !text.includes('todos los días')) {
      isClosed = true;
    }
  }

  // Verificar si es Sábado (6) y hay especificación para Sábado
  if (dayIndex === 6 && text.includes('sábado')) {
    const sabPart = text.split(/sábado|sáb/i)[1] || '';
    const sabTimes = sabPart.match(/(\d{1,2})(?::\d{2})?\s*-\s*(\d{1,2})/);
    if (sabTimes) {
      startHour = parseInt(sabTimes[1], 10);
      let end = parseInt(sabTimes[2], 10);
      if (end < startHour && end <= 12) end += 12; // Formato 12 horas (ej. 2 -> 14)
      endHour = end;
    }
  } else if (!isClosed) {
    // Buscar rango general de horario (ej. 9:00 - 18:00, 8:00 - 20:00, 10:00 - 19:00)
    const match = text.match(/(\d{1,2})(?::\d{2})?\s*-\s*(\d{1,2})/);
    if (match) {
      startHour = parseInt(match[1], 10);
      let end = parseInt(match[2], 10);
      if (end < startHour && end <= 12) end += 12;
      endHour = end;
    }
  }

  if (isClosed) return { isClosed: true, groupedSlots: [] };

  const groupedSlots = [];
  for (let h = startHour; h < endHour; h++) {
    const hour12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hourLabel = `${String(hour12).padStart(2, '0')}:00 ${ampm}`;
    const icon = h < 12 ? '🌅' : (h === 12 ? '☀️' : (h < 17 ? '🌇' : '🌆'));

    const minuteSlots = [];
    // Intervalos de 10 minutos
    for (let m = 0; m < 60; m += 10) {
      const timeValue = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
      const label = `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
      minuteSlots.push({ value: timeValue, label, icon });
    }

    groupedSlots.push({
      hour: h,
      hourLabel,
      icon,
      minuteSlots
    });
  }

  return { isClosed: false, groupedSlots };
};

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
  
  // Estado para controlar qué grupo de horas está seleccionado (para mostrar sus minutos)
  const [selectedHourGroup, setSelectedHourGroup] = useState(null);

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

  // Al cambiar la fecha, reiniciar hora seleccionada y slots ocupados
  useEffect(() => {
    setSelectedHourGroup(null);
    setForm(f => ({ ...f, time_slot: '' }));
    
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

  const bakerAvailability = getBakerSlotsForDate(baker?.business_hours, form.date);
  const groupedSlots = bakerAvailability.groupedSlots;
  const isClosedDay = bakerAvailability.isClosed;
  
  // Buscar el label e ícono de la hora seleccionada finalmente para mostrar en resumen
  let selectedSlot = null;
  if (form.time_slot) {
    for (const group of groupedSlots) {
      const match = group.minuteSlots.find(s => s.value === form.time_slot);
      if (match) {
        selectedSlot = match;
        break;
      }
    }
  }

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
            <span>{selectedSlot?.label || form.time_slot}</span>
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
                <p className="appt-baker-card__hours" style={{ fontSize: '0.75rem', color: 'var(--color-gold)', marginTop: '0.4rem' }}>
                  🕒 Horario: {baker.business_hours || 'Lunes a Viernes: 9:00 - 18:00 | Sábado: 10:00 - 14:00'}
                </p>
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
                  <span>{selectedSlot?.icon || '🕒'}</span>
                  <span>{selectedSlot?.label || form.time_slot}</span>
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

          {/* Paso 1: Horario Dinámico */}
          {step === 1 && (
            <div className="appt-step-panel animate-fadeUp">
              <h2 className="appt-step-title font-serif">Selecciona tu horario</h2>
              <p className="appt-step-desc" style={{ marginBottom: '1.5rem' }}>
                Horarios de atención de <strong>{baker?.business_name}</strong> para el {formatDate(form.date)}.
              </p>

              {isClosedDay ? (
                <div className="appts-empty glass" style={{ padding: '1.5rem', textAlign: 'center' }}>
                  <span style={{ fontSize: '2rem' }}>🕒</span>
                  <h3 className="font-serif" style={{ color: 'var(--color-gold)', marginTop: '0.5rem' }}>Día no laboral</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                    El repostero no atiende en el día seleccionado según su horario registrado:
                    <br />
                    <strong style={{ color: 'var(--color-cream)' }}>{baker?.business_hours || 'Lunes a Viernes: 9:00 - 18:00'}</strong>
                  </p>
                </div>
              ) : (
                <div className="appt-time-selection">
                  {!selectedHourGroup ? (
                    <div className="appt-hours-view animate-fadeUp">
                      <h3 className="appt-step-subtitle" style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-cream)' }}>
                        Paso 1: Elige la Hora
                      </h3>
                      <div className="appt-slots-grid">
                        {groupedSlots.map(group => (
                          <button
                            key={group.hour}
                            className="appt-slot-btn"
                            onClick={() => setSelectedHourGroup(group)}
                          >
                            <span className="appt-slot-btn__icon">{group.icon}</span>
                            <span className="appt-slot-btn__label">{group.hourLabel}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="appt-minutes-view animate-fadeUp">
                      <div className="appt-minutes-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 className="appt-step-subtitle" style={{ fontSize: '1.1rem', color: 'var(--color-cream)', margin: 0 }}>
                          Paso 2: Elige los Minutos
                        </h3>
                        <button 
                          onClick={() => {
                            setSelectedHourGroup(null);
                            setForm({ ...form, time_slot: '' });
                          }} 
                          style={{ color: 'var(--color-gold)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.9rem', textDecoration: 'underline' }}
                        >
                          Volver a elegir hora
                        </button>
                      </div>
                      
                      <div className="appt-slots-grid">
                        {selectedHourGroup.minuteSlots.map(slot => {
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
                              <span className="appt-slot-btn__label">{slot.label}</span>
                              {taken && <span className="appt-slot-btn__taken">Ocupado</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="appt-step-nav" style={{ marginTop: '2rem' }}>
                <button className="appt-btn-outline" onClick={() => setStep(0)}>← Atrás</button>
                <button className="appt-btn-gold" disabled={!form.time_slot || isClosedDay} onClick={() => setStep(2)}>
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
                  <span className="appt-confirm-val">{selectedSlot?.icon || '🕒'} {selectedSlot?.label || form.time_slot}</span>
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
