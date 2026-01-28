const saml = require('samlify');
const xml2js = require('xml2js');
const forge = require('node-forge');
const IdpConfiguration = require('../models/IdpConfiguration');
const SamlSession = require('../models/SamlSession');
const User = require('../models/User');
const auditLogger = require('../lib/auditLogger');

// Configure samlify defaults
saml.setSchemaValidator({
  validate: (response) => {
    // Basic validation - can be enhanced with schema validation
    return { valid: true };
  }
});

class SamlService {
  constructor() {
    this.spConfig = this.initializeServiceProvider();
  }

  /**
   * Initialize Service Provider configuration
   */
  initializeServiceProvider() {
    const baseUrl = process.env.SAML_SP_BASE_URL || 'http://localhost:3000';
    
    return {
      entityID: `${baseUrl}/saml/metadata`,
      assertionConsumerService: [
        {
          Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
          Location: `${baseUrl}/api/auth/saml/callback`
        }
      ],
      singleLogoutService: [
        {
          Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
          Location: `${baseUrl}/api/auth/logout/saml`
        }
      ],
      nameIDFormat: [
        'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent'
      ],
      wantAssertionsSigned: true,
      authnRequestsSigned: false  // Set to true in production with SP certificate
    };
  }

  /**
   * Create Service Provider instance
   */
  createServiceProvider() {
    return saml.ServiceProvider(this.spConfig);
  }

  /**
   * Create Identity Provider instance from configuration
   */
  async createIdentityProvider(idpId) {
    const idpConfig = await IdpConfiguration.findById(idpId);
    
    if (!idpConfig || !idpConfig.enabled) {
      throw new Error('Identity Provider not found or disabled');
    }

    if (idpConfig.isCertificateExpired) {
      throw new Error('Identity Provider certificate has expired');
    }

    return saml.IdentityProvider({
      entityID: idpConfig.entityId,
      singleSignOnService: [
        {
          Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
          Location: idpConfig.ssoUrl
        },
        {
          Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
          Location: idpConfig.ssoUrl
        }
      ],
      singleLogoutService: idpConfig.sloUrl ? [
        {
          Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
          Location: idpConfig.sloUrl
        }
      ] : undefined,
      nameIDFormat: [idpConfig.nameIdFormat],
      wantAuthnRequestsSigned: false,
      signingCert: idpConfig.certificate
    });
  }

