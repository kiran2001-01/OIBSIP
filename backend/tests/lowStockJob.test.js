const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const Inventory = require("../models/Inventory");
const nodemailer = require("nodemailer");
const { checkLowStock } = require("../services/lowStockJob");

const originalMethods = {
  inventoryFind: Inventory.find,
  inventoryUpdateMany: Inventory.updateMany,
  createTransport: nodemailer.createTransport
};
const originalEnvironment = {
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  EMAIL_HOST: process.env.EMAIL_HOST,
  EMAIL_PORT: process.env.EMAIL_PORT,
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASSWORD: process.env.EMAIL_PASSWORD,
  EMAIL_FROM: process.env.EMAIL_FROM
};

beforeEach(() => {
  process.env.ADMIN_EMAIL = "admin@example.test";
  process.env.EMAIL_HOST = "smtp.example.test";
  process.env.EMAIL_PORT = "587";
});

afterEach(() => {
  Inventory.find = originalMethods.inventoryFind;
  Inventory.updateMany = originalMethods.inventoryUpdateMany;
  nodemailer.createTransport = originalMethods.createTransport;
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test("resets restocked alerts and sends one email for all newly low items", async () => {
  const sentMessages = [];
  const updatedFilters = [];
  const restocked = {
    _id: "restocked",
    name: "Restocked",
    stock: 11,
    lowStockThreshold: 10,
    lowStockNotifiedAt: new Date()
  };
  const lowItems = [
    { _id: "low-1", name: "Cheese", unit: "piece", stock: 2, lowStockThreshold: 5 },
    { _id: "low-2", name: "<Sauce>", unit: "ml", stock: 0, lowStockThreshold: 3 }
  ];

  Inventory.find = (filter) => (
    filter.lowStockNotifiedAt
      ? Promise.resolve([restocked])
      : { sort: async () => lowItems }
  );
  Inventory.updateMany = async (filter) => {
    updatedFilters.push(filter);
    return { matchedCount: 1 };
  };
  nodemailer.createTransport = () => ({
    sendMail: async (message) => sentMessages.push(message)
  });

  await checkLowStock();

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].to, "admin@example.test");
  assert.match(sentMessages[0].html, /Cheese/);
  assert.match(sentMessages[0].html, /&lt;Sauce&gt;/);
  assert.equal(updatedFilters.length, 2);
  assert.deepEqual(updatedFilters[0]._id.$in, ["restocked"]);
  assert.deepEqual(updatedFilters[1]._id.$in, ["low-1", "low-2"]);
});
