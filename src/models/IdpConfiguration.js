const mongoose = require('mongoose');

const idpConfigurationSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    default: null,
    index: true,
    description: 'Optional tenant ID for multi-tenant isolation'
  },
  name: {
    type: String,
    required: true,
    trim: true,
    description: 'Human-readable IdP name (e.g., "Okta Production")'
  },
  entityId: {
    type: String,
    required: true,
    unique: true,
    description: 'SAML Entity ID from IdP metadata'
  },
  ssoUrl: {
    type: String,
    required: true,
    description: 'SAML SSO endpoint URL'
  },
  sloUrl: {
    type: String,
    default: null,
    description: 'SAML Single Logout endpoint URL (optional)'
  },
  certificate: {
    type: String,
    required: true,
    description: 'X.509 certificate for signature validation (PEM format)'
  },
  certificateExpiry: {
    type: Date,
    required: true,
    description: 'Certificate expiration date'
  },
  metadataUrl: {
    type: String,
    default: null,
    description: 'URL to fetch IdP metadata (for auto-refresh)'
  },
  metadataLastFetched: {
    type: Date,
    default: null,
    description: 'Last time metadata was fetched from metadataUrl'
  },
  nameIdFormat: {
    type: String,
    default: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    enum: [
      'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
      'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
      'urn:oasis:names:tc:SAML:2.0:nameid-format:transient'
    ],
    description: 'Expected NameID format'
  },
  attributeMapping: {
    type: Map,
    of: String,
    default: {
      email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
      lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
      roles: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'
    },
    description: 'Mapping of user attributes from SAML assertions'
  },
  enabled: {
    type: Boolean,
    default: true,
    description: 'Whether this IdP is currently active'
  },
  allowedDomains: {
    type: [String],
    default: [],
    description: 'Email domains allowed to authenticate via this IdP (empty = all)'
  },
  metadata: {
    type: Object,
    default: {},
    description: 'Full IdP metadata object (cached)'
  }
}, {
  timestamps: true,
  collection: 'idp_configurations'
});

// Index for tenant-based queries
idpConfigurationSchema.index({ tenantId: 1, enabled: 1 });

// Virtual for certificate expiry status
idpConfigurationSchema.virtual('isCertificateExpiringSoon').get(function() {
  if (!this.certificateExpiry) return false;
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  return this.certificateExpiry < thirtyDaysFromNow;
});

// Virtual for certificate expired status
idpConfigurationSchema.virtual('isCertificateExpired').get(function() {
  if (!this.certificateExpiry) return false;
  return this.certificateExpiry < new Date();
});

// Method to check if domain is allowed
idpConfigurationSchema.methods.isDomainAllowed = function(email) {
  if (!this.allowedDomains || this.allowedDomains.length === 0) {
    return true; // No domain restrictions
  }
  
  const domain = email.split('@')[1];
  return this.allowedDomains.includes(domain);
};

// Static method to find IdP by entity ID
idpConfigurationSchema.statics.findByEntityId = function(entityId) {
  return this.findOne({ entityId, enabled: true });
};

// Static method to find IdPs by tenant
idpConfigurationSchema.statics.findByTenant = function(tenantId) {
  return this.find({ tenantId, enabled: true });
};

// Pre-save hook to validate certificate expiry
idpConfigurationSchema.pre('save', function(next) {
  if (this.isModified('certificate')) {
    // Extract expiry from certificate (simplified - real implementation uses node-forge)
    // For now, we'll assume certificateExpiry is set manually or by metadata parser
    if (!this.certificateExpiry) {
      return next(new Error('Certificate expiry date is required'));
    }
  }
  next();
});

const IdpConfiguration = mongoose.model('IdpConfiguration', idpConfigurationSchema);

module.exports = IdpConfiguration;
