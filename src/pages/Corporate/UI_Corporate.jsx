import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import StarRating from '../../components/ui/StarRating';
import './UI_Corporate.css';

const UICorporate = () => {
  const navigate = useNavigate();
  const [cakes, setCakes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cakesRes, catsRes] = await Promise.all([
          fetch('http://localhost:4000/api/cakes'),
          fetch('http://localhost:4000/api/categories')
        ]);
        
        if (!cakesRes.ok || !catsRes.ok) {
          throw new Error('No se pudo obtener la información de los pasteles del servidor.');
        }

        const cakesData = await cakesRes.json();
        const catsData = await catsRes.json();
        
        if (cakesData.success) {
          const corporateCakes = cakesData.data.filter(
            cake => cake.category_name === 'Corporativo' || cake.category_slug === 'corporativo'
          );
          setCakes(corporateCakes);
        }

        if (catsData.success) {
          setCategories([{ id: 0, name: 'Todas', slug: 'Todas' }, ...catsData.data]);
        }
      } catch (error) {
        console.error('Error fetching corporate data:', error);
        setError('Error de conexión: Verifica que el servidor esté activo para cargar los pasteles corporativos.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleCategoryClick = (category) => {
    const nameLower = category.name.toLowerCase();
    const slugLower = category.slug ? category.slug.toLowerCase() : '';

    if (nameLower === 'corporativo' || slugLower === 'corporativo') {
      return; // ya estamos aquí
    } else if (nameLower === 'bodas' || nameLower === 'boda' || slugLower === 'bodas' || slugLower === 'boda') {
      navigate('/wedding');
    } else if (nameLower === 'aniversario' || slugLower === 'aniversario') {
      navigate('/anniversary');
    } else if (nameLower === 'graduación' || nameLower === 'graduacion' || slugLower === 'graduacion') {
      navigate('/graduation');
    } else {
      navigate(`/explorar?categoria=${category.name}`);
    }
  };

  const filteredCakes = cakes.filter(cake => {
    const matchSearch = cake.name.toLowerCase().includes(search.toLowerCase()) || 
                        cake.business_name.toLowerCase().includes(search.toLowerCase());
    const matchLocation = !location || cake.location.toLowerCase().includes(location.toLowerCase());
    return matchSearch && matchLocation;
  });

  return (
    <div className="corporate-page" id="corporate-page">
      <div className="corporate-page__header">
        <div className="container">
          <span className="corporate-page__label">Colección Ejecutiva</span>
          <h1 className="corporate-page__title font-serif">
            Pasteles <span className="gradient-text">Corporativos</span>
          </h1>
          <p className="corporate-page__subtitle">
            Eleva la imagen de tu empresa con detalles que dejan huella
          </p>

          <div className="corporate-filters" id="corporate-filters">
            <div className="corporate-filters__main">
              <input
                id="corporate-filter-search"
                className="corporate-filters__input"
                type="text"
                placeholder="Buscar pastel o repostero..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <input
                id="corporate-filter-location"
                className="corporate-filters__input"
                type="text"
                placeholder="Ubicación..."
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
            </div>
            
            <div className="explore-filters__chips">
              {categories.map(s => (
                <button
                  key={s.id}
                  className={`explore-filters__chip ${s.name === 'Corporativo' || s.slug === 'corporativo' ? 'explore-filters__chip--active' : ''}`}
                  onClick={() => handleCategoryClick(s)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="container corporate-page__grid">
        {error && (
          <div className="corporate-page__error glass">
            <span>⚠️</span>
            <p>{error}</p>
          </div>
        )}

        {loading ? (
          <p className="corporate-page__empty">Cargando pasteles corporativos...</p>
        ) : filteredCakes.length === 0 && !error ? (
          <p className="corporate-page__empty">No se encontraron pasteles corporativos con ese criterio.</p>
        ) : filteredCakes.map((cake, i) => (
          <article
            key={cake.id}
            className="corporate-cake-card animate-fadeUp"
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <Link to={`/pastel/${cake.id}`} style={{ display: 'block', textDecoration: 'none' }}>
              <div className="corporate-cake-card__visual" style={{ height: '220px', background: 'var(--color-surface-2)' }}>
                {cake.image_url ? (
                  <img src={cake.image_url} alt={cake.name} className="corporate-cake-card__img" />
                ) : (
                  <span className="corporate-cake-card__emoji" style={{ fontSize: '3.5rem' }}>🎂</span>
                )}
                <div className="corporate-cake-card__tags">
                  <span className="corporate-cake-card__tag">{cake.category_name}</span>
                </div>
              </div>
            </Link>

            <div className="corporate-cake-card__body">
              <div className="corporate-cake-card__meta">
                <span className="corporate-cake-card__baker">{cake.business_name}</span>
                <span className="corporate-cake-card__price">${cake.price}</span>
              </div>
              <Link to={`/pastel/${cake.id}`} style={{ textDecoration: 'none' }}>
                <h2 className="corporate-cake-card__name font-serif">{cake.name}</h2>
              </Link>
              <p className="corporate-cake-card__specialty">📍 {cake.location}</p>
              <div className="corporate-cake-card__footer">
                <StarRating rating={Number(cake.rating)} size="sm" />
                <span className="corporate-cake-card__reviews">({cake.reviews_count})</span>
              </div>
              <Link to={`/repostero/${cake.baker_id}`} className="corporate-cake-card__cta">
                Ver perfil →
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default UICorporate;
