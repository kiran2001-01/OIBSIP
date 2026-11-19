const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Pizza = require("../models/Pizza");
const {
  getPizzas,
  getPizzaById,
  createPizza,
  updatePizza,
  deletePizza
} = require("../controllers/pizzaController");

const originalMethods = {
  pizzaFind: Pizza.find,
  pizzaFindById: Pizza.findById,
  pizzaCreate: Pizza.create,
  pizzaFindByIdAndUpdate: Pizza.findByIdAndUpdate,
  pizzaFindByIdAndDelete: Pizza.findByIdAndDelete,
  orderExists: Order.exists
};

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

beforeEach(() => {
  Pizza.find = originalMethods.pizzaFind;
  Pizza.findById = originalMethods.pizzaFindById;
  Pizza.create = originalMethods.pizzaCreate;
  Pizza.findByIdAndUpdate = originalMethods.pizzaFindByIdAndUpdate;
  Pizza.findByIdAndDelete = originalMethods.pizzaFindByIdAndDelete;
  Order.exists = originalMethods.orderExists;
});

afterEach(() => {
  Pizza.find = originalMethods.pizzaFind;
  Pizza.findById = originalMethods.pizzaFindById;
  Pizza.create = originalMethods.pizzaCreate;
  Pizza.findByIdAndUpdate = originalMethods.pizzaFindByIdAndUpdate;
  Pizza.findByIdAndDelete = originalMethods.pizzaFindByIdAndDelete;
  Order.exists = originalMethods.orderExists;
});

test("lists pizzas with escaped search terms and category filters", async () => {
  let filter;
  const pizzas = [{ name: "Farmhouse Pizza" }];
  Pizza.find = (query) => {
    filter = query;
    return { sort: async () => pizzas };
  };
  const response = makeResponse();

  await getPizzas({ query: { search: "Farm.*", category: "Veg" } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.pizzas, pizzas);
  assert.equal(filter.category, "Veg");
  assert.equal(filter.$or[0].name.$regex, "Farm\\.\\*");
});

test("creates a pizza with the existing schema defaults", async () => {
  const userId = new mongoose.Types.ObjectId();
  let createdPizza;
  Pizza.create = async (value) => {
    createdPizza = value;
    return value;
  };
  const response = makeResponse();

  await createPizza({
    user: { _id: userId },
    body: {
      name: "Test Pizza",
      description: "Test description",
      category: "Veg",
      price: 250
    }
  }, response);

  assert.equal(response.statusCode, 201);
  assert.equal(createdPizza.createdBy, userId);
  assert.deepEqual(createdPizza.sizes, ["Small", "Medium", "Large"]);
  assert.equal(createdPizza.available, true);
  assert.equal(createdPizza.stock, 50);
});

test("updates a pizza with schema validation enabled", async () => {
  const pizzaId = new mongoose.Types.ObjectId().toString();
  let query;
  let update;
  let options;
  Pizza.findByIdAndUpdate = async (...args) => {
    [query, update, options] = args;
    return { _id: pizzaId, ...update };
  };
  const response = makeResponse();

  await updatePizza({
    params: { id: pizzaId },
    body: { price: 399, description: "Updated" }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(query, pizzaId);
  assert.deepEqual(update, { price: 399, description: "Updated" });
  assert.equal(options.runValidators, true);
});

test("rejects invalid IDs and prevents deleting pizzas referenced by orders", async () => {
  const invalidIdResponse = makeResponse();
  await getPizzaById({ params: { id: "not-an-id" } }, invalidIdResponse);
  assert.equal(invalidIdResponse.statusCode, 400);

  const pizzaId = new mongoose.Types.ObjectId().toString();
  Order.exists = async () => true;
  let deleteCalled = false;
  Pizza.findByIdAndDelete = async () => {
    deleteCalled = true;
  };
  const deleteResponse = makeResponse();

  await deletePizza({ params: { id: pizzaId } }, deleteResponse);

  assert.equal(deleteResponse.statusCode, 409);
  assert.equal(deleteCalled, false);
});
