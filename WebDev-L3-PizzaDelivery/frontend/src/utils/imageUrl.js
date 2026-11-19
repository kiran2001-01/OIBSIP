const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const apiOrigin = new URL(apiUrl, window.location.origin).origin;

export const getImageUrl = (image, fallback = '/uploads/pizzas/default-pizza.svg') => {
  const source = image || fallback;
  return source.startsWith('/') ? `${apiOrigin}${source}` : source;
};
