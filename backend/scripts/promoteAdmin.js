require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

const promoteAdmin = async () => {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    throw new Error("Provide the email address of an existing verified user");
  }

  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pizza_delivery");
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error("No account was found for that email address");
  }
  if (!user.emailVerified) {
    throw new Error("Verify the account email before promoting it to admin");
  }

  user.role = "admin";
  await user.save();
  console.log(`Admin role granted to ${user.email}`);
};

promoteAdmin()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
