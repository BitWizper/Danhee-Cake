import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import StarRating from '../components/ui/StarRating';
import Button from '../components/ui/Button';
import './BakerProfilePage.css';

const BakerProfilePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  
  const [baker, setBaker] = useState(null);
  const [cakes, setCakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchBakerData = async () => {
      try {
        const [profileRes, cakesRes] = await Promise.all([
          fetch(`http://localhost:4000/api/bakers/${id}`),
          fetch(`http://localhost:4000/api/cakes?baker=${id}`)
        ]);

        const profileData = await profileRes.json();
        const cakesData = await cakesRes.json();

        if (profileData.success) {
          setBaker(profileData.data);
        } else {
          setError('No se pudo encontrar el perfil del repostero.');
        }

        if (cakesData.success) {
          setCakes(cakesData.data);
        }
      } catch (err) {
        console.error('Error fetching baker profile:', err);
        setError('Error al conectar con el servidor.');
      } finally {
        setLoading(false);
      }
    };

    fetchBakerData();
  }, [id]);

  const handleAction = (path) => {
    if (!isAuthenticated) {
      navigate('/login');
    } else {
      navigate(path);
    }
  };

  if (loading) return <div className="profile-loading">Cargando perfil...</div>;
  if (error) return <div className="profile-error">{error}</div>;

  return (
    <div className="baker-profile" id="baker-profile-page">
      {/* Header / Hero del Perfil */}
      <div className="profile-hero">
        <div className="container profile-hero__inner">
          <div className="profile-header">
            <div className="profile-avatar glass">
              {baker.avatar_url ? (
                <img src={baker.avatar_url} alt={baker.business_name} />
              ) : (
                <span className="avatar-placeholder">🎂</span>
              )}
            </div>
            <div className="profile-info">
              <div className="profile-badges">
                <span className="badge-tag">Boda</span>
                <span className="badge-tag">Fondant</span>
                {baker.is_verified && <span className="badge-verified">✓ Verificado</span>}
              </div>
              <h1 className="profile-name font-serif">{baker.business_name}</h1>
              <p className="profile-meta">
                <span className="location">📍 {baker.location}</span>
                <span className="specialty"> • {baker.specialty || 'Repostería Creativa'}</span>
              </p>
              <div className="profile-rating">
                <StarRating rating={Number(baker.rating_avg)} />
                <span className="rating-count">({baker.total_reviews} reseñas)</span>
              </div>
              <p className="profile-bio">{baker.bio || 'Sin descripción disponible.'}</p>
              
              <div className="profile-actions">
                <Button 
                  variant="gold" 
                  id="btn-agendar-cita"
                  onClick={() => handleAction(`/agenda/${id}`)}
                >
                  Agendar Cita
                </Button>
                <Button 
                  variant="outline" 
                  id="btn-diseñar-pastel"
                  onClick={() => handleAction('/diseñador')}
                >
                  Diseñar mi Pastel
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Portafolio Dinámico */}
      <section className="profile-portfolio section">
        <div className="container">
          <div className="section-header">
            <h2 className="font-serif section-title">Portafolio</h2>
            <span className="gold-divider" />
          </div>

          <div className="portfolio-grid">
            {cakes.length === 0 ? (
              <p className="empty-msg">Este repostero aún no ha subido pasteles a su portafolio.</p>
            ) : (
              cakes.map((cake, i) => (
                <div 
                  key={cake.id} 
                  className="cake-card-simple glass animate-fadeUp"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <div className="cake-card-simple__img">
                    {cake.image_url ? (
                      <img src={cake.image_url} alt={cake.name} />
                    ) : (
                      <div className="placeholder-img">🎂</div>
                    )}
                  </div>
                  <div className="cake-card-simple__body">
                    <h3>{cake.name}</h3>
                    <p>{cake.category_name}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Reseñas (Estructura base) */}
      <section className="profile-reviews section">
        <div className="container">
          <div className="section-header">
            <h2 className="font-serif section-title">Lo que dicen los clientes</h2>
            <span className="gold-divider" />
          </div>
          
          <div className="reviews-placeholder glass">
            <p>Próximamente: Reseñas reales de clientes verificados.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default BakerProfilePage;
