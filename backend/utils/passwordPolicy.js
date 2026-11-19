const PASSWORD_POLICY_MESSAGE =
  "Password must be at least 10 characters and include an uppercase letter, lowercase letter, and number";

const isStrongPassword = (password) =>
  typeof password === "string" &&
  password.length >= 10 &&
  password.length <= 72 &&
  Buffer.byteLength(password, "utf8") <= 72 &&
  /[a-z]/.test(password) &&
  /[A-Z]/.test(password) &&
  /\d/.test(password);

module.exports = {
  PASSWORD_POLICY_MESSAGE,
  isStrongPassword
};
