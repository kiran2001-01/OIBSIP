const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const express = require("express");
const { test } = require("node:test");
const authRoutes = require("../routes/authRoutes");
const User = require("../models/User");

const postLogin = (port, payload) =>
  new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/auth/login",
        method: "POST",
        headers: { "Content-Type": "application/json" }
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      }
    );
    request.on("error", reject);
    request.end(JSON.stringify(payload));
  });

test("counts failed logins but does not rate-limit successful logins", async (t) => {
  const originalFindOne = User.findOne;
  const originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-jwt-signing";
  User.findOne = async ({ email }) => email === "test@example.test"
    ? {
        _id: "test-user",
        role: "user",
        email,
        emailVerified: true,
        matchPassword: async (password) => password === "correct-password",
        toJSON: () => ({ _id: "test-user", email, role: "user" })
      }
    : null;

  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    User.findOne = originalFindOne;
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
    await new Promise((resolve) => server.close(resolve));
  });

  const { port } = server.address();
  const successfulStatuses = [];
  for (let attempt = 0; attempt < 11; attempt += 1) {
    successfulStatuses.push(
      await postLogin(port, {
        email: " Test@Example.Test ",
        password: "correct-password"
      })
    );
  }

  assert.deepEqual(successfulStatuses, Array(11).fill(200));

  const failedStatuses = [];
  for (let attempt = 0; attempt < 11; attempt += 1) {
    failedStatuses.push(
      await postLogin(port, {
        email: "test@example.test",
        password: "wrong-password"
      })
    );
  }

  assert.deepEqual(failedStatuses.slice(0, 10), Array(10).fill(401));
  assert.equal(failedStatuses[10], 429);
});
