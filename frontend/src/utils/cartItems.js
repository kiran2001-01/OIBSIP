const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

export const isCustomCartItem = (item) =>
  item?.isCustom === true || item?.custom !== undefined;

const isValidCustomSelection = (custom) =>
  custom &&
  isNonEmptyString(custom.baseId) &&
  isNonEmptyString(custom.sauceId) &&
  isNonEmptyString(custom.cheeseId) &&
  Array.isArray(custom.vegetableIds) &&
  custom.vegetableIds.length <= 8 &&
  custom.vegetableIds.every(isNonEmptyString) &&
  new Set(custom.vegetableIds).size === custom.vegetableIds.length &&
  (custom.size === undefined || ['Small', 'Medium', 'Large'].includes(custom.size));

const isValidCustomSummary = (summary) =>
  summary === undefined ||
  (
    summary &&
    (summary.size === undefined || typeof summary.size === 'string') &&
    (summary.sizeUpcharge === undefined || (typeof summary.sizeUpcharge === 'number' && Number.isFinite(summary.sizeUpcharge) && summary.sizeUpcharge >= 0)) &&
    typeof summary.base === 'string' &&
    typeof summary.sauce === 'string' &&
    typeof summary.cheese === 'string' &&
    Array.isArray(summary.vegetables) &&
    summary.vegetables.every((vegetable) => typeof vegetable === 'string') &&
    (summary.basePrice === undefined || (typeof summary.basePrice === 'number' && Number.isFinite(summary.basePrice) && summary.basePrice >= 0)) &&
    (summary.saucePrice === undefined || (typeof summary.saucePrice === 'number' && Number.isFinite(summary.saucePrice) && summary.saucePrice >= 0)) &&
    (summary.cheesePrice === undefined || (typeof summary.cheesePrice === 'number' && Number.isFinite(summary.cheesePrice) && summary.cheesePrice >= 0)) &&
    (summary.vegetableDetails === undefined || (
      Array.isArray(summary.vegetableDetails) &&
      summary.vegetableDetails.every((item) =>
        item &&
        typeof item.name === 'string' &&
        typeof item.price === 'number' &&
        Number.isFinite(item.price) &&
        item.price >= 0
      )
    ))
  );

export const isValidCartItem = (item) => {
  if (
    !item ||
    !isNonEmptyString(item.key) ||
    typeof item.name !== 'string' ||
    !Number.isFinite(item.price) ||
    item.price < 0 ||
    !Number.isSafeInteger(Math.round(item.price * 100)) ||
    !Number.isInteger(item.quantity) ||
    item.quantity < 1 ||
    !Number.isFinite(item.stock) ||
    item.stock < 1
  ) {
    return false;
  }

  if (isCustomCartItem(item)) {
    return isValidCustomSelection(item.custom) && isValidCustomSummary(item.customSummary);
  }

  return (
    isNonEmptyString(item.pizzaId) &&
    typeof item.size === 'string' &&
    typeof item.crust === 'string' &&
    Array.isArray(item.toppings) &&
    item.toppings.every((topping) => typeof topping === 'string')
  );
};
