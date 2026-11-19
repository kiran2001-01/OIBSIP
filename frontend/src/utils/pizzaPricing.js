const SIZE_MULTIPLIERS = {
  Small: 1,
  Medium: 1.25,
  Large: 1.5
};

export const calculatePizzaPrice = (pizza, size, crust) => {
  const multiplier = SIZE_MULTIPLIERS[size] || 1;
  const sizePrice = Math.round(Number(pizza.price) * multiplier);
  const crustUpcharge = crust === 'Cheese Burst' ? 80 : 0;

  return sizePrice + crustUpcharge;
};

export const formatPrice = (price) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(price);
