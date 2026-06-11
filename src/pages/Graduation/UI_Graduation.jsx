import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import StarRating from '../../components/ui/StarRating';
import './UI_Graduation.css';

const UIGraduation = () => {
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
          const graduationCakes = cakesData.data.filter(
            cake => cake.category_name === 'Graduación' || cake.category_slug === 'graduacion' || cake.category_name === 'Graduacion'
          );
          setCakes(graduationCakes);
        }

        if (catsData.success) {
          setCategories([{ id: 0, name: 'Todas', slug: 'Todas' }, ...catsData.data]);
        }
      } catch (error) {
        console.error('Error fetching graduation data:', error);
        setError('Error de conexión: Verifica que el servidor esté activo para cargar los pasteles de graduación.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleCategoryClick = (category) => {
    const nameLower = category.name.toLowerCase();
    const slugLower = category.slug ? category.slug.toLowerCase() : '';

    if (nameLower === 'graduación' || nameLower === 'graduacion' || slugLower === 'graduacion') {
      return; // ya estamos aquí
    } else if (nameLower === 'bodas' || nameLower === 'boda' || slugLower === 'bodas' || slugLower === 'boda') {
      navigate('/wedding');
    } else if (nameLower === 'aniversario' || slugLower === 'aniversario') {
      navigate('/anniversary');
    } else if (nameLower === 'corporativo' || slugLower === 'corporativo') {
      navigate('/corporate');
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
    <div className="graduation-page" id="graduation-page">
      <div className="graduation-page__header">
        <div className="container">
          <span className="graduation-page__label">Colección de Logros</span>
          <h1 className="graduation-page__title font-serif">
            Pasteles de <span className="gradient-text">Graduación</span>
          </h1>
          <p className="graduation-page__subtitle">
            El dulce premio para celebrar una meta alcanzada
          </p>

          <div className="graduation-filters" id="graduation-filters">
            <div className="graduation-filters__main">
              <input
                id="graduation-filter-search"
                className="graduation-filters__input"
                type="text"
                placeholder="Buscar pastel o repostero..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <input
                id="graduation-filter-location"
                className="graduation-filters__input"
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
                  className={`explore-filters__chip ${s.name === 'Graduación' || s.name === 'Graduacion' || s.slug === 'graduacion' ? 'explore-filters__chip--active' : ''}`}
                  onClick={() => handleCategoryClick(s)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="container graduation-page__grid">
        {error && (
          <div className="graduation-page__error glass">
            <span>⚠️</span>
            <p>{error}</p>
          </div>
        )}

        {loading ? (
          <p className="graduation-page__empty">Cargando pasteles de graduación...</p>
        ) : filteredCakes.length === 0 && !error ? (
          <p className="graduation-page__empty">No se encontraron pasteles de graduación con ese criterio.</p>
        ) : filteredCakes.map((cake, i) => (
          <article
            key={cake.id}
            className="graduation-cake-card animate-fadeUp"
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <Link to={`/pastel/${cake.id}`} style={{ display: 'block', textDecoration: 'none' }}>
              <div className="graduation-cake-card__visual" style={{ height: '220px', background: 'var(--color-surface-2)' }}>
                {cake.image_url ? (
                  <img src={cake.image_url} alt={cake.name} className="graduation-cake-card__img" />
                ) : (
                  <span className="graduation-cake-card__emoji" style={{ fontSize: '3.5rem' }}>🎂</span>
                )}
                <div className="graduation-cake-card__tags">
                  <span className="graduation-cake-card__tag">{cake.category_name}</span>
                </div>
              </div>
            </Link>

            <div className="graduation-cake-card__body">
              <div className="graduation-cake-card__meta">
                <span className="graduation-cake-card__baker">{cake.business_name}</span>
                <span className="graduation-cake-card__price">${cake.price}</span>
              </div>
              <Link to={`/pastel/${cake.id}`} style={{ textDecoration: 'none' }}>
                <h2 className="graduation-cake-card__name font-serif">{cake.name}</h2>
              </Link>
              <p className="graduation-cake-card__specialty">📍 {cake.location}</p>
              <div className="graduation-cake-card__footer">
                <StarRating rating={Number(cake.rating)} size="sm" />
                <span className="graduation-cake-card__reviews">({cake.reviews_count})</span>
              </div>
              <Link to={`/repostero/${cake.baker_id}`} className="graduation-cake-card__cta">
                Ver perfil →
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default UIGraduation;
