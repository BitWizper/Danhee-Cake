import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import './UI_cart.css';

const UICart = () => {
  const { cartItems, removeFromCart, updateQuantity, getTotalPrice, clearCart } = useCart();

  return (
    <div className="cart-page" id="cart-page">
      <div className="container cart-page__content">
        <h1 className="cart-page__title font-serif">Mi Carrito de Compras</h1>

        {cartItems.length === 0 ? (
          <div className="cart-page__empty">
            <span className="cart-page__empty-icon">🛒</span>
            <h2>Tu carrito está vacío</h2>
            <p>Explora nuestros deliciosos pasteles y agrega algunos a tu carrito.</p>
            <Link to="/explorar" className="cart-page__cta">
              ← Volver a Explorar
            </Link>
          </div>
        ) : (
          <div className="cart-page__layout">
            {/* Items */}
            <div className="cart-page__items">
              {cartItems.map(item => (
                <article key={item.id} className="cart-item">
                  <div className="cart-item__image">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} />
                    ) : (
                      <span className="cart-item__emoji">🎂</span>
                    )}
                  </div>

                  <div className="cart-item__info">
                    <h3 className="cart-item__name">{item.name}</h3>
                    <p className="cart-item__baker">{item.business_name}</p>
                    <p className="cart-item__category">{item.category_name}</p>
                  </div>

                  <div className="cart-item__quantity">
                    <button
                      className="cart-item__btn-qty"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={e => updateQuantity(item.id, parseInt(e.target.value) || 1)}
                      className="cart-item__qty-input"
                      min="1"
                    />
                    <button
                      className="cart-item__btn-qty"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    >
                      +
                    </button>
                  </div>

                  <div className="cart-item__price">
                    <span className="cart-item__price-label">Precio unitario</span>
                    <span className="cart-item__price-value">${item.price}</span>
                  </div>

                  <div className="cart-item__subtotal">
                    <span className="cart-item__subtotal-label">Subtotal</span>
                    <span className="cart-item__subtotal-value">${(item.price * item.quantity).toFixed(2)}</span>
                  </div>

                  <button
                    className="cart-item__remove"
                    onClick={() => removeFromCart(item.id)}
                    title="Eliminar del carrito"
                  >
                    ✕
                  </button>
                </article>
              ))}
            </div>

            {/* Resumen */}
            <aside className="cart-page__summary">
              <h2 className="cart-page__summary-title">Resumen del Pedido</h2>

              <div className="cart-page__summary-row">
                <span>Subtotal</span>
                <span>${getTotalPrice().toFixed(2)}</span>
              </div>

              <div className="cart-page__summary-row">
                <span>Envío</span>
                <span className="cart-page__summary-pending">Por confirmar</span>
              </div>

              <div className="cart-page__summary-row">
                <span>Impuestos</span>
                <span className="cart-page__summary-pending">Por confirmar</span>
              </div>

              <div className="cart-page__summary-divider"></div>

              <div className="cart-page__summary-total">
                <span>Total</span>
                <span>${getTotalPrice().toFixed(2)}</span>
              </div>

              <button className="cart-page__checkout">
                Proceder al Pago
              </button>

              <button
                className="cart-page__continue-shopping"
                onClick={() => window.history.back()}
              >
                ← Seguir Comprando
              </button>

              <button
                className="cart-page__clear-cart"
                onClick={clearCart}
              >
                Limpiar Carrito
              </button>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
};

export default UICart;
