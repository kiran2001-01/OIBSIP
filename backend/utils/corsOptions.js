const createCorsOptions = (env = process.env) => {
  const allowedOrigins = new Set([
    env.FRONTEND_URL || "http://localhost:5173"
  ]);

  if (env.NODE_ENV === "development") {
    allowedOrigins.add("http://localhost:5174");
  }

  return {
    origin: [...allowedOrigins],
    credentials: true
  };
};

module.exports = {
  createCorsOptions
};
