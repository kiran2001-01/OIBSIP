const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  builderIngredients,
  seedBuilderInventory
} = require("../scripts/seedBuilderInventory");

test("seeds all builder ingredients and preserves existing stock on rerun", async () => {
  const records = new Map();
  const InventoryModel = {
    async findOne({ name }) {
      return [...records.values()].find((record) => (
        new RegExp(name.$regex, name.$options).test(record.name)
      )) || null;
    },
    async updateOne({ _id }, { $set }) {
      Object.assign(records.get(_id), $set);
    },
    async create(value) {
      const record = { _id: value.name, ...value };
      records.set(record._id, record);
      return record;
    }
  };

  assert.deepEqual(await seedBuilderInventory(InventoryModel), {
    created: 22,
    updated: 0
  });
  assert.equal(builderIngredients.length, 22);
  const base = records.get("Classic Pizza Base");
  base.stock = 73;

  assert.deepEqual(await seedBuilderInventory(InventoryModel), {
    created: 0,
    updated: 22
  });
  assert.equal(base.stock, 73);
  assert.equal(base.category, "base");
  assert.equal(base.price, 80);
  assert.equal(base.lowStockThreshold, 20);
});
