import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import CakeModal from '../../components/ui/CakeModal';
import './UI_editproduct.css';

const UI_editproduct = () => {
  const { user, token, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [myCakes, setMyCakes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [bakerProfile, setBakerProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCake, setEditingCake] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);

  useEffect(() => {
    if (authLoading) return;
    
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Cargar perfil del repostero
        const profileRes = await fetch('http://localhost:4000/api/bakers/profile/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const profileData = await profileRes.json();
        if (profileData.success) {
          setBakerProfile(profileData.data);
        }

        const [cakesRes, categoriesRes] = await Promise.all([
          fetch('http://localhost:4000/api/bakers/cakes', {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch('http://localhost:4000/api/categories')
        ]);

        const cakesData = await cakesRes.json();
        const categoriesData = await categoriesRes.json();

        if (!cakesData.success) {
          throw new Error(cakesData.message || 'No se pudieron cargar tus pasteles.');
        }

        if (!categoriesData.success) {
          throw new Error(categoriesData.message || 'No se pudieron cargar las categorías.');
        }

        setMyCakes(cakesData.data);
        setCategories(categoriesData.data);
      } catch (err) {
        console.error('Error fetching edit product data:', err);
        setError(err.message || 'Error al cargar datos.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isAuthenticated, token, authLoading]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.cake-card')) {
        setMenuOpenId(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleEditClick = (cake) => {
    setEditingCake(cake);
    setIsModalOpen(true);
    setMenuOpenId(null);
  };

  const handleSaveCake = async (formData) => {
    if (!token) return;

    const method = editingCake ? 'PUT' : 'POST';
    const url = editingCake
      ? `http://localhost:4000/api/bakers/cakes/${editingCake.id}`
      : 'http://localhost:4000/api/bakers/cakes';

    try {
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'No se pudo guardar el pastel.');
      }

      setIsModalOpen(false);
      setEditingCake(null);
      await refreshMyCakes();
      alert('Cambios guardados correctamente.');
    } catch (err) {
      console.error('Save cake error:', err);
      alert(err.message || 'Error al guardar el pastel.');
    }
  };

  const refreshMyCakes = async () => {
    try {
      const cakesRes = await fetch('http://localhost:4000/api/bakers/cakes', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const cakesData = await cakesRes.json();
      if (cakesData.success) {
        setMyCakes(cakesData.data);
      }
    } catch (err) {
      console.error('Error refreshing my cakes:', err);
    }
  };

  const handleOpenModal = () => {
    setEditingCake(null);
    setIsModalOpen(true);
    setMenuOpenId(null);
  };

  if (!isAuthenticated) {
    return (
      <div className="edit-product-page">
        <div className="access-denied-card glass">
          <h2>Acceso restringido</h2>
          <p>Esta sección solo está disponible para reposteros autenticados.</p>
          <Button onClick={() => navigate('/login')}>Iniciar sesión</Button>
        </div>
      </div>
    );
  }

  if (user?.role !== 'repostero') {
    return null;
  }

  return (
    <div className="edit-product-page">
      <div className="edit-product-header glass">
        <div>
          <span className="small-label">{bakerProfile?.business_name || 'Catálogo del repostero'}</span>
          <h1 className="font-serif">Editar tus pasteles</h1>
          <p>Selecciona un pastel y presiona editar para cambiar nombre, descripción, imagen o detalles.</p>
        </div>
        <Button onClick={handleOpenModal}>+ Nuevo pastel</Button>
      </div>

      <div className="edit-product-content">
        {loading ? (
          <div className="loading-card glass">Cargando tus pasteles...</div>
        ) : error ? (
          <div className="error-card glass">
            <p>{error}</p>
            <Button variant="outline" onClick={refreshMyCakes}>Reintentar</Button>
          </div>
        ) : myCakes.length === 0 ? (
          <div className="empty-card glass">
            <p>Aún no hay pasteles en tu catálogo.</p>
            <Button onClick={handleOpenModal}>Agregar primer pastel</Button>
          </div>
        ) : (
          <div className="cakes-grid">
            {myCakes.map((cake) => (
              <div key={cake.id} className="cake-card glass">
                <div className="cake-card__image">
                  <img src={cake.image_url || 'https://via.placeholder.com/400x240'} alt={cake.name} />
                </div>
                <div className="cake-card__body">
                  <div className="card-head">
                    <div className="card-title-row">
                      <h3>{cake.name}</h3>
                      <button
                        type="button"
                        className="menu-trigger"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuOpenId(prev => (prev === cake.id ? null : cake.id));
                        }}
                        aria-label="Abrir menú de opciones"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="12" cy="5" r="2.2" fill="currentColor" />
                          <circle cx="12" cy="12" r="2.2" fill="currentColor" />
                          <circle cx="12" cy="19" r="2.2" fill="currentColor" />
                        </svg>
                      </button>
                    </div>

                    {menuOpenId === cake.id && (
                      <div className="menu-popup glass" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => handleEditClick(cake)}>Editar</button>
                      </div>
                    )}

                    <span className="cake-category">{cake.category_name || 'Sin categoría'}</span>
                  </div>
                  <p className="cake-description">{cake.description || 'Sin descripción disponible.'}</p>
                  <div className="cake-footer">
                    <span className="cake-price">${cake.price?.toFixed?.(2) ?? cake.price}</span>
                    <span className="cake-status">{cake.is_featured ? 'Destacado' : 'Normal'}</span>
                  </div>
                </div>
              </div>
            ))}
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

export default UI_editproduct;
