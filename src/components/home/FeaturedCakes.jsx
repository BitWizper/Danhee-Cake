import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import StarRating from '../ui/StarRating';
import './FeaturedCakes.css';

const FeaturedCakes = () => {
  const { user, token, isAuthenticated } = useAuth();
  const [cakes, setCakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const fetchFeaturedCakes = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('http://localhost:4000/api/cakes?featured=true');
      if (!response.ok) {
        throw new Error(`Error de red: ${response.status} ${response.statusText}`);
      }
      const result = await response.json();
      if (result.success) {
        setCakes(result.data);
      } else {
        setError(result.message || 'Error al cargar los pasteles destacados.');
      }
    } catch (err) {
      console.error('Error fetching featured cakes:', err);
      setError('No se pudo conectar con el servidor. Por favor, verifica tu conexión.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeaturedCakes();
  }, []);



  const handleNavigateToEdit = () => {
    navigate('/edit-product');
  };

  return (
    <section className="featured section" id="featured-cakes">
      <div className="container">
        {/* Encabezado */}
        <div className="featured__header">
          <span className="featured__label">Lo más destacado</span>
          <h2 className="featured__title font-serif">
            Pasteles que <span className="gradient-text">inspiran</span>
          </h2>
          <p className="featured__desc">
            Seleccionados por calificaciones, popularidad y la magia de nuestros reposteros.
          </p>
          <span className="gold-divider" />
        </div>

        {/* Manejo de Errores */}
        {error && (
          <div className="featured__error glass">
            <span className="featured__error-icon">⚠️</span>
            <p>{error}</p>
          </div>
        )}

        {/* Grid de tarjetas */}
        <div className="featured__grid">
          {loading ? (
            <div className="featured__loading">Cargando inspiración...</div>
          ) : cakes.length === 0 ? (
            <p className="featured__empty">Próximamente más pasteles destacados...</p>
          ) : (
            cakes.map((cake, i) => (
              <article
                key={cake.id}
                className="cake-card"
                style={{ animationDelay: `${i * 0.15}s` }}
              >
                {/* Visual del pastel */}
                <div className="cake-card__visual" style={{ background: 'var(--color-surface-2)' }}>
                  {cake.image_url ? (
                    <img src={cake.image_url} alt={cake.name} className="cake-card__img" />
                  ) : (
                    <span className="cake-card__emoji">🎂</span>
                  )}
                  <div className="cake-card__tags">
                    <span className="cake-card__tag">{cake.category_name}</span>
                  </div>
                </div>

                {/* Info */}
                <div className="cake-card__body">
                  <div className="cake-card__meta">
                    <span className="cake-card__baker">{cake.business_name}</span>
                    <span className="cake-card__price">Desde ${cake.price}</span>
                  </div>
                  <div className="cake-card__title-row">
                    <h3 className="cake-card__name font-serif">{cake.name}</h3>
                    {user?.role === 'repostero' && user?.id === cake.user_id && (
                      <button
                        type="button"
                        className="cake-card__menu-trigger"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleNavigateToEdit();
                        }}
                        aria-label="Ir a editar catálogo"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="12" cy="5" r="2.2" fill="currentColor" />
                          <circle cx="12" cy="12" r="2.2" fill="currentColor" />
                          <circle cx="12" cy="19" r="2.2" fill="currentColor" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <p className="cake-card__specialty">{cake.location}</p>
                  <div className="cake-card__footer">
                    <StarRating rating={Number(cake.rating)} size="sm" />
                    <span className="cake-card__reviews">({cake.reviews_count})</span>
                  </div>
                  <Link to={`/repostero/${cake.baker_id}`} className="cake-card__cta" id={`cake-cta-${cake.id}`}>
                    Ver repostero →
                  </Link>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="featured__more">
          <Link to="/explorar" className="featured__more-btn" id="featured-explore-btn">
            Ver todos los pasteles destacados
          </Link>
        </div>
      </div>

    </section>
  );
};

export default FeaturedCakes;
