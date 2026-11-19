const Inventory = require("../models/Inventory");
const Pizza = require("../models/Pizza");
const mongoose = require("mongoose");
const { sendEmail } = require("./emailService");

const transactionTopologyTypes = new Set([
  "ReplicaSetWithPrimary",
  "Sharded",
  "LoadBalanced"
]);

const createInventoryError = (code, message) => Object.assign(new Error(message), { code });

const supportsStockTransactions = () => {
  const topologyType = mongoose.connection.client?.topology?.description?.type;
  return transactionTopologyTypes.has(topologyType);
};

const withStockTransaction = async (operation, required = false) => {
  if (!supportsStockTransactions()) {
    if (required) {
      throw new Error("A replica set or sharded MongoDB deployment is required for this payment operation");
    }
    return operation(undefined);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const notifyLowStock = async (ingredient) => {
  if (
    ingredient.stock > ingredient.lowStockThreshold ||
    ingredient.lowStockNotifiedAt ||
    !process.env.ADMIN_EMAIL ||
    !process.env.EMAIL_HOST
  ) {
    return;
  }

  const result = await sendEmail({
    to: process.env.ADMIN_EMAIL,
    subject: `Low stock alert: ${ingredient.name}`,
    html: `<p>${ingredient.name} stock is low: ${ingredient.stock} ${ingredient.unit} remaining.</p>`
  });

  if (!result.skipped) {
    await Inventory.updateOne(
      { _id: ingredient._id, lowStockNotifiedAt: null },
      { $set: { lowStockNotifiedAt: new Date() } }
    );
  }
};

const restoreStock = async (changes) => {
  const failures = [];

  for (const change of changes.reverse()) {
    try {
      const result = await change.model.updateOne(
        { _id: change.id },
        { $inc: { stock: change.amount } }
      );
      if (result.matchedCount === 0) {
        throw new Error(`Stock record ${change.id} no longer exists`);
      }
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    console.error("Inventory rollback failed:", failures.map((error) => error.message));
    throw new Error("Inventory update failed and could not be fully rolled back");
  }
};

const deductOrderStock = async (order, existingSession) => {
  const pizzaCounts = new Map();
  const ingredientCounts = new Map();

  for (const item of order.items) {
    if (item.pizza) {
      const pizzaId = (item.pizza._id || item.pizza).toString();
      pizzaCounts.set(pizzaId, (pizzaCounts.get(pizzaId) || 0) + item.quantity);

      for (const recipeItem of item.pizza.ingredients || []) {
        const ingredient = recipeItem.ingredient;
        if (!ingredient) {
          throw createInventoryError(
            "INVALID_RECIPE",
            `An ingredient recipe for ${item.name} is incomplete`
          );
        }

        const ingredientId = (ingredient._id || ingredient).toString();
        const required = recipeItem.amountPerPizza * item.quantity;
        ingredientCounts.set(
          ingredientId,
          (ingredientCounts.get(ingredientId) || 0) + required
        );
      }
    }

    for (const selectedIngredient of item.customIngredients || []) {
      const ingredient = selectedIngredient.ingredient;
      if (!ingredient) {
        throw createInventoryError(
          "INVALID_RECIPE",
          `A custom ingredient for ${item.name} is missing`
        );
      }
      const ingredientId = (ingredient._id || ingredient).toString();
      ingredientCounts.set(
        ingredientId,
        (ingredientCounts.get(ingredientId) || 0) + item.quantity
      );
    }
  }

  const applyStock = async (session) => {
    const changes = [];
    const lowStockIngredients = [];
    const options = session ? { new: true, session } : { new: true };

    try {
      for (const [pizzaId, quantity] of pizzaCounts) {
        const updatedPizza = await Pizza.findOneAndUpdate(
          { _id: pizzaId, available: true, stock: { $gte: quantity } },
          { $inc: { stock: -quantity } },
          options
        );
        if (!updatedPizza) {
          throw createInventoryError(
            "OUT_OF_STOCK",
            "A pizza in this order is no longer available in the requested quantity"
          );
        }
        changes.push({ model: Pizza, id: pizzaId, amount: quantity });
      }

      for (const [ingredientId, quantity] of ingredientCounts) {
        const updatedIngredient = await Inventory.findOneAndUpdate(
          { _id: ingredientId, stock: { $gte: quantity } },
          { $inc: { stock: -quantity } },
          options
        );
        if (!updatedIngredient) {
          throw createInventoryError("OUT_OF_STOCK", "An ingredient in this order is out of stock");
        }

        changes.push({ model: Inventory, id: ingredientId, amount: quantity });
        if (updatedIngredient.stock <= updatedIngredient.lowStockThreshold) {
          lowStockIngredients.push(updatedIngredient);
        }
      }

      return { changes, lowStockIngredients };
    } catch (error) {
      if (!session) {
        await restoreStock(changes);
      }
      throw error;
    }
  };
  const { changes, lowStockIngredients } = existingSession
    ? await applyStock(existingSession)
    : await withStockTransaction(applyStock);

  order.stockUsage = changes.map((change) => ({
    kind: change.model === Pizza ? "pizza" : "ingredient",
    item: change.id,
    amount: change.amount
  }));

  for (const ingredient of lowStockIngredients) {
    try {
      await notifyLowStock(ingredient);
    } catch (error) {
      console.error(`Low-stock notification failed for ${ingredient.name}:`, error.message);
    }
  }
};

const restoreOrderStock = async (order, existingSession) => {
  if (!order.stockDeducted) return;

  const restore = async (session) => {
    const changes = [];
    const options = session ? { new: true, session } : { new: true };

    try {
      if (order.stockUsage?.length) {
        for (const usage of order.stockUsage) {
          const model = usage.kind === "pizza" ? Pizza : Inventory;
          const updatedItem = await model.findByIdAndUpdate(
            usage.item,
            { $inc: { stock: usage.amount } },
            options
          );
          if (!updatedItem) {
            throw new Error(`${usage.kind} stock record ${usage.item} was not found`);
          }

          changes.push({ model, id: usage.item, amount: -usage.amount });
          if (usage.kind === "ingredient" && updatedItem.stock > updatedItem.lowStockThreshold) {
            await Inventory.updateOne(
              { _id: updatedItem._id },
              { $set: { lowStockNotifiedAt: null } },
              session ? { session } : {}
            );
          }
        }
        return;
      }

      const populatedOrder = await order.populate({
        path: "items.pizza",
        populate: { path: "ingredients.ingredient" }
      });
      await populatedOrder.populate("items.customIngredients.ingredient");
      for (const item of populatedOrder.items) {
        const pizza = item.pizza;
        if (pizza) {
          const updatedPizza = await Pizza.findByIdAndUpdate(
            pizza._id,
            { $inc: { stock: item.quantity } },
            options
          );
          if (!updatedPizza) {
            throw new Error(`Pizza stock record ${pizza._id} was not found`);
          }
          changes.push({ model: Pizza, id: pizza._id, amount: -item.quantity });
        }

        for (const selectedIngredient of item.customIngredients || []) {
          const updatedIngredient = await Inventory.findByIdAndUpdate(
            selectedIngredient.ingredient._id || selectedIngredient.ingredient,
            { $inc: { stock: item.quantity } },
            options
          );
          if (!updatedIngredient) {
            throw new Error(`Inventory record for ${selectedIngredient.name} was not found`);
          }
          changes.push({
            model: Inventory,
            id: updatedIngredient._id,
            amount: -item.quantity
          });
          if (updatedIngredient.stock > updatedIngredient.lowStockThreshold) {
            await Inventory.updateOne(
              { _id: updatedIngredient._id },
              { $set: { lowStockNotifiedAt: null } },
              session ? { session } : {}
            );
          }
        }

        if (!pizza) continue;

        for (const recipeItem of pizza.ingredients || []) {
          if (!recipeItem.ingredient) continue;
          const quantity = recipeItem.amountPerPizza * item.quantity;
          const updatedIngredient = await Inventory.findByIdAndUpdate(
            recipeItem.ingredient._id,
            { $inc: { stock: quantity } },
            options
          );
          if (!updatedIngredient) {
            throw new Error(`Inventory record for ${recipeItem.ingredient.name} was not found`);
          }
          changes.push({ model: Inventory, id: recipeItem.ingredient._id, amount: -quantity });
          if (updatedIngredient.stock > updatedIngredient.lowStockThreshold) {
            await Inventory.updateOne(
              { _id: updatedIngredient._id },
              { $set: { lowStockNotifiedAt: null } },
              session ? { session } : {}
            );
          }
        }
      }
    } catch (error) {
      if (!session) {
        await restoreStock(changes);
      }
      throw error;
    }
  };

  if (existingSession) {
    return restore(existingSession);
  }
  return withStockTransaction(restore);
};

module.exports = {
  supportsStockTransactions,
  withStockTransaction,
  deductOrderStock,
  restoreOrderStock
};
