import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import './AppointmentPage.css';

const AppointmentPage = () => {
  const { id } = useParams(); // bakerId
  const navigate = useNavigate();
  const { user, token, isAuthenticated, loading: authLoading } = useAuth();
  
  const [baker, setBaker] = useState(null);
  const [form, setForm] = useState({
    date: '',
    time_slot: '',
    notes: ''
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          baker_id: id,
          ...form
        })
      });

      const result = await response.json();
      if (result.success) {
        alert('¡Cita solicitada con éxito! El repostero se pondrá en contacto contigo.');
        navigate('/');
      } else {
        alert(result.message || 'Error al agendar cita.');
      }
    } catch (err) {
      alert('Error de conexión.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="loading-screen">Cargando...</div>;

  return (
    <div className="appointment-page">
      <div className="container">
        <div className="appointment-card glass animate-fadeUp">
          <div className="appointment-header">
            <h1 className="font-serif">Agendar Cita</h1>
            {baker && <p>Con: <span className="gold-text">{baker.business_name}</span></p>}
          </div>

          <form className="appointment-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Fecha de la Cita</label>
              <input 
                type="date" required
                className="premium-input"
                min={new Date().toISOString().split('T')[0]}
                value={form.date}
                onChange={e => setForm({...form, date: e.target.value})}
              />
            </div>

            <div className="form-group">
              <label>Horario</label>
              <select 
                className="premium-input" required
                value={form.time_slot}
                onChange={e => setForm({...form, time_slot: e.target.value})}
              >
                <option value="">Selecciona una hora...</option>
                <option value="10:00:00">10:00 AM</option>
                <option value="11:00:00">11:00 AM</option>
                <option value="12:00:00">12:00 PM</option>
                <option value="16:00:00">04:00 PM</option>
                <option value="17:00:00">05:00 PM</option>
              </select>
            </div>

            <div className="form-group">
              <label>Notas o Requerimientos Especiales</label>
              <textarea 
                className="premium-input"
                placeholder="Ej: Degustación de chocolate, alergias, o detalles del evento..."
                value={form.notes}
                onChange={e => setForm({...form, notes: e.target.value})}
              />
            </div>

            <div className="appointment-actions">
              <Button type="submit" variant="gold" fullWidth disabled={submitting}>
                {submitting ? 'Solicitando...' : 'Confirmar Solicitud de Cita'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AppointmentPage;
