import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import StarRating from '../../components/ui/StarRating';
import './UI_xv.css';

const UIXV = () => {
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
          // Filtrado exacto según tu BD: category_name 'XV Años' o category_slug 'xv-anos'
          const xvCakes = cakesData.data.filter(
            cake => cake.category_name === 'XV Años' || cake.category_slug === 'xv-anos'
          );
          setCakes(xvCakes);
        }

        if (catsData.success) {
          setCategories([{ id: 0, name: 'Todas', slug: 'Todas' }, ...catsData.data]);
        }
      } catch (error) {
        console.error('Error fetching XV años data:', error);
        setError('Error de conexión: Verifica que el servidor esté activo para cargar los pasteles de XV años.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleCategoryClick = (category) => {
    const nameLower = category.name.toLowerCase();
    const slugLower = category.slug ? category.slug.toLowerCase() : '';

    // Si es la misma categoría, no hacemos nada
    if (nameLower === 'xv años' || slugLower === 'xv-anos') {
      return;
    } else if (nameLower === 'bodas' || nameLower === 'boda' || slugLower === 'bodas' || slugLower === 'boda') {
      navigate('/wedding');
    } else if (nameLower === 'aniversario' || slugLower === 'aniversario') {
      navigate('/anniversary');
    } else if (nameLower === 'corporativo' || slugLower === 'corporativo') {
      navigate('/corporate');
    } else if (nameLower === 'graduación' || nameLower === 'graduacion' || slugLower === 'graduacion') {
      navigate('/graduation');
    } else if (nameLower === 'baby shower' || slugLower === 'baby-shower') {
      navigate('/babyshower');
    } else if (nameLower === 'cumpleaños' || nameLower === 'cumpleanos' || slugLower === 'cumpleanos') {
      navigate('/birthday');
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
    <div className="xv-page" id="xv-page">
      <div className="xv-page__header">
        <div className="container">
          <span className="xv-page__label">Colección Especial</span>
          <h1 className="xv-page__title font-serif">
            Pasteles de <span className="gradient-text">XV Años</span>
          </h1>
          <p className="xv-page__subtitle">
            Celebra tus quince primaveras con un pastel tan único como tú
          </p>

          <div className="xv-filters" id="xv-filters">
            <div className="xv-filters__main">
              <input
                id="xv-filter-search"
                className="xv-filters__input"
                type="text"
                placeholder="Buscar pastel o repostero..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <input
                id="xv-filter-location"
                className="xv-filters__input"
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
                  className={`explore-filters__chip ${
                    (s.name === 'XV Años' || s.slug === 'xv-anos') 
                      ? 'explore-filters__chip--active' 
                      : ''
                  }`}
                  onClick={() => handleCategoryClick(s)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="container xv-page__grid">
        {error && (
          <div className="xv-page__error glass">
            <span>⚠️</span>
            <p>{error}</p>
          </div>
        )}

        {loading ? (
          <p className="xv-page__empty">Cargando pasteles de XV años...</p>
        ) : filteredCakes.length === 0 && !error ? (
          <p className="xv-page__empty">No se encontraron pasteles de XV años con ese criterio.</p>
        ) : filteredCakes.map((cake, i) => (
          <article
            key={cake.id}
            className="xv-cake-card animate-fadeUp"
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <Link to={`/pastel/${cake.id}`} style={{ display: 'block', textDecoration: 'none' }}>
              <div className="xv-cake-card__visual" style={{ height: '220px', background: 'var(--color-surface-2)' }}>
                {cake.image_url ? (
                  <img src={cake.image_url} alt={cake.name} className="xv-cake-card__img" />
                ) : (
                  <span className="xv-cake-card__emoji" style={{ fontSize: '3.5rem' }}>👑</span>
                )}
                <div className="xv-cake-card__tags">
                  <span className="xv-cake-card__tag">{cake.category_name}</span>
                </div>
              </div>
            </Link>

            <div className="xv-cake-card__body">
              <div className="xv-cake-card__meta">
                <span className="xv-cake-card__baker">{cake.business_name}</span>
                <span className="xv-cake-card__price">${cake.price}</span>
              </div>
              <Link to={`/pastel/${cake.id}`} style={{ textDecoration: 'none' }}>
                <h2 className="xv-cake-card__name font-serif">{cake.name}</h2>
              </Link>
              <p className="xv-cake-card__specialty">📍 {cake.location}</p>
              <div className="xv-cake-card__footer">
                <StarRating rating={Number(cake.rating)} size="sm" />
                <span className="xv-cake-card__reviews">({cake.reviews_count})</span>
              </div>
              <Link to={`/repostero/${cake.baker_id}`} className="xv-cake-card__cta">
                Ver perfil →
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default UIXV;