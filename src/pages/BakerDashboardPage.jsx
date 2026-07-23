import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import CakeModal from '../components/ui/CakeModal';
import './BakerDashboardPage.css';

const SCHEDULE_PRESETS = [
  "Lunes a Viernes: 9:00 - 18:00 | Sábado: 10:00 - 14:00",
  "Lunes a Sábado: 8:00 - 20:00",
  "Lunes a Viernes: 10:00 - 19:00 | Sáb y Dom: 10:00 - 15:00",
  "Todos los días: 9:00 - 21:00",
  "Previa Cita / Personalizado"
];

const BakerDashboardPage = () => {
  const { user, token, loading: authLoading } = useAuth();
  const [stats, setStats] = useState({ baker_id: null, cakes: 0, appointments: 0, rating: 0 });
  const [appointments, setAppointments] = useState([]);
  const [myCakes, setMyCakes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [bakerProfile, setBakerProfile] = useState({
    business_name: '',
    location: '',
    specialty: '',
    bio: '',
    business_hours: 'Lunes a Viernes: 9:00 - 18:00 | Sábado: 10:00 - 14:00'
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCake, setEditingCake] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // overview, portfolio, profile
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [portfolioSearch, setPortfolioSearch] = useState('');
  const [updatingApptId, setUpdatingApptId] = useState(null);

  // Reset pagination when switching tabs or searching
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, portfolioSearch]);

  const fetchData = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [statsRes, appRes, catRes, cakesRes] = await Promise.all([
        fetch('/api/bakers/stats', { headers }),
        fetch('/api/bakers/appointments', { headers }),
        fetch('/api/categories'),
        fetch('/api/bakers/cakes', { headers })
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
          const response = await fetch('/api/bakers/profile/me', { headers });
          const result = await response.json();
          if (result.success && result.data) {
            setBakerProfile(prev => ({
              ...prev,
              ...result.data,
              business_hours: result.data.business_hours || 'Lunes a Viernes: 9:00 - 18:00 | Sábado: 10:00 - 14:00'
            }));
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
        ? `/api/bakers/cakes/${editingCake.id}`
        : '/api/bakers/cakes';
      
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
      const response = await fetch(`/api/bakers/cakes/${id}`, {
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
      const response = await fetch('/api/bakers/profile', {
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

  const handleUpdateAppointmentStatus = async (apptId, newStatus) => {
    setUpdatingApptId(apptId);
    try {
      const response = await fetch(`/api/bakers/appointments/${apptId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      const result = await response.json();
      if (result.success) {
        setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, status: newStatus } : a));
      } else {
        alert(result.message || 'No se pudo actualizar el estado de la cita.');
      }
    } catch (err) {
      alert('Error de conexión al actualizar la cita.');
    } finally {
      setUpdatingApptId(null);
    }
  };

  return (
    <div className="dashboard-page" id="baker-dashboard">
      <div className="dashboard-hero">
        <div className="container">
          <span className="featured__label">Panel de Control Repostero</span>
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
            >Mi Portafolio ({myCakes.length})</button>
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

        {/* PESTAÑA RESUMEN */}
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
                <h3 className="stat-card__value">{stats.rating || '0.00'}</h3>
                <p className="stat-card__label">Calificación</p>
              </div>
            </div>

            <div className="dashboard-main-grid">
              <div className="dashboard-section glass appointments-section">
                <div className="dashboard-section-header">
                  <h2 className="font-serif section-title">Próximas Citas de Clientes</h2>
                  <span className="subtitle-badge">{appointments.length} solicitadas</span>
                </div>

                <div className="appointments-list">
                  {appointments.length === 0 ? (
                    <div className="no-appts-box">
                      <span className="empty-icon">📅</span>
                      <p className="empty-msg">No tienes citas de clientes pendientes.</p>
                    </div>
                  ) : (
                    appointments.slice(0, 5).map(app => (
                      <div key={app.id} className="app-item">
                        <div className="app-item__date">
                          <span className="day">{new Date(app.date).getDate()}</span>
                          <span className="month">{new Date(app.date).toLocaleString('es-MX', { month: 'short' })}</span>
                        </div>
                        <div className="app-item__info">
                          <h4>{app.client_name || 'Cliente Registrar'}</h4>
                          <p className="app-meta-detail">
                            🕒 {app.time_slot} • ✉️ {app.client_email || 'Sin correo'} {app.client_phone ? `• 📞 ${app.client_phone}` : ''}
                          </p>
                          {app.notes && <p className="app-notes-snippet">"{app.notes}"</p>}
                        </div>
                        <div className="app-item__actions">
                          <span className={`status-pill status-pill--${app.status}`}>
                            {app.status === 'pending' ? 'Pendiente' : app.status === 'confirmed' ? 'Confirmada' : app.status === 'completed' ? 'Completada' : 'Cancelada'}
                          </span>
                          {app.status === 'pending' && (
                            <button 
                              className="btn-quick-action btn-confirm"
                              disabled={updatingApptId === app.id}
                              onClick={() => handleUpdateAppointmentStatus(app.id, 'confirmed')}
                            >
                              ✓ Confirmar
                            </button>
                          )}
                          {app.status === 'confirmed' && (
                            <button 
                              className="btn-quick-action btn-complete"
                              disabled={updatingApptId === app.id}
                              onClick={() => handleUpdateAppointmentStatus(app.id, 'completed')}
                            >
                              🎂 Completar
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="dashboard-section glass quick-actions-section">
                <h2 className="font-serif section-title">Acciones Rápidas</h2>
                <div className="action-btns">
                  <Button fullWidth onClick={() => { setEditingCake(null); setIsModalOpen(true); }}>
                    ➕ Añadir Nuevo Pastel
                  </Button>
                  <Button variant="outline" fullWidth onClick={() => setActiveTab('portfolio')}>
                    🎨 Gestionar Portafolio
                  </Button>
                  <Button variant="outline" fullWidth onClick={() => setActiveTab('profile')}>
                    🏪 Configurar Perfil de Empresa
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* PESTAÑA PORTAFOLIO CON PAGINACIÓN Y BÚSQUEDA */}
        {activeTab === 'portfolio' && (() => {
          const cakesPerPage = 6;
          const filteredCakes = myCakes.filter(c => 
            c.name.toLowerCase().includes(portfolioSearch.toLowerCase()) ||
            (c.category_name && c.category_name.toLowerCase().includes(portfolioSearch.toLowerCase()))
          );
          const totalPages = Math.ceil(filteredCakes.length / cakesPerPage) || 1;
          const indexOfLastCake = currentPage * cakesPerPage;
          const indexOfFirstCake = indexOfLastCake - cakesPerPage;
          const currentCakes = filteredCakes.slice(indexOfFirstCake, indexOfLastCake);
          
          return (
            <div className="portfolio-manager animate-fadeUp">
              <div className="portfolio-header">
                <div>
                  <h2 className="font-serif section-title">Gestionar mi Portafolio</h2>
                  <p className="section-subtitle">Muestra tus mejores obras de repostería a tus clientes.</p>
                </div>
                <Button onClick={() => { setEditingCake(null); setIsModalOpen(true); }}>+ Añadir Pastel</Button>
              </div>

              {/* BARRA DE BÚSQUEDA Y FILTRO */}
              <div className="portfolio-controls glass">
                <div className="search-box">
                  <span className="search-icon">🔍</span>
                  <input 
                    type="text" 
                    placeholder="Buscar pastel por nombre o categoría..." 
                    value={portfolioSearch}
                    onChange={(e) => setPortfolioSearch(e.target.value)}
                    className="portfolio-search-input"
                  />
                  {portfolioSearch && (
                    <button className="search-clear" onClick={() => setPortfolioSearch('')}>✕</button>
                  )}
                </div>
                <div className="portfolio-count-tag">
                  {filteredCakes.length} pasteles encontrados
                </div>
              </div>

              <div className="portfolio-grid">
                {loading ? (
                  <p className="empty-msg">Cargando portafolio...</p>
                ) : filteredCakes.length === 0 ? (
                  <div className="no-cakes-box glass">
                     <p className="empty-msg">
                       {portfolioSearch ? 'No se encontraron pasteles con ese filtro.' : 'Aún no has añadido pasteles a tu portafolio.'}
                     </p>
                     <Button variant="outline" onClick={() => setIsModalOpen(true)}>Crear mi primer pastel</Button>
                  </div>
                ) : (
                  currentCakes.map(cake => (
                    <div key={cake.id} className="cake-manage-card glass">
                      <div className="cake-manage-card__img">
                        <img src={cake.image_url || 'https://via.placeholder.com/300x200?text=Sin+Imagen'} alt={cake.name} />
                        {cake.is_featured ? <span className="featured-badge">⭐ Destacado</span> : null}
                      </div>
                      <div className="cake-manage-card__info">
                        <h4>{cake.name}</h4>
                        <p className="cake-card-category">${cake.price} • {cake.category_name || 'Sin categoría'}</p>
                        <div className="cake-manage-card__actions">
                          <button onClick={() => { setEditingCake(cake); setIsModalOpen(true); }}>✏️ Editar</button>
                          <button className="btn-delete" onClick={() => handleDeleteCake(cake.id)}>🗑️ Eliminar</button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* CONTROL DE PAGINACIÓN */}
              {filteredCakes.length > cakesPerPage && (
                <div className="portfolio-pagination">
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => {
                      setCurrentPage(prev => Math.max(prev - 1, 1));
                      window.scrollTo({ top: 200, behavior: 'smooth' });
                    }}
                    className="pagination-btn"
                  >
                    &larr; Anterior
                  </button>

                  <div className="pagination-pages">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(num => (
                      <button
                        key={num}
                        className={`page-num-btn ${currentPage === num ? 'page-num-btn--active' : ''}`}
                        onClick={() => {
                          setCurrentPage(num);
                          window.scrollTo({ top: 200, behavior: 'smooth' });
                        }}
                      >
                        {num}
                      </button>
                    ))}
                  </div>

                  <button 
                    disabled={currentPage === totalPages}
                    onClick={() => {
                      setCurrentPage(prev => Math.min(prev + 1, totalPages));
                      window.scrollTo({ top: 200, behavior: 'smooth' });
                    }}
                    className="pagination-btn"
                  >
                    Siguiente &rarr;
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* PESTAÑA PERFIL DE EMPRESA Y HORARIO */}
        {activeTab === 'profile' && (
          <div className="profile-manager-view animate-fadeUp">
            <div className="profile-manager-header">
              <div className="profile-manager-titles">
                <h2 className="font-serif section-title">Perfil de Empresa</h2>
                <p className="section-subtitle">Gestiona la identidad de tu marca, horario de atención y especialidades en Danhee.</p>
              </div>
              <Button 
                variant="outline" 
                onClick={() => window.open(`/repostero/${stats.baker_id || ''}`, '_blank')}
                className="btn-view-public"
              >
                👁️ Ver mi Perfil Público
              </Button>
            </div>

            <div className="profile-manager-grid">
              <form onSubmit={handleUpdateProfile} className="business-form glass">
                <div className="form-section-title">Información Comercial y Horarios</div>
                
                <div className="form-grid-inputs">
                  <div className="form-group form-group--full-width">
                    <label className="form-label-custom">Nombre de la Pastelería</label>
                    <div className="input-with-icon">
                      <span className="input-icon">🏪</span>
                      <input 
                        type="text" className="premium-input"
                        value={bakerProfile.business_name || ''}
                        onChange={e => setBakerProfile({...bakerProfile, business_name: e.target.value})}
                        placeholder="Ej. Atelier Dulce de Mérida"
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label-custom">Ubicación / Ciudad</label>
                    <div className="input-with-icon">
                      <span className="input-icon">📍</span>
                      <input 
                        type="text" className="premium-input"
                        value={bakerProfile.location || ''}
                        onChange={e => setBakerProfile({...bakerProfile, location: e.target.value})}
                        placeholder="Ej. Mérida, Yucatán"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label-custom">Especialidad Principal</label>
                    <div className="input-with-icon">
                      <span className="input-icon">✨</span>
                      <input 
                        type="text" className="premium-input"
                        value={bakerProfile.specialty || ''}
                        onChange={e => setBakerProfile({...bakerProfile, specialty: e.target.value})}
                        placeholder="Ej. Pasteles de Boda & XV Años"
                      />
                    </div>
                  </div>

                  {/* HORARIO DE ATENCIÓN */}
                  <div className="form-group form-group--full-width">
                    <label className="form-label-custom">Horario de Atención</label>
                    <div className="schedule-input-wrapper">
                      <div className="input-with-icon">
                        <span className="input-icon">🕒</span>
                        <select 
                          className="premium-input"
                          value={SCHEDULE_PRESETS.includes(bakerProfile.business_hours) ? bakerProfile.business_hours : 'custom'}
                          onChange={e => {
                            if (e.target.value !== 'custom') {
                              setBakerProfile({ ...bakerProfile, business_hours: e.target.value });
                            }
                          }}
                        >
                          {SCHEDULE_PRESETS.map((preset, idx) => (
                            <option key={idx} value={preset}>{preset}</option>
                          ))}
                          <option value="custom">✏️ Escribir horario personalizado...</option>
                        </select>
                      </div>

                      <div className="input-with-icon" style={{ marginTop: '0.75rem' }}>
                        <span className="input-icon">📅</span>
                        <input 
                          type="text" 
                          className="premium-input"
                          value={bakerProfile.business_hours || ''}
                          onChange={e => setBakerProfile({...bakerProfile, business_hours: e.target.value})}
                          placeholder="Ej. Lun - Vie: 9:00 AM - 6:00 PM | Sáb: 10:00 AM - 2:00 PM"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-group form-group--biography">
                    <label className="form-label-custom">Biografía y Experiencia</label>
                    <textarea 
                      className="premium-input" rows="5"
                      value={bakerProfile.bio || ''}
                      onChange={e => setBakerProfile({...bakerProfile, bio: e.target.value})}
                      placeholder="Cuéntale a tus clientes sobre tu trayectoria, ingredientes artesanales, historia y técnica..."
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <Button type="submit" variant="gold" disabled={savingProfile} fullWidth>
                    {savingProfile ? 'Guardando cambios...' : '💾 Actualizar Perfil Profesional'}
                  </Button>
                </div>
              </form>

              {/* VISTA PREVIA EN TIEMPO REAL */}
              <div className="profile-preview-sidebar glass">
                <div className="form-section-title">Vista Previa Rápida</div>
                <div className="preview-card">
                  <div className="preview-card__avatar">
                    <span>{bakerProfile.business_name?.[0]?.toUpperCase() || 'D'}</span>
                  </div>
                  <div className="preview-card__info">
                    <h4>{bakerProfile.business_name || 'Tu Negocio'}</h4>
                    <span className="verified-badge-pill">✓ Verificado</span>
                    <p className="preview-location">📍 {bakerProfile.location || 'Mérida, Yucatán'}</p>
                    <p className="preview-specialty">✨ {bakerProfile.specialty || 'Repostería Artesanal'}</p>
                    <div className="preview-card__rating">⭐⭐⭐⭐⭐ (5.0)</div>
                  </div>

                  <div className="preview-schedule-box">
                    <span className="schedule-title">🕒 Horario de Servicio:</span>
                    <p className="schedule-val">{bakerProfile.business_hours || 'Por definir'}</p>
                  </div>
                </div>
                <div className="preview-help">
                  <p>💡 Tu perfil completo se mostrará en Danhee con esta estética. Mantén tus horarios actualizados para recibir más citas.</p>
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
