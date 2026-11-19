import { Link } from 'react-router-dom';
import { useCart } from '../context/useCart';
import { isCustomCartItem } from '../utils/cartItems';
import { formatPrice } from '../utils/pizzaPricing';
import { calculateCartTotals } from '../utils/cartPricing';
import { getImageUrl } from '../utils/imageUrl';

const CartPage = () => {
  const { items, updateQuantity, removeItem, clearCart } = useCart();
  const { subtotal, tax, deliveryFee, total } = calculateCartTotals(items);

  if (items.length === 0) {
    return (
      <main className="container py-5 text-center">
        <div className="empty-menu py-5">
          <div className="display-5 mb-2" aria-hidden="true">🛒</div>
          <h1 className="h3">Your cart is empty</h1>
          <p className="text-muted mb-3">Choose a pizza from the menu to get started.</p>
          <Link to="/menu" className="btn btn-primary">Browse menu</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container py-5">
      <div className="d-flex justify-content-between align-items-center gap-3 mb-4">
        <div>
          <h1 className="h2 fw-bold mb-1">Your cart</h1>
          <p className="text-muted mb-0">{items.length} customized item{items.length === 1 ? '' : 's'}</p>
        </div>
        <button type="button" className="btn btn-outline-danger btn-sm" onClick={clearCart}>Clear cart</button>
      </div>

      <div className="row g-4">
        <div className="col-lg-8">
          <div className="d-grid gap-3">
            {items.map((item) => {
              const isCustom = isCustomCartItem(item);

              return (
                <article className="cart-item" key={item.key}>
                  <img
                    src={getImageUrl(item.image)}
                    alt=""
                    className="cart-item-image"
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = getImageUrl();
                    }}
                  />
                  <div className="flex-grow-1">
                    <div className="cart-item-heading d-flex justify-content-between gap-3">
                      <div>
                        <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                          <h2 className="h5 fw-bold mb-0">{item.name}</h2>
                          {isCustom && (
                            <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill px-2.5 py-1">
                              🍕 {item.size || item.customSummary?.size || 'Regular (8")'}
                            </span>
                          )}
                        </div>

                        {isCustom ? (
                          <div className="cart-ingredient-box my-2">
                            {/* Base, Sauce, Cheese row */}
                            <div className="row g-2 mb-2 pb-2 border-bottom border-light-subtle small">
                              <div className="col-sm-4 col-12">
                                <span className="text-muted d-block text-uppercase fw-semibold" style={{ fontSize: '0.72rem' }}>
                                  Crust Base
                                </span>
                                <div className="fw-semibold text-dark">
                                  {item.customSummary?.base || item.crust}
                                </div>
                                <span className="text-secondary" style={{ fontSize: '0.8rem' }}>
                                  {item.customSummary?.basePrice !== undefined ? formatPrice(item.customSummary.basePrice) : ''}
                                  {item.customSummary?.sizeUpcharge > 0 && ` (+${formatPrice(item.customSummary.sizeUpcharge)} size)`}
                                </span>
                              </div>
                              <div className="col-sm-4 col-12">
                                <span className="text-muted d-block text-uppercase fw-semibold" style={{ fontSize: '0.72rem' }}>
                                  Sauce
                                </span>
                                <div className="fw-semibold text-dark">
                                  {item.customSummary?.sauce || 'Custom'}
                                </div>
                                <span className="text-secondary" style={{ fontSize: '0.8rem' }}>
                                  {item.customSummary?.saucePrice !== undefined ? formatPrice(item.customSummary.saucePrice) : ''}
                                </span>
                              </div>
                              <div className="col-sm-4 col-12">
                                <span className="text-muted d-block text-uppercase fw-semibold" style={{ fontSize: '0.72rem' }}>
                                  Cheese
                                </span>
                                <div className="fw-semibold text-dark">
                                  {item.customSummary?.cheese || 'Custom'}
                                </div>
                                <span className="text-secondary" style={{ fontSize: '0.8rem' }}>
                                  {item.customSummary?.cheesePrice !== undefined ? formatPrice(item.customSummary.cheesePrice) : ''}
                                </span>
                              </div>
                            </div>

                            {/* Fresh Vegetables Tags */}
                            <div className="small">
                              <div className="d-flex justify-content-between align-items-center mb-1">
                                <span className="fw-semibold text-secondary text-uppercase" style={{ fontSize: '0.72rem' }}>
                                  Fresh Vegetables {item.customSummary?.vegetableDetails?.length ? `(${item.customSummary.vegetableDetails.length})` : ''}
                                </span>
                                {item.customSummary?.vegetableDetails && item.customSummary.vegetableDetails.length > 0 && (
                                  <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                                    Total: {formatPrice(item.customSummary.vegetableDetails.reduce((sum, v) => sum + (v.price || 0), 0))}
                                  </span>
                                )}
                              </div>

                              {item.customSummary?.vegetableDetails && item.customSummary.vegetableDetails.length > 0 ? (
                                <div className="d-flex flex-wrap gap-1 mt-1">
                                  {item.customSummary.vegetableDetails.map((veg, index) => (
                                    <span key={index} className="cart-veg-chip">
                                      <span className="text-success" aria-hidden="true">●</span>
                                      <span>{veg.name}</span>
                                      <span className="fw-semibold text-dark ms-1">{formatPrice(veg.price)}</span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-muted fst-italic" style={{ fontSize: '0.82rem' }}>
                                  {item.customSummary?.vegetables?.length
                                    ? item.customSummary.vegetables.join(', ')
                                    : 'No vegetables selected'}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-muted small mb-1">{item.size} · {item.crust}</p>
                        )}
                        {!isCustom && item.toppings.length > 0 && (
                          <p className="text-muted small mb-2">Toppings: {item.toppings.join(', ')}</p>
                        )}
                      </div>
                      <div className="text-end">
                        <strong className="d-block">{formatPrice(item.price * item.quantity)}</strong>
                        {item.quantity > 1 && (
                          <small className="text-muted">({formatPrice(item.price)} each)</small>
                        )}
                      </div>
                    </div>
                    <div className="cart-item-controls d-flex justify-content-between align-items-center">
                      <div className="quantity-control" aria-label={`Quantity for ${item.name}`}>
                        <button type="button" aria-label="Decrease quantity" onClick={() => updateQuantity(item.key, item.quantity - 1)} disabled={item.quantity <= 1}>−</button>
                        <span>{item.quantity}</span>
                        <button type="button" aria-label="Increase quantity" onClick={() => updateQuantity(item.key, item.quantity + 1)} disabled={item.quantity >= item.stock}>+</button>
                      </div>
                      <div className="cart-item-actions">
                        <Link
                          className="cart-action-button cart-action-edit"
                          to={isCustom
                            ? `/builder?edit=${encodeURIComponent(item.key)}`
                            : `/pizza/${item.pizzaId}?edit=${encodeURIComponent(item.key)}`}
                        >
                          <i className="bi bi-pencil-square" aria-hidden="true" />
                          Edit
                        </Link>
                        <button
                          type="button"
                          className="cart-action-button cart-action-remove"
                          onClick={() => removeItem(item.key)}
                        >
                          <i className="bi bi-trash3" aria-hidden="true" />
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="col-lg-4">
          <div className="cart-summary">
            <h2 className="h5 fw-bold mb-3">Order summary</h2>
            <div className="d-flex justify-content-between mb-3">
              <span>Subtotal</span>
              <strong>{formatPrice(subtotal)}</strong>
            </div>
            <div className="d-flex justify-content-between mb-3">
              <span>Tax (5%)</span>
              <span>{formatPrice(tax)}</span>
            </div>
            <div className="d-flex justify-content-between mb-3">
              <span>Delivery</span>
              <span>{deliveryFee === 0 ? 'Free' : formatPrice(deliveryFee)}</span>
            </div>
            <div className="d-flex justify-content-between border-top pt-3 mb-3 fs-5">
              <strong>Total</strong>
              <strong>{formatPrice(total)}</strong>
            </div>
            <p className="small text-muted mb-3">Free delivery on orders of ₹499 or more. Tax is calculated at 5%.</p>
            <Link to="/checkout" className="btn btn-primary w-100 mb-2">Proceed to checkout</Link>
            <Link to="/menu" className="btn btn-primary w-100">Continue shopping</Link>
          </div>
        </aside>
      </div>
    </main>
  );
};

export default CartPage;
