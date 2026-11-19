import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateCartTotals } from '../src/utils/cartPricing.js';
import { calculatePizzaPrice } from '../src/utils/pizzaPricing.js';

test('calculates cart subtotal, rounded tax, delivery, and total', () => {
  assert.deepEqual(
    calculateCartTotals([
      { price: 249, quantity: 2 },
      { price: 329, quantity: 1 }
    ]),
    { subtotal: 827, tax: 41, deliveryFee: 0, total: 868 }
  );
});

test('charges delivery below the free-delivery threshold only', () => {
  assert.equal(calculateCartTotals([{ price: 498, quantity: 1 }]).deliveryFee, 49);
  assert.equal(calculateCartTotals([{ price: 499, quantity: 1 }]).deliveryFee, 0);
});

test('rejects negative prices and invalid quantities', () => {
  assert.throws(
    () => calculateCartTotals([{ price: -1, quantity: 1 }]),
    /non-negative price/
  );
  assert.throws(
    () => calculateCartTotals([{ price: 100, quantity: 0.5 }]),
    /positive quantity/
  );
});

test('calculates totals for custom ingredient prices with paise precision', () => {
  assert.deepEqual(
    calculateCartTotals([
      { price: 100.25, quantity: 1 },
      { price: 50.5, quantity: 1 }
    ]),
    { subtotal: 150.75, tax: 8, deliveryFee: 49, total: 207.75 }
  );
});

test('uses the same rounded size and crust pricing rules in the cart', () => {
  assert.equal(
    calculatePizzaPrice({ price: 249 }, 'Large', 'Cheese Burst'),
    454
  );
});