  /**
   * Initiate SAML SSO flow (SP-initiated)
   * @param {String} idpId - Identity Provider ID
   * @param {String} returnUrl - URL to return after authentication
   * @param {String} tenantId - Optional tenant ID
   * @returns {Object} { redirectUrl, requestId }
   */
  async initiateSso(idpId, returnUrl, tenantId = null) {
    try {
      const sp = this.createServiceProvider();
      const idp = await this.createIdentityProvider(idpId);

      // Create SAML authentication request
      const { context, entityEndpoint } = sp.createLoginRequest(idp, 'redirect');

      // Store request ID and return URL in session/cache (Redis recommended)
      // For now, we'll include it in RelayState
      const relayState = JSON.stringify({
        returnUrl,
        tenantId,
        timestamp: Date.now()
      });

      auditLogger.log({
        event: 'SAML_SSO_INITIATED',
        idpId,
        tenantId,
        returnUrl,
        timestamp: new Date()
      });

      return {
        redirectUrl: `${entityEndpoint}?${context}${relayState ? `&RelayState=${encodeURIComponent(relayState)}` : ''}`,
        requestId: context.split('ID=')[1]?.split('&')[0] || null
      };
    } catch (error) {
      auditLogger.log({
        event: 'SAML_SSO_INITIATE_FAILED',
        error: error.message,
        idpId,
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Process SAML assertion from callback
   * @param {String} samlResponse - Base64 encoded SAML response
   * @param {String} relayState - Relay state from SSO initiation
   * @returns {Object} { user, session, accessToken, refreshToken }
   */
  async processAssertion(samlResponse, relayState = null) {
    try {
      const sp = this.createServiceProvider();
      
      // Parse relay state
      let parsedRelayState = {};
      if (relayState) {
        try {
          parsedRelayState = JSON.parse(decodeURIComponent(relayState));
        } catch (e) {
          // Invalid relay state - continue anyway
        }
      }

      // Decode and parse SAML response
      const buffer = Buffer.from(samlResponse, 'base64');
      const xmlResponse = buffer.toString('utf-8');
      
      // Parse XML to extract IdP entity ID
      const parser = new xml2js.Parser();
      const parsed = await parser.parseStringPromise(xmlResponse);
      
      // Extract issuer (IdP entity ID)
      const issuer = this.extractIssuer(parsed);
      
      // Find IdP configuration
      const idpConfig = await IdpConfiguration.findByEntityId(issuer);
      if (!idpConfig) {
        throw new Error(`Unknown Identity Provider: ${issuer}`);
      }

      const idp = await this.createIdentityProvider(idpConfig._id);

      // Validate SAML response
      const { extract } = await sp.parseLoginResponse(idp, 'post', {
        body: { SAMLResponse: samlResponse }
      });

      // Extract user attributes
      const attributes = extract.attributes || {};
      const nameID = extract.nameID || extract.nameid;
      const sessionIndex = extract.sessionIndex;
      const assertionId = this.extractAssertionId(parsed);

      // Check for assertion replay
      const existingAssertion = await SamlSession.findOne({ assertionId });
      if (existingAssertion) {
        throw new Error('Assertion replay detected');
      }

      // Map SAML attributes to user data
      const userData = this.mapAttributes(attributes, idpConfig.attributeMapping);
      
      // Validate email domain if configured
      if (userData.email && !idpConfig.isDomainAllowed(userData.email)) {
        throw new Error(`Email domain not allowed for this IdP: ${userData.email}`);
      }

      // Find or create user
      let user = await User.findOne({ email: userData.email });
      
      if (!user) {
        // Auto-provision user
        user = new User({
          email: userData.email,
          username: userData.email,
          firstName: userData.firstName || 'Unknown',
          lastName: userData.lastName || 'Unknown',
          samlNameId: nameID,
          identityProvider: idpConfig.name,
          tenantId: parsedRelayState.tenantId || idpConfig.tenantId,
          emailVerified: true,  // Trust IdP verification
          isActive: true
        });
        await user.save();

        auditLogger.log({
          event: 'USER_AUTO_PROVISIONED',
          userId: user._id,
          email: user.email,
          idpId: idpConfig._id,
          timestamp: new Date()
        });
      } else {
        // Update user data from SAML
        user.firstName = userData.firstName || user.firstName;
        user.lastName = userData.lastName || user.lastName;
        user.samlNameId = nameID;
        user.lastSamlLogin = new Date();
        await user.save();
      }

      // Create SAML session
      const sessionExpiry = new Date();
      sessionExpiry.setHours(sessionExpiry.getHours() + 8); // 8 hour session

      const samlSession = new SamlSession({
        userId: user._id,
        tenantId: parsedRelayState.tenantId || idpConfig.tenantId,
        idpId: idpConfig._id,
        nameId: nameID,
        nameIdFormat: extract.nameIDFormat || idpConfig.nameIdFormat,
        sessionIndex: sessionIndex,
        assertionId: assertionId,
        expiresAt: sessionExpiry,
        attributes: userData,
        active: true
      });
      await samlSession.save();

      // Generate JWT tokens (reuse existing token service)
      const tokenService = require('./token');
      const { accessToken, refreshToken } = await tokenService.generateTokenPair(user);

      auditLogger.log({
        event: 'SAML_LOGIN_SUCCESS',
        userId: user._id,
        email: user.email,
        idpId: idpConfig._id,
        sessionId: samlSession._id,
        timestamp: new Date()
      });

      return {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          roles: userData.roles || []
        },
        session: {
          id: samlSession._id,
          expiresAt: samlSession.expiresAt
        },
        accessToken,
        refreshToken,
        returnUrl: parsedRelayState.returnUrl || '/'
      };
    } catch (error) {
      auditLogger.log({
        event: 'SAML_LOGIN_FAILED',
        error: error.message,
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Initiate SAML logout (SLO)
   */
  async initiateSlo(sessionId) {
    try {
      const samlSession = await SamlSession.findById(sessionId).populate('idpId userId');
      
      if (!samlSession || !samlSession.active) {
        throw new Error('Session not found or already terminated');
      }

      const sp = this.createServiceProvider();
      const idp = await this.createIdentityProvider(samlSession.idpId._id);

      // Create logout request
      const { context, entityEndpoint } = sp.createLogoutRequest(idp, 'redirect', {
        nameID: samlSession.nameId,
        sessionIndex: samlSession.sessionIndex
      });

      // Terminate local session
      await samlSession.terminate();

      auditLogger.log({
        event: 'SAML_LOGOUT_INITIATED',
        userId: samlSession.userId._id,
        sessionId: samlSession._id,
        timestamp: new Date()
      });

      return {
        redirectUrl: `${entityEndpoint}?${context}`
      };
    } catch (error) {
      auditLogger.log({
        event: 'SAML_LOGOUT_FAILED',
        error: error.message,
        sessionId,
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Generate SP metadata XML
   */
  generateMetadata(tenantId = null) {
    const sp = this.createServiceProvider();
    const metadata = sp.getMetadata();

    auditLogger.log({
      event: 'METADATA_GENERATED',
      tenantId,
      timestamp: new Date()
    });

    return metadata;
  }

  /**
   * Parse IdP metadata from URL or XML
   */
  async parseIdpMetadata(metadataUrlOrXml) {
    try {
      let metadataXml;

      // Check if it's a URL or XML string
      if (metadataUrlOrXml.startsWith('http')) {
        // Fetch metadata from URL
        const response = await fetch(metadataUrlOrXml);
        metadataXml = await response.text();
      } else {
        metadataXml = metadataUrlOrXml;
      }

      // Parse XML
      const parser = new xml2js.Parser();
      const parsed = await parser.parseStringPromise(metadataXml);

      // Extract relevant fields
      const entityDescriptor = parsed['md:EntityDescriptor'] || parsed.EntityDescriptor;
      const idpDescriptor = entityDescriptor['md:IDPSSODescriptor'] || entityDescriptor.IDPSSODescriptor;

      const entityId = entityDescriptor.$.entityID;
      
      // Extract SSO URL
      const ssoServices = idpDescriptor[0]['md:SingleSignOnService'] || idpDescriptor[0].SingleSignOnService;
      const ssoUrl = ssoServices.find(s => 
        s.$.Binding.includes('HTTP-Redirect') || s.$.Binding.includes('HTTP-POST')
      ).$.Location;

      // Extract SLO URL (optional)
      const sloServices = idpDescriptor[0]['md:SingleLogoutService'] || idpDescriptor[0].SingleLogoutService;
      const sloUrl = sloServices ? sloServices[0].$.Location : null;

      // Extract certificate
      const keyDescriptor = idpDescriptor[0]['md:KeyDescriptor'] || idpDescriptor[0].KeyDescriptor;
      const certData = keyDescriptor[0]['ds:KeyInfo'][0]['ds:X509Data'][0]['ds:X509Certificate'][0];
      const certificate = `-----BEGIN CERTIFICATE-----\n${certData.trim()}\n-----END CERTIFICATE-----`;

      // Parse certificate expiry
      const cert = forge.pki.certificateFromPem(certificate);
      const certificateExpiry = cert.validity.notAfter;

      return {
        entityId,
        ssoUrl,
        sloUrl,
        certificate,
        certificateExpiry,
        metadata: parsed
      };
    } catch (error) {
      throw new Error(`Failed to parse IdP metadata: ${error.message}`);
    }
  }

  /**
   * Helper: Extract issuer from SAML response
   */
  extractIssuer(parsedXml) {
    try {
      const response = parsedXml['samlp:Response'] || parsedXml.Response;
      const issuer = response['saml:Issuer'] || response.Issuer;
      return issuer[0]._ || issuer[0];
    } catch (error) {
      throw new Error('Unable to extract issuer from SAML response');
    }
  }

  /**
   * Helper: Extract assertion ID from SAML response
   */
  extractAssertionId(parsedXml) {
    try {
      const response = parsedXml['samlp:Response'] || parsedXml.Response;
      const assertion = response['saml:Assertion'] || response.Assertion;
      return assertion[0].$.ID;
    } catch (error) {
      return `assertion-${Date.now()}`; // Fallback
    }
  }

  /**
   * Helper: Map SAML attributes to user data
   */
  mapAttributes(samlAttributes, attributeMapping) {
    const userData = {};

    // Convert attributeMapping from Map to object if needed
    const mapping = attributeMapping instanceof Map 
      ? Object.fromEntries(attributeMapping) 
      : attributeMapping;

    for (const [userField, samlField] of Object.entries(mapping)) {
      const value = samlAttributes[samlField];
      if (value !== undefined) {
        userData[userField] = Array.isArray(value) ? value[0] : value;
      }
    }

    return userData;
  }

  /**
   * Validate certificate expiry
   */
  async checkCertificateExpiry(idpId) {
    const idpConfig = await IdpConfiguration.findById(idpId);
    
    if (!idpConfig) {
      throw new Error('IdP not found');
    }

    return {
      expiry: idpConfig.certificateExpiry,
      isExpired: idpConfig.isCertificateExpired,
      isExpiringSoon: idpConfig.isCertificateExpiringSoon,
      daysUntilExpiry: Math.ceil(
        (idpConfig.certificateExpiry - new Date()) / (1000 * 60 * 60 * 24)
      )
    };
  }
}

module.exports = new SamlService();
