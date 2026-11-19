require("dotenv").config();

const mongoose = require("mongoose");
const Pizza = require("../models/Pizza");

const imageByPizzaName = {
  "Margherita Pizza": "/uploads/pizzas/margherita.jpg",
  "Farmhouse Pizza": "/uploads/pizzas/farmhouse.jpg",
  "Peppy Paneer Pizza": "/uploads/pizzas/peppy-paneer.jpg",
  "Veg Extravaganza Pizza": "/uploads/pizzas/veg-extravaganza.jpg",
  "Chicken Dominator Pizza": "/uploads/pizzas/chicken-dominator.jpg",
  "Chicken Golden Delight": "/uploads/pizzas/chicken-golden-delight.jpg",
  "BBQ Chicken Pizza": "/uploads/pizzas/bbq-chicken.jpg",
  "Mexican Green Wave Pizza": "/uploads/pizzas/farmhouse.jpg",
  "Double Cheese Margherita": "/uploads/pizzas/margherita.jpg",
  "Tandoori Paneer Pizza": "/uploads/pizzas/peppy-paneer.jpg"
};

const migratePizzaImages = async (PizzaModel = Pizza) => {
  let updated = 0;
  for (const [name, image] of Object.entries(imageByPizzaName)) {
    const result = await PizzaModel.updateOne({ name }, { $set: { image } });
    updated += result.modifiedCount || 0;
  }
  return updated;
};

if (require.main === module) {
  mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pizza_delivery")
    .then(async () => console.log(`Updated ${await migratePizzaImages()} pizza images.`))
    .catch((error) => {
      console.error("Pizza image migration failed:", error.message);
      process.exitCode = 1;
    })
    .finally(async () => mongoose.disconnect());
}

module.exports = { imageByPizzaName, migratePizzaImages };
