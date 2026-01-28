/**
 * User Model Extension for SAML Support
 * 
 * Add these fields to the existing User schema in src/models/User/index.js
 */

// Add to userSchema definition (after oauthProviders):

/*
    // SAML/SSO integration
    samlNameId: {
      type: String,
      default: null,
      description: 'SAML NameID from IdP'
    },
    samlSessionIndex: {
      type: String,
      default: null,
      description: 'Current SAML session index'
    },
    identityProvider: {
      type: String,
      default: null,
      description: 'Identity provider name (e.g., "Okta", "Azure AD")'
    },
    tenantId: {
      type: String,
      default: null,
      index: true,
      description: 'Tenant ID for multi-tenant support'
    },
    lastSamlLogin: {
      type: Date,
      default: null,
      description: 'Last SAML login timestamp'
    },
    isActive: {
      type: Boolean,
      default: true,
      description: 'Whether user account is active'
    }
*/

// Example of updated User schema structure:
const userSchemaWithSaml = {
  name: String,
  email: String,
  password: String,
  tokens: Array,
  roles: Array,
  
  // Security
  failedLoginAttempts: Number,
  lockoutUntil: Date,
  lastLoginAt: Date,
  lastLoginIP: String,
  passwordHistory: Array,
  emailVerified: Boolean,
  emailVerificationToken: String,
  passwordResetToken: String,
  passwordResetExpires: Date,
  mustResetPassword: Boolean,
  
  // OAuth
  oauthProviders: Array,
  
  // SAML/SSO (NEW)
  samlNameId: String,
  samlSessionIndex: String,
  identityProvider: String,
  tenantId: String,
  lastSamlLogin: Date,
  isActive: Boolean
};

module.exports = {
  userSchemaWithSaml,
  description: 'Add SAML fields to existing User model'
};
