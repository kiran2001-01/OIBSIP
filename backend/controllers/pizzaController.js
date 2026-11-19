const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const Pizza = require("../models/Pizza");
const Order = require("../models/Order");
const sendControllerError = require("../utils/controllerError");

const uploadDirectory = path.join(__dirname, "..", "uploads", "pizzas");

const getPizzas = async (req, res) => {
  try {
    const { category, search } = req.query;
    const filter = {};

    if (category) {
      filter.category = category;
    }

    if (search) {
      const escapedSearch = String(search)
        .slice(0, 100)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: escapedSearch, $options: "i" } },
        { description: { $regex: escapedSearch, $options: "i" } }
      ];
    }

    const pizzas = await Pizza.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Pizzas fetched successfully",
      data: {
        pizzas
      }
    });
  } catch (error) {
    return sendControllerError(res, error, "Fetching pizzas failed", "Failed to fetch pizzas");
  }
};

const getPizzaById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pizza ID"
      });
    }

    const pizza = await Pizza.findById(req.params.id);

    if (!pizza) {
      return res.status(404).json({
        success: false,
        message: "Pizza not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        pizza
      }
    });
  } catch (error) {
    return sendControllerError(res, error, "Fetching pizza failed", "Failed to fetch pizza");
  }
};

const uploadPizzaImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Please select a product image"
    });
  }

  return res.status(201).json({
    success: true,
    message: "Product image uploaded successfully",
    data: {
      image: `/uploads/pizzas/${req.file.filename}`
    }
  });
};

const createPizza = async (req, res) => {
  try {
    const {
      name,
      description,
      image,
      category,
      price,
      sizes,
      crusts,
      toppings,
      available,
      stock,
      ingredients
    } = req.body;

    if (!name || !description || !category || price === undefined) {
      return res.status(400).json({
        success: false,
        message: "Name, description, category, and price are required"
      });
    }

    const pizza = await Pizza.create({
      name,
      description,
      image,
      category,
      price,
      sizes: sizes || ["Small", "Medium", "Large"],
      crusts: crusts || ["Regular", "Thin", "Cheese Burst"],
      toppings: toppings || ["Extra Cheese", "Olives", "Mushrooms"],
      available: available !== undefined ? available : true,
      stock: stock !== undefined ? stock : 50,
      ingredients: ingredients || [],
      createdBy: req.user._id
    });

    return res.status(201).json({
      success: true,
      message: "Pizza created successfully",
      data: {
        pizza
      }
    });
  } catch (error) {
    return sendControllerError(res, error, "Creating pizza failed", "Failed to create pizza");
  }
};

const updatePizza = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pizza ID"
      });
    }

    const pizza = await Pizza.findByIdAndUpdate(req.params.id, req.body, {
      returnDocument: 'after',
      runValidators: true
    });

    if (!pizza) {
      return res.status(404).json({
        success: false,
        message: "Pizza not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pizza updated successfully",
      data: {
        pizza
      }
    });
  } catch (error) {
    return sendControllerError(res, error, "Updating pizza failed", "Failed to update pizza");
  }
};

const deletePizza = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pizza ID"
      });
    }

    const hasOrders = await Order.exists({ "items.pizza": req.params.id });
    if (hasOrders) {
      return res.status(409).json({
        success: false,
        message: "A pizza referenced by an order cannot be deleted"
      });
    }

    const pizza = await Pizza.findByIdAndDelete(req.params.id);

    if (!pizza) {
      return res.status(404).json({
        success: false,
        message: "Pizza not found"
      });
    }

    if (pizza.image?.startsWith("/uploads/pizzas/")) {
      const imagePath = path.join(uploadDirectory, path.basename(pizza.image));
      await fs.promises.unlink(imagePath).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      message: "Pizza deleted successfully"
    });
  } catch (error) {
    return sendControllerError(res, error, "Deleting pizza failed", "Failed to delete pizza");
  }
};

module.exports = {
  getPizzas,
  getPizzaById,
  uploadPizzaImage,
  createPizza,
  updatePizza,
  deletePizza
};
