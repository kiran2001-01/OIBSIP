const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const Inventory = require("../models/Inventory");
const Pizza = require("../models/Pizza");
const {
  deductOrderStock,
  restoreOrderStock,
  withStockTransaction
} = require("../services/inventoryService");

const originalCreateTransport = nodemailer.createTransport;
const originalEmailEnvironment = {
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  EMAIL_HOST: process.env.EMAIL_HOST,
  EMAIL_PORT: process.env.EMAIL_PORT,
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASSWORD: process.env.EMAIL_PASSWORD,
  EMAIL_FROM: process.env.EMAIL_FROM
};
const originalMethods = {
  pizzaFindOneAndUpdate: Pizza.findOneAndUpdate,
  pizzaFindByIdAndUpdate: Pizza.findByIdAndUpdate,
  pizzaUpdateOne: Pizza.updateOne,
  inventoryFindOneAndUpdate: Inventory.findOneAndUpdate,
  inventoryFindByIdAndUpdate: Inventory.findByIdAndUpdate,
  inventoryUpdateOne: Inventory.updateOne
};

let pizzaStocks;
let ingredientStocks;
const originalClient = mongoose.connection.client;
const originalStartSession = mongoose.startSession;

const updateStock = (stocks, id, update) => {
  const record = stocks.get(String(id));
  if (!record) return null;
  record.stock += update.$inc.stock;
  return record;
};

beforeEach(() => {
  pizzaStocks = new Map([
    ["pizza-1", { _id: "pizza-1", stock: 10, available: true }]
  ]);
  ingredientStocks = new Map([
    ["ingredient-1", {
      _id: "ingredient-1",
      stock: 100,
      lowStockThreshold: 10,
      lowStockNotifiedAt: null,
      name: "Cheese",
      unit: "g"
    }]
  ]);
  delete process.env.ADMIN_EMAIL;
  delete process.env.EMAIL_HOST;

  Pizza.findOneAndUpdate = async (filter, update) => {
    const record = pizzaStocks.get(String(filter._id));
    if (!record || !record.available || record.stock < filter.stock.$gte) return null;
    record.stock += update.$inc.stock;
    return record;
  };
  Pizza.findByIdAndUpdate = async (id, update) => updateStock(pizzaStocks, id, update);
  Pizza.updateOne = async (filter, update) => ({
    matchedCount: updateStock(pizzaStocks, filter._id, update) ? 1 : 0
  });
  Inventory.findOneAndUpdate = async (filter, update) => {
    const record = ingredientStocks.get(String(filter._id));
    if (!record || record.stock < filter.stock.$gte) return null;
    record.stock += update.$inc.stock;
    return record;
  };
  Inventory.findByIdAndUpdate = async (id, update) => updateStock(ingredientStocks, id, update);
  Inventory.updateOne = async (filter, update) => {
    const record = ingredientStocks.get(String(filter._id));
    if (!record) return { matchedCount: 0 };
    if (update.$inc) record.stock += update.$inc.stock;
    if (update.$set) Object.assign(record, update.$set);
    return { matchedCount: 1 };
  };
});

