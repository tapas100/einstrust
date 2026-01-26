//
// ─── IMPORTS AND DECLARATIONS ───────────────────────────────────────────────────
//
import { msg } from "../../lib";
import config from "../../../config";
const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const uniqueValidator = require("mongoose-unique-validator");

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      validate: value => {
        if (!validator.isEmail(value)) {
          throw new Error({ error: "Invalid Email address" });
        }
      }
    },
    password: {
      type: String,
      required: true,
      minLength: 8
    },
    tokens: [
      {
        token: {
          type: String,
          required: true
        }
      }
    ],
    roles: [{ type: String }],
    
    // Security enhancements
    failedLoginAttempts: {
      type: Number,
      default: 0
    },
    lockoutUntil: {
      type: Date,
      default: null
    },
    lastLoginAt: {
      type: Date,
      default: null
    },
    lastLoginIP: {
      type: String,
      default: null
    },
    passwordHistory: [{
      type: String,  // Hashed passwords
      createdAt: { type: Date, default: Date.now }
    }],
    emailVerified: {
      type: Boolean,
      default: false
    },
    emailVerificationToken: String,
    passwordResetToken: String,
    passwordResetExpires: Date,
    mustResetPassword: {
      type: Boolean,
      default: false
    },
    // OAuth integrations
    oauthProviders: [{
      provider: String,  // 'google', 'github'
      providerId: String,
      email: String,
      connectedAt: { type: Date, default: Date.now }
    }]
  },
  {
    timestamps: true
  }
);

// Password hashing with bcrypt (cost factor: 12 for production-grade security)
userSchema.pre("save", async function(next) {
  const user = this;
  
  // Hash password if modified
  if (user.isModified("password")) {
    // Store in password history (keep last 5)
    if (!user.isNew && user.password) {
      const oldHash = (await mongoose.model("User").findById(user._id))?.password;
      if (oldHash) {
        user.passwordHistory = user.passwordHistory || [];
        user.passwordHistory.unshift(oldHash);
        user.passwordHistory = user.passwordHistory.slice(0, 5);
      }
    }
    
    // Hash new password
    user.password = await bcrypt.hash(user.password, 12);  // Cost factor: 12
  }
  
  next();
});

// Generate access token (15 minutes)
userSchema.methods.generateAuthToken = async function() {
  const user = this;
  const token = jwt.sign(
    { 
      _id: user._id,
      email: user.email,
      roles: user.roles,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (15 * 60)  // 15 minutes
    }, 
    config.jwtSecretKey,
    { algorithm: 'HS256' }
  );
  
  user.tokens = user.tokens.concat({ token });
  await user.save();
  return token;
};

userSchema.methods.transform = function() {
  const transformed = {};
  const fields = ["id", "name", "email", "roles", "emailVerified", "createdAt", "lastLoginAt"];

  fields.forEach(field => {
    transformed[field] = this[field];
  });
  return transformed;
};

userSchema.methods.getName = function() {
  return this.name;
};

userSchema.methods.hasRole = function(role) {
  return this.roles.includes(role);
};

userSchema.methods.hasPermission = function(permission) {
  // Get all permissions from all roles
  const { ROLES, PERMISSIONS } = require("../../lib/roles");
  const allPermissions = this.roles.reduce((acc, role) => {
    return [...acc, ...(PERMISSIONS[role] || [])];
  }, []);
  
  return allPermissions.includes(permission);
};

userSchema.methods.getPermissions = function() {
  const { ROLES, PERMISSIONS } = require("../../lib/roles");
  return this.roles.reduce((acc, role) => {
    return [...acc, ...(PERMISSIONS[role] || [])];
  }, []);
};

// Check if account is locked
userSchema.methods.isLocked = function() {
  return this.lockoutUntil && this.lockoutUntil > Date.now();
};

// Increment failed login attempts
userSchema.methods.incrementFailedLogins = async function() {
  // Check if lockout has expired
  if (this.lockoutUntil && this.lockoutUntil < Date.now()) {
    this.failedLoginAttempts = 1;
    this.lockoutUntil = null;
  } else {
    this.failedLoginAttempts += 1;
    
    // Lock account after 5 failed attempts
    if (this.failedLoginAttempts >= 5) {
      this.lockoutUntil = new Date(Date.now() + 15 * 60 * 1000);  // 15 minutes
    }
  }
  
  await this.save();
};

// Reset failed login attempts
userSchema.methods.resetFailedLogins = async function() {
  this.failedLoginAttempts = 0;
  this.lockoutUntil = null;
  await this.save();
};

// Check if password was used recently
userSchema.methods.isPasswordReused = async function(newPassword) {
  if (!this.passwordHistory || this.passwordHistory.length === 0) {
    return false;
  }
  
  for (const oldHash of this.passwordHistory) {
    const isMatch = await bcrypt.compare(newPassword, oldHash);
    if (isMatch) {
      return true;
    }
  }
  
  return false;
};

userSchema.statics = {
  async findByCredentials(email, password) {
    const user = await User.findOne({ email });
    
    if (!user) {
      throw new Error(msg("not_register"));
    }
    
    // Check if account is locked
    if (user.isLocked()) {
      const minutesLeft = Math.ceil((user.lockoutUntil - Date.now()) / 60000);
      throw new Error(`Account locked. Try again in ${minutesLeft} minutes.`);
    }
    
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    
    if (!isPasswordMatch) {
      // Increment failed attempts
      await user.incrementFailedLogins();
      throw new Error(msg("invalid_creds"));
    }
    
    // Reset failed attempts on successful login
    if (user.failedLoginAttempts > 0) {
      await user.resetFailedLogins();
    }
    
    return user;
  },

  async get(id) {
    try {
      let user = await User.findById(id);
      return user;
    } catch (error) {
      throw error;
    }
    return user;
  },
  async isEmailTaken(email) {
		let user = await User.findOne({ email }).exec();
		if (user) {
			return true;
		}
		return false;
	},
};
userSchema.plugin(uniqueValidator, {
  message: "Error, expected {PATH} to be unique."
});

export const User = mongoose.model("User", userSchema);
