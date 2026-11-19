import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/useAuth';
import { useCart } from '../context/useCart';
import { isCustomCartItem } from '../utils/cartItems';
import api from '../services/api';
import { calculateCartTotals } from '../utils/cartPricing';
import {
  clearCheckoutSession,
  getCheckoutRequestKey,
  hasCheckoutOrderAttempt,
  markCheckoutOrderAttempted,
  rotateCheckoutRequestKey
} from '../utils/checkoutSession';
import { formatPrice } from '../utils/pizzaPricing';

const loadRazorpayScript = () => {
  if (window.Razorpay) return Promise.resolve(true);

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

const CheckoutPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, clearCart } = useCart();
  const [deliveryAddress, setDeliveryAddress] = useState({
    fullName: user?.name || '',
    phone: user?.phone || '',
    address: '',
    city: '',
    postalCode: '',
    instructions: ''
  });
  const [loading, setLoading] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(null);
  const requestKey = useRef(null);
  const checkoutInFlight = useRef(false);
  const verificationInFlight = useRef(false);
  const totals = calculateCartTotals(items);

  const handleAddressChange = (event) => {
    const { name, value } = event.target;
    setDeliveryAddress((current) => ({ ...current, [name]: value }));

    if (pendingOrder || hasCheckoutOrderAttempt()) {
      setPendingOrder(null);
      requestKey.current = rotateCheckoutRequestKey(items);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (items.length === 0) {
      toast.error('Your cart is empty.');
      navigate('/cart');
      return;
    }

    if (checkoutInFlight.current) return;
    checkoutInFlight.current = true;
    setLoading(true);

    try {
      let order = pendingOrder;

      if (!order) {
        requestKey.current = getCheckoutRequestKey(items);
        markCheckoutOrderAttempted();
        const orderResponse = await api.post(
          '/orders',
          {
            items: items.map((item) => isCustomCartItem(item)
              ? { custom: item.custom, quantity: item.quantity }
              : ({
                  pizzaId: item.pizzaId,
                  size: item.size,
                  crust: item.crust,
                  toppings: item.toppings,
                  quantity: item.quantity
                })),
            deliveryAddress
          },
          {
            headers: {
              'Idempotency-Key': requestKey.current
            }
          }
        );
        order = orderResponse.data?.data?.order;

        if (!order?._id) {
          throw new Error('The server did not return an order.');
        }

        setPendingOrder(order);
      }

      const paymentResponse = await api.post('/payments/create-order', {
        orderId: order._id
      });
      const payment = paymentResponse.data?.data;

      if (!payment?.keyId || !payment.razorpayOrderId) {
        throw new Error('The server did not return payment details.');
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay) {
        throw new Error('Could not load the secure payment window. Check your connection and try again.');
      }

      let paymentFailureReported = false;
      const checkout = new window.Razorpay({
        key: payment.keyId,
        amount: payment.amount,
        currency: payment.currency,
        name: 'Pizza Delivery',
        description: 'Pizza order payment',
        order_id: payment.razorpayOrderId,
        prefill: {
          name: deliveryAddress.fullName,
          email: user?.email || '',
          contact: deliveryAddress.phone
        },
        notes: {
          orderId: order._id
        },
        handler: async (result) => {
          if (verificationInFlight.current) return;
          verificationInFlight.current = true;
          try {
            await api.post('/payments/verify', {
              orderId: order._id,
              razorpay_order_id: result.razorpay_order_id,
              razorpay_payment_id: result.razorpay_payment_id,
              razorpay_signature: result.razorpay_signature
            });
            clearCart();
            clearCheckoutSession();
            toast.success('Payment verified. Your order is confirmed.');
            navigate(`/orders/${order._id}`);
          } catch (verificationError) {
            toast.error(
              verificationError.response?.data?.message ||
              'Payment was received but could not be verified. Contact support with your payment ID.'
            );
          } finally {
            verificationInFlight.current = false;
            checkoutInFlight.current = false;
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            if (!verificationInFlight.current) {
              if (!paymentFailureReported) {
                toast.info('Checkout was closed. Your order is still unpaid; you can try again.');
              }
              checkoutInFlight.current = false;
              setLoading(false);
            }
          }
        }
      });

      checkout.on('payment.failed', (result) => {
        paymentFailureReported = true;
        toast.error(result.error?.description || 'Payment failed. You can try again.');
        checkoutInFlight.current = false;
        setLoading(false);
      });
      checkout.open();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Unable to start checkout.');
      checkoutInFlight.current = false;
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <main className="container py-5 text-center">
        <div className="empty-menu py-5">
          <h1 className="h3">Your cart is empty</h1>
          <Link to="/menu" className="btn btn-primary mt-3">Browse menu</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container py-5">
      <h1 className="h2 fw-bold mb-4">Checkout</h1>
      <div className="row g-4">
        <section className="col-lg-7">
          <form className="checkout-card" onSubmit={handleSubmit}>
            <h2 className="h5 fw-bold mb-3">Delivery details</h2>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label" htmlFor="fullName">Full name</label>
                <input className="form-control" id="fullName" name="fullName" value={deliveryAddress.fullName} onChange={handleAddressChange} required maxLength={80} />
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="phone">Phone number</label>
                <input className="form-control" id="phone" name="phone" type="tel" value={deliveryAddress.phone} onChange={handleAddressChange} required minLength={7} maxLength={20} />
              </div>
              <div className="col-12">
                <label className="form-label" htmlFor="address">Delivery address</label>
                <input className="form-control" id="address" name="address" value={deliveryAddress.address} onChange={handleAddressChange} required maxLength={200} />
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="city">City</label>
                <input className="form-control" id="city" name="city" value={deliveryAddress.city} onChange={handleAddressChange} required maxLength={80} />
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="postalCode">Postal code</label>
                <input className="form-control" id="postalCode" name="postalCode" value={deliveryAddress.postalCode} onChange={handleAddressChange} required minLength={4} maxLength={12} />
              </div>
              <div className="col-12">
                <label className="form-label" htmlFor="instructions">Delivery instructions <span className="text-muted">(optional)</span></label>
                <textarea className="form-control" id="instructions" name="instructions" rows="3" value={deliveryAddress.instructions} onChange={handleAddressChange} maxLength={500} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-lg w-100 mt-4" disabled={loading}>
              {loading ? 'Connecting to secure checkout...' : `Pay ${formatPrice(totals.total)} with Razorpay`}
            </button>
            <p className="small text-muted text-center mt-3 mb-0">Payments are processed in Razorpay test mode when test credentials are configured.</p>
          </form>
        </section>

        <aside className="col-lg-5">
          <div className="cart-summary">
            <h2 className="h5 fw-bold mb-3">Order summary</h2>
            {items.map((item) => (
              <div className="d-flex justify-content-between gap-3 mb-2" key={item.key}>
                <span>
                  {item.quantity} × {item.name}
                  {isCustomCartItem(item) ? (
                    <small className="d-block text-muted">
                      {item.size || item.customSummary?.size ? `Size: ${item.size || item.customSummary?.size}; ` : ''}
                      Base: {item.customSummary?.base || item.crust}{item.customSummary?.basePrice !== undefined ? ` (${formatPrice(item.customSummary.basePrice)})` : ''};{' '}
                      Sauce: {item.customSummary?.sauce || 'Custom'}{item.customSummary?.saucePrice !== undefined ? ` (${formatPrice(item.customSummary.saucePrice)})` : ''};{' '}
                      Cheese: {item.customSummary?.cheese || 'Custom'}{item.customSummary?.cheesePrice !== undefined ? ` (${formatPrice(item.customSummary.cheesePrice)})` : ''};{' '}
                      Vegetables:{' '}
                      {item.customSummary?.vegetableDetails && item.customSummary.vegetableDetails.length > 0
                        ? item.customSummary.vegetableDetails.map((v) => `${v.name} (${formatPrice(v.price)})`).join(', ')
                        : item.customSummary?.vegetables?.join(', ') || 'None'}
                    </small>
                  ) : (
                    <small className="text-muted"> ({item.size}, {item.crust})</small>
                  )}
                </span>
                <span>{formatPrice(item.price * item.quantity)}</span>
              </div>
            ))}
            <hr />
            <div className="d-flex justify-content-between mb-2"><span>Subtotal</span><span>{formatPrice(totals.subtotal)}</span></div>
            <div className="d-flex justify-content-between mb-2"><span>Tax</span><span>{formatPrice(totals.tax)}</span></div>
            <div className="d-flex justify-content-between mb-2"><span>Delivery</span><span>{totals.deliveryFee === 0 ? 'Free' : formatPrice(totals.deliveryFee)}</span></div>
            <div className="d-flex justify-content-between border-top pt-3 mt-3 fs-5"><strong>Total</strong><strong>{formatPrice(totals.total)}</strong></div>
          </div>
        </aside>
      </div>
    </main>
  );
};

export default CheckoutPage;
