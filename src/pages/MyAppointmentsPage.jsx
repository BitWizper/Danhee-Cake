import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './MyAppointmentsPage.css';

/* ── Helpers ── */
const STATUS_CONFIG = {
  pending:   { label: 'Pendiente',  className: 'status--pending',   icon: '⏳' },
  confirmed: { label: 'Confirmada', className: 'status--confirmed', icon: '✅' },
  cancelled: { label: 'Cancelada',  className: 'status--cancelled', icon: '✕'  },
  completed: { label: 'Completada', className: 'status--completed', icon: '🎂' },
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

const formatTime = (timeStr) => {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  return `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
};

/* ── Modal de Confirmación ── */
const CancelModal = ({ appointment, onConfirm, onClose, loading }) => (
  <div className="modal-overlay animate-fadeIn" onClick={onClose}>
    <div className="modal-card glass animate-scaleIn" onClick={e => e.stopPropagation()}>
      <div className="modal-icon-wrap">
        <span className="modal-icon">⚠️</span>
      </div>
      <h2 className="modal-title font-serif">¿Cancelar esta cita?</h2>
      <p className="modal-desc">
        Estás a punto de cancelar tu cita con{' '}
        <strong className="modal-highlight">{appointment.business_name}</strong> el{' '}
        <strong className="modal-highlight">{formatDate(appointment.date)}</strong> a las{' '}
        <strong className="modal-highlight">{formatTime(appointment.time_slot)}</strong>.
      </p>
      <p className="modal-warning">Esta acción no se puede deshacer.</p>
      <div className="modal-actions">
        <button className="modal-btn modal-btn--keep" onClick={onClose} disabled={loading}>
          Mantener Cita
        </button>
        <button
          className="modal-btn modal-btn--confirm"
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? 'Cancelando…' : 'Sí, Cancelar'}
        </button>
      </div>
    </div>
  </div>
);

/* ── Tarjeta de Cita ── */
const AppointmentCard = ({ appt, onCancel, index }) => {
  const status = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending;
  const canCancel = appt.status === 'pending' || appt.status === 'confirmed';

  return (
    <div
      className="appt-card glass animate-fadeUp"
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      <div className={`appt-status-stripe ${status.className}`} />

      <div className="appt-card__inner">
        {/* Cabecera */}
        <div className="appt-card__head">
          <div className="appt-baker-info">
            <div className="appt-baker-avatar">🎂</div>
            <div>
              <h3 className="appt-baker-name font-serif">{appt.business_name}</h3>
              {appt.specialty && <p className="appt-baker-specialty">{appt.specialty}</p>}
              {appt.location && <p className="appt-baker-loc">📍 {appt.location}</p>}
            </div>
          </div>
          <span className={`appt-status-badge ${status.className}`}>
            <span className="appt-status-badge__icon">{status.icon}</span>
            {status.label}
          </span>
        </div>

        {/* Divisor */}
        <div className="appt-divider" />

        {/* Detalles */}
        <div className="appt-details">
          <div className="appt-detail-item">
            <span className="appt-detail-icon">📅</span>
            <div>
              <span className="appt-detail-label">Fecha</span>
              <span className="appt-detail-value">{formatDate(appt.date)}</span>
            </div>
          </div>
          <div className="appt-detail-item">
            <span className="appt-detail-icon">🕐</span>
            <div>
              <span className="appt-detail-label">Horario</span>
              <span className="appt-detail-value">{formatTime(appt.time_slot)}</span>
            </div>
          </div>
        </div>

        {/* Notas */}
        {appt.notes && (
          <div className="appt-notes">
            <span className="appt-notes-label">Notas</span>
            <p className="appt-notes-text">{appt.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="appt-card__footer">
          <Link to={`/repostero/${appt.baker_id}`} className="appt-link-baker">
            Ver perfil del repostero →
          </Link>
          {canCancel && (
            <button className="appt-cancel-btn" onClick={() => onCancel(appt)}>
              Cancelar cita
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Página principal ── */
const MyAppointmentsPage = () => {
  const { token, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchAppointments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/appointments/my-appointments', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (result.success) {
        setAppointments(result.data);
      } else {
        setError('No se pudieron cargar las citas.');
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { navigate('/login'); return; }
    fetchAppointments();
  }, [authLoading, isAuthenticated, navigate, fetchAppointments]);

  const handleCancelConfirm = async () => {
    if (!selectedAppt) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/appointments/${selectedAppt.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (result.success) {
        setAppointments(prev =>
          prev.map(a => a.id === selectedAppt.id ? { ...a, status: 'cancelled' } : a)
        );
        setSelectedAppt(null);
      } else {
        alert(result.message || 'No se pudo cancelar la cita.');
      }
    } catch {
      alert('Error de conexión.');
    } finally {
      setCancelling(false);
    }
  };

  const filtered = filter === 'all'
    ? appointments
    : appointments.filter(a => a.status === filter);

  const counts = {
    all:       appointments.length,
    pending:   appointments.filter(a => a.status === 'pending').length,
    confirmed: appointments.filter(a => a.status === 'confirmed').length,
    cancelled: appointments.filter(a => a.status === 'cancelled').length,
    completed: appointments.filter(a => a.status === 'completed').length,
  };

  return (
    <div className="my-appts-page">
      {/* Hero Header */}
      <div className="my-appts-hero">
        <div className="my-appts-hero__bg" />
        <div className="container my-appts-hero__inner">
          <span className="my-appts-overline">Mi Cuenta</span>
          <h1 className="my-appts-title font-serif">Mis Citas</h1>
          <p className="my-appts-subtitle">
            Gestiona tus consultas y reuniones con nuestros reposteros artesanos.
          </p>
          <Link to="/explorar" className="my-appts-cta">
            + Agendar nueva cita
          </Link>
        </div>
      </div>

      <div className="container my-appts-body">
        {/* Filtros */}
        <div className="appt-filters">
          {[
            { key: 'all',       label: 'Todas'       },
            { key: 'pending',   label: 'Pendientes'  },
            { key: 'confirmed', label: 'Confirmadas' },
            { key: 'completed', label: 'Completadas' },
            { key: 'cancelled', label: 'Canceladas'  },
          ].map(({ key, label }) =>
            (counts[key] > 0 || key === 'all') ? (
              <button
                key={key}
                className={`appt-filter-btn ${filter === key ? 'appt-filter-btn--active' : ''}`}
                onClick={() => setFilter(key)}
              >
                {label}
                <span className="appt-filter-count">{counts[key]}</span>
              </button>
            ) : null
          )}
        </div>

        {/* Estados */}
        {loading && (
          <div className="appts-loading">
            <div className="appts-spinner" />
            <p>Cargando tus citas…</p>
          </div>
        )}

        {error && !loading && (
          <div className="appts-error glass">
            <span>⚠️</span>
            <p>{error}</p>
            <button onClick={fetchAppointments}>Reintentar</button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="appts-empty glass">
            <span className="appts-empty__icon">📅</span>
            <h3 className="font-serif">
              {filter === 'all' ? 'No tienes citas aún' : 'Sin citas en esta categoría'}
            </h3>
            <p>
              {filter === 'all'
                ? 'Explora nuestros reposteros y agenda tu primera consulta.'
                : 'Cambia el filtro para ver otras citas.'}
            </p>
            {filter === 'all' && (
              <Link to="/explorar" className="appts-empty__cta">
                Explorar Reposteros
              </Link>
            )}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="appts-grid">
            {filtered.map((appt, i) => (
              <AppointmentCard
                key={appt.id}
                appt={appt}
                index={i}
                onCancel={setSelectedAppt}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal de confirmación */}
      {selectedAppt && (
        <CancelModal
          appointment={selectedAppt}
          onConfirm={handleCancelConfirm}
          onClose={() => setSelectedAppt(null)}
          loading={cancelling}
        />
      )}
    </div>
  );
};

export default MyAppointmentsPage;
