import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';
import { connectOrderSocket } from '../services/orderSocket';
import { formatPrice } from '../utils/pizzaPricing';
import OrderProgress from '../components/OrderProgress';
import LoadingSpinner from '../components/common/LoadingSpinner';

const OrderDetailsPage = () => {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const minimumLoadingTime = new Promise((resolve) => setTimeout(resolve, 1000));

    Promise.all([
      api.get(`/orders/${id}`),
      minimumLoadingTime
    ])
      .then(([response]) => {
        if (active) setOrder(response.data?.data?.order || null);
      })
      .catch(async (requestError) => {
        await minimumLoadingTime;
        if (active) {
          setError(requestError.response?.data?.message || 'Could not load this order.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!order?._id) return undefined;

    const socket = connectOrderSocket();
    socket.on('order-status-updated', (update) => {
      if (update.orderId === order._id) {
        setOrder((current) => ({ ...current, orderStatus: update.status, updatedAt: update.updatedAt }));
      }
    });

    return () => socket.disconnect();
  }, [order?._id]);

  if (loading) return <LoadingSpinner text="Loading order details..." />;
  if (error || !order) {
    return <main className="container py-5"><div className="alert alert-danger">{error || 'Order not found.'}</div></main>;
  }

  const paymentLabel = {
    paid: 'Payment confirmed',
    refunded: 'Payment refunded',
    refund_pending: 'Refund pending',
    refund_failed: 'Refund failed — contact support',
    failed: 'Payment failed',
    pending: 'Payment pending'
  }[order.paymentStatus] || 'Payment status unavailable';

  return (
    <main className="container py-5">
      <div className="order-detail-card">
        <span className={`badge ${['paid', 'refunded'].includes(order.paymentStatus) ? 'text-bg-success' : 'text-bg-warning'} mb-3`}>
          {paymentLabel}
        </span>
        <h1 className="h2 fw-bold">Order details</h1>
        <p className="text-muted">Order reference: {order._id}</p>
        <OrderProgress orderStatus={order.orderStatus} paymentStatus={order.paymentStatus} />
        <h2 className="h5 fw-bold mt-4">Delivery address</h2>
        <p className="mb-1">{order.deliveryAddress.fullName} · {order.deliveryAddress.phone}</p>
        <p className="text-muted">{order.deliveryAddress.address}, {order.deliveryAddress.city} {order.deliveryAddress.postalCode}</p>
        <h2 className="h5 fw-bold mt-4">Items</h2>
        {order.items.map((item, index) => {
          const customIngredients = item.customIngredients || [];
          const isCustom = customIngredients.length > 0;
          const categoryLabels = {
            base: 'Base',
            sauce: 'Sauce',
            cheese: 'Cheese',
            vegetable: 'Vegetables'
          };

          return (
            <div className="d-flex justify-content-between gap-3 border-bottom py-2" key={`${item.pizza || item.name}-${index}`}>
              <span>
                {item.quantity} × {item.name}
                {isCustom ? (
                  <small className="d-block text-muted">
                    {['base', 'sauce', 'cheese', 'vegetable'].map((category) => {
                      const chosen = customIngredients.filter((ingredient) => ingredient.category === category);
                      return chosen.length
                        ? (
                          <span className="d-block" key={category}>
                            {categoryLabels[category]}:{' '}
                            {chosen.map((ing) => `${ing.name}${ing.price !== undefined ? ` (${formatPrice(ing.price)})` : ''}`).join(', ')}
                          </span>
                        )
                        : null;
                    })}
                  </small>
                ) : (
                  <small className="text-muted">({item.size}, {item.crust})</small>
                )}
              </span>
              <strong>{formatPrice(item.lineTotal)}</strong>
            </div>
          );
        })}
        <div className="d-flex justify-content-between pt-3 fs-5">
          <strong>Total</strong>
          <strong>{formatPrice(order.totalAmount)}</strong>
        </div>
        {!['paid', 'refunded'].includes(order.paymentStatus) && (
          <p className="alert alert-warning mt-4 mb-0">
            Payment is not confirmed. If you did not finish payment, return to checkout and try again.
          </p>
        )}
        <Link to="/menu" className="btn btn-outline-primary mt-4">Back to menu</Link>
      </div>
    </main>
  );
};

export default OrderDetailsPage;
