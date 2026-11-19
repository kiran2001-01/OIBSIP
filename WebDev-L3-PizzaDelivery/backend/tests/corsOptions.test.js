const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createCorsOptions } = require("../utils/corsOptions");

test("development CORS allows the configured origin and Vite fallback port only", () => {
  const options = createCorsOptions({
    FRONTEND_URL: "http://localhost:5173",
    NODE_ENV: "development"
  });

  assert.deepEqual(options.origin, [
    "http://localhost:5173",
    "http://localhost:5174"
  ]);
  assert.equal(options.credentials, true);
  assert.equal(options.origin.includes("http://localhost:5175"), false);
});

test("production CORS remains restricted to its configured frontend origin", () => {
  const options = createCorsOptions({
    FRONTEND_URL: "https://pizza.example",
    NODE_ENV: "production"
  });

  assert.deepEqual(options.origin, ["https://pizza.example"]);
  assert.equal(options.credentials, true);
});
