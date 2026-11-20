import { Fragment, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';
import { formatPrice } from '../utils/pizzaPricing';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { getImageUrl } from '../utils/imageUrl';

const transitions = {
  Pending: ['Cancelled'],
  Confirmed: ['Preparing', 'Cancelled'],
  Preparing: ['Out for Delivery', 'Cancelled'],
  'Out for Delivery': ['Delivered', 'Cancelled'],
  Delivered: [],
  Cancelled: []
};

const inventoryCategoryOptions = [
  { value: 'all', label: 'All' },
  { value: 'base', label: 'Pizza Bases' },
  { value: 'sauce', label: 'Sauces' },
  { value: 'cheese', label: 'Cheeses' },
  { value: 'vegetable', label: 'Vegetables' },
  { value: 'other', label: 'Other' }
];

const inventoryCategoryLabels = {
  base: 'Pizza Base',
  sauce: 'Sauce',
  cheese: 'Cheese',
  vegetable: 'Vegetable',
  other: 'Other'
};

const inventoryCategoryBadgeClasses = {
  base: 'text-bg-primary',
  sauce: 'text-bg-warning',
  cheese: 'text-bg-info',
  vegetable: 'text-bg-success',
  other: 'text-bg-secondary'
};

const inventorySummaryCategories = [
  { category: 'base', label: 'Pizza Bases', icon: '🍞' },
  { category: 'sauce', label: 'Sauces', icon: '🍅' },
  { category: 'cheese', label: 'Cheeses', icon: '🧀' },
  { category: 'vegetable', label: 'Vegetables', icon: '🥦' }
];

const emptyPizzaForm = {
  name: '',
  description: '',
  image: '',
  category: 'Veg',
  price: '',
  stock: '50',
  available: true
};

const AdminDashboardPage = () => {
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [pizzas, setPizzas] = useState([]);
  const [expandedOrderId, setExpandedOrderId] = useState('');
  const [selectedPizzaId, setSelectedPizzaId] = useState('');
  const [recipe, setRecipe] = useState([]);
  const [pizzaForm, setPizzaForm] = useState(emptyPizzaForm);
  const [editingPizzaId, setEditingPizzaId] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageFileName, setImageFileName] = useState('');
  const [ingredientForm, setIngredientForm] = useState({
    name: '',
    category: 'other',
    price: '0',
    unit: 'g',
    stock: '',
    lowStockThreshold: '10'
  });
  const [inventoryFilter, setInventoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = async () => {
    setLoading(true);
    const minimumLoadingTime = new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const [dashboardResponse, ordersResponse, inventoryResponse, pizzasResponse] = await Promise.all([
        api.get('/admin/dashboard'),
        api.get('/admin/orders'),
        api.get('/admin/inventory'),
        api.get('/pizzas'),
        minimumLoadingTime
      ]);
      setStats(dashboardResponse.data?.data?.stats || null);
      setOrders(ordersResponse.data?.data?.orders || []);
      setInventory(inventoryResponse.data?.data?.inventory || []);
      setPizzas(pizzasResponse.data?.data?.pizzas || []);
      setError('');
    } catch (requestError) {
      await minimumLoadingTime;
      setError(requestError.response?.data?.message || 'Could not load the admin dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const fetchDashboard = async () => {
      const minimumLoadingTime = new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        const [dashboardResponse, ordersResponse, inventoryResponse, pizzasResponse] = await Promise.all([
          api.get('/admin/dashboard'),
          api.get('/admin/orders'),
          api.get('/admin/inventory'),
          api.get('/pizzas'),
          minimumLoadingTime
        ]);
        if (!active) return;
        setStats(dashboardResponse.data?.data?.stats || null);
        setOrders(ordersResponse.data?.data?.orders || []);
        setInventory(inventoryResponse.data?.data?.inventory || []);
        setPizzas(pizzasResponse.data?.data?.pizzas || []);
        setError('');
      } catch (requestError) {
        await minimumLoadingTime;
        if (active) {
          setError(requestError.response?.data?.message || 'Could not load the admin dashboard.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchDashboard();
    return () => {
      active = false;
    };
  }, []);

  const updateStatus = async (orderId, status) => {
    try {
      const response = await api.patch(`/admin/orders/${orderId}/status`, { status });
      setOrders((current) => current.map((order) =>
        order._id === orderId
          ? { ...response.data.data.order, user: order.user }
          : order
      ));
      toast.success('Order status updated.');
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Could not update order status.');
      await loadDashboard();
    }
  };

  const createIngredient = async (event) => {
    event.preventDefault();
    try {
      const response = await api.post('/admin/inventory', {
        name: ingredientForm.name,
        category: ingredientForm.category,
        price: Number(ingredientForm.price),
        unit: ingredientForm.unit,
        stock: Number(ingredientForm.stock),
        lowStockThreshold: Number(ingredientForm.lowStockThreshold)
      });
      setInventory((current) => [...current, response.data.data.inventoryItem]
        .sort((first, second) => first.name.localeCompare(second.name)));
      setIngredientForm({
        name: '',
        category: 'other',
        price: '0',
        unit: 'g',
        stock: '',
        lowStockThreshold: '10'
      });
      toast.success('Ingredient added to inventory.');
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Could not add ingredient.');
    }
  };

  const adjustStock = async (item, adjustment) => {
    if (!adjustment) return;
    try {
      const response = await api.patch(`/admin/inventory/${item._id}`, {
        adjustment: Number(adjustment)
      });
      setInventory((current) => current.map((entry) =>
        entry._id === item._id ? response.data.data.inventoryItem : entry
      ));
      toast.success('Inventory stock updated.');
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Could not update stock.');
    }
  };

  const selectPizza = (pizzaId) => {
    setSelectedPizzaId(pizzaId);
    const pizza = pizzas.find((entry) => entry._id === pizzaId);
    setRecipe((pizza?.ingredients || []).map((entry) => ({
      ingredient: typeof entry.ingredient === 'string' ? entry.ingredient : entry.ingredient?._id || '',
      amountPerPizza: entry.amountPerPizza
    })));
  };

  const saveRecipe = async (event) => {
    event.preventDefault();
    const pizza = pizzas.find((entry) => entry._id === selectedPizzaId);
    if (!pizza) return;

    try {
      const response = await api.patch(`/pizzas/${pizza._id}`, {
        ingredients: recipe.filter((entry) => entry.ingredient && Number(entry.amountPerPizza) > 0)
          .map((entry) => ({
            ingredient: entry.ingredient,
            amountPerPizza: Number(entry.amountPerPizza)
          }))
      });
      setPizzas((current) => current.map((entry) =>
        entry._id === pizza._id ? response.data.data.pizza : entry
      ));
      toast.success('Pizza ingredient recipe saved.');
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Could not save pizza recipe.');
    }
  };

  const editPizza = (pizza) => {
    setEditingPizzaId(pizza._id);
    setPizzaForm({
      name: pizza.name,
      description: pizza.description,
      image: pizza.image || '',
      category: pizza.category,
      price: String(pizza.price),
      stock: String(pizza.stock),
      available: pizza.available
    });
  };

  const savePizza = async (event) => {
    event.preventDefault();
    const payload = {
      ...pizzaForm,
      price: Number(pizzaForm.price),
      stock: Number(pizzaForm.stock)
    };

    try {
      const response = editingPizzaId
        ? await api.patch(`/pizzas/${editingPizzaId}`, payload)
        : await api.post('/pizzas', payload);
      const savedPizza = response.data.data.pizza;
      setPizzas((current) => editingPizzaId
        ? current.map((pizza) => pizza._id === editingPizzaId ? savedPizza : pizza)
        : [savedPizza, ...current]);
      if (!editingPizzaId) {
        setSelectedPizzaId(savedPizza._id);
        setRecipe([]);
      }
      setPizzaForm(emptyPizzaForm);
      setImageFileName('');
      setEditingPizzaId('');
      toast.success(editingPizzaId ? 'Pizza updated.' : 'Pizza added to the menu.');
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Could not save pizza.');
    }
  };

  const handlePizzaImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be smaller than 5 MB.');
      event.target.value = '';
      return;
    }

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await api.post('/pizzas/upload-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setPizzaForm((current) => ({ ...current, image: response.data.data.image }));
      setImageFileName(file.name);
      toast.success('Image uploaded. Save the pizza to use it.');
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Could not upload image.');
    } finally {
      setUploadingImage(false);
      event.target.value = '';
    }
  };

  const deletePizza = async (pizza) => {
    if (!window.confirm(`Delete ${pizza.name} from the menu?`)) return;
    try {
      await api.delete(`/pizzas/${pizza._id}`);
      setPizzas((current) => current.filter((entry) => entry._id !== pizza._id));
      if (selectedPizzaId === pizza._id) {
        setSelectedPizzaId('');
        setRecipe([]);
      }
      if (editingPizzaId === pizza._id) {
        setEditingPizzaId('');
        setPizzaForm(emptyPizzaForm);
        setImageFileName('');
      }
      toast.success('Pizza deleted.');
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Could not delete pizza.');
    }
  };

  if (loading) return <LoadingSpinner text="Loading admin dashboard..." />;
  if (error) return <main className="container py-5"><div className="alert alert-danger">{error}</div></main>;

  const cards = [
    ['Users', stats?.totalUsers ?? 0],
    ['Orders', stats?.totalOrders ?? 0],
    ['Revenue', formatPrice(stats?.totalRevenue ?? 0)],
    ['Pending', stats?.pendingOrders ?? 0],
    ['Delivered', stats?.completedOrders ?? 0]
  ];
  const inventoryCounts = inventory.reduce((counts, item) => {
    const category = inventoryCategoryLabels[item.category] ? item.category : 'other';
    counts[category] += 1;
    return counts;
  }, { base: 0, sauce: 0, cheese: 0, vegetable: 0, other: 0 });
  const filteredInventory = inventory.filter((item) => {
    const category = inventoryCategoryLabels[item.category] ? item.category : 'other';
    return inventoryFilter === 'all' || category === inventoryFilter;
  });

  return (
    <main className="container py-5">
      <h1 className="h2 fw-bold mb-4">Admin dashboard</h1>
      <section className="row g-3 mb-5" aria-label="Dashboard statistics">
        {cards.map(([label, value]) => (
          <div className="col-6 col-lg" key={label}>
            <div className="admin-stat">
              <span className="text-muted small">{label}</span>
              <strong className="d-block fs-4">{value}</strong>
            </div>
          </div>
        ))}
      </section>

      <h2 className="h4 fw-bold mb-3">Recent orders</h2>
      {orders.length === 0 ? (
        <div className="alert alert-info">No orders have been placed yet.</div>
      ) : (
        <div className="table-responsive admin-table">
          <table className="table align-middle mb-0">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Details</th>
                <th>Update status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <Fragment key={order._id}>
                <tr>
                  <td>#{order._id.slice(-8).toUpperCase()}</td>
                  <td>{order.user?.name || 'Unknown'}<small className="d-block text-muted">{order.user?.email}</small></td>
                  <td>{formatPrice(order.totalAmount)}</td>
                  <td>{order.paymentStatus}</td>
                  <td>{order.orderStatus}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      aria-expanded={expandedOrderId === order._id}
                      aria-controls={`order-details-${order._id}`}
                      onClick={() => setExpandedOrderId((current) =>
                        current === order._id ? '' : order._id
                      )}
                    >
                      {expandedOrderId === order._id ? 'Hide details' : 'View details'}
                    </button>
                  </td>
                  <td>
                    <select
                      className="form-select form-select-sm"
                      value=""
                      aria-label={`Set status for order ${order._id}`}
                      disabled={(order.paymentStatus !== 'paid' && order.orderStatus !== 'Pending') || !transitions[order.orderStatus]?.length}
                      onChange={(event) => updateStatus(order._id, event.target.value)}
                    >
                      <option value="" disabled>Choose status</option>
                      {(transitions[order.orderStatus] || []).map((status) => (
                        <option value={status} key={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                </tr>
                {expandedOrderId === order._id && (
                  <tr>
                    <td colSpan={7}>
                      <div id={`order-details-${order._id}`} className="row g-3">
                        <section className="col-md-7" aria-label="Order items">
                          <h3 className="h6 fw-bold">Items</h3>
                          <ul className="list-unstyled mb-0">
                            {(order.items || []).map((item, index) => (
                              <li className="mb-2" key={`${item.name}-${index}`}>
                                <strong>{item.quantity} × {item.name}</strong>
                                <span className="d-block text-muted small">
                                  {item.size} · {item.crust}
                                  {item.toppings?.length ? ` · ${item.toppings.join(', ')}` : ''}
                                </span>
                                <span>{formatPrice(item.lineTotal)}</span>
                              </li>
                            ))}
                          </ul>
                        </section>
                        <section className="col-md-5" aria-label="Delivery and payment details">
                          <h3 className="h6 fw-bold">Delivery address</h3>
                          {order.deliveryAddress ? (
                            <address className="mb-2">
                              {order.deliveryAddress.fullName}<br />
                              {order.deliveryAddress.phone}<br />
                              {order.deliveryAddress.address}<br />
                              {order.deliveryAddress.city}, {order.deliveryAddress.postalCode}
                              {order.deliveryAddress.instructions && (
                                <><br /><span className="text-muted">Instructions: {order.deliveryAddress.instructions}</span></>
                              )}
                            </address>
                          ) : <p className="text-muted">No delivery address recorded.</p>}
                          <p className="mb-1">Subtotal: {formatPrice(order.subtotal)}</p>
                          <p className="mb-1">Tax: {formatPrice(order.tax)}</p>
                          <p className="mb-1">Delivery: {formatPrice(order.deliveryFee)}</p>
                          <p className="mb-0">Payment method: {order.paymentMethod}</p>
                        </section>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="mt-5" aria-labelledby="inventory-heading">
        <h2 id="inventory-heading" className="h4 fw-bold mb-3">Ingredient inventory</h2>
        <div className="row g-3 mb-4" aria-label="Inventory category counts">
          {inventorySummaryCategories.map(({ category, label, icon }) => (
            <div className="col-6 col-lg-3" key={category}>
              <div className="admin-stat">
                <span className="text-muted small">{icon} {label}</span>
                <strong className="d-block fs-4">{inventoryCounts[category]} <small className="fs-6 fw-normal">items</small></strong>
              </div>
            </div>
          ))}
        </div>

        <div className="d-flex flex-wrap gap-2 mb-4" role="group" aria-label="Filter inventory by category">
          {inventoryCategoryOptions.map(({ value, label }) => (
            <button
              className={`btn btn-sm ${inventoryFilter === value ? 'btn-primary' : 'btn-outline-primary'}`}
              type="button"
              key={value}
              aria-pressed={inventoryFilter === value}
              onClick={() => setInventoryFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <form className="row g-2 align-items-end mb-4" onSubmit={createIngredient}>
          <div className="col-12 col-md-3">
            <label className="form-label" htmlFor="ingredient-name">Ingredient</label>
            <input id="ingredient-name" className="form-control" value={ingredientForm.name}
              onChange={(event) => setIngredientForm({ ...ingredientForm, name: event.target.value })}
              required maxLength={100} />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label" htmlFor="ingredient-category">Category</label>
            <select id="ingredient-category" className="form-select" value={ingredientForm.category}
              onChange={(event) => setIngredientForm({ ...ingredientForm, category: event.target.value })}>
              {inventoryCategoryOptions.filter(({ value }) => value !== 'all').map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-1">
            <label className="form-label" htmlFor="ingredient-price">Price (₹)</label>
            <input id="ingredient-price" type="number" min="0" step="0.01" className="form-control"
              value={ingredientForm.price}
              onChange={(event) => setIngredientForm({ ...ingredientForm, price: event.target.value })}
              required />
          </div>
          <div className="col-6 col-md-1">
            <label className="form-label" htmlFor="ingredient-unit">Unit</label>
            <select id="ingredient-unit" className="form-select" value={ingredientForm.unit}
              onChange={(event) => setIngredientForm({ ...ingredientForm, unit: event.target.value })}>
              {['g', 'kg', 'ml', 'l', 'piece'].map((unit) => <option key={unit}>{unit}</option>)}
            </select>
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label" htmlFor="ingredient-stock">Starting stock</label>
            <input id="ingredient-stock" type="number" min="0" step="any" className="form-control"
              value={ingredientForm.stock}
              onChange={(event) => setIngredientForm({ ...ingredientForm, stock: event.target.value })}
              required />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label" htmlFor="ingredient-threshold">Low-stock alert</label>
            <input id="ingredient-threshold" type="number" min="0" step="any" className="form-control"
              value={ingredientForm.lowStockThreshold}
              onChange={(event) => setIngredientForm({ ...ingredientForm, lowStockThreshold: event.target.value })}
              required />
          </div>
          <div className="col-6 col-md-1">
            <button type="submit" className="btn btn-primary w-100">Add ingredient</button>
          </div>
        </form>

        {inventory.length === 0 ? (
          <div className="alert alert-info">No ingredient inventory has been configured.</div>
        ) : filteredInventory.length === 0 ? (
          <div className="alert alert-info">No ingredients found in this category.</div>
        ) : (
          <div className="table-responsive admin-table">
            <table className="table align-middle mb-0">
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Available</th>
                  <th>Low-stock threshold</th>
                  <th>Adjust stock</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((item) => {
                  const category = inventoryCategoryLabels[item.category] ? item.category : 'other';
                  return (
                  <tr key={item._id}>
                    <td>{item.name}</td>
                    <td>
                      <span className={`badge ${inventoryCategoryBadgeClasses[category]}`}>
                        {inventoryCategoryLabels[category]}
                      </span>
                    </td>
                    <td>{formatPrice(item.price ?? 0)}</td>
                    <td className={item.stock <= item.lowStockThreshold ? 'text-danger fw-semibold' : ''}>
                      {item.stock} {item.unit}
                    </td>
                    <td>{item.lowStockThreshold} {item.unit}</td>
                    <td>
                      <form className="d-flex gap-2" onSubmit={(event) => {
                        event.preventDefault();
                        const adjustment = event.currentTarget.elements.adjustment.value;
                        adjustStock(item, adjustment);
                        event.currentTarget.reset();
                      }}>
                        <input name="adjustment" type="number" step="any" className="form-control form-control-sm"
                          aria-label={`Stock adjustment for ${item.name}`} placeholder="+/- amount" required />
                        <button className="btn btn-outline-primary btn-sm">Apply</button>
                      </form>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-5" aria-labelledby="pizza-management-heading">
        <h2 id="pizza-management-heading" className="h4 fw-bold mb-3">Menu management</h2>
        <form className="row g-3 mb-4" onSubmit={savePizza}>
          <div className="col-md-6">
            <label className="form-label" htmlFor="pizza-name">Pizza name</label>
            <input id="pizza-name" className="form-control" value={pizzaForm.name}
              onChange={(event) => setPizzaForm({ ...pizzaForm, name: event.target.value })}
              required maxLength={100} />
          </div>
          <div className="col-md-3">
            <label className="form-label" htmlFor="pizza-category">Category</label>
            <select id="pizza-category" className="form-select" value={pizzaForm.category}
              onChange={(event) => setPizzaForm({ ...pizzaForm, category: event.target.value })}>
              {['Veg', 'Non-Veg', 'Specialty', 'Classic'].map((category) =>
                <option key={category}>{category}</option>
              )}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label" htmlFor="pizza-price">Base price (₹)</label>
            <input id="pizza-price" type="number" min="0" step="0.01" className="form-control"
              value={pizzaForm.price}
              onChange={(event) => setPizzaForm({ ...pizzaForm, price: event.target.value })}
              required />
          </div>
          <div className="col-12">
            <label className="form-label" htmlFor="pizza-description">Description</label>
            <textarea id="pizza-description" className="form-control" rows="2" value={pizzaForm.description}
              onChange={(event) => setPizzaForm({ ...pizzaForm, description: event.target.value })}
              required maxLength={500} />
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="pizza-image">Product picture</label>
            <input id="pizza-image" type="file" accept="image/*" className="visually-hidden"
              onChange={handlePizzaImageChange} disabled={uploadingImage} />
            <div className="admin-image-upload">
              <label htmlFor="pizza-image" className="btn btn-outline-primary">
                {uploadingImage ? 'Uploading image...' : 'Choose image'}
              </label>
              <div className="small text-muted text-truncate">
                {imageFileName || (pizzaForm.image ? 'Current image selected' : 'No image selected')}
              </div>
            </div>
            <div className="form-text">Choose an image from your computer. Maximum size: 5 MB.</div>
            {pizzaForm.image && (
              <img className="admin-pizza-preview mt-2" src={getImageUrl(pizzaForm.image)} alt="Selected pizza preview" />
            )}
          </div>
          <div className="col-md-3">
            <label className="form-label" htmlFor="pizza-stock">Pizza stock</label>
            <input id="pizza-stock" type="number" min="0" step="1" className="form-control"
              value={pizzaForm.stock}
              onChange={(event) => setPizzaForm({ ...pizzaForm, stock: event.target.value })}
              required />
          </div>
          <div className="col-md-3 d-flex align-items-end">
            <div className="form-check mb-2">
              <input id="pizza-available" type="checkbox" className="form-check-input" checked={pizzaForm.available}
                onChange={(event) => setPizzaForm({ ...pizzaForm, available: event.target.checked })} />
              <label className="form-check-label" htmlFor="pizza-available">Available for ordering</label>
            </div>
          </div>
          <div className="col-12 d-flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={uploadingImage}>
              {editingPizzaId ? 'Save pizza' : 'Add pizza'}
            </button>
            {editingPizzaId && (
              <button type="button" className="btn btn-outline-secondary" onClick={() => {
                setEditingPizzaId('');
                setPizzaForm(emptyPizzaForm);
                setImageFileName('');
              }}>Stop editing</button>
            )}
          </div>
        </form>

        {pizzas.length > 0 && (
          <div className="table-responsive admin-table">
            <table className="table align-middle mb-0">
              <thead><tr><th>Pizza</th><th>Price</th><th>Stock</th><th>Available</th><th>Actions</th></tr></thead>
              <tbody>
                {pizzas.map((pizza) => (
                  <tr key={pizza._id}>
                    <td>{pizza.name}</td>
                    <td>{formatPrice(pizza.price)}</td>
                    <td>{pizza.stock}</td>
                    <td>{pizza.available ? 'Yes' : 'No'}</td>
                    <td className="d-flex gap-2">
                      <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => editPizza(pizza)}>Edit</button>
                      <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => deletePizza(pizza)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-5" aria-labelledby="recipe-heading">
        <h2 id="recipe-heading" className="h4 fw-bold mb-3">Pizza ingredient recipes</h2>
        <p className="text-muted">Set the amount of each ingredient used for one pizza to enable ingredient stock tracking.</p>
        <form onSubmit={saveRecipe}>
          <label className="form-label" htmlFor="recipe-pizza">Pizza</label>
          <select id="recipe-pizza" className="form-select mb-3" value={selectedPizzaId}
            onChange={(event) => selectPizza(event.target.value)} required>
            <option value="">Select a pizza</option>
            {pizzas.map((pizza) => <option value={pizza._id} key={pizza._id}>{pizza.name}</option>)}
          </select>

          {recipe.map((entry, index) => (
            <div className="row g-2 align-items-end mb-2" key={`${selectedPizzaId}-${index}`}>
              <div className="col-md-6">
                <label className="form-label" htmlFor={`recipe-ingredient-${index}`}>Ingredient</label>
                <select id={`recipe-ingredient-${index}`} className="form-select" value={entry.ingredient}
                  onChange={(event) => setRecipe((current) => current.map((row, rowIndex) =>
                    rowIndex === index ? { ...row, ingredient: event.target.value } : row
                  ))} required>
                  <option value="">Choose ingredient</option>
                  {inventory.map((item) => <option value={item._id} key={item._id}>{item.name} ({item.unit})</option>)}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label" htmlFor={`recipe-amount-${index}`}>Amount per pizza</label>
                <input id={`recipe-amount-${index}`} type="number" min="0.001" step="any"
                  className="form-control" value={entry.amountPerPizza}
                  onChange={(event) => setRecipe((current) => current.map((row, rowIndex) =>
                    rowIndex === index ? { ...row, amountPerPizza: event.target.value } : row
                  ))} required />
              </div>
              <div className="col-md-2">
                <button type="button" className="btn btn-outline-danger w-100"
                  onClick={() => setRecipe((current) => current.filter((_, rowIndex) => rowIndex !== index))}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          <div className="d-flex gap-2 mt-3">
            <button type="button" className="btn btn-outline-primary" disabled={!selectedPizzaId || inventory.length === 0}
              onClick={() => setRecipe((current) => [...current, { ingredient: '', amountPerPizza: '1' }])}>
              Add ingredient
            </button>
            <button type="submit" className="btn btn-primary" disabled={!selectedPizzaId}>Save recipe</button>
          </div>
        </form>
      </section>
    </main>
  );
};

export default AdminDashboardPage;
