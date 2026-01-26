import mongoose from "mongoose";

const refreshTokenSchema = mongoose.Schema(
  {
    _id: {
      type: String,  // UUID
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true
    },
    family: {
      type: String,  // UUID - groups related tokens
      required: true,
      index: true
    },
    parent: {
      type: String,  // Parent token ID (for rotation tracking)
      default: null
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true
    },
    revokedAt: {
      type: Date,
      default: null
    },
    revokedReason: {
      type: String,
      enum: ["logout", "logout_all", "rotated", "suspicious", "expired", "password_change", "family_compromised", "replay_attack"],
      default: null
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    lastUsedAt: {
      type: Date,
      default: null
    },
    usageCount: {
      type: Number,
      default: 0
    },
    metadata: {
      ip: String,
      userAgent: String,
      location: String,
      device: String,
      fingerprint: String
    }
  },
  {
    timestamps: true
  }
);

// Index for cleanup queries
refreshTokenSchema.index({ expiresAt: 1, isRevoked: 1 });

// Check if token has children (already rotated)
refreshTokenSchema.methods.hasChildren = async function() {
  const children = await RefreshToken.countDocuments({ parent: this._id });
  return children > 0;
};

// Get all tokens in family
refreshTokenSchema.statics.getFamily = async function(familyId) {
  return await RefreshToken.find({ family: familyId }).sort({ createdAt: 1 });
};

// Revoke entire token family
refreshTokenSchema.statics.revokeFamily = async function(familyId, reason = "family_compromised") {
  return await RefreshToken.updateMany(
    { family: familyId, isRevoked: false },
    {
      $set: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: reason
      }
    }
  );
};

// Revoke all tokens for user
refreshTokenSchema.statics.revokeAllForUser = async function(userId, reason = "logout_all") {
  return await RefreshToken.updateMany(
    { userId, isRevoked: false },
    {
      $set: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: reason
      }
    }
  );
};

// Cleanup expired tokens
refreshTokenSchema.statics.cleanupExpired = async function() {
  return await RefreshToken.deleteMany({
    expiresAt: { $lt: new Date() }
  });
};

// Cleanup old revoked tokens (older than 30 days)
refreshTokenSchema.statics.cleanupOldRevoked = async function() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return await RefreshToken.deleteMany({
    isRevoked: true,
    revokedAt: { $lt: thirtyDaysAgo }
  });
};

export const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);
