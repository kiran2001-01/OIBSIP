import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api';
import { useCart } from '../context/useCart';
import { formatPrice } from '../utils/pizzaPricing';
import LoadingSpinner from '../components/common/LoadingSpinner';

const categories = ['base', 'sauce', 'cheese', 'vegetable'];

const PIZZA_SIZES = [
  { id: 'Small', name: 'Regular', inches: '8"', upcharge: 0, description: 'Personal size, 4 slices' },
  { id: 'Medium', name: 'Medium', inches: '10"', upcharge: 40, description: 'Serves 2, 6 slices' },
  { id: 'Large', name: 'Large', inches: '12"', upcharge: 80, description: 'Serves 3-4, 8 slices' }
];

const steps = [
  { category: 'base', selection: 'baseId', title: 'Choose Pizza Base', type: 'single' },
  { category: 'sauce', selection: 'sauceId', title: 'Choose Sauce', type: 'single' },
  { category: 'cheese', selection: 'cheeseId', title: 'Choose Cheese Type', type: 'single' },
  { category: 'vegetable', selection: 'vegetableIds', title: 'Choose Vegetables', type: 'multiple' }
];

const categoryLabels = {
  base: 'Pizza Base',
  sauce: 'Sauce',
  cheese: 'Cheese',
  vegetable: 'Vegetables'
};

const emptyOptions = {
  base: [],
  sauce: [],
  cheese: [],
  vegetable: []
};

const optionDisplayName = (category, name) => {
  if (category === 'vegetable') {
    return { 'Red Onion': 'Onion', 'Black Olives': 'Olives' }[name] || name;
  }

  const suffix = {
    base: /(?: Pizza)? Base$/i,
    sauce: / Sauce$/i,
    cheese: / Cheese$/i
  }[category];

  return name.replace(suffix, '');
};

const isBuilderOptionsResponse = (value) =>
  value &&
  categories.every((category) =>
    Array.isArray(value[category]) &&
    value[category].every((option) =>
      typeof option?._id === 'string' &&
      typeof option.name === 'string' &&
      Number.isFinite(option.price) &&
      option.price >= 0 &&
      typeof option.inStock === 'boolean'
    )
  );

const CustomPizzaBuilderPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editKey = searchParams.get('edit');
  const { items, addItem, updateItem } = useCart();
  const editingItem = useMemo(
    () => items.find((item) => item.key === editKey),
    [editKey, items]
  );
  const [options, setOptions] = useState(emptyOptions);
  const [selectedSizeId, setSelectedSizeId] = useState('Small');
  const [selections, setSelections] = useState({
    baseId: '',
    sauceId: '',
    cheeseId: '',
    vegetableIds: []
  });
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const selectedSize = useMemo(
    () => PIZZA_SIZES.find((s) => s.id === selectedSizeId) || PIZZA_SIZES[0],
    [selectedSizeId]
  );

  useEffect(() => {
    let active = true;
    const minimumLoadingTime = new Promise((resolve) => setTimeout(resolve, 1000));

    Promise.all([
      api.get('/builder/options'),
      minimumLoadingTime
    ])
      .then(([response]) => {
        if (!isBuilderOptionsResponse(response.data)) {
          throw new Error('The server returned invalid pizza builder options.');
        }
        if (active) {
          setOptions(response.data);

          if (editKey) {
            if (!editingItem?.custom) {
              setError('This custom pizza is no longer available to edit.');
              return;
            }

            const availableIds = Object.fromEntries(
              categories.map((category) => [
                category,
                new Set(response.data[category]
                  .filter((option) => option.inStock)
                  .map((option) => option._id))
              ])
            );
            setSelections({
              baseId: availableIds.base.has(editingItem.custom.baseId)
                ? editingItem.custom.baseId
                : '',
              sauceId: availableIds.sauce.has(editingItem.custom.sauceId)
                ? editingItem.custom.sauceId
                : '',
              cheeseId: availableIds.cheese.has(editingItem.custom.cheeseId)
                ? editingItem.custom.cheeseId
                : '',
              vegetableIds: editingItem.custom.vegetableIds.filter((id) =>
                availableIds.vegetable.has(id)
              )
            });
            setSelectedSizeId(
              PIZZA_SIZES.some((size) => size.id === editingItem.custom.size)
                ? editingItem.custom.size
                : PIZZA_SIZES[0].id
            );
          }
        }
      })
      .catch(async (requestError) => {
        await minimumLoadingTime;
        if (active) {
          setError(requestError.response?.data?.message || requestError.message || 'Could not load pizza ingredients.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [editKey, editingItem]);

  const selectedBase = useMemo(
    () => options.base.find((option) => option._id === selections.baseId),
    [options.base, selections.baseId]
  );
  const selectedSauce = useMemo(
    () => options.sauce.find((option) => option._id === selections.sauceId),
    [options.sauce, selections.sauceId]
  );
  const selectedCheese = useMemo(
    () => options.cheese.find((option) => option._id === selections.cheeseId),
    [options.cheese, selections.cheeseId]
  );
  const selectedVegetables = useMemo(
    () => options.vegetable.filter((option) => selections.vegetableIds.includes(option._id)),
    [options.vegetable, selections.vegetableIds]
  );

  const selectedIngredients = [
    selectedBase,
    selectedSauce,
    selectedCheese,
    ...selectedVegetables
  ].filter(Boolean);
  const sizeUpcharge = selectedSize.upcharge || 0;
  const totalPrice = Math.round(
    (selectedIngredients.reduce((total, ingredient) => total + ingredient.price, 0) + sizeUpcharge) * 100
  ) / 100;
  const currentStepDetails = steps[currentStep];
  const currentStepComplete = currentStepDetails.type === 'multiple'
    ? selections[currentStepDetails.selection].length > 0
    : Boolean(selections[currentStepDetails.selection]);
  const canAddToCart =
    selectedBase?.inStock &&
    selectedSauce?.inStock &&
    selectedCheese?.inStock &&
    selectedVegetables.every((ingredient) => ingredient.inStock);

  const selectIngredient = (category, ingredientId) => {
    const step = steps.find((entry) => entry.category === category);
    if (!step) return;

    if (step.type === 'single') {
      setSelections((current) => ({ ...current, [step.selection]: ingredientId }));
      return;
    }

    setSelections((current) => {
      const selected = current.vegetableIds;
      if (selected.includes(ingredientId)) {
        return {
          ...current,
          vegetableIds: selected.filter((id) => id !== ingredientId)
        };
      }
      if (selected.length >= 8) {
        toast.error('You can choose up to 8 vegetables.');
        return current;
      }
      return { ...current, vegetableIds: [...selected, ingredientId] };
    });
  };

  const handleContinue = () => {
    if (currentStep < steps.length - 1) {
      if (!currentStepComplete) {
        const message = currentStepDetails.type === 'multiple'
          ? 'Please select at least one vegetable to continue.'
          : `Please select a ${categoryLabels[currentStepDetails.category].toLowerCase()} option to continue.`;
        toast.error(message);
        return;
      }
      setCurrentStep((step) => step + 1);
      return;
    }

    if (!currentStepComplete) {
      toast.error('Please select at least one vegetable to continue.');
      return;
    }

    if (!canAddToCart) {
      toast.error('Choose available ingredients for your custom pizza.');
      return;
    }

    const vegetableIds = selectedVegetables.map((ingredient) => ingredient._id);
    const custom = {
      baseId: selectedBase._id,
      sauceId: selectedSauce._id,
      cheeseId: selectedCheese._id,
      vegetableIds,
      size: selectedSize.id
    };
    const key = [
      'custom',
      selectedSize.id,
      custom.baseId,
      custom.sauceId,
      custom.cheeseId,
      [...vegetableIds].sort().join(',')
    ].join('|');

    const updatedCartItem = {
      key,
      isCustom: true,
      custom,
      customSummary: {
        size: `${selectedSize.name} (${selectedSize.inches})`,
        sizeUpcharge: selectedSize.upcharge,
        base: optionDisplayName('base', selectedBase.name),
        basePrice: selectedBase.price,
        sauce: optionDisplayName('sauce', selectedSauce.name),
        saucePrice: selectedSauce.price,
        cheese: optionDisplayName('cheese', selectedCheese.name),
        cheesePrice: selectedCheese.price,
        vegetables: selectedVegetables.map((ingredient) =>
          optionDisplayName('vegetable', ingredient.name)
        ),
        vegetableDetails: selectedVegetables.map((ingredient) => ({
          name: optionDisplayName('vegetable', ingredient.name),
          price: ingredient.price
        }))
      },
      name: 'Custom Pizza',
      image: '',
      size: `${selectedSize.name} (${selectedSize.inches})`,
      crust: selectedBase.name,
      toppings: [],
      price: totalPrice,
      quantity: 1,
      stock: 10
    };

    if (editingItem) {
      updateItem(editingItem.key, updatedCartItem);
      toast.success('Custom pizza changes saved.');
    } else {
      addItem(updatedCartItem);
      toast.success('Custom pizza added to your cart.');
    }
    navigate('/cart');
  };

  if (loading) {
    return <LoadingSpinner text="Loading pizza builder ingredients..." />;
  }

  if (error) {
    return (
      <main className="container py-5">
        <div className="alert alert-danger" role="alert">{error}</div>
        <Link className="btn btn-outline-primary" to="/cart">Back to cart</Link>
      </main>
    );
  }

  return (
    <main className="container py-5">
      <h1 className="h2 fw-bold mb-2">{editingItem ? 'Edit Your Custom Pizza' : 'Build Your Own Pizza'}</h1>
      <p className="text-muted mb-4">Choose your base, sauce, cheese, and vegetables.</p>

      <ol className="custom-builder-steps list-unstyled mb-4" aria-label="Pizza builder steps">
        {steps.map((step, index) => (
          <li
            className={`custom-builder-step${index === currentStep ? ' is-active' : ''}${index < currentStep ? ' is-complete' : ''}`}
            aria-current={index === currentStep ? 'step' : undefined}
            key={step.category}
          >
            <span className="custom-builder-step-number">{index + 1}</span>
            <span className="custom-builder-step-label">{step.title}</span>
          </li>
        ))}
      </ol>

      <section className="builder-section" aria-labelledby="builder-step-heading">
        <h2 id="builder-step-heading" className="h4 fw-bold mb-3">
          Step {currentStep + 1}: {currentStepDetails.title}
        </h2>

        {currentStep === 0 && (
          <div className="custom-builder-size-selection mb-4">
            <h3 className="h6 fw-bold text-uppercase text-secondary tracking-wide mb-2">
              1. Select Pizza Size
            </h3>
            <div className="row g-3">
              {PIZZA_SIZES.map((sizeOption) => {
                const isSelected = selectedSizeId === sizeOption.id;
                return (
                  <div className="col-md-4 col-12" key={sizeOption.id}>
                    <div
                      className={`builder-size-card ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => setSelectedSizeId(sizeOption.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setSelectedSizeId(sizeOption.id);
                        }
                      }}
                    >
                      <div className="d-flex justify-content-between align-items-center w-100 mb-1">
                        <span className="fw-bold fs-6 text-dark">{sizeOption.name}</span>
                        <span className="badge rounded-pill text-dark border" style={{ backgroundColor: '#fef3c7', borderColor: '#fde68a' }}>
                          {sizeOption.inches}
                        </span>
                      </div>
                      <div className="small text-muted mb-2 text-start w-100">{sizeOption.description}</div>
                      <div className="d-flex justify-content-between align-items-center w-100 border-top pt-2 mt-auto">
                        <span className="small text-secondary">Size upcharge:</span>
                        <span className="fw-bold text-dark">
                          {sizeOption.upcharge === 0 ? 'Included' : `+ ${formatPrice(sizeOption.upcharge)}`}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <h3 className="h6 fw-bold text-uppercase text-secondary tracking-wide mt-4 mb-2">
              2. Choose Crust Base
            </h3>
          </div>
        )}

        {options[currentStepDetails.category].length === 0 ? (
          <div className="alert alert-warning">No {categoryLabels[currentStepDetails.category].toLowerCase()} options are available.</div>
        ) : (
          <div className="custom-builder-option-grid">
            {options[currentStepDetails.category].map((ingredient) => {
              const isSelected = currentStepDetails.type === 'multiple'
                ? selections.vegetableIds.includes(ingredient._id)
                : selections[currentStepDetails.selection] === ingredient._id;
              const label = optionDisplayName(currentStepDetails.category, ingredient.name);

              return (
                <label
                  className={`custom-builder-option${isSelected ? ' is-selected' : ''}${!ingredient.inStock ? ' is-unavailable' : ''}`}
                  key={ingredient._id}
                >
                  <input
                    className="form-check-input mt-0"
                    type={currentStepDetails.type === 'multiple' ? 'checkbox' : 'radio'}
                    name={currentStepDetails.category}
                    checked={isSelected}
                    disabled={!ingredient.inStock}
                    onChange={() => selectIngredient(currentStepDetails.category, ingredient._id)}
                  />
                  <span className="flex-grow-1">
                    <span className="d-block fw-semibold">{label}</span>
                    <span className="small text-muted">
                      {ingredient.inStock ? `+ ${formatPrice(ingredient.price)}` : 'Currently unavailable'}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      <section className="builder-total mt-4" aria-labelledby="custom-pizza-summary-heading">
        <h2 id="custom-pizza-summary-heading" className="h5 fw-bold mb-3">Your pizza</h2>
        <dl className="row mb-3">
          <dt className="col-sm-3">Size</dt>
          <dd className="col-sm-9">
            <span className="fw-semibold text-dark">{selectedSize.name} ({selectedSize.inches})</span>
            {selectedSize.upcharge > 0 && <span className="text-muted ms-2">(+{formatPrice(selectedSize.upcharge)})</span>}
          </dd>
          <dt className="col-sm-3">Base</dt>
          <dd className="col-sm-9">{selectedBase ? optionDisplayName('base', selectedBase.name) : 'Not selected'}</dd>
          <dt className="col-sm-3">Sauce</dt>
          <dd className="col-sm-9">{selectedSauce ? optionDisplayName('sauce', selectedSauce.name) : 'Not selected'}</dd>
          <dt className="col-sm-3">Cheese</dt>
          <dd className="col-sm-9">{selectedCheese ? optionDisplayName('cheese', selectedCheese.name) : 'Not selected'}</dd>
          <dt className="col-sm-3">Vegetables</dt>
          <dd className="col-sm-9 mb-0">
            {selectedVegetables.length
              ? selectedVegetables.map((ingredient) => optionDisplayName('vegetable', ingredient.name)).join(', ')
              : 'None'}
          </dd>
        </dl>
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 border-top pt-3">
          <div>
            <span className="d-block text-muted small">Current total</span>
            <strong className="fs-4">{formatPrice(totalPrice)}</strong>
          </div>
          <div className="d-flex gap-2">
            {currentStep > 0 && (
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setCurrentStep((step) => step - 1)}
              >
                Previous
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleContinue}
              disabled={currentStep === steps.length - 1 && !canAddToCart}
            >
              {currentStep === steps.length - 1
                ? (editingItem ? 'Save Changes to Cart' : 'Add Custom Pizza to Cart')
                : 'Continue'}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
};

export default CustomPizzaBuilderPage;
