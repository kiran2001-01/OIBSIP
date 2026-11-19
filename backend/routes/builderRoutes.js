const express = require("express");
const { getBuilderOptions } = require("../controllers/builderController");

const router = express.Router();

router.get("/options", getBuilderOptions);

module.exports = router;
