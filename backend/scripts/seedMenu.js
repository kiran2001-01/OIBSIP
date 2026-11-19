require("dotenv").config();

const mongoose = require("mongoose");
const Pizza = require("../models/Pizza");

const menuProducts = [
  {
    name: "Margherita Pizza",
    description: "Classic mozzarella, tomato sauce, and fresh basil.",
    image: "/uploads/pizzas/margherita.jpg",
    category: "Classic",
    price: 249,
    available: true,
    stock: 50
  },
  {
    name: "Farmhouse Pizza",
    description: "A colorful mix of capsicum, onion, mushroom, and tomato.",
    image: "/uploads/pizzas/farmhouse.jpg",
    category: "Veg",
    price: 329,
    available: true,
    stock: 50
  },
  {
    name: "Peppy Paneer Pizza",
    description: "Spiced paneer, crisp capsicum, onion, and a tangy sauce.",
    image: "/uploads/pizzas/peppy-paneer.jpg",
    category: "Specialty",
    price: 359,
    available: true,
    stock: 50
  },
  {
    name: "Veg Extravaganza Pizza",
    description: "Loaded with olives, corn, capsicum, onion, and mushrooms.",
    image: "/uploads/pizzas/veg-extravaganza.jpg",
    category: "Specialty",
    price: 399,
    available: true,
    stock: 50
  },
  {
    name: "Chicken Dominator Pizza",
    description: "A hearty combination of grilled chicken and chicken sausage.",
    image: "/uploads/pizzas/chicken-dominator.jpg",
    category: "Non-Veg",
    price: 449,
    available: true,
    stock: 50
  },
  {
    name: "Chicken Golden Delight",
    description: "Golden chicken, sweet corn, onion, and mozzarella.",
    image: "/uploads/pizzas/chicken-golden-delight.jpg",
    category: "Non-Veg",
    price: 419,
    available: true,
    stock: 50
  },
  {
    name: "BBQ Chicken Pizza",
    description: "Smoky barbecue chicken with red onion and melted cheese.",
    image: "/uploads/pizzas/bbq-chicken.jpg",
    category: "Classic",
    price: 389,
    available: true,
    stock: 50
  },
  {
    name: "Mexican Green Wave Pizza",
    description: "Jalapenos, capsicum, onion, and a fresh Mexican herb blend.",
    image: "/uploads/pizzas/farmhouse.jpg",
    category: "Specialty",
    price: 349,
    available: true,
    stock: 50
  },
  {
    name: "Double Cheese Margherita",
    description: "A simple tomato-and-basil pizza with an extra layer of cheese.",
    image: "/uploads/pizzas/margherita.jpg",
    category: "Veg",
    price: 299,
    available: true,
    stock: 50
  },
  {
    name: "Tandoori Paneer Pizza",
    description: "Tandoori paneer, onion, capsicum, and minty yogurt sauce.",
    image: "/uploads/pizzas/peppy-paneer.jpg",
    category: "Specialty",
    price: 379,
    available: true,
    stock: 50
  }
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const seedMenu = async (PizzaModel = Pizza) => {
  const result = { created: 0, skipped: 0 };

  for (const product of menuProducts) {
    const existing = await PizzaModel.exists({
      name: {
        $regex: `^${escapeRegex(product.name)}$`,
        $options: "i"
      }
    });

    if (existing) {
      result.skipped += 1;
      continue;
    }

    await PizzaModel.create(product);
    result.created += 1;
  }

  return result;
};

const run = async () => {
  await mongoose.connect(
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pizza_delivery"
  );
  const result = await seedMenu();
  console.log(
    `Menu seed complete: ${result.created} added, ${result.skipped} already existed.`
  );
};

if (require.main === module) {
  run()
    .catch((error) => {
      console.error("Menu seeding failed:", error.name || "Unexpected error");
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = {
  menuProducts,
  seedMenu
};
