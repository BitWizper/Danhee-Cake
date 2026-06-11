import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import StarRating from '../../components/ui/StarRating';
import './UI_wedding.css';

const UIWedding = () => {
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
          // Filtramos directamente desde la API para quedarnos SOLO con los de Bodas
          const weddingCakes = cakesData.data.filter(
            cake => cake.category_name === 'Bodas' || cake.category_slug === 'bodas'
          );
          setCakes(weddingCakes);
        }

        if (catsData.success) {
          setCategories([{ id: 0, name: 'Todas', slug: 'Todas' }, ...catsData.data]);
        }
      } catch (error) {
        console.error('Error fetching wedding data:', error);
        setError('Error de conexión: Verifica que el servidor esté activo para cargar los pasteles de bodas.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Manejador del click en las categorías para regresar o cambiar de sección
  const handleCategoryClick = (category) => {
    const nameLower = category.name.toLowerCase();
    const slugLower = category.slug ? category.slug.toLowerCase() : '';

    if (nameLower === 'bodas' || nameLower === 'boda' || slugLower === 'bodas' || slugLower === 'boda') {
      return; // ya estamos aquí
    } else if (nameLower === 'aniversario' || slugLower === 'aniversario') {
      navigate('/anniversary');
    } else if (nameLower === 'corporativo' || slugLower === 'corporativo') {
      navigate('/corporate');
    } else if (nameLower === 'graduación' || nameLower === 'graduacion' || slugLower === 'graduacion') {
      navigate('/graduation');
    } else {
      navigate(`/explorar?categoria=${category.name}`);
    }
  };

  // Filtros secundarios (por texto de búsqueda y por ubicación)
  const filteredWeddingCakes = cakes.filter(cake => {
    const matchSearch = cake.name.toLowerCase().includes(search.toLowerCase()) || 
                        cake.business_name.toLowerCase().includes(search.toLowerCase());
    const matchLocation = !location || cake.location.toLowerCase().includes(location.toLowerCase());
    return matchSearch && matchLocation;
  });

  return (
    <div className="wedding-page" id="wedding-page">
      <div className="wedding-page__header">
        <div className="container">
          <span className="wedding-page__label">Colección Exclusiva</span>
          <h1 className="wedding-page__title font-serif">
            Pasteles de <span className="gradient-text">Bodas</span>
          </h1>
          <p className="wedding-page__subtitle">
            Encuentra la creación perfecta para el día más especial de tu vida
          </p>

          <div className="wedding-filters" id="wedding-filters">
            <div className="wedding-filters__main">
              <input
                id="wedding-filter-search"
                className="wedding-filters__input"
                type="text"
                placeholder="Buscar pastel o repostero de bodas..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <input
                id="wedding-filter-location"
                className="wedding-filters__input"
                type="text"
                placeholder="Ubicación..."
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
            </div>
            
            {/* Bloque de botones integrado exactamente igual que en ExplorePage */}
            <div className="explore-filters__chips">
              {categories.map(s => (
                <button
                  key={s.id}
                  className={`explore-filters__chip ${s.name === 'Bodas' || s.name === 'Boda' || s.slug === 'bodas' ? 'explore-filters__chip--active' : ''}`}
                  onClick={() => handleCategoryClick(s)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="container wedding-page__grid">
        {error && (
          <div className="wedding-page__error glass">
            <span>⚠️</span>
            <p>{error}</p>
          </div>
        )}

        {loading ? (
          <p className="wedding-page__empty">Cargando pasteles de bodas...</p>
        ) : filteredWeddingCakes.length === 0 && !error ? (
          <p className="wedding-page__empty">No se encontraron pasteles de bodas con ese criterio.</p>
        ) : filteredWeddingCakes.map((cake, i) => (
          <article
            key={cake.id}
            className="wedding-cake-card animate-fadeUp"
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <Link to={`/pastel/${cake.id}`} style={{ display: 'block', textDecoration: 'none' }}>
              <div className="wedding-cake-card__visual" style={{ height: '220px', background: 'var(--color-surface-2)' }}>
                {cake.image_url ? (
                  <img src={cake.image_url} alt={cake.name} className="wedding-cake-card__img" />
                ) : (
                  <span className="wedding-cake-card__emoji" style={{ fontSize: '3.5rem' }}>🎂</span>
                )}
                <div className="wedding-cake-card__tags">
                  <span className="wedding-cake-card__tag">{cake.category_name}</span>
                </div>
              </div>
            </Link>

            <div className="wedding-cake-card__body">
              <div className="wedding-cake-card__meta">
                <span className="wedding-cake-card__baker">{cake.business_name}</span>
                <span className="wedding-cake-card__price">${cake.price}</span>
              </div>
              <Link to={`/pastel/${cake.id}`} style={{ textDecoration: 'none' }}>
                <h2 className="wedding-cake-card__name font-serif">{cake.name}</h2>
              </Link>
              <p className="wedding-cake-card__specialty">📍 {cake.location}</p>
              <div className="wedding-cake-card__footer">
                <StarRating rating={Number(cake.rating)} size="sm" />
                <span className="wedding-cake-card__reviews">({cake.reviews_count})</span>
              </div>
              <Link to={`/repostero/${cake.baker_id}`} className="wedding-cake-card__cta">
                Ver perfil →
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default UIWedding;