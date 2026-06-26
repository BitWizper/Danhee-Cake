import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { useCart } from '../../context/CartContext';
import './UI_checkout_process.css';

const UICheckout = () => {
  const { cartItems, getTotalPrice, clearCart } = useCart();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);

  const [shipping, setShipping] = useState({ fullName: '', address: '', city: '', postal: '', phone: '' });
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [card, setCard] = useState({ number: '', name: '', exp: '', cvv: '' });
  const [processing, setProcessing] = useState(false);
  const [oxxoTicket, setOxxoTicket] = useState(null);

  const handleNext = async () => {
    if (step === 1) {
      if (!shipping.fullName || !shipping.address) {
        alert('Por favor completa la información de envío.');
        return;
      }
    }
    if (step === 2) {
      if (paymentMethod === 'card') {
        if (!card.number || !card.name || !card.exp || !card.cvv) {
          alert('Por favor completa los datos de la tarjeta.');
          return;
        }
      }
      // Si es OXXO, generar comprobante mock desde el servidor antes de avanzar
      if (paymentMethod === 'oxxo' && !oxxoTicket) {
        try {
          const resp = await fetch('http://localhost:4000/api/payments/oxxo-ticket', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: `TEMP-${Date.now()}`, amount: total })
          });
          const json = await resp.json();
          if (json.success) {
            setOxxoTicket(json.data);
          } else {
            alert('No se pudo generar el comprobante OXXO. Intenta de nuevo.');
            return;
          }
        } catch (err) {
          console.error('Error generando ticket OXXO:', err);
          alert('Error de conexión al generar comprobante OXXO.');
          return;
        }
      }
    }
    setStep(prev => prev + 1);
  };

  const handleBack = () => setStep(prev => Math.max(1, prev - 1));

  const handleConfirm = () => {
    const ok = window.confirm('¿Estás seguro de que deseas realizar el pago ahora?');
    if (!ok) return;
    setProcessing(true);
    // Simular procesamiento de pago
    setTimeout(() => {
      setProcessing(false);
      clearCart();
      alert('Pago realizado con éxito. ¡Gracias por tu compra!');
      navigate('/');
    }, 1800);
  };

  const total = getTotalPrice();

  return (
    <div className="checkout-page" id="checkout-page">
      <div className="container checkout-content">
        <h1 className="font-serif">Proceso de Pago</h1>
        <div className="checkout-grid">
          <div className="checkout-main">
            <div className="checkout-steps">
              <div className={`step ${step === 1 ? 'active' : ''}`}>1. Envío</div>
              <div className={`step ${step === 2 ? 'active' : ''}`}>2. Pago</div>
              <div className={`step ${step === 3 ? 'active' : ''}`}>3. Revisión</div>
            </div>

            {step === 1 && (
              <section className="checkout-section">
                <h2 className="section-title">Dirección de Envío</h2>
                <div className="form-grid">
                  <input placeholder="Nombre completo" value={shipping.fullName} onChange={e => setShipping({...shipping, fullName: e.target.value})} />
                  <input placeholder="Dirección" value={shipping.address} onChange={e => setShipping({...shipping, address: e.target.value})} />
                  <input placeholder="Ciudad" value={shipping.city} onChange={e => setShipping({...shipping, city: e.target.value})} />
                  <input placeholder="Código Postal" value={shipping.postal} onChange={e => setShipping({...shipping, postal: e.target.value})} />
                  <input placeholder="Teléfono" value={shipping.phone} onChange={e => setShipping({...shipping, phone: e.target.value})} />
                </div>
                <div className="checkout-actions">
                  <Button variant="outline" onClick={() => navigate('/carrito')}>Volver al Carrito</Button>
                  <Button onClick={handleNext}>Continuar a Pago</Button>
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="checkout-section">
                <h2 className="section-title">Método de Pago</h2>
                <div className="payment-options">
                  <label className={`payment-option ${paymentMethod === 'card' ? 'selected' : ''}`}>
                    <input type="radio" name="pm" checked={paymentMethod === 'card'} onChange={() => setPaymentMethod('card')} />
                    Tarjeta de Crédito / Débito
                  </label>
                  <label className={`payment-option ${paymentMethod === 'oxxo' ? 'selected' : ''}`}>
                    <input type="radio" name="pm" checked={paymentMethod === 'oxxo'} onChange={() => setPaymentMethod('oxxo')} />
                    Pago en OXXO
                  </label>
                  <label className={`payment-option ${paymentMethod === 'paypal' ? 'selected' : ''}`}>
                    <input type="radio" name="pm" checked={paymentMethod === 'paypal'} onChange={() => setPaymentMethod('paypal')} />
                    PayPal / Otros
                  </label>
                </div>

                {paymentMethod === 'card' && (
                  <div className="card-form">
                    <input placeholder="Número de tarjeta" value={card.number} onChange={e => setCard({...card, number: e.target.value})} />
                    <input placeholder="Nombre en la tarjeta" value={card.name} onChange={e => setCard({...card, name: e.target.value})} />
                    <div className="card-row">
                      <input placeholder="MM/AA" value={card.exp} onChange={e => setCard({...card, exp: e.target.value})} />
                      <input placeholder="CVV" value={card.cvv} onChange={e => setCard({...card, cvv: e.target.value})} />
                    </div>
                  </div>
                )}

                {paymentMethod === 'oxxo' && (
                  <div className="oxxo-info">
                    <p>Se generará un comprobante para pagar en OXXO. Tendrás 48 horas para realizar el pago.</p>
                  </div>
                )}

                <div className="checkout-actions">
                  <Button variant="outline" onClick={handleBack}>Volver</Button>
                  <Button onClick={handleNext}>Continuar a Revisión</Button>
                </div>
              </section>
            )}

            {step === 3 && (
              <section className="checkout-section">
                <h2 className="section-title">Revisa y Confirma</h2>
                {paymentMethod === 'oxxo' && oxxoTicket && (
                  <div className="oxxo-ticket-box">
                    <h4>Comprobante OXXO</h4>
                    <p><strong>Código:</strong> {oxxoTicket.reference}</p>
                    <p><strong>Vence:</strong> {new Date(oxxoTicket.expiresAt).toLocaleString()}</p>
                    <p>{oxxoTicket.instructions}</p>
                    <div style={{display:'flex',gap:8,marginTop:8}}>
                      <button onClick={() => navigator.clipboard.writeText(oxxoTicket.reference)}>Copiar código</button>
                      <a href={oxxoTicket.printUrl} target="_blank" rel="noreferrer">Imprimir comprobante</a>
                    </div>
                  </div>
                )}

                <div className="order-review">
                  {cartItems.map(item => (
                    <div key={item.id} className="review-item">
                      <div className="review-item__left">
                        <img src={item.image_url || 'https://via.placeholder.com/80'} alt={item.name} />
                        <div>
                          <strong>{item.name}</strong>
                          <div className="muted">{item.business_name} • {item.quantity} x ${item.price}</div>
                        </div>
                      </div>
                      <div className="review-item__right">${(item.price * item.quantity).toFixed(2)}</div>
                    </div>
                  ))}
                </div>

                <div className="checkout-summary">
                  <div><span>Subtotal</span><span>${total.toFixed(2)}</span></div>
                  <div><span>Envío</span><span>Por confirmar</span></div>
                  <div className="total-row"><span>Total</span><span>${total.toFixed(2)}</span></div>
                </div>

                <div className="checkout-actions">
                  <Button variant="outline" onClick={handleBack}>Volver</Button>
                  <Button onClick={handleConfirm} disabled={processing}>{processing ? 'Procesando...' : 'Confirmar Pago'}</Button>
                </div>
              </section>
            )}
          </div>

          <aside className="checkout-side">
            <div className="side-box">
              <h3>Resumen</h3>
              <p>{cartItems.length} artículos</p>
              <p className="side-total">Total: <strong>${total.toFixed(2)}</strong></p>
              <div className="help-note muted">Soporte: si tienes dudas, contacta al repostero o al soporte.</div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default UICheckout;
