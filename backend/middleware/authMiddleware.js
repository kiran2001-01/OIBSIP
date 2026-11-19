const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { getAuthToken } = require("../utils/authCookie");

const protect = async (req, res, next) => {
  try {
    const token = getAuthToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, token missing"
      });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32 || secret === "replace_with_secure_secret") {
      return res.status(500).json({
        success: false,
        message: "Authentication is not configured on the server"
      });
    }

    const decoded = jwt.verify(token, secret);

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found"
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Not authorized, invalid token"
    });
  }
};

module.exports = {
  protect
};
