import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api';
import { useCart } from '../context/useCart';
import { calculatePizzaPrice, formatPrice } from '../utils/pizzaPricing';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { getImageUrl } from '../utils/imageUrl';

const PizzaBuilderPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { items, addItem, updateItem } = useCart();
  const [searchParams] = useSearchParams();
  const editKey = searchParams.get('edit');
  const editingItem = useMemo(
    () => items.find((item) => item.key === editKey),
    [editKey, items]
  );
  const [pizza, setPizza] = useState(null);
  const [size, setSize] = useState('');
  const [crust, setCrust] = useState('');
  const [toppings, setToppings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const fetchPizza = async () => {
      const minimumLoadingTime = new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        const [response] = await Promise.all([
          api.get(`/pizzas/${id}`),
          minimumLoadingTime
        ]);
        const item = response.data?.data?.pizza;

        if (active && item) {
          setPizza(item);
          if (editKey) {
            if (!editingItem || editingItem.pizzaId !== item._id) {
              setError('This cart item is no longer available to edit.');
            } else {
              const sizes = item.sizes?.length ? item.sizes : ['Small', 'Medium', 'Large'];
              const crusts = item.crusts?.length
                ? item.crusts
                : ['Regular', 'Thin', 'Cheese Burst'];
              setSize(sizes.includes(editingItem.size) ? editingItem.size : sizes[0]);
              setCrust(crusts.includes(editingItem.crust) ? editingItem.crust : crusts[0]);
              setToppings(
                (editingItem.toppings || []).filter((topping) =>
                  item.toppings?.includes(topping)
                )
              );
            }
          } else {
            setSize(item.sizes?.[0] || 'Small');
            setCrust(item.crusts?.[0] || 'Regular');
          }
        }
      } catch (requestError) {
        await minimumLoadingTime;
        if (active) {
          setError(requestError.response?.data?.message || 'Could not load this pizza.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchPizza();
    return () => {
      active = false;
    };
  }, [id, editKey, editingItem]);

  const toggleTopping = (topping) => {
    setToppings((selected) =>
      selected.includes(topping)
        ? selected.filter((item) => item !== topping)
        : [...selected, topping]
    );
  };

  if (loading) {
    return <LoadingSpinner text="Loading pizza details..." />;
  }

  if (error || !pizza) {
    return (
      <main className="container py-5">
        <div className="alert alert-danger" role="alert">{error || 'Pizza not found.'}</div>
        <Link className="btn btn-outline-primary" to="/menu">Back to menu</Link>
      </main>
    );
  }

  const available = pizza.available && pizza.stock > 0;
  const price = calculatePizzaPrice(pizza, size, crust);
  const availableSizes = pizza.sizes?.length ? pizza.sizes : ['Small', 'Medium', 'Large'];
  const availableCrusts = pizza.crusts?.length ? pizza.crusts : ['Regular', 'Thin', 'Cheese Burst'];

  const handleAddToCart = () => {
    if (!available) return;

    const key = [
      pizza._id,
      size,
      crust,
      [...toppings].sort().join(',')
    ].join('|');
    const existing = items.find((item) => item.key === key);

    if (editingItem) {
      if (editingItem.quantity > pizza.stock) {
        toast.error('The current cart quantity exceeds available stock. Reduce the quantity in your cart first.');
        return;
      }

      if (
        existing &&
        existing.key !== editingItem.key &&
        existing.quantity + editingItem.quantity > pizza.stock
      ) {
        toast.error('The cart quantity would exceed available stock.');
        return;
      }

      updateItem(editingItem.key, {
        key,
        pizzaId: pizza._id,
        name: pizza.name,
        image: pizza.image,
        size,
        crust,
        toppings: [...toppings],
        price,
        stock: pizza.stock
      });
      toast.success(`${pizza.name} customization updated`);
      navigate('/cart');
      return;
    }

    if (existing && existing.quantity >= pizza.stock) {
      toast.info('You have added all available stock of this pizza.');
      return;
    }

    addItem({
      key,
      pizzaId: pizza._id,
      name: pizza.name,
      image: pizza.image,
      size,
      crust,
      toppings: [...toppings],
      price,
      quantity: 1,
      stock: pizza.stock
    });

    toast.success(`${pizza.name} added to cart`);
    navigate('/cart');
  };

  return (
    <main className="container py-5">
      <Link to="/menu" className="btn btn-outline-primary btn-sm mb-2">&larr; Back to menu</Link>
      <div className="row g-4 mt-2">
        <div className="col-lg-6">
          <img
            className="builder-image"
            src={getImageUrl(pizza.image)}
            alt={pizza.name}
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = getImageUrl();
            }}
          />
        </div>
        <div className="col-lg-6">
          <span className="badge text-bg-warning mb-2">{pizza.category}</span>
          <h1 className="h2 fw-bold">{pizza.name}</h1>
          <p className="text-muted">{pizza.description}</p>

          <div className="builder-section">
            <label className="form-label fw-semibold" htmlFor="pizza-size">Size</label>
            <select id="pizza-size" className="form-select" value={size} onChange={(event) => setSize(event.target.value)}>
              {availableSizes.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>

          <div className="builder-section">
            <label className="form-label fw-semibold" htmlFor="pizza-crust">Crust</label>
            <select id="pizza-crust" className="form-select" value={crust} onChange={(event) => setCrust(event.target.value)}>
              {availableCrusts.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>

          {pizza.toppings?.length > 0 && (
            <fieldset className="builder-section">
              <legend className="form-label fw-semibold">Toppings <span className="text-muted fw-normal">(included)</span></legend>
              <div className="d-flex flex-wrap gap-2">
                {pizza.toppings.map((topping) => (
                  <label className={`topping-option ${toppings.includes(topping) ? 'selected' : ''}`} key={topping}>
                    <input
                      type="checkbox"
                      checked={toppings.includes(topping)}
                      onChange={() => toggleTopping(topping)}
                    />
                    {topping}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="builder-total d-flex justify-content-between align-items-center mt-4">
            <div>
              <span className="d-block text-muted small">Current price</span>
              <strong className="fs-4">{formatPrice(price)}</strong>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={handleAddToCart}
              disabled={!available || (editingItem && editingItem.quantity > pizza.stock)}
            >
              {available ? (editingItem ? 'Save changes' : 'Add to cart') : 'Unavailable'}
            </button>
          </div>
          {!available && <p className="text-danger small mt-2 mb-0">This pizza is currently out of stock.</p>}
          {editingItem && editingItem.quantity > pizza.stock && (
            <p className="text-danger small mt-2 mb-0" role="alert">
              The cart quantity exceeds current stock. Reduce it in your cart before saving.
            </p>
          )}
          <p className="text-muted small mt-3 mb-0">
            Size pricing: Small base, Medium +25%, Large +50%. Cheese Burst adds ₹80; selected toppings are included.
          </p>
        </div>
      </div>
    </main>
  );
};

export default PizzaBuilderPage;