afterEach(() => {
  if (originalClient === undefined) {
    delete mongoose.connection.client;
  } else {
    mongoose.connection.client = originalClient;
  }
  mongoose.startSession = originalStartSession;
  nodemailer.createTransport = originalCreateTransport;
  for (const [key, value] of Object.entries(originalEmailEnvironment)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  Pizza.findOneAndUpdate = originalMethods.pizzaFindOneAndUpdate;
  Pizza.findByIdAndUpdate = originalMethods.pizzaFindByIdAndUpdate;
  Pizza.updateOne = originalMethods.pizzaUpdateOne;
  Inventory.findOneAndUpdate = originalMethods.inventoryFindOneAndUpdate;
  Inventory.findByIdAndUpdate = originalMethods.inventoryFindByIdAndUpdate;
  Inventory.updateOne = originalMethods.inventoryUpdateOne;
});

const makeOrder = (quantity) => ({
  items: [{
    name: "Cheese pizza",
    quantity,
    pizza: {
      _id: "pizza-1",
      ingredients: [{
        ingredient: { _id: "ingredient-1" },
        amountPerPizza: 3
      }]
    }
  }]
});

test("deducts pizza and recipe stock in order quantities and records exact usage", async () => {
  const order = makeOrder(3);

  await deductOrderStock(order);

  assert.equal(pizzaStocks.get("pizza-1").stock, 7);
  assert.equal(ingredientStocks.get("ingredient-1").stock, 91);
  assert.deepEqual(order.stockUsage.map(({ kind, amount }) => ({ kind, amount })), [
    { kind: "pizza", amount: 3 },
    { kind: "ingredient", amount: 9 }
  ]);
});

test("deducts custom ingredients per pizza quantity without deducting a pizza", async () => {
  const order = {
    items: [{
      name: "Custom Pizza",
      quantity: 3,
      pizza: null,
      customIngredients: [{ ingredient: "ingredient-1" }]
    }]
  };

  await deductOrderStock(order);

  assert.equal(pizzaStocks.get("pizza-1").stock, 10);
  assert.equal(ingredientStocks.get("ingredient-1").stock, 97);
  assert.deepEqual(order.stockUsage, [
    { kind: "ingredient", item: "ingredient-1", amount: 3 }
  ]);
});

test("fallback restoration restores custom ingredients without looking up a pizza", async () => {
  const order = {
    stockDeducted: true,
    items: [{
      pizza: null,
      quantity: 2,
      customIngredients: [{
        ingredient: { _id: "ingredient-1" },
        name: "Cheese"
      }]
    }],
    async populate() {
      return this;
    }
  };

  await restoreOrderStock(order);

  assert.equal(pizzaStocks.get("pizza-1").stock, 10);
  assert.equal(ingredientStocks.get("ingredient-1").stock, 102);
});

test("uses a MongoDB transaction when connected to a replica set", async () => {
  const sessions = new Set();
  let sessionsEnded = 0;
  mongoose.connection.client = {
    topology: { description: { type: "ReplicaSetWithPrimary" } }
  };
  mongoose.startSession = async () => {
    const session = {
      withTransaction: async (operation) => operation(),
      endSession: async () => {
        sessionsEnded += 1;
      }
    };
    sessions.add(session);
    return session;
  };
  Pizza.findOneAndUpdate = async (filter, update, options) => {
    assert.ok(sessions.has(options.session));
    return updateStock(pizzaStocks, filter._id, update);
  };
  Inventory.findOneAndUpdate = async (filter, update, options) => {
    assert.ok(sessions.has(options.session));
    return updateStock(ingredientStocks, filter._id, update);
  };
  Pizza.findByIdAndUpdate = async (id, update, options) => {
    assert.ok(sessions.has(options.session));
    return updateStock(pizzaStocks, id, update);
  };
  Inventory.findByIdAndUpdate = async (id, update, options) => {
    assert.ok(sessions.has(options.session));
    return updateStock(ingredientStocks, id, update);
  };
  Inventory.updateOne = async (filter, update, options) => {
    assert.ok(sessions.has(options.session));
    const record = ingredientStocks.get(String(filter._id));
    Object.assign(record, update.$set);
    return { matchedCount: 1 };
  };

  const order = makeOrder(2);
  await deductOrderStock(order);

  assert.equal(pizzaStocks.get("pizza-1").stock, 8);
  assert.equal(ingredientStocks.get("ingredient-1").stock, 94);

  order.stockDeducted = true;
  await restoreOrderStock(order);

  assert.equal(pizzaStocks.get("pizza-1").stock, 10);
  assert.equal(ingredientStocks.get("ingredient-1").stock, 100);
  assert.equal(sessionsEnded, 2);
});

test("refuses payment stock transactions on a standalone MongoDB deployment", async () => {
  mongoose.connection.client = {
    topology: { description: { type: "Single" } }
  };
  let operationCalled = false;

  await assert.rejects(
    withStockTransaction(async () => {
      operationCalled = true;
    }, true),
    /replica set or sharded MongoDB deployment/
  );

  assert.equal(operationCalled, false);
});

test("rolls back pizza stock if a recipe ingredient is unavailable", async () => {
  ingredientStocks.get("ingredient-1").stock = 2;
  const order = makeOrder(3);

  await assert.rejects(deductOrderStock(order), /ingredient in this order is out of stock/);

  assert.equal(pizzaStocks.get("pizza-1").stock, 10);
  assert.equal(ingredientStocks.get("ingredient-1").stock, 2);
});

test("restores recorded ingredient amounts instead of a subsequently changed recipe", async () => {
  ingredientStocks.get("ingredient-1").stock = 91;
  const order = {
    stockDeducted: true,
    stockUsage: [
      { kind: "pizza", item: "pizza-1", amount: 3 },
      { kind: "ingredient", item: "ingredient-1", amount: 9 }
    ]
  };

  await restoreOrderStock(order);

  assert.equal(pizzaStocks.get("pizza-1").stock, 13);
  assert.equal(ingredientStocks.get("ingredient-1").stock, 100);
});

test("sends a low-stock email when an ingredient crosses its threshold", async () => {
  process.env.ADMIN_EMAIL = "admin@example.test";
  process.env.EMAIL_HOST = "smtp.example.test";
  process.env.EMAIL_PORT = "587";
  const sentMessages = [];
  nodemailer.createTransport = () => ({
    sendMail: async (message) => sentMessages.push(message)
  });
  ingredientStocks.get("ingredient-1").stock = 20;
  const order = makeOrder(1);
  order.items[0].pizza.ingredients[0].amountPerPizza = 11;

  await deductOrderStock(order);

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].to, "admin@example.test");
  assert.match(sentMessages[0].subject, /Low stock alert: Cheese/);
  assert.ok(ingredientStocks.get("ingredient-1").lowStockNotifiedAt instanceof Date);
});
