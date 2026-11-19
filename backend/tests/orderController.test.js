const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Pizza = require("../models/Pizza");
const Inventory = require("../models/Inventory");
const { createOrder, getOrderById } = require("../controllers/orderController");

const originalMethods = {
  orderFindOne: Order.findOne,
  orderCreate: Order.create,
  pizzaFind: Pizza.find,
  inventoryFind: Inventory.find
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

const userId = new mongoose.Types.ObjectId();
const pizzaId = new mongoose.Types.ObjectId();
const pizza = {
  _id: pizzaId,
  name: "Margherita Pizza",
  image: "pizza.jpg",
  price: 249,
  sizes: ["Small", "Medium", "Large"],
  crusts: ["Regular", "Thin", "Cheese Burst"],
  toppings: ["Extra Cheese"],
  available: true,
  stock: 10
};
const customIngredients = [
  { _id: new mongoose.Types.ObjectId(), name: "Classic Base", category: "base", price: 80, stock: 5 },
  { _id: new mongoose.Types.ObjectId(), name: "Tomato Sauce", category: "sauce", price: 30, stock: 5 },
  { _id: new mongoose.Types.ObjectId(), name: "Mozzarella", category: "cheese", price: 60, stock: 5 },
  { _id: new mongoose.Types.ObjectId(), name: "Capsicum", category: "vegetable", price: 20, stock: 5 }
];

const makeRequest = (items, overrides = {}) => ({
  user: { _id: userId },
  params: { id: new mongoose.Types.ObjectId().toString() },
  body: {
    items,
    deliveryAddress: {
      fullName: "Test User",
      phone: "8328531621",
      address: "10 Test Street",
      city: "Hyderabad",
      postalCode: "500001"
    }
  },
  get: (name) => name === "Idempotency-Key" ? "checkout-request-1" : undefined,
  ...overrides
});

beforeEach(() => {
  Order.findOne = originalMethods.orderFindOne;
  Order.create = originalMethods.orderCreate;
  Pizza.find = originalMethods.pizzaFind;
  Inventory.find = originalMethods.inventoryFind;
});

afterEach(() => {
  Order.findOne = originalMethods.orderFindOne;
  Order.create = originalMethods.orderCreate;
  Pizza.find = originalMethods.pizzaFind;
  Inventory.find = originalMethods.inventoryFind;
});

test("creates an order using database prices and calculated totals", async () => {
  let createdOrder;
  Order.findOne = async () => null;
  Pizza.find = async () => [pizza];
  Order.create = async (value) => {
    createdOrder = value;
    return { _id: new mongoose.Types.ObjectId(), ...value };
  };
  const response = makeResponse();

  await createOrder(
    makeRequest([{
      pizzaId: pizzaId.toString(),
      size: "Large",
      crust: "Cheese Burst",
      toppings: ["Extra Cheese", "Extra Cheese"],
      quantity: 2,
      price: 0.01
    }]),
    response
  );

  assert.equal(response.statusCode, 201);
  assert.equal(createdOrder.items[0].unitPrice, 454);
  assert.equal(createdOrder.items[0].lineTotal, 908);
  assert.deepEqual(createdOrder.items[0].toppings, ["Extra Cheese"]);
  assert.deepEqual(
    {
      subtotal: createdOrder.subtotal,
      tax: createdOrder.tax,
      deliveryFee: createdOrder.deliveryFee,
      totalAmount: createdOrder.totalAmount
    },
    { subtotal: 908, tax: 45, deliveryFee: 0, totalAmount: 953 }
  );
  assert.equal(createdOrder.user, userId);
  assert.equal(createdOrder.idempotencyKey, "checkout-request-1");
});

test("creates custom pizza items using validated inventory prices", async () => {
  let createdOrder;
  Order.findOne = async () => null;
  Inventory.find = async () => customIngredients;
  Order.create = async (value) => {
    createdOrder = value;
    return { _id: new mongoose.Types.ObjectId(), ...value };
  };
  const response = makeResponse();

  await createOrder(
    makeRequest([{
      custom: {
        baseId: customIngredients[0]._id.toString(),
        sauceId: customIngredients[1]._id.toString(),
        cheeseId: customIngredients[2]._id.toString(),
        vegetableIds: [customIngredients[3]._id.toString()]
      },
      quantity: 2
    }]),
    response
  );

  const item = createdOrder.items[0];
  assert.equal(response.statusCode, 201);
  assert.equal(item.pizza, null);
  assert.equal(item.name, "Custom Pizza");
  assert.equal(item.size, "Custom");
  assert.equal(item.crust, "Classic Base");
  assert.deepEqual(item.toppings, ["Tomato Sauce", "Mozzarella", "Capsicum"]);
  assert.equal(item.unitPrice, 190);
  assert.equal(item.lineTotal, 380);
  assert.equal(item.customIngredients.length, 4);
});

test("creates custom pizza items with selected size and upcharge", async () => {
  let createdOrder;
  Order.findOne = async () => null;
  Inventory.find = async () => customIngredients;
  Order.create = async (value) => {
    createdOrder = value;
    return { _id: new mongoose.Types.ObjectId(), ...value };
  };
  const response = makeResponse();

  await createOrder(
    makeRequest([{
      custom: {
        baseId: customIngredients[0]._id.toString(),
        sauceId: customIngredients[1]._id.toString(),
        cheeseId: customIngredients[2]._id.toString(),
        vegetableIds: [customIngredients[3]._id.toString()],
        size: "Medium"
      },
      quantity: 1
    }]),
    response
  );

  const item = createdOrder.items[0];
  assert.equal(response.statusCode, 201);
  assert.equal(item.name, "Custom Pizza");
  assert.equal(item.size, "Medium (10\")");
  assert.equal(item.unitPrice, 230);
  assert.equal(item.lineTotal, 230);
});

test("rejects unsupported custom pizza sizes", async () => {
  let createCount = 0;
  Order.findOne = async () => null;
  Order.create = async () => {
    createCount += 1;
  };
  const response = makeResponse();

  await createOrder(
    makeRequest([{
      custom: {
        baseId: customIngredients[0]._id.toString(),
        sauceId: customIngredients[1]._id.toString(),
        cheeseId: customIngredients[2]._id.toString(),
        vegetableIds: [],
        size: "Jumbo"
      },
      quantity: 1
    }]),
    response
  );

  assert.equal(response.statusCode, 400);
  assert.equal(createCount, 0);
});

test("allows custom order items without a pizza reference but keeps regular pizzas required", async () => {
  const customOrder = new Order({
    user: userId,
    idempotencyKey: "custom-order",
    items: [{
      pizza: null,
      customIngredients: [{
        category: "base",
        ingredient: customIngredients[0]._id,
        name: customIngredients[0].name,
        price: customIngredients[0].price
      }],
      name: "Custom Pizza",
      size: "Custom",
      crust: "Classic Base",
      quantity: 1,
      unitPrice: 80,
      lineTotal: 80
    }],
    deliveryAddress: {
      fullName: "Test User",
      phone: "8328531621",
      address: "10 Test Street",
      city: "Hyderabad",
      postalCode: "500001"
    },
    subtotal: 80,
    tax: 4,
    deliveryFee: 0,
    totalAmount: 84
  });
  const regularOrder = new Order({
    items: [{
      name: "Margherita Pizza",
      size: "Medium",
      crust: "Regular",
      quantity: 1,
      unitPrice: 249,
      lineTotal: 249
    }]
  });

  await customOrder.validate();
  await assert.rejects(
    regularOrder.validate(),
    (error) => Boolean(error.errors["items.0.pizza"])
  );
});

test("returns the existing order for a repeated idempotency key", async () => {
  const existingOrder = { _id: "existing-order" };
  let pizzaQueryCount = 0;
  let createCount = 0;
  Order.findOne = async (filter) => {
    assert.equal(filter.user, userId);
    assert.equal(filter.idempotencyKey, "checkout-request-1");
    return existingOrder;
  };
  Pizza.find = async () => {
    pizzaQueryCount += 1;
    return [pizza];
  };
  Order.create = async () => {
    createCount += 1;
  };
  const response = makeResponse();

  await createOrder(makeRequest([{ pizzaId: pizzaId.toString() }]), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.order, existingOrder);
  assert.equal(pizzaQueryCount, 0);
  assert.equal(createCount, 0);
});

test("rejects fractional quantities before creating an order", async () => {
  let createCount = 0;
  Order.findOne = async () => null;
  Pizza.find = async () => [pizza];
  Order.create = async () => {
    createCount += 1;
  };
  const response = makeResponse();

  await createOrder(
    makeRequest([{
      pizzaId: pizzaId.toString(),
      size: "Small",
      crust: "Regular",
      quantity: 1.5
    }]),
    response
  );

  assert.equal(response.statusCode, 400);
  assert.equal(createCount, 0);
});

test("does not return another customer's order", async () => {
  let query;
  Order.findOne = async (filter) => {
    query = filter;
    return null;
  };
  const request = makeRequest([]);
  const response = makeResponse();

  await getOrderById(request, response);

  assert.equal(response.statusCode, 404);
  assert.equal(query._id, request.params.id);
  assert.equal(query.user, userId);
});
