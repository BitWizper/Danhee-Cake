import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import StarRating from '../../components/ui/StarRating';
import './UI_Anniversary.css';

const UIAnniversary = () => {
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
          fetch('/api/cakes'),
          fetch('/api/categories')
        ]);
        
        if (!cakesRes.ok || !catsRes.ok) {
          throw new Error('No se pudo obtener la información de los pasteles del servidor.');
        }

        const cakesData = await cakesRes.json();
        const catsData = await catsRes.json();
        
        if (cakesData.success) {
          const anniversaryCakes = cakesData.data.filter(
            cake => cake.category_name === 'Aniversario' || cake.category_slug === 'aniversario'
          );
          setCakes(anniversaryCakes);
        }

        if (catsData.success) {
          setCategories([{ id: 0, name: 'Todas', slug: 'Todas' }, ...catsData.data]);
        }
      } catch (error) {
        console.error('Error fetching anniversary data:', error);
        setError('Error de conexión: Verifica que el servidor esté activo para cargar los pasteles de aniversario.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleCategoryClick = (category) => {
    const nameLower = category.name.toLowerCase();
    const slugLower = category.slug ? category.slug.toLowerCase() : '';

    if (nameLower === 'aniversario' || slugLower === 'aniversario') {
      return; // ya estamos aquí
    } else if (nameLower === 'bodas' || nameLower === 'boda' || slugLower === 'bodas' || slugLower === 'boda') {
      navigate('/wedding');
    } else if (nameLower === 'corporativo' || slugLower === 'corporativo') {
      navigate('/corporate');
    } else if (nameLower === 'graduación' || nameLower === 'graduacion' || slugLower === 'graduacion') {
      navigate('/graduation');
    } else if (nameLower === 'baby shower' || slugLower === 'baby-shower') {
      navigate('/babyshower');
    } else if (nameLower === 'cumpleaños' || nameLower === 'cumpleanos' || slugLower === 'cumpleanos') {
      navigate('/birthday');
    } else if (nameLower === 'xv años' || slugLower === 'xv-anos') {
      navigate('/xv');  
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
    <div className="anniversary-page" id="anniversary-page">
      <div className="anniversary-page__header">
        <div className="container">
          <span className="anniversary-page__label">Colección Especial</span>
          <h1 className="anniversary-page__title font-serif">
            Pasteles de <span className="gradient-text">Aniversario</span>
          </h1>
          <p className="anniversary-page__subtitle">
            Celebra el amor y el tiempo compartido con un pastel inolvidable
          </p>

          <div className="anniversary-filters" id="anniversary-filters">
            <div className="anniversary-filters__main">
              <input
                id="anniversary-filter-search"
                className="anniversary-filters__input"
                type="text"
                placeholder="Buscar pastel o repostero..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <input
                id="anniversary-filter-location"
                className="anniversary-filters__input"
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
                  className={`explore-filters__chip ${s.name === 'Aniversario' || s.slug === 'aniversario' ? 'explore-filters__chip--active' : ''}`}
                  onClick={() => handleCategoryClick(s)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="container anniversary-page__grid">
        {error && (
          <div className="anniversary-page__error glass">
            <span>⚠️</span>
            <p>{error}</p>
          </div>
        )}

        {loading ? (
          <p className="anniversary-page__empty">Cargando pasteles de aniversario...</p>
        ) : filteredCakes.length === 0 && !error ? (
          <p className="anniversary-page__empty">No se encontraron pasteles de aniversario con ese criterio.</p>
        ) : filteredCakes.map((cake, i) => (
          <article
            key={cake.id}
            className="anniversary-cake-card animate-fadeUp"
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <Link to={`/pastel/${cake.id}`} style={{ display: 'block', textDecoration: 'none' }}>
              <div className="anniversary-cake-card__visual" style={{ height: '220px', background: 'var(--color-surface-2)' }}>
                {cake.image_url ? (
                  <img src={cake.image_url} alt={cake.name} className="anniversary-cake-card__img" />
                ) : (
                  <span className="anniversary-cake-card__emoji" style={{ fontSize: '3.5rem' }}>🎂</span>
                )}
                <div className="anniversary-cake-card__tags">
                  <span className="anniversary-cake-card__tag">{cake.category_name}</span>
                </div>
              </div>
            </Link>

            <div className="anniversary-cake-card__body">
              <div className="anniversary-cake-card__meta">
                <span className="anniversary-cake-card__baker">{cake.business_name}</span>
                <span className="anniversary-cake-card__price">${cake.price}</span>
              </div>
              <Link to={`/pastel/${cake.id}`} style={{ textDecoration: 'none' }}>
                <h2 className="anniversary-cake-card__name font-serif">{cake.name}</h2>
              </Link>
              <p className="anniversary-cake-card__specialty">📍 {cake.location}</p>
              <div className="anniversary-cake-card__footer">
                <StarRating rating={Number(cake.rating)} size="sm" />
                <span className="anniversary-cake-card__reviews">({cake.reviews_count})</span>
              </div>
              <Link to={`/repostero/${cake.baker_id}`} className="anniversary-cake-card__cta">
                Ver perfil →
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default UIAnniversary;
