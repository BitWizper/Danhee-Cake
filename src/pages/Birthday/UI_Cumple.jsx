import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import StarRating from '../../components/ui/StarRating';
import '../Birthday/UI_Cumple.css';

const Cumpleanos = () => {
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
                    const birthdayCakes = cakesData.data.filter(
                        cake => cake.category_name === 'Cumpleaños' || cake.category_slug === 'cumpleanos'
                    );
                    setCakes(birthdayCakes);
                }

                if (catsData.success) {
                    setCategories([{ id: 0, name: 'Todas', slug: 'Todas' }, ...catsData.data]);
                }
            } catch (error) {
                console.error('Error fetching birthday data:', error);
                setError('Error de conexión: Verifica que el servidor esté activo para cargar los pasteles de cumpleaños.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleCategoryClick = (category) => {
        const nameLower = category.name.toLowerCase();
        const slugLower = category.slug ? category.slug.toLowerCase() : '';

        if (nameLower === 'cumpleaños' || slugLower === 'cumpleanos') {
            return; // ya estamos en cumpleaños
        } else if (nameLower === 'aniversario' || slugLower === 'aniversario') {
            navigate('/anniversary');
        } else if (nameLower === 'bodas' || nameLower === 'boda' || slugLower === 'bodas' || slugLower === 'boda') {
            navigate('/wedding');
        } else if (nameLower === 'corporativo' || slugLower === 'corporativo') {
            navigate('/corporate');
        } else if (nameLower === 'graduación' || nameLower === 'graduacion' || slugLower === 'graduacion') {
            navigate('/graduation');
        } else if (nameLower === 'baby shower' || slugLower === 'baby-shower') {
            navigate('/babyshower');
        } else if (nameLower === 'xv años' || slugLower === 'xv-anos') {
            navigate('/xv');
        } else {
            navigate(`/explorar?cate    goria=${category.name}`);
        }
    };

    const filteredCakes = cakes.filter(cake => {
        const matchSearch = cake.name.toLowerCase().includes(search.toLowerCase()) ||
            cake.business_name.toLowerCase().includes(search.toLowerCase());
        const matchLocation = !location || cake.location.toLowerCase().includes(location.toLowerCase());
        return matchSearch && matchLocation;
    });

    return (
        <div className="birthday-page" id="birthday-page">
            <div className="birthday-page__header">
                <div className="container">
                    <span className="birthday-page__label">Colección Especial</span>
                    <h1 className="birthday-page__title font-serif">
                        Pasteles de <span className="gradient-text">Cumpleaños</span>
                    </h1>
                    <p className="birthday-page__subtitle">
                        Celebra un año más de vida con un pastel único y personalizado
                    </p>

                    <div className="birthday-filters" id="birthday-filters">
                        <div className="birthday-filters__main">
                            <input
                                id="birthday-filter-search"
                                className="birthday-filters__input"
                                type="text"
                                placeholder="Buscar pastel o repostero..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                            <input
                                id="birthday-filter-location"
                                className="birthday-filters__input"
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
                                    className={`explore-filters__chip ${s.name === 'Cumpleaños' || s.slug === 'cumpleanos' ? 'explore-filters__chip--active' : ''}`}
                                    onClick={() => handleCategoryClick(s)}
                                >
                                    {s.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="container birthday-page__grid">
                {error && (
                    <div className="birthday-page__error glass">
                        <span>⚠️</span>
                        <p>{error}</p>
                    </div>
                )}

                {loading ? (
                    <p className="birthday-page__empty">Cargando pasteles de cumpleaños...</p>
                ) : filteredCakes.length === 0 && !error ? (
                    <p className="birthday-page__empty">No se encontraron pasteles de cumpleaños con ese criterio.</p>
                ) : filteredCakes.map((cake, i) => (
                    <article
                        key={cake.id}
                        className="birthday-cake-card animate-fadeUp"
                        style={{ animationDelay: `${i * 0.05}s` }}
                    >
                        <Link to={`/pastel/${cake.id}`} style={{ display: 'block', textDecoration: 'none' }}>
                            <div className="birthday-cake-card__visual" style={{ height: '220px', background: 'var(--color-surface-2)' }}>
                                {cake.image_url ? (
                                    <img src={cake.image_url} alt={cake.name} className="birthday-cake-card__img" />
                                ) : (
                                    <span className="birthday-cake-card__emoji" style={{ fontSize: '3.5rem' }}>🎂</span>
                                )}
                                <div className="birthday-cake-card__tags">
                                    <span className="birthday-cake-card__tag">{cake.category_name}</span>
                                </div>
                            </div>
                        </Link>

                        <div className="birthday-cake-card__body">
                            <div className="birthday-cake-card__meta">
                                <span className="birthday-cake-card__baker">{cake.business_name}</span>
                                <span className="birthday-cake-card__price">${cake.price}</span>
                            </div>
                            <Link to={`/pastel/${cake.id}`} style={{ textDecoration: 'none' }}>
                                <h2 className="birthday-cake-card__name font-serif">{cake.name}</h2>
                            </Link>
                            <p className="birthday-cake-card__specialty">📍 {cake.location}</p>
                            <div className="birthday-cake-card__footer">
                                <StarRating rating={Number(cake.rating)} size="sm" />
                                <span className="birthday-cake-card__reviews">({cake.reviews_count})</span>
                            </div>
                            <Link to={`/repostero/${cake.baker_id}`} className="birthday-cake-card__cta">
                                Ver perfil →
                            </Link>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
};

export default Cumpleanos;