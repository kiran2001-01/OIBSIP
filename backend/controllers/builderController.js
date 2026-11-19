const Inventory = require("../models/Inventory");
const sendControllerError = require("../utils/controllerError");

const getBuilderOptions = async (req, res) => {
  try {
    const categories = ["base", "sauce", "cheese", "vegetable"];
    const ingredients = await Inventory.find({ category: { $in: categories } })
      .select("_id name price stock category")
      .sort({ name: 1 });
    const options = Object.fromEntries(
      categories.map((category) => [
        category,
        ingredients
          .filter((ingredient) => ingredient.category === category)
          .map(({ _id, name, price, stock }) => ({
            _id,
            name,
            price,
            inStock: stock >= 1
          }))
      ])
    );

    return res.status(200).json(options);
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Loading pizza builder options failed",
      "Unable to load pizza builder options"
    );
  }
};

module.exports = {
  getBuilderOptions
};
