import { useEffect, useMemo, useState } from 'react';
import CartContext from './cart-context';
import { isValidCartItem } from '../utils/cartItems';

const loadCart = () => {
  try {
    const savedCart = localStorage.getItem('pizza_cart');
    const parsedCart = savedCart ? JSON.parse(savedCart) : [];
    if (!Array.isArray(parsedCart)) {
      console.error('Saved cart data is invalid and was ignored.');
      return [];
    }

    const validItems = parsedCart.filter(isValidCartItem);
    if (validItems.length !== parsedCart.length) {
      console.error('Invalid saved cart items were discarded.');
    }
    return validItems;
  } catch (error) {
    console.error('Unable to read saved cart:', error);
    return [];
  }
};

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState(loadCart);

  useEffect(() => {
    localStorage.setItem('pizza_cart', JSON.stringify(items));
  }, [items]);

  const addItem = (item) => {
    setItems((currentItems) => {
      const quantity = Math.min(Math.floor(item.stock), item.quantity);
      const newItem = { ...item, quantity };
      if (!isValidCartItem(newItem)) {
        console.error('Invalid cart item was not added.');
        return currentItems;
      }

      const existing = currentItems.find((cartItem) => cartItem.key === item.key);

      if (existing) {
        return currentItems.map((cartItem) =>
          cartItem.key === item.key
            ? {
                ...cartItem,
                quantity: Math.min(
                  Math.floor(cartItem.stock),
                  cartItem.quantity + newItem.quantity
                )
              }
            : cartItem
        );
      }

      return [...currentItems, newItem];
    });
  };

  const updateQuantity = (key, quantity) => {
    if (!Number.isInteger(quantity) || quantity < 1) return;

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.key === key
          ? { ...item, quantity: Math.min(Math.floor(item.stock), quantity) }
          : item
      )
    );
  };

  const updateItem = (key, updatedItem) => {
    if (!isValidCartItem({ ...updatedItem, quantity: 1 })) {
      console.error('Invalid cart customization was not saved.');
      return;
    }

    setItems((currentItems) => {
      const currentItem = currentItems.find((item) => item.key === key);
      if (!currentItem) return currentItems;

      const matchingItem = currentItems.find(
        (item) => item.key === updatedItem.key && item.key !== key
      );
      if (matchingItem) {
        return currentItems
          .filter((item) => item.key !== key && item.key !== updatedItem.key)
          .concat({
            ...updatedItem,
            quantity: Math.min(
              Math.floor(updatedItem.stock),
              matchingItem.quantity + currentItem.quantity
            )
          });
      }

      return currentItems.map((item) =>
        item.key === key
          ? {
              ...updatedItem,
              quantity: Math.min(Math.floor(updatedItem.stock), currentItem.quantity)
            }
          : item
      );
    });
  };

  const removeItem = (key) => {
    setItems((currentItems) => currentItems.filter((item) => item.key !== key));
  };

  const clearCart = () => setItems([]);
  const itemCount = items.reduce((total, item) => total + item.quantity, 0);

  const value = useMemo(
    () => ({ items, itemCount, addItem, updateItem, updateQuantity, removeItem, clearCart }),
    [items, itemCount]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
