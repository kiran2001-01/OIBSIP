require("dotenv").config();

const mongoose = require("mongoose");
const Inventory = require("../models/Inventory");

const builderIngredients = [
  { name: "Classic Pizza Base", category: "base", price: 80 },
  { name: "Whole Wheat Base", category: "base", price: 90 },
  { name: "Thin Crust Base", category: "base", price: 90 },
  { name: "Cheese Burst Base", category: "base", price: 120 },
  { name: "Multigrain Base", category: "base", price: 100 },
  { name: "Classic Tomato Sauce", category: "sauce", price: 30 },
  { name: "Pesto Sauce", category: "sauce", price: 45 },
  { name: "Barbecue Sauce", category: "sauce", price: 40 },
  { name: "Peri Peri Sauce", category: "sauce", price: 35 },
  { name: "White Sauce", category: "sauce", price: 45 },
  { name: "Mozzarella Cheese", category: "cheese", price: 60 },
  { name: "Cheddar Cheese", category: "cheese", price: 65 },
  { name: "Parmesan Cheese", category: "cheese", price: 70 },
  { name: "Vegan Cheese", category: "cheese", price: 75 },
  { name: "Capsicum", category: "vegetable", price: 20 },
  { name: "Red Onion", category: "vegetable", price: 15 },
  { name: "Mushroom", category: "vegetable", price: 30 },
  { name: "Sweet Corn", category: "vegetable", price: 20 },
  { name: "Black Olives", category: "vegetable", price: 35 },
  { name: "Jalapeno", category: "vegetable", price: 25 },
  { name: "Tomato", category: "vegetable", price: 15 },
  { name: "Pineapple", category: "vegetable", price: 25 }
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const seedBuilderInventory = async (InventoryModel = Inventory) => {
  const result = { created: 0, updated: 0 };

  for (const ingredient of builderIngredients) {
    const existing = await InventoryModel.findOne({
      name: { $regex: `^${escapeRegex(ingredient.name)}$`, $options: "i" }
    });

    if (existing) {
      await InventoryModel.updateOne(
        { _id: existing._id },
        { $set: { category: ingredient.category, price: ingredient.price } }
      );
      result.updated += 1;
      continue;
    }

    await InventoryModel.create({
      ...ingredient,
      unit: "piece",
      stock: 100,
      lowStockThreshold: 20
    });
    result.created += 1;
  }

  return result;
};

const run = async () => {
  await mongoose.connect(
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pizza_delivery"
  );
  const result = await seedBuilderInventory();
  console.log(
    `Builder inventory seed complete: ${result.created} added, ${result.updated} updated.`
  );
};

if (require.main === module) {
  run()
    .catch((error) => {
      console.error("Builder inventory seed failed:", error.name || "Unexpected error");
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = {
  builderIngredients,
  seedBuilderInventory
};
