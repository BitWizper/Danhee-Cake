import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import StarRating from '../../components/ui/StarRating';
import './UI_BabyShower.css';

const BabyShower = () => {
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
                    const babyShowerCakes = cakesData.data.filter(
                        cake => cake.category_name === 'Baby Shower' || cake.category_slug === 'baby-shower'
                    );
                    setCakes(babyShowerCakes);
                }

                if (catsData.success) {
                    setCategories([{ id: 0, name: 'Todas', slug: 'Todas' }, ...catsData.data]);
                }
            } catch (error) {
                console.error('Error fetching baby shower data:', error);
                setError('Error de conexión: Verifica que el servidor esté activo para cargar los pasteles de baby shower.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleCategoryClick = (category) => {
        const nameLower = category.name.toLowerCase();
        const slugLower = category.slug ? category.slug.toLowerCase() : '';

        if (nameLower === 'baby shower' || slugLower === 'baby-shower') {
            return; // ya estamos en baby shower
        } else if (nameLower === 'aniversario' || slugLower === 'aniversario') {
            navigate('/anniversary');
        } else if (nameLower === 'cumpleaños' || slugLower === 'cumpleanos') {
            navigate('/birthday');
        } else if (nameLower === 'bodas' || nameLower === 'boda' || slugLower === 'bodas' || slugLower === 'boda') {
            navigate('/wedding');
        } else if (nameLower === 'corporativo' || slugLower === 'corporativo') {
            navigate('/corporate');
        } else if (nameLower === 'graduación' || nameLower === 'graduacion' || slugLower === 'graduacion') {
            navigate('/graduation');
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
        <div className="babyshower-page" id="babyshower-page">
            <div className="babyshower-page__header">
                <div className="container">
                    <span className="babyshower-page__label">Colección Especial</span>
                    <h1 className="babyshower-page__title font-serif">
                        Pasteles de <span className="gradient-text">Baby Shower</span>
                    </h1>
                    <p className="babyshower-page__subtitle">
                        Celebra la llegada de un nuevo integrante con un pastel tierno y lleno de amor
                    </p>

                    <div className="babyshower-filters" id="babyshower-filters">
                        <div className="babyshower-filters__main">
                            <input
                                id="babyshower-filter-search"
                                className="babyshower-filters__input"
                                type="text"
                                placeholder="Buscar pastel o repostero..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                            <input
                                id="babyshower-filter-location"
                                className="babyshower-filters__input"
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
                                    className={`explore-filters__chip ${s.name === 'Baby Shower' || s.slug === 'baby-shower' ? 'explore-filters__chip--active' : ''}`}
                                    onClick={() => handleCategoryClick(s)}
                                >
                                    {s.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="container babyshower-page__grid">
                {error && (
                    <div className="babyshower-page__error glass">
                        <span>⚠️</span>
                        <p>{error}</p>
                    </div>
                )}

                {loading ? (
                    <p className="babyshower-page__empty">Cargando pasteles de baby shower...</p>
                ) : filteredCakes.length === 0 && !error ? (
                    <p className="babyshower-page__empty">No se encontraron pasteles de baby shower con ese criterio.</p>
                ) : filteredCakes.map((cake, i) => (
                    <article
                        key={cake.id}
                        className="babyshower-cake-card animate-fadeUp"
                        style={{ animationDelay: `${i * 0.05}s` }}
                    >
                        <Link to={`/pastel/${cake.id}`} style={{ display: 'block', textDecoration: 'none' }}>
                            <div className="babyshower-cake-card__visual" style={{ height: '220px', background: 'var(--color-surface-2)' }}>
                                {cake.image_url ? (
                                    <img src={cake.image_url} alt={cake.name} className="babyshower-cake-card__img" />
                                ) : (
                                    <span className="babyshower-cake-card__emoji" style={{ fontSize: '3.5rem' }}>🍼</span>
                                )}
                                <div className="babyshower-cake-card__tags">
                                    <span className="babyshower-cake-card__tag">{cake.category_name}</span>
                                </div>
                            </div>
                        </Link>

                        <div className="babyshower-cake-card__body">
                            <div className="babyshower-cake-card__meta">
                                <span className="babyshower-cake-card__baker">{cake.business_name}</span>
                                <span className="babyshower-cake-card__price">${cake.price}</span>
                            </div>
                            <Link to={`/pastel/${cake.id}`} style={{ textDecoration: 'none' }}>
                                <h2 className="babyshower-cake-card__name font-serif">{cake.name}</h2>
                            </Link>
                            <p className="babyshower-cake-card__specialty">📍 {cake.location}</p>
                            <div className="babyshower-cake-card__footer">
                                <StarRating rating={Number(cake.rating)} size="sm" />
                                <span className="babyshower-cake-card__reviews">({cake.reviews_count})</span>
                            </div>
                            <Link to={`/repostero/${cake.baker_id}`} className="babyshower-cake-card__cta">
                                Ver perfil →
                            </Link>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
};

export default BabyShower;