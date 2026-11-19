import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCustomCartItem, isValidCartItem } from '../src/utils/cartItems.js';

const customCartItem = {
  key: 'custom|base-1|sauce-1|cheese-1|veg-1',
  isCustom: true,
  custom: {
    baseId: 'base-1',
    sauceId: 'sauce-1',
    cheeseId: 'cheese-1',
    vegetableIds: ['veg-1']
  },
  customSummary: {
    base: 'Classic',
    sauce: 'Classic Tomato',
    cheese: 'Mozzarella',
    vegetables: ['Capsicum']
  },
  name: 'Custom Pizza',
  price: 190.5,
  quantity: 1,
  stock: 10
};

test('accepts a custom cart item without a pizza ID', () => {
  assert.equal(isCustomCartItem(customCartItem), true);
  assert.equal(isValidCartItem(customCartItem), true);
});

test('accepts a custom cart item with itemized ingredient prices', () => {
  const itemWithPrices = {
    ...customCartItem,
    custom: {
      ...customCartItem.custom,
      size: 'Medium'
    },
    customSummary: {
      ...customCartItem.customSummary,
      size: 'Medium (10")',
      sizeUpcharge: 40,
      basePrice: 90,
      saucePrice: 45,
      cheesePrice: 60,
      vegetableDetails: [{ name: 'Capsicum', price: 25 }]
    }
  };
  assert.equal(isValidCartItem(itemWithPrices), true);
});

test('rejects custom cart items with unsupported sizes', () => {
  assert.equal(isValidCartItem({
    ...customCartItem,
    custom: { ...customCartItem.custom, size: 'Jumbo' }
  }), false);
});

test('rejects negative or malformed ingredient prices in custom summary', () => {
  assert.equal(isValidCartItem({
    ...customCartItem,
    customSummary: {
      ...customCartItem.customSummary,
      basePrice: -10
    }
  }), false);

  assert.equal(isValidCartItem({
    ...customCartItem,
    customSummary: {
      ...customCartItem.customSummary,
      vegetableDetails: [{ name: 'Capsicum', price: -5 }]
    }
  }), false);
});

test('rejects malformed custom selections', () => {
  assert.equal(isValidCartItem({
    ...customCartItem,
    custom: { ...customCartItem.custom, vegetableIds: ['veg-1', 'veg-1'] }
  }), false);
});

test('continues to accept regular pizza cart items', () => {
  assert.equal(isValidCartItem({
    key: 'pizza-1|Small|Regular|',
    pizzaId: 'pizza-1',
    name: 'Margherita',
    size: 'Small',
    crust: 'Regular',
    toppings: [],
    price: 249,
    quantity: 1,
    stock: 5
  }), true);
});
