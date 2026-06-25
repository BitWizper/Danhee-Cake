import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import CakeModal from '../components/ui/CakeModal';
import './BakerDashboardPage.css';

const BakerDashboardPage = () => {
  const { user, token, loading: authLoading } = useAuth();
  const [stats, setStats] = useState({ cakes: 0, appointments: 0, rating: 0 });
  const [appointments, setAppointments] = useState([]);
  const [myCakes, setMyCakes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [bakerProfile, setBakerProfile] = useState({ business_name: '', location: '', specialty: '', bio: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCake, setEditingCake] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // overview, portfolio, profile
  const [savingProfile, setSavingProfile] = useState(false);

  const fetchData = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [statsRes, appRes, catRes, cakesRes] = await Promise.all([
        fetch('http://localhost:4000/api/bakers/stats', { headers }),
        fetch('http://localhost:4000/api/bakers/appointments', { headers }),
        fetch('http://localhost:4000/api/categories'),
        fetch('http://localhost:4000/api/bakers/cakes', { headers })
      ]);

      const statsData = await statsRes.json();
      const appData = await appRes.json();
      const catData = await catRes.json();
      const cakesData = await cakesRes.json();

      if (statsData.success) setStats(statsData.data);
      if (appData.success) setAppointments(appData.data);
      if (catData.success) setCategories(catData.data);
      if (cakesData.success) setMyCakes(cakesData.data);
      
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Hubo un problema al cargar los datos. Por favor, intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && token) {
      fetchData();
    }
  }, [token, authLoading]);

  // Cargar datos de perfil de empresa al entrar a la pestaña
  useEffect(() => {
    const fetchProfile = async () => {
      if (activeTab === 'profile' && token) {
        try {
          const headers = { 'Authorization': `Bearer ${token}` };
          const response = await fetch('http://localhost:4000/api/bakers/profile/me', { headers });
          const result = await response.json();
          if (result.success) {
            setBakerProfile(result.data);
          }
        } catch (err) {
          console.error('Error fetching business profile:', err);
        }
      }
    };
    fetchProfile();
  }, [activeTab, token]);

  const handleSaveCake = async (cakeData) => {
    try {
      const url = editingCake 
        ? `http://localhost:4000/api/bakers/cakes/${editingCake.id}`
        : 'http://localhost:4000/api/bakers/cakes';
      
      const method = editingCake ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Authorization': `Bearer ${token}` },
        body: cakeData
      });
      
      const result = await response.json();
      if (result.success) {
        setIsModalOpen(false);
        setEditingCake(null);
        fetchData();
        alert(editingCake ? 'Pastel actualizado correctamente.' : '¡Nuevo pastel añadido a tu portafolio!');
      } else {
        alert('Error: ' + result.message);
      }
    } catch (err) {
      alert('Error de conexión al guardar el pastel.');
    }
  };

  const handleDeleteCake = async (id) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar este pastel?')) return;
    
    try {
      const response = await fetch(`http://localhost:4000/api/bakers/cakes/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.success) {
        fetchData();
      } else {
        alert(result.message);
      }
    } catch (err) {
      alert('Error al eliminar el pastel.');
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const response = await fetch('http://localhost:4000/api/bakers/profile', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(bakerProfile)
      });
      const result = await response.json();
      if (result.success) {
        alert('¡Perfil de empresa actualizado con éxito!');
      } else {
        alert('Error: ' + result.message);
      }
    } catch (err) {
      alert('Error de conexión al actualizar el perfil.');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="dashboard-page" id="baker-dashboard">
      <div className="dashboard-hero">
        <div className="container">
          <span className="featured__label">Panel de Control</span>
          <h1 className="featured__title font-serif">
            Bienvenido, <span className="gradient-text">{user?.name}</span>
          </h1>
          <div className="dashboard-tabs">
            <button 
              className={`tab-btn ${activeTab === 'overview' ? 'tab-btn--active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >Resumen</button>
            <button 
              className={`tab-btn ${activeTab === 'portfolio' ? 'tab-btn--active' : ''}`}
              onClick={() => setActiveTab('portfolio')}
            >Mi Portafolio</button>
            <button 
              className={`tab-btn ${activeTab === 'profile' ? 'tab-btn--active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >Perfil de Empresa</button>
          </div>
        </div>
      </div>

      <div className="container dashboard-content">
        {error && (
          <div className="error-banner glass">
            <p>{error}</p>
            <Button variant="outline" onClick={fetchData}>Reintentar</Button>
          </div>
        )}

        {activeTab === 'overview' && (
          <>
            <div className="stats-grid">
              <div className="stat-card glass">
                <span className="stat-card__icon">🎂</span>
                <h3 className="stat-card__value">{stats.cakes}</h3>
                <p className="stat-card__label">Mis Pasteles</p>
              </div>
              <div className="stat-card glass">
                <span className="stat-card__icon">📅</span>
                <h3 className="stat-card__value">{stats.appointments}</h3>
                <p className="stat-card__label">Citas Pendientes</p>
              </div>
              <div className="stat-card glass">
                <span className="stat-card__icon">⭐</span>
                <h3 className="stat-card__value">{stats.rating}</h3>
                <p className="stat-card__label">Calificación</p>
              </div>
            </div>

            <div className="dashboard-main-grid">
              <div className="dashboard-section glass">
                <h2 className="font-serif section-title">Próximas Citas</h2>
                <div className="appointments-list">
                  {appointments.length === 0 ? (
                    <p className="empty-msg">No tienes citas programadas.</p>
                  ) : (
                    appointments.slice(0, 5).map(app => (
                      <div key={app.id} className="app-item">
                        <div className="app-item__date">
                          <span className="day">{new Date(app.date).getDate()}</span>
                          <span className="month">{new Date(app.date).toLocaleString('default', { month: 'short' })}</span>
                        </div>
                        <div className="app-item__info">
                          <h4>{app.client_name}</h4>
                          <p>{app.time_slot} • {app.status}</p>
                        </div>
                        <div className={`status-pill status-pill--${app.status}`} />
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="dashboard-section glass">
                <h2 className="font-serif section-title">Acciones Rápidas</h2>
                <div className="action-btns">
                  <Button fullWidth onClick={() => { setEditingCake(null); setIsModalOpen(true); }}>
                    Añadir Nuevo Pastel
                  </Button>
                  <Button variant="outline" fullWidth onClick={() => setActiveTab('portfolio')}>
                    Gestionar Portafolio
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'portfolio' && (
          <div className="portfolio-manager">
            <div className="portfolio-header">
              <h2 className="font-serif section-title">Gestionar mi Portafolio</h2>
              <Button onClick={() => { setEditingCake(null); setIsModalOpen(true); }}>+ Añadir Pastel</Button>
            </div>
            <div className="portfolio-grid">
              {loading ? (
                <p className="empty-msg">Cargando portafolio...</p>
              ) : myCakes.length === 0 ? (
                <div className="no-cakes-box glass">
                   <p className="empty-msg">Aún no has añadido pasteles a tu portafolio.</p>
                   <Button variant="outline" onClick={() => setIsModalOpen(true)}>Crear mi primer pastel</Button>
                </div>
              ) : (
                myCakes.map(cake => (
                  <div key={cake.id} className="cake-manage-card glass animate-fadeUp">
                    <div className="cake-manage-card__img">
                      <img src={cake.image_url || 'https://via.placeholder.com/150'} alt={cake.name} />
                    </div>
                    <div className="cake-manage-card__info">
                      <h4>{cake.name}</h4>
                      <p>${cake.price} • {cake.category_name || 'Sin categoría'}</p>
                      <div className="cake-manage-card__actions">
                        <button onClick={() => { setEditingCake(cake); setIsModalOpen(true); }}>Editar</button>
                        <button className="btn-delete" onClick={() => handleDeleteCake(cake.id)}>Eliminar</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="profile-manager-view animate-fadeUp">
            <div className="profile-manager-header">
              <div className="profile-manager-titles">
                <h2 className="font-serif section-title">Perfil de Empresa</h2>
                <p className="section-subtitle">Gestiona la identidad de tu marca en Danhee.</p>
              </div>
              <Button 
                variant="outline" 
                onClick={() => window.open(`/repostero/${stats.baker_id || ''}`, '_blank')}
              >
                👁️ Ver mi Perfil Público
              </Button>
            </div>

            <div className="profile-manager-grid">
              <form onSubmit={handleUpdateProfile} className="business-form glass">
                <div className="form-section-title">Información General</div>
                
                <div className="form-group">
                  <label>Nombre de la Pastelería</label>
                  <div className="input-with-icon">
                    <span className="input-icon">🏪</span>
                    <input 
                      type="text" className="premium-input"
                      value={bakerProfile.business_name}
                      onChange={e => setBakerProfile({...bakerProfile, business_name: e.target.value})}
                      placeholder="Ej. Atelier Dulce"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group flex-1">
                    <label>Ubicación / Ciudad</label>
                    <div className="input-with-icon">
                      <span className="input-icon">📍</span>
                      <input 
                        type="text" className="premium-input"
                        value={bakerProfile.location}
                        onChange={e => setBakerProfile({...bakerProfile, location: e.target.value})}
                        placeholder="Ej. Merida, Yucatán"
                      />
                    </div>
                  </div>
                  <div className="form-group flex-1">
                    <label>Especialidad Principal</label>
                    <div className="input-with-icon">
                      <span className="input-icon">✨</span>
                      <input 
                        type="text" className="premium-input"
                        value={bakerProfile.specialty}
                        onChange={e => setBakerProfile({...bakerProfile, specialty: e.target.value})}
                        placeholder="Ej. Bodas & XV Años"
                      />
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label>Biografía y Experiencia</label>
                  <textarea 
                    className="premium-input" rows="6"
                    value={bakerProfile.bio || ''}
                    onChange={e => setBakerProfile({...bakerProfile, bio: e.target.value})}
                    placeholder="Cuéntale a tus clientes sobre tu trayectoria, ingredientes favoritos y estilo..."
                  />
                </div>

                <div className="form-actions">
                  <Button type="submit" variant="gold" disabled={savingProfile} fullWidth>
                    {savingProfile ? 'Guardando cambios...' : 'Actualizar Perfil Profesional'}
                  </Button>
                </div>
              </form>

              <div className="profile-preview-sidebar glass">
                <div className="form-section-title">Vista Previa Rápida</div>
                <div className="preview-card">
                  <div className="preview-card__avatar">
                    <span>{bakerProfile.business_name?.[0] || 'D'}</span>
                  </div>
                  <div className="preview-card__info">
                    <h4>{bakerProfile.business_name || 'Tu Negocio'}</h4>
                    <p>{bakerProfile.location || 'Ubicación'}</p>
                    <div className="preview-card__rating">⭐⭐⭐⭐⭐ (0)</div>
                  </div>
                </div>
                <div className="preview-help">
                  <p>Asegúrate de que tu biografía sea atractiva para generar confianza en tus futuros clientes.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <CakeModal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setEditingCake(null); }}
        onAdd={handleSaveCake}
        categories={categories}
        initialData={editingCake}
      />
    </div>
  );
};

export default BakerDashboardPage;
