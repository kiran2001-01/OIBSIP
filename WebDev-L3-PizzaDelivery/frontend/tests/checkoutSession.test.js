import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearCheckoutSession,
  getCheckoutRequestKey,
  hasCheckoutOrderAttempt,
  markCheckoutOrderAttempted,
  rotateCheckoutRequestKey
} from '../src/utils/checkoutSession.js';

const makeStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
};

test('reuses the checkout key after reload for an unchanged cart', () => {
  const storage = makeStorage();
  const items = [{ key: 'pizza-1|Small|Regular|', quantity: 2 }];
  const firstKey = getCheckoutRequestKey(items, storage, () => 'first-key');
  const afterReload = getCheckoutRequestKey(items, storage, () => 'unexpected-key');

  assert.equal(firstKey, 'first-key');
  assert.equal(afterReload, firstKey);
});

test('rotates the key when the cart or delivery details change', () => {
  const storage = makeStorage();
  const firstItems = [{ key: 'pizza-1|Small|Regular|', quantity: 1 }];
  const changedItems = [{ key: 'pizza-1|Large|Regular|', quantity: 1 }];
  getCheckoutRequestKey(firstItems, storage, () => 'first-key');

  assert.equal(
    getCheckoutRequestKey(changedItems, storage, () => 'second-key'),
    'second-key'
  );
  assert.equal(
    rotateCheckoutRequestKey(changedItems, storage, () => 'third-key'),
    'third-key'
  );
});

test('clears the retry marker after verified checkout', () => {
  const storage = makeStorage();
  getCheckoutRequestKey([], storage, () => 'first-key');
  markCheckoutOrderAttempted(storage);
  assert.equal(hasCheckoutOrderAttempt(storage), true);

  clearCheckoutSession(storage);

  assert.equal(hasCheckoutOrderAttempt(storage), false);
  assert.equal(getCheckoutRequestKey([], storage, () => 'new-key'), 'new-key');
});
