const mongoose = require("mongoose");
const Order = require("../models/Order");
const Pizza = require("../models/Pizza");
const Inventory = require("../models/Inventory");
const { calculateTotals, getUnitPrice } = require("../utils/orderPricing");
const sendControllerError = require("../utils/controllerError");

const createOrder = async (req, res) => {
  try {
    const idempotencyKey = req.get("Idempotency-Key");
    const { items, deliveryAddress } = req.body;

    if (!idempotencyKey || idempotencyKey.length > 100) {
      return res.status(400).json({
        success: false,
        message: "A valid Idempotency-Key header is required"
      });
    }

    const existingOrder = await Order.findOne({
      user: req.user._id,
      idempotencyKey
    });

    if (existingOrder) {
      return res.status(200).json({
        success: true,
        message: "Order request already received",
        data: { order: existingOrder }
      });
    }

    if (!Array.isArray(items) || items.length === 0 || items.length > 30) {
      return res.status(400).json({
        success: false,
        message: "Add between 1 and 30 items to your order"
      });
    }

    if (items.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
      return res.status(400).json({
        success: false,
        message: "Order items must be valid objects"
      });
    }

    const requiredAddressFields = ["fullName", "phone", "address", "city", "postalCode"];
    if (
      !deliveryAddress ||
      requiredAddressFields.some(
        (field) => typeof deliveryAddress[field] !== "string" || !deliveryAddress[field].trim()
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a complete delivery address"
      });
    }

    if (!/^\+?[0-9\s()-]{7,20}$/.test(deliveryAddress.phone.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid phone number"
      });
    }

    if (!/^[0-9A-Za-z -]{4,12}$/.test(deliveryAddress.postalCode.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid postal code"
      });
    }

    const isCustomItem = (item) => Object.prototype.hasOwnProperty.call(item, "custom");
    const regularItems = items.filter((item) => !isCustomItem(item));
    const pizzaIds = regularItems.map((item) => item.pizzaId);
    if (
      regularItems.some((item) => !mongoose.isValidObjectId(item.pizzaId)) ||
      items.some((item) => (
        isCustomItem(item) && (
          !item.custom ||
          typeof item.custom !== "object" ||
          Array.isArray(item.custom) ||
          !mongoose.isValidObjectId(item.custom.baseId) ||
          !mongoose.isValidObjectId(item.custom.sauceId) ||
          !mongoose.isValidObjectId(item.custom.cheeseId) ||
          !Array.isArray(item.custom.vegetableIds) ||
          item.custom.vegetableIds.length > 8 ||
          item.custom.vegetableIds.some((id) => !mongoose.isValidObjectId(id)) ||
          (item.custom.size !== undefined && !["Small", "Medium", "Large"].includes(item.custom.size)) ||
          new Set(item.custom.vegetableIds.map(String)).size !== item.custom.vegetableIds.length
        )
      ))
    ) {
      return res.status(400).json({
        success: false,
        message: "An order item contains invalid pizza or custom ingredient IDs"
      });
    }

    const pizzas = pizzaIds.length ? await Pizza.find({ _id: { $in: pizzaIds } }) : [];
    const pizzasById = new Map(pizzas.map((pizza) => [pizza._id.toString(), pizza]));
    const customIngredientIds = items
      .filter(isCustomItem)
      .flatMap((item) => [
        item.custom.baseId,
        item.custom.sauceId,
        item.custom.cheeseId,
        ...item.custom.vegetableIds
      ].map(String));
    const ingredients = customIngredientIds.length
      ? await Inventory.find({ _id: { $in: [...new Set(customIngredientIds)] } })
      : [];
    const ingredientsById = new Map(
      ingredients.map((ingredient) => [ingredient._id.toString(), ingredient])
    );
    const requestedPizzaCounts = new Map();
    const requestedIngredientCounts = new Map();
    const orderItems = [];

    for (const item of items) {
      if (isCustomItem(item)) {
        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
          return res.status(400).json({
            success: false,
            message: "Custom pizza quantity must be between 1 and 10"
          });
        }

        const selectedIngredients = [
          { id: item.custom.baseId, category: "base" },
          { id: item.custom.sauceId, category: "sauce" },
          { id: item.custom.cheeseId, category: "cheese" },
          ...item.custom.vegetableIds.map((id) => ({ id, category: "vegetable" }))
        ];
        const customIngredients = [];
        for (const selected of selectedIngredients) {
          const ingredient = ingredientsById.get(String(selected.id));
          if (!ingredient) {
            return res.status(404).json({
              success: false,
              message: "One of the selected ingredients no longer exists"
            });
          }
          if (ingredient.category !== selected.category) {
            return res.status(400).json({
              success: false,
              message: `Selected ingredient must be in the ${selected.category} category`
            });
          }

          const ingredientId = ingredient._id.toString();
          requestedIngredientCounts.set(
            ingredientId,
            (requestedIngredientCounts.get(ingredientId) || 0) + quantity
          );
          customIngredients.push({
            category: selected.category,
            ingredient: ingredient._id,
            name: ingredient.name,
            price: ingredient.price
          });
        }

        const base = customIngredients[0];
        const toppings = customIngredients.slice(1).map(({ name }) => name);
        const sizeOption = item.custom?.size;
        const sizeUpcharge = sizeOption === "Large" ? 80 : sizeOption === "Medium" ? 40 : 0;
        const sizeLabel = sizeOption
          ? (sizeOption === "Small" ? "Regular (8\")" : sizeOption === "Medium" ? "Medium (10\")" : sizeOption === "Large" ? "Large (12\")" : sizeOption)
          : "Custom";
        const unitPrice = customIngredients.reduce((total, ingredient) => (
          total + ingredient.price
        ), 0) + sizeUpcharge;
        orderItems.push({
          pizza: null,
          customIngredients,
          name: "Custom Pizza",
          size: sizeLabel,
          crust: base.name,
          toppings,
          quantity,
          unitPrice,
          lineTotal: unitPrice * quantity
        });
        continue;
      }

      const pizza = pizzasById.get(String(item.pizzaId));
      const quantity = Number(item.quantity);

      if (!pizza) {
        return res.status(404).json({
          success: false,
          message: "One of the selected pizzas no longer exists"
        });
      }

      if (!pizza.available || pizza.stock < 1) {
        return res.status(409).json({
          success: false,
          message: `${pizza.name} is currently unavailable`
        });
      }

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > pizza.stock) {
        return res.status(400).json({
          success: false,
          message: `Quantity for ${pizza.name} is invalid`
        });
      }

      if (!pizza.sizes.includes(item.size) || !pizza.crusts.includes(item.crust)) {
        return res.status(400).json({
          success: false,
          message: `Selected size or crust is not available for ${pizza.name}`
        });
      }

      const selectedToppings = item.toppings === undefined ? [] : item.toppings;
      if (
        !Array.isArray(selectedToppings) ||
        selectedToppings.some((topping) => !pizza.toppings.includes(topping))
      ) {
        return res.status(400).json({
          success: false,
          message: `A selected topping is not available for ${pizza.name}`
        });
      }

      const count = (requestedPizzaCounts.get(pizza._id.toString()) || 0) + quantity;
      if (count > pizza.stock) {
        return res.status(409).json({
          success: false,
          message: `Requested quantity exceeds available stock for ${pizza.name}`
        });
      }
      requestedPizzaCounts.set(pizza._id.toString(), count);

      const unitPrice = getUnitPrice(pizza, item.size, item.crust);
      orderItems.push({
        pizza: pizza._id,
        name: pizza.name,
        image: pizza.image,
        size: item.size,
        crust: item.crust,
        toppings: [...new Set(selectedToppings)],
        quantity,
        unitPrice,
        lineTotal: unitPrice * quantity
      });
    }

    for (const [ingredientId, quantity] of requestedIngredientCounts) {
      const ingredient = ingredientsById.get(ingredientId);
      if (ingredient.stock < quantity) {
        return res.status(409).json({
          success: false,
          message: `${ingredient.name} is currently unavailable in the requested quantity`
        });
      }
    }

    const totals = calculateTotals(orderItems);
    const order = await Order.create({
      user: req.user._id,
      idempotencyKey,
      items: orderItems,
      deliveryAddress: {
        fullName: deliveryAddress.fullName.trim(),
        phone: deliveryAddress.phone.trim(),
        address: deliveryAddress.address.trim(),
        city: deliveryAddress.city.trim(),
        postalCode: deliveryAddress.postalCode.trim(),
        instructions: typeof deliveryAddress.instructions === "string"
          ? deliveryAddress.instructions.trim().slice(0, 500)
          : ""
      },
      ...totals
    });

    return res.status(201).json({
      success: true,
      message: "Order created and awaiting payment",
      data: { order }
    });
  } catch (error) {
    if (error.code === 11000) {
      const order = await Order.findOne({
        user: req.user._id,
        idempotencyKey: req.get("Idempotency-Key")
      });
      if (order) {
        return res.status(200).json({
          success: true,
          message: "Order request already received",
          data: { order }
        });
      }
    }

    return sendControllerError(res, error, "Creating order failed", "Unable to create order");
  }
};

const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      data: { orders }
    });
  } catch (error) {
    return sendControllerError(res, error, "Loading user orders failed", "Unable to load your orders");
  }
};

const getOrderById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID"
      });
    }

    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: { order }
    });
  } catch (error) {
    return sendControllerError(res, error, "Loading order failed", "Unable to load order");
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById
};
