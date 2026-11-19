export const calculateCartTotals = (items) => {
  const subtotalInPaise = items.reduce((sum, item) => {
    if (
      !Number.isFinite(item.price) ||
      item.price < 0 ||
      !Number.isSafeInteger(Math.round(item.price * 100)) ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    ) {
      throw new RangeError('Cart items must have a non-negative price and positive quantity.');
    }

    const lineTotalInPaise = Math.round(item.price * 100) * item.quantity;
    if (
      !Number.isSafeInteger(lineTotalInPaise) ||
      !Number.isSafeInteger(sum + lineTotalInPaise)
    ) {
      throw new RangeError('Cart total exceeds the supported amount.');
    }

    return sum + lineTotalInPaise;
  }, 0);
  const subtotal = subtotalInPaise / 100;
  const tax = Math.round(subtotal * 0.05);
  const deliveryFee = subtotal >= 499 || subtotal === 0 ? 0 : 49;
  const total = (
    subtotalInPaise + (tax + deliveryFee) * 100
  ) / 100;

  if (!Number.isSafeInteger(Math.round(total * 100))) {
    throw new RangeError('Cart total exceeds the supported amount.');
  }

  return {
    subtotal,
    tax,
    deliveryFee,
    total
  };
};
