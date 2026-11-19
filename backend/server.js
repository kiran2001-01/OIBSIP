const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const connectDB = require("./config/db");
const { errorHandler, notFound } = require("./middleware/errorMiddleware");
const User = require("./models/User");
const { getAuthToken } = require("./utils/authCookie");
const { createCorsOptions } = require("./utils/corsOptions");

const authRoutes = require("./routes/authRoutes");
const pizzaRoutes = require("./routes/pizzaRoutes");
const orderRoutes = require("./routes/orderRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const paymentWebhookRoutes = require("./routes/paymentWebhookRoutes");
const adminRoutes = require("./routes/adminRoutes");
const builderRoutes = require("./routes/builderRoutes");
const { startPaymentRecoveryWorker } = require("./controllers/paymentController");
const { startLowStockJob } = require("./services/lowStockJob");

dotenv.config();

const app = express();
const trustProxy = process.env.TRUST_PROXY;
app.set(
  "trust proxy",
  trustProxy === "true" ? true : Number.isInteger(Number(trustProxy)) ? Number(trustProxy) : 0
);
const httpServer = http.createServer(app);
const corsOptions = createCorsOptions();
const io = new Server(httpServer, {
  cors: corsOptions
});

io.use(async (socket, next) => {
  try {
    const token = getAuthToken({ headers: socket.handshake.headers });
    if (!token) {
      return next(new Error("Authentication required"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("_id role");
    if (!user) {
      return next(new Error("Authentication required"));
    }

    socket.data.user = {
      id: user._id.toString(),
      role: user.role
    };
    return next();
  } catch {
    return next(new Error("Authentication required"));
  }
});

io.on("connection", (socket) => {
  socket.join(`user:${socket.data.user.id}`);
  if (socket.data.user.role === "admin") {
    socket.join("admins");
  }
});

app.set("io", io);

app.use(cors(corsOptions));
app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  fallthrough: false,
  maxAge: "1d"
}));
app.use("/api/payments/webhook", paymentWebhookRoutes);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Pizza Delivery API is working!",
    timestamp: new Date().toISOString()
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/pizzas", pizzaRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/builder", builderRoutes);

app.use(notFound);
app.use(errorHandler);

const startServer = async () => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32 || jwtSecret === "replace_with_secure_secret") {
    console.error("JWT_SECRET must be set to a unique secret of at least 32 characters.");
    process.exitCode = 1;
    return;
  }

  await connectDB();
  startPaymentRecoveryWorker();
  startLowStockJob();

  const port = process.env.PORT || 5000;
  httpServer.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
};

startServer().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exitCode = 1;
});
