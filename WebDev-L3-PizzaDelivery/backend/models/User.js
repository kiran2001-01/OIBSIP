const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: 2,
      maxlength: 80
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"]
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 10,
      maxlength: 72
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    emailVerificationToken: {
      type: String,
      default: ""
    },
    emailVerificationExpires: {
      type: Date,
      default: null
    },
    resetPasswordToken: {
      type: String,
      default: ""
    },
    resetPasswordExpires: {
      type: Date,
      default: null
    },
    resetPasswordOtp: {
      type: String,
      default: ""
    },
    resetPasswordOtpExpires: {
      type: Date,
      default: null
    },
    resetPasswordOtpAttempts: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.emailVerificationToken;
  delete userObject.emailVerificationExpires;
  delete userObject.resetPasswordToken;
  delete userObject.resetPasswordExpires;
  delete userObject.resetPasswordOtp;
  delete userObject.resetPasswordOtpExpires;
  delete userObject.resetPasswordOtpAttempts;
  return userObject;
};

module.exports = mongoose.model("User", userSchema);
