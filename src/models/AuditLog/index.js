import mongoose from "mongoose";

const auditLogSchema = mongoose.Schema(
  {
    event: {
      type: String,
      required: true,
      enum: [
        "LOGIN_SUCCESS",
        "LOGIN_FAILED",
        "LOGOUT",
        "LOGOUT_ALL",
        "TOKEN_REFRESH",
        "TOKEN_REVOKED",
        "PASSWORD_RESET_REQUEST",
        "PASSWORD_RESET_SUCCESS",
        "PASSWORD_CHANGED",
        "ACCOUNT_LOCKED",
        "ACCOUNT_UNLOCKED",
        "ROLE_CHANGED",
        "PERMISSION_DENIED",
        "SUSPICIOUS_ACTIVITY",
        "OAUTH_CONNECTED",
        "OAUTH_DISCONNECTED",
        "EMAIL_VERIFIED",
        "REGISTRATION",
        "TOKEN_REPLAY_DETECTED",
        "BRUTE_FORCE_DETECTED",
        "RATE_LIMIT_EXCEEDED"
      ],
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true
    },
    correlationId: {
      type: String,  // UUID for tracing related events
      required: true,
      index: true
    },
    ip: {
      type: String,
      required: true
    },
    userAgent: String,
    location: String,
    success: {
      type: Boolean,
      default: true
    },
    severity: {
      type: String,
      enum: ["info", "warning", "error", "critical"],
      default: "info",
      index: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: false  // Using custom timestamp field
  }
);

// Index for common queries
auditLogSchema.index({ userId: 1, event: 1, timestamp: -1 });
auditLogSchema.index({ correlationId: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });

// Get recent events for user
auditLogSchema.statics.getUserEvents = async function(userId, limit = 50) {
  return await AuditLog.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
};

// Get events by correlation ID
auditLogSchema.statics.getByCorrelationId = async function(correlationId) {
  return await AuditLog.find({ correlationId })
    .sort({ timestamp: 1 })
    .lean();
};

// Get failed login attempts for user (last 24 hours)
auditLogSchema.statics.getFailedLogins = async function(userId, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return await AuditLog.countDocuments({
    userId,
    event: "LOGIN_FAILED",
    timestamp: { $gte: since }
  });
};

// Get failed login attempts from IP (last 24 hours)
auditLogSchema.statics.getFailedLoginsFromIP = async function(ip, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return await AuditLog.countDocuments({
    ip,
    event: "LOGIN_FAILED",
    timestamp: { $gte: since }
  });
};

// Get suspicious activity
auditLogSchema.statics.getSuspiciousActivity = async function(hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return await AuditLog.find({
    severity: { $in: ["warning", "error", "critical"] },
    timestamp: { $gte: since }
  })
    .sort({ timestamp: -1 })
    .lean();
};

// Cleanup old logs (older than 90 days for compliance)
auditLogSchema.statics.cleanupOld = async function(days = 90) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return await AuditLog.deleteMany({
    timestamp: { $lt: cutoff },
    severity: { $nin: ["error", "critical"] }  // Keep security events longer
  });
};

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
