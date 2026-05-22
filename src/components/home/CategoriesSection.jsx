import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './CategoriesSection.css';

const CategoriesSection = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

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
            <Link
              key={cat.id}
              to={`/explorar?categoria=${cat.slug}`}
              className="category-card"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="category-card__icon">{cat.icon}</div>
              <h3 className="category-card__name font-serif">{cat.name}</h3>
              <div className="category-card__hover">
                <span>Ver más →</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CategoriesSection;
