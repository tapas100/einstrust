const mongoose = require('mongoose');

const samlSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
    description: 'Reference to authenticated user'
  },
  tenantId: {
    type: String,
    default: null,
    index: true,
    description: 'Tenant ID for multi-tenant isolation'
  },
  idpId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IdpConfiguration',
    required: true,
    description: 'Identity Provider used for authentication'
  },
  nameId: {
    type: String,
    required: true,
    description: 'SAML NameID from assertion'
  },
  nameIdFormat: {
    type: String,
    required: true,
    description: 'NameID format from assertion'
  },
  sessionIndex: {
    type: String,
    required: true,
    unique: true,
    description: 'SAML SessionIndex for SLO support'
  },
  assertionId: {
    type: String,
    required: true,
    unique: true,
    description: 'Assertion ID for replay attack prevention'
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
    description: 'Session expiration timestamp'
  },
  lastActivity: {
    type: Date,
    default: Date.now,
    description: 'Last activity timestamp for idle timeout'
  },
  attributes: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {},
    description: 'SAML attributes from assertion'
  },
  ipAddress: {
    type: String,
    default: null,
    description: 'IP address of the client'
  },
  userAgent: {
    type: String,
    default: null,
    description: 'User agent string'
  },
  active: {
    type: Boolean,
    default: true,
    index: true,
    description: 'Whether session is currently active'
  }
}, {
  timestamps: true,
  collection: 'saml_sessions'
});

// Compound index for efficient session lookups
samlSessionSchema.index({ userId: 1, active: 1 });
samlSessionSchema.index({ sessionIndex: 1, active: 1 });
samlSessionSchema.index({ expiresAt: 1, active: 1 });

// TTL index to auto-delete expired sessions
samlSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual to check if session is expired
samlSessionSchema.virtual('isExpired').get(function() {
  return this.expiresAt < new Date();
});

// Virtual to check if session is idle (30 minutes default)
samlSessionSchema.virtual('isIdle').get(function() {
  const idleTimeout = 30 * 60 * 1000; // 30 minutes in milliseconds
  return (Date.now() - this.lastActivity.getTime()) > idleTimeout;
});

// Method to update last activity
samlSessionSchema.methods.updateActivity = function() {
  this.lastActivity = new Date();
  return this.save();
};

// Method to terminate session
samlSessionSchema.methods.terminate = function() {
  this.active = false;
  return this.save();
};

// Static method to find active session by session index
samlSessionSchema.statics.findActiveBySessionIndex = function(sessionIndex) {
  return this.findOne({
    sessionIndex,
    active: true,
    expiresAt: { $gt: new Date() }
  }).populate('userId idpId');
};

// Static method to find all active sessions for a user
samlSessionSchema.statics.findActiveByUser = function(userId) {
  return this.find({
    userId,
    active: true,
    expiresAt: { $gt: new Date() }
  }).populate('idpId');
};

// Static method to terminate all sessions for a user
samlSessionSchema.statics.terminateAllForUser = async function(userId) {
  return this.updateMany(
    { userId, active: true },
    { active: false }
  );
};

// Static method to clean up expired sessions (manual cleanup)
samlSessionSchema.statics.cleanupExpired = async function() {
  return this.deleteMany({
    expiresAt: { $lt: new Date() }
  });
};

// Pre-save hook to validate session hasn't expired
samlSessionSchema.pre('save', function(next) {
  if (this.isNew && this.expiresAt < new Date()) {
    return next(new Error('Cannot create expired session'));
  }
  next();
});

const SamlSession = mongoose.model('SamlSession', samlSessionSchema);

module.exports = SamlSession;
