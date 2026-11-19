const assert = require("node:assert/strict");
const { test } = require("node:test");
const { isStrongPassword } = require("../utils/passwordPolicy");

test("accepts passwords that satisfy the length and character policy", () => {
  assert.equal(isStrongPassword("Saikiran@2001"), true);
});

test("rejects short passwords and passwords missing required character classes", () => {
  assert.equal(isStrongPassword("Short1A"), false);
  assert.equal(isStrongPassword("lowercasepassword1"), false);
  assert.equal(isStrongPassword("OnlyLettersHere"), false);
});

test("rejects passwords that exceed bcrypt's 72-byte input limit", () => {
  assert.equal(isStrongPassword(`a${"é".repeat(36)}A1`), false);
});
