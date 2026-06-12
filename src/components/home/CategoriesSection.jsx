import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom'; // ← Agregamos useNavigate
import './CategoriesSection.css';

const CategoriesSection = () => {
  const navigate = useNavigate(); // ← Hook para redirigir
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Función que devuelve la ruta específica para ciertas categorías
  const getRouteForCategory = (category) => {
    const name = category.name.toLowerCase();
    const slug = category.slug?.toLowerCase() || '';

    if (name === 'xv años' || slug === 'xv-anos') return '/xv';
    if (name === 'boda' || slug === 'boda') return '/wedding';
    if (name === 'baby shower' || slug === 'baby-shower') return '/babyshower';
    if (name === 'cumpleaños' || slug === 'cumpleanos') return '/birthday';
    if (name === 'aniversario' || slug === 'aniversario') return '/anniversary';
    if (name === 'graduación' || slug === 'graduacion') return '/graduation';
    if (name === 'corporativo' || slug === 'corporativo') return '/corporate';
    // Para cualquier otra (ej. Sin Ocasión) usamos el explorador con filtro
    return `/explorar?categoria=${encodeURIComponent(category.slug || category.name)}`;
  };

  const handleCategoryClick = (category) => {
    const route = getRouteForCategory(category);
    navigate(route);
  };

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('http://localhost:4000/api/categories');
        const result = await response.json();
        if (result.success) {
          setCategories(result.data);
        }
      } catch (error) {
        console.error('Error fetching categories:', error);
        // Fallback si la API no está lista
        setCategories([
          { id: 1, name: 'XV Años', icon: '👑', slug: 'xv-anos' },
          { id: 2, name: 'Boda', icon: '💍', slug: 'boda' },
          { id: 3, name: 'Baby Shower', icon: '🍼', slug: 'baby-shower' },
          { id: 4, name: 'Cumpleaños', icon: '🎂', slug: 'cumpleanos' },
          { id: 5, name: 'Aniversario', icon: '💑', slug: 'aniversario' },
          { id: 6, name: 'Graduación', icon: '🎓', slug: 'graduacion' },
          { id: 7, name: 'Corporativo', icon: '🏢', slug: 'corporativo' },
          { id: 8, name: 'Sin Ocasión', icon: '✨', slug: 'sin-ocasion' },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  return (
    <section className="categories section" id="categories">
      <div className="container">
        <div className="categories__header">
          <span className="featured__label">Nuestras especialidades</span>
          <h2 className="featured__title font-serif">
            Explora por <span className="gradient-text">categoría</span>
          </h2>
          <span className="gold-divider" />
        </div>

        <div className="categories__grid">
          {categories.map((cat, i) => (
            <div
              key={cat.id}
              className="category-card"
              style={{ animationDelay: `${i * 0.1}s` }}
              onClick={() => handleCategoryClick(cat)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleCategoryClick(cat)}
            >
              <div className="category-card__icon">{cat.icon}</div>
              <h3 className="category-card__name font-serif">{cat.name}</h3>
              <div className="category-card__hover">
                <span>Ver más →</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CategoriesSection;