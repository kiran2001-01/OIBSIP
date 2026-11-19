const assert = require("node:assert/strict");
const { test } = require("node:test");
const { menuProducts, seedMenu } = require("../scripts/seedMenu");

const makePizzaStore = (initialProducts = []) => {
  const products = new Map(
    initialProducts.map((product) => [product.name.toLowerCase(), { ...product }])
  );

  return {
    products,
    model: {
      async exists(filter) {
        const pattern = new RegExp(filter.name.$regex, filter.name.$options);
        return [...products.values()].some((product) => pattern.test(product.name))
          ? { _id: "existing" }
          : null;
      },
      async create(product) {
        products.set(product.name.toLowerCase(), { ...product });
        return product;
      }
    }
  };
};

test("seeds all menu products and is safe to rerun", async () => {
  const store = makePizzaStore();

  const firstRun = await seedMenu(store.model);
  const secondRun = await seedMenu(store.model);

  assert.deepEqual(firstRun, { created: menuProducts.length, skipped: 0 });
  assert.deepEqual(secondRun, { created: 0, skipped: menuProducts.length });
  assert.equal(store.products.size, menuProducts.length);
  assert.ok([...store.products.values()].some((product) => product.category === "Non-Veg"));
  assert.ok([...store.products.values()].some((product) => product.category === "Veg"));
});

test("does not overwrite an existing pizza with a matching name", async () => {
  const existingProduct = {
    name: "Margherita Pizza",
    description: "Custom description",
    price: 999,
    category: "Classic"
  };
  const store = makePizzaStore([existingProduct]);

  const result = await seedMenu(store.model);

  assert.deepEqual(result, { created: menuProducts.length - 1, skipped: 1 });
  assert.equal(
    store.products.get("margherita pizza").description,
    "Custom description"
  );
  assert.equal(store.products.get("margherita pizza").price, 999);
});
