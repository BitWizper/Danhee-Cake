import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import StarRating from '../components/ui/StarRating';
import Button from '../components/ui/Button';
import './CakeDetailPage.css';

const CakeDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [cake, setCake] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCake = async () => {
      try {
        const response = await fetch(`http://localhost:4000/api/cakes/${id}`);
        const data = await response.json();
        
        if (data.success) {
          setCake(data.data);
        } else {
          setError('No se pudo encontrar el pastel.');
        }
      } catch (err) {
        console.error('Error fetching cake:', err);
        setError('Error al conectar con el servidor.');
      } finally {
        setLoading(false);
      }
    };

    fetchCake();
  }, [id]);

  const handlePurchase = () => {
    // Por ahora una alerta interactiva simulando la acción de compra
    alert(`🎉 ¡Excelente elección! Has añadido el pastel "${cake.name}" a tu carrito por $${cake.price}. El flujo de pago estará disponible pronto.`);
  };

  if (loading) return <div className="cake-detail-loading">Cargando detalles del pastel...</div>;
  if (error) return <div className="cake-detail-error">{error}</div>;
  if (!cake) return <div className="cake-detail-error">Pastel no encontrado.</div>;

  return (
    <div className="cake-detail-page animate-fadeUp">
      <div className="container cake-detail__container">
        
        {/* Sección Izquierda: Imagen */}
        <div className="cake-detail__image-wrapper glass">
          {cake.image_url ? (
            <img src={cake.image_url} alt={cake.name} className="cake-detail__image" />
          ) : (
            <div className="cake-detail__placeholder">🎂</div>
          )}
        </div>

        {/* Sección Derecha: Información y Compra */}
        <div className="cake-detail__info">
          <div className="cake-detail__header">
            <span className="badge-tag">{cake.category_name}</span>
            <h1 className="cake-detail__title font-serif">{cake.name}</h1>
            <Link to={`/repostero/${cake.baker_id}`} className="cake-detail__baker-link">
              Creado por <strong>{cake.business_name}</strong> →
            </Link>
          </div>

          <div className="cake-detail__rating">
            <StarRating rating={Number(cake.rating)} />
            <span className="rating-count">({cake.reviews_count} reseñas)</span>
          </div>

          <div className="cake-detail__price-section">
            <h2 className="cake-detail__price">${cake.price}</h2>
            <p className="cake-detail__location">📍 Ubicación: {cake.location}</p>
          </div>

          <div className="cake-detail__description">
            <h3>Descripción</h3>
            <p>{cake.description || 'Este delicioso pastel ha sido creado con los mejores ingredientes y un diseño excepcional. Perfecto para tu celebración.'}</p>
          </div>

          <div className="cake-detail__actions">
            <Button variant="gold" className="btn-buy" onClick={handlePurchase}>
              Añadir al carrito
            </Button>
            <Button variant="outline" onClick={() => navigate(-1)}>
              Volver
            </Button>
          </div>

          <div className="cake-detail__guarantee glass">
            <h4>🛡️ Garantía Danhee Cake</h4>
            <p>Tu pedido está protegido. Coordinaremos con el repostero para asegurar la máxima calidad y entrega a tiempo.</p>
          </div>
        </div>
      </div>

      {/* Sección Inferior: Reseñas */}
      <section className="cake-reviews-section">
        <div className="container">
          <div className="section-header">
            <h2 className="font-serif section-title">Reseñas de este pastel</h2>
            <span className="gold-divider" />
          </div>
          
          <div className="reviews-grid">
            {cake.reviews_count > 0 ? (
              <div className="review-card glass">
                <div className="review-card__header">
                  <StarRating rating={5} size="sm" />
                  <span className="review-card__author">Cliente Verificado</span>
                </div>
                <p className="review-card__text">"El pastel estuvo hermoso y delicioso. A todos mis invitados les encantó. El detalle del diseño fue impecable."</p>
              </div>
            ) : (
              <p className="empty-msg">Aún no hay reseñas para este pastel. ¡Sé el primero en probarlo!</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default CakeDetailPage;
