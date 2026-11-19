require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

const seedAdmin = async () => {
  const email = (process.env.ADMIN_EMAIL || "admin@example.com").trim().toLowerCase();
  const password = process.env.ADMIN_DEFAULT_PASSWORD || "Admin@12345";
  const name = "System Administrator";
  const phone = "9876543210";

  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pizza_delivery");

  let admin = await User.findOne({ email });
  if (admin) {
    admin.role = "admin";
    admin.emailVerified = true;
    admin.password = password;
    await admin.save();
    console.log(`Updated existing user ${email} to admin role with password: ${password}`);
  } else {
    admin = await User.create({
      name,
      email,
      phone,
      password,
      role: "admin",
      emailVerified: true
    });
    console.log(`Successfully created admin user: ${email} with password: ${password}`);
  }
};

seedAdmin()
  .catch((err) => {
    console.error("Failed to seed admin:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
