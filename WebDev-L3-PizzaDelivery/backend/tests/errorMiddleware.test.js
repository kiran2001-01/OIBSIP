const assert = require("node:assert/strict");
const { test } = require("node:test");
const { errorHandler } = require("../middleware/errorMiddleware");

test("does not return internal error details for server errors", () => {
  const originalConsoleError = console.error;
  let responseBody;
  let responseStatus;
  const response = {
    statusCode: 200,
    status(status) {
      responseStatus = status;
      this.statusCode = status;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    }
  };

  console.error = () => {};
  try {
    errorHandler(new Error("database credentials leaked"), {}, response, () => {});
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(responseStatus, 500);
  assert.equal(responseBody.message, "Internal server error");
  assert.equal(JSON.stringify(responseBody).includes("database credentials"), false);
});
