import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import StarRating from '../components/ui/StarRating';
import CakeModal from '../components/ui/CakeModal';
import './ExplorePage.css';

const ExplorePage = () => {
  const { user, token, isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialCategory = searchParams.get('categoria') || 'Todas';

  const [cakes, setCakes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCake, setEditingCake] = useState(null);

  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');
  const [specialty, setSpecialty] = useState(initialCategory);

  // ── VARIABLES DE PAGINACIÓN (6 PASTELES) ─────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const cakesPerPage = 9; 

  const handleNavigateToEdit = () => {
    navigate('/edit-product');
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cakesRes, catsRes] = await Promise.all([
          fetch('http://localhost:4000/api/cakes'),
          fetch('http://localhost:4000/api/categories')
        ]);

        if (!cakesRes.ok || !catsRes.ok) {
          throw new Error('No se pudo obtener la información completa del servidor.');
        }

        const cakesData = await cakesRes.json();
        const catsData = await catsRes.json();

        if (cakesData.success) setCakes(cakesData.data);
        if (catsData.success) setCategories([{ id: 0, name: 'Todas', slug: 'Todas' }, ...catsData.data]);
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Error de conexión: Verifica que el servidor esté activo para cargar los pasteles.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.cake-card')) {
        setMenuOpenId(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Manejador del click en las categorías (Chips)
  const handleCategoryClick = (category) => {
    const nameLower = category.name.toLowerCase();
    const slugLower = category.slug ? category.slug.toLowerCase() : '';

    if (nameLower === 'bodas' || nameLower === 'boda' || slugLower === 'bodas' || slugLower === 'boda') {
      navigate('/wedding');
    } else if (nameLower === 'aniversario' || slugLower === 'aniversario') {
      navigate('/anniversary');
    } else if (nameLower === 'corporativo' || slugLower === 'corporativo') {
      navigate('/corporate');
    } else if (nameLower === 'baby-shower' || slugLower === 'baby-shower') {
      navigate('/babyshower');
    } else if (nameLower === 'graduación' || nameLower === 'graduacion' || slugLower === 'graduacion') {
      navigate('/graduation');
    } else if (nameLower === 'cumpleaños' || nameLower === 'cumpleanos' || slugLower === 'cumpleanos') {
      navigate('/birthday');
    } else if (nameLower === 'xv años' || slugLower === 'xv-anos') {
      navigate('/xv');
    } else {
      setSpecialty(category.name);
    }
  };

  const filtered = cakes.filter(cake => {
    const matchSearch = cake.name.toLowerCase().includes(search.toLowerCase()) ||
      cake.business_name.toLowerCase().includes(search.toLowerCase());
    const matchLocation = !location || cake.location.toLowerCase().includes(location.toLowerCase());
    const matchSpecialty = specialty === 'Todas' || cake.category_name === specialty || cake.category_slug === specialty;
    return matchSearch && matchLocation && matchSpecialty;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / cakesPerPage));
  const indexOfLastCake = currentPage * cakesPerPage;
  const indexOfFirstCake = indexOfLastCake - cakesPerPage;
  const currentCakes = filtered.slice(indexOfFirstCake, indexOfLastCake);

  const getPaginatedRange = () => {
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const half = Math.floor(maxVisible / 2);
    let start = Math.max(1, currentPage - half);
    const end = start + maxVisible - 1;

    if (end > totalPages) {
      start = totalPages - maxVisible + 1;
    }

    return Array.from({ length: maxVisible }, (_, i) => start + i);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [search, location, specialty]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="explore-page" id="explore-page">
      <div className="explore-page__header">
        <div className="container">
          <span className="explore-page__label">Galería de Pasteles</span>
          <h1 className="explore-page__title font-serif">
            Descubre <span className="gradient-text">creaciones únicas</span>
          </h1>
          <p className="explore-page__subtitle">
            Explora el trabajo de los mejores reposteros en tu área
          </p>

          <div className="explore-filters" id="explore-filters">
            <div className="explore-filters__main">
              <input
                id="filter-search"
                className="explore-filters__input"
                type="text"
                placeholder="Buscar pastel o repostero..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <input
                id="filter-location"
                className="explore-filters__input"
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
                  className={`explore-filters__chip ${specialty === s.name || specialty === s.slug ? 'explore-filters__chip--active' : ''}`}
                  onClick={() => handleCategoryClick(s)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="container explore-page__grid">
        {error && (
          <div className="explore-page__error glass">
            <span>⚠️</span>
            <p>{error}</p>
          </div>
        )}

        {loading ? (
          <p className="explore-page__empty">Cargando pasteles...</p>
        ) : filtered.length === 0 && !error ? (
          <p className="explore-page__empty">No se encontraron pasteles con ese criterio.</p>
        ) : currentCakes.map((cake, i) => (
          <article
            key={cake.id}
            className="cake-card animate-fadeUp"
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <div className="cake-card__visual" style={{ height: '220px', background: 'var(--color-surface-2)' }}>
              {cake.image_url ? (
                <img src={cake.image_url} alt={cake.name} className="cake-card__img" />
              ) : (
                <span className="cake-card__emoji" style={{ fontSize: '3.5rem' }}>🎂</span>
              )}
              <div className="cake-card__tags">
                <span className="cake-card__tag">{cake.category_name}</span>
              </div>
            </div>

            <div className="cake-card__body">
              <div className="cake-card__meta">
                <span className="cake-card__baker">{cake.business_name}</span>
                <span className="cake-card__price">${cake.price}</span>
              </div>
              <div className="cake-card__title-row">
                <Link to={`/pastel/${cake.id}`} style={{ textDecoration: 'none', flex: 1 }}>
                  <h2 className="cake-card__name font-serif">{cake.name}</h2>
                </Link>
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
              <p className="cake-card__specialty">📍 {cake.location}</p>
              <div className="cake-card__footer">
                <StarRating rating={Number(cake.rating)} size="sm" />
                <span className="cake-card__reviews">({cake.reviews_count})</span>
              </div>
              <Link to={`/repostero/${cake.baker_id}`} className="cake-card__cta">
                Ver perfil →
              </Link>
            </div>
          </article>
        ))}
      </div>

      {/* ── CONTROLES LIMPIOS DE 5 BOTONES SIN ELIPSIS ── */}
      {!loading && totalPages > 1 && (
        <div className="explore-pagination">
          <button
            disabled={currentPage === 1}
            className="explore-pagination__arrow"
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
          >
            ‹
          </button>

          <div className="explore-pagination__numbers">
            {getPaginatedRange().map((page) => (
              <button
                key={page}
                className={`explore-pagination__num ${page === currentPage ? 'explore-pagination__num--active' : ''}`}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            ))}
          </div>

          <button
            disabled={currentPage === totalPages}
            className="explore-pagination__arrow"
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
};

export default ExplorePage;