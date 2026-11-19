const getSizeMultiplier = (size) => {
  const multipliers = {
    Small: 1,
    Medium: 1.25,
    Large: 1.5
  };

  return multipliers[size] || 1;
};

const getUnitPrice = (pizza, size, crust) => {
  const sizePrice = Math.round(pizza.price * getSizeMultiplier(size));
  const crustUpcharge = crust === "Cheese Burst" ? 80 : 0;

  return sizePrice + crustUpcharge;
};

const calculateTotals = (items) => {
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const tax = Math.round(subtotal * 0.05);
  const deliveryFee = subtotal >= 499 ? 0 : 49;

  return {
    subtotal,
    tax,
    deliveryFee,
    totalAmount: subtotal + tax + deliveryFee
  };
};

module.exports = {
  getUnitPrice,
  calculateTotals
};
