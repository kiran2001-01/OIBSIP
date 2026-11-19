const jwt = require("jsonwebtoken");

const generateToken = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || secret === "replace_with_secure_secret") {
    throw new Error("JWT_SECRET must be set to a unique secret of at least 32 characters");
  }

  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      email: user.email
    },
    secret,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d"
    }
  );
};

module.exports = {
  generateToken
};
