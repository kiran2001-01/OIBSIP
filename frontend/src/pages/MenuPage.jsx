import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { formatPrice } from '../utils/pizzaPricing';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { getImageUrl } from '../utils/imageUrl';

const categories = ['All', 'Veg', 'Non-Veg', 'Specialty', 'Classic'];

const MenuPage = () => {
  const [pizzas, setPizzas] = useState([]);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      const minimumLoadingTime = new Promise((resolve) => setTimeout(resolve, 1000));
      setError('');
      try {
        const params = {};
        if (category !== 'All') params.category = category;
        if (search.trim()) params.search = search.trim();

        const [response] = await Promise.all([
          api.get('/pizzas', { params }),
          minimumLoadingTime
        ]);
        if (active) {
          setPizzas(response.data?.data?.pizzas || []);
        }
      } catch (requestError) {
        await minimumLoadingTime;
        if (active) {
          setError(requestError.response?.data?.message || 'Could not load the menu. Please try again.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [category, search]);

  return (
    <main className="container py-5">
      <header className="menu-header mb-4">
        <div>
          <span className="badge text-bg-warning mb-2">Made fresh to order</span>
          <h1 className="h2 fw-bold mb-2">Our pizza menu</h1>
          <p className="text-muted mb-0">Find your favorite, made with fresh ingredients.</p>
        </div>
        <div className="menu-search">
          <label className="visually-hidden" htmlFor="pizza-search">Search pizzas</label>
          <input
            id="pizza-search"
            className="form-control"
            type="search"
            placeholder="Search pizzas..."
            value={search}
            onChange={(event) => {
              if (search !== event.target.value) {
                setLoading(true);
                setSearch(event.target.value);
              }
            }}
          />
        </div>
      </header>

      <div className="d-flex flex-wrap gap-2 mb-4" role="group" aria-label="Filter by category">
        {categories.map((item) => (
          <button
            className={`btn ${category === item ? 'btn-primary' : 'btn-outline-secondary'}`}
            key={item}
            type="button"
            aria-pressed={category === item}
            onClick={() => {
              if (category !== item) {
                setLoading(true);
                setCategory(item);
              }
            }}
          >
            {item}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner text="Loading delicious pizzas..." />
      ) : error ? (
        <div className="alert alert-danger" role="alert">{error}</div>
      ) : pizzas.length === 0 ? (
        <div className="empty-menu text-center py-5">
          <div className="display-5 mb-2" aria-hidden="true">🍕</div>
          <h2 className="h4">No pizzas found</h2>
          <p className="text-muted mb-0">Try a different search or category.</p>
        </div>
      ) : (
        <div className="row g-4">
          {pizzas.map((pizza) => {
            const available = pizza.available && pizza.stock > 0;

            return (
              <div className="col-sm-6 col-lg-4" key={pizza._id}>
                <article className="pizza-card h-100">
                  <img
                    className="pizza-card-image"
                    src={getImageUrl(pizza.image)}
                    alt={pizza.name}
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = getImageUrl();
                    }}
                  />
                  <div className="p-3 p-lg-4">
                    <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                      <h2 className="h5 fw-bold mb-0">{pizza.name}</h2>
                      <span className="pizza-price">{formatPrice(pizza.price)}</span>
                    </div>
                    <p className="text-muted small mb-3">{pizza.description}</p>
                    <div className="d-flex flex-wrap gap-2 mb-3">
                      <span className="badge rounded-pill text-bg-light">{pizza.category}</span>
                      {(pizza.sizes || []).map((size) => (
                        <span className="badge rounded-pill text-bg-light" key={size}>{size}</span>
                      ))}
                    </div>
                    <div className="d-flex justify-content-between align-items-center border-top pt-3">
                      <span className={available ? 'text-success small fw-semibold' : 'text-danger small fw-semibold'}>
                        {available ? 'Available' : 'Currently unavailable'}
                      </span>
                      <span className="text-muted small">
                        {available ? `${pizza.stock} in stock` : ''}
                      </span>
                    </div>
                    {available ? (
                      <Link to={`/pizza/${pizza._id}`} className="btn btn-primary w-100 mt-3">
                        Place Order
                      </Link>
                    ) : (
                      <button type="button" className="btn btn-primary w-100 mt-3" disabled>
                        Unavailable
                      </button>
                    )}
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
};

export default MenuPage;
