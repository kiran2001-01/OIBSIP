const REQUEST_KEY = 'pizza_checkout_request_key';
const CART_FINGERPRINT = 'pizza_checkout_cart_fingerprint';
const ORDER_ATTEMPTED = 'pizza_checkout_order_attempted';

const fingerprintCart = (items) =>
  JSON.stringify(items.map(({ key, quantity }) => [key, quantity]));

export const getCheckoutRequestKey = (
  items,
  storage = window.sessionStorage,
  createKey = () => window.crypto.randomUUID()
) => {
  const fingerprint = fingerprintCart(items);
  const storedFingerprint = storage.getItem(CART_FINGERPRINT);
  const storedKey = storage.getItem(REQUEST_KEY);

  if (storedFingerprint === fingerprint && storedKey) {
    return storedKey;
  }

  const requestKey = createKey();
  storage.setItem(CART_FINGERPRINT, fingerprint);
  storage.setItem(REQUEST_KEY, requestKey);
  storage.removeItem(ORDER_ATTEMPTED);
  return requestKey;
};

export const rotateCheckoutRequestKey = (
  items,
  storage = window.sessionStorage,
  createKey = () => window.crypto.randomUUID()
) => {
  const requestKey = createKey();
  storage.setItem(CART_FINGERPRINT, fingerprintCart(items));
  storage.setItem(REQUEST_KEY, requestKey);
  storage.removeItem(ORDER_ATTEMPTED);
  return requestKey;
};

export const markCheckoutOrderAttempted = (storage = window.sessionStorage) => {
  storage.setItem(ORDER_ATTEMPTED, 'true');
};

export const hasCheckoutOrderAttempt = (storage = window.sessionStorage) =>
  storage.getItem(ORDER_ATTEMPTED) === 'true';

export const clearCheckoutSession = (storage = window.sessionStorage) => {
  storage.removeItem(REQUEST_KEY);
  storage.removeItem(CART_FINGERPRINT);
  storage.removeItem(ORDER_ATTEMPTED);
};
