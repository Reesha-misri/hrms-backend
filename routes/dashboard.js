const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");

// GET dashboard stats
router.get("/stats", dashboardController.getStats);

module.exports = router;