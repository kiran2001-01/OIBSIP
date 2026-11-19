import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api';
import { connectOrderSocket } from '../services/orderSocket';
import { formatPrice } from '../utils/pizzaPricing';
import LoadingSpinner from '../components/common/LoadingSpinner';

const MyOrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const minimumLoadingTime = new Promise((resolve) => setTimeout(resolve, 1000));

    Promise.all([
      api.get('/orders/my-orders'),
      minimumLoadingTime
    ])
      .then(([response]) => {
        if (active) setOrders(response.data?.data?.orders || []);
      })
      .catch(async (requestError) => {
        await minimumLoadingTime;
        if (active) setError(requestError.response?.data?.message || 'Could not load your orders.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const socket = connectOrderSocket();
    socket.on('order-status-updated', (update) => {
      if (!active) return;
      setOrders((current) => current.map((order) => {
        if (order._id !== update.orderId) return order;
        toast.info(`Order status updated: ${update.status}`);
        return { ...order, orderStatus: update.status, updatedAt: update.updatedAt };
      }));
    });

    return () => {
      active = false;
      socket.disconnect();
    };
  }, []);

  if (loading) return <LoadingSpinner text="Loading your orders..." />;
  if (error) return <main className="container py-5"><div className="alert alert-danger">{error}</div></main>;

  return (
    <main className="container py-5">
      <h1 className="h2 fw-bold mb-4">My orders</h1>
      {orders.length === 0 ? (
        <div className="empty-menu py-5 text-center">
          <h2 className="h4">No orders yet</h2>
          <p className="text-muted">Your placed orders will appear here.</p>
          <Link to="/menu" className="btn btn-primary">Browse menu</Link>
        </div>
      ) : (
        <div className="d-grid gap-3">
          {orders.map((order) => (
            <article className="order-list-card" key={order._id}>
              <div className="d-flex flex-wrap justify-content-between gap-3">
                <div>
                  <span className="text-muted small">Order</span>
                  <h2 className="h6 fw-bold mb-1">#{order._id.slice(-8).toUpperCase()}</h2>
                  <p className="text-muted small mb-0">{new Date(order.createdAt).toLocaleString()}</p>
                </div>
                <div className="text-end">
                  <span className={`badge ${order.paymentStatus === 'paid' ? 'text-bg-success' : 'text-bg-warning'}`}>
                    {order.paymentStatus === 'paid' ? order.orderStatus : 'Payment pending'}
                  </span>
                  <p className="fw-bold mt-2 mb-0">{formatPrice(order.totalAmount)}</p>
                </div>
              </div>
              <p className="text-muted small mt-3 mb-3">
                {order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}
              </p>
              <Link to={`/orders/${order._id}`} className="btn btn-outline-primary btn-sm">View order</Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
};

export default MyOrdersPage;
