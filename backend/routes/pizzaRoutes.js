const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const {
  getPizzas,
  getPizzaById,
  uploadPizzaImage,
  createPizza,
  updatePizza,
  deletePizza
} = require("../controllers/pizzaController");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/adminMiddleware");

const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, "..", "uploads", "pizzas"),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      return callback(new Error("Only image files are allowed"));
    }
    return callback(null, true);
  }
});

router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Pizza routes ready"
  });
});

router.get("/", getPizzas);
router.post("/upload-image", protect, adminOnly, upload.single("image"), uploadPizzaImage);
router.get("/:id", getPizzaById);
router.post("/", protect, adminOnly, createPizza);
router.patch("/:id", protect, adminOnly, updatePizza);
router.delete("/:id", protect, adminOnly, deletePizza);

module.exports = router;
