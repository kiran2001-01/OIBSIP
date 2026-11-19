const mongoose = require("mongoose");

const pizzaIngredientSchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      required: true
    },
    amountPerPizza: {
      type: Number,
      required: true,
      min: 0.001
    }
  },
  { _id: false }
);

const pizzaSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Pizza name is required"],
      trim: true
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true
    },
    image: {
      type: String,
      default: "/uploads/pizzas/default-pizza.svg"
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: ["Veg", "Non-Veg", "Specialty", "Classic"],
      default: "Veg"
    },
    price: {
      type: Number,
      required: [true, "Base price is required"],
      min: 0
    },
    sizes: {
      type: [String],
      default: ["Small", "Medium", "Large"]
    },
    crusts: {
      type: [String],
      default: ["Regular", "Thin", "Cheese Burst"]
    },
    toppings: {
      type: [String],
      default: ["Extra Cheese", "Olives", "Mushrooms", "Onions", "Jalapenos"]
    },
    available: {
      type: Boolean,
      default: true
    },
    stock: {
      type: Number,
      default: 50,
      min: 0
    },
    ingredients: {
      type: [pizzaIngredientSchema],
      default: []
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Pizza", pizzaSchema);
