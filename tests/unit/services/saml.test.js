const samlService = require('../../../src/services/saml');
const IdpConfiguration = require('../../../src/models/IdpConfiguration');
const SamlSession = require('../../../src/models/SamlSession');
const User = require('../../../src/models/User');
const mongoose = require('mongoose');

// Mock data
const mockIdpMetadata = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="http://test-idp.example.com">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" 
                         Location="https://test-idp.example.com/sso"/>
    <SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" 
                        Location="https://test-idp.example.com/slo"/>
    <KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>MIIDXTCCAkWgAwIBAgIJAKL0UG+mRKU7MA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNVBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGQwHhcNMjQwMTAxMDAwMDAwWhcNMjUxMjMxMjM1OTU5WjBFMQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw7Wa</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </KeyDescriptor>
  </IDPSSODescriptor>
</EntityDescriptor>`;

describe('SAML Service', () => {
  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/einstrust_test');
    }
  });

  afterAll(async () => {
    // Cleanup
    await IdpConfiguration.deleteMany({});
    await SamlSession.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear collections before each test
    await IdpConfiguration.deleteMany({});
    await SamlSession.deleteMany({});
  });

  describe('Service Provider Configuration', () => {
    test('should initialize SP configuration', () => {
      const sp = samlService.createServiceProvider();
      
      expect(sp).toBeDefined();
      expect(sp.entityMeta).toBeDefined();
    });

    test('should generate SP metadata XML', () => {
      const metadata = samlService.generateMetadata();
      
      expect(metadata).toBeDefined();
      expect(metadata).toContain('EntityDescriptor');
      expect(metadata).toContain('SPSSODescriptor');
      expect(metadata).toContain('AssertionConsumerService');
    });

    test('should generate tenant-specific metadata', () => {
      const metadata = samlService.generateMetadata('tenant-123');
      
      expect(metadata).toBeDefined();
      expect(metadata).toContain('EntityDescriptor');
    });
  });

  describe('IdP Metadata Parsing', () => {
    test('should parse IdP metadata XML', async () => {
      const parsed = await samlService.parseIdpMetadata(mockIdpMetadata);
      
      expect(parsed).toBeDefined();
      expect(parsed.entityId).toBe('http://test-idp.example.com');
      expect(parsed.ssoUrl).toBe('https://test-idp.example.com/sso');
      expect(parsed.sloUrl).toBe('https://test-idp.example.com/slo');
      expect(parsed.certificate).toContain('BEGIN CERTIFICATE');
      expect(parsed.certificateExpiry).toBeInstanceOf(Date);
    });

    test('should handle invalid metadata XML', async () => {
      const invalidXml = '<invalid>xml</invalid>';
      
      await expect(samlService.parseIdpMetadata(invalidXml))
        .rejects.toThrow('Failed to parse IdP metadata');
    });

    test('should extract certificate expiry correctly', async () => {
      const parsed = await samlService.parseIdpMetadata(mockIdpMetadata);
      
      expect(parsed.certificateExpiry).toBeInstanceOf(Date);
      expect(parsed.certificateExpiry.getFullYear()).toBeGreaterThan(2024);
    });
  });

  describe('SSO Initiation', () => {
    let testIdp;

    beforeEach(async () => {
      // Create test IdP
      const metadata = await samlService.parseIdpMetadata(mockIdpMetadata);
      testIdp = await IdpConfiguration.create({
        name: 'Test IdP',
        entityId: metadata.entityId,
        ssoUrl: metadata.ssoUrl,
        sloUrl: metadata.sloUrl,
        certificate: metadata.certificate,
        certificateExpiry: metadata.certificateExpiry,
        enabled: true
      });
    });

    test('should initiate SSO successfully', async () => {
      const result = await samlService.initiateSso(
        testIdp._id.toString(),
        'https://myapp.com/callback',
        'test-tenant'
      );
      
      expect(result).toBeDefined();
      expect(result.redirectUrl).toContain('test-idp.example.com');
      expect(result.redirectUrl).toContain('SAMLRequest');
      expect(result.requestId).toBeDefined();
    });

    test('should fail with disabled IdP', async () => {
      testIdp.enabled = false;
      await testIdp.save();
      
      await expect(
        samlService.initiateSso(testIdp._id.toString(), 'https://myapp.com/callback')
      ).rejects.toThrow('Identity Provider not found or disabled');
    });

    test('should fail with expired certificate', async () => {
      testIdp.certificateExpiry = new Date('2020-01-01');
      await testIdp.save();
      
      await expect(
        samlService.initiateSso(testIdp._id.toString(), 'https://myapp.com/callback')
      ).rejects.toThrow('Identity Provider certificate has expired');
    });

    test('should fail with invalid IdP ID', async () => {
      const invalidId = new mongoose.Types.ObjectId();
      
      await expect(
        samlService.initiateSso(invalidId.toString(), 'https://myapp.com/callback')
      ).rejects.toThrow();
    });
  });

  describe('Certificate Validation', () => {
    let testIdp;

    beforeEach(async () => {
      const metadata = await samlService.parseIdpMetadata(mockIdpMetadata);
      testIdp = await IdpConfiguration.create({
        name: 'Test IdP',
        entityId: metadata.entityId,
        ssoUrl: metadata.ssoUrl,
        certificate: metadata.certificate,
        certificateExpiry: metadata.certificateExpiry,
        enabled: true
      });
    });

    test('should detect certificate expiry status', async () => {
      const status = await samlService.checkCertificateExpiry(testIdp._id);
      
      expect(status).toBeDefined();
      expect(status.expiry).toBeInstanceOf(Date);
      expect(status.isExpired).toBe(false);
      expect(status.daysUntilExpiry).toBeGreaterThan(0);
    });

    test('should detect expired certificate', async () => {
      testIdp.certificateExpiry = new Date('2020-01-01');
      await testIdp.save();
      
      const status = await samlService.checkCertificateExpiry(testIdp._id);
      
      expect(status.isExpired).toBe(true);
      expect(status.daysUntilExpiry).toBeLessThan(0);
    });

    test('should detect certificate expiring soon', async () => {
      const twentyDaysFromNow = new Date();
      twentyDaysFromNow.setDate(twentyDaysFromNow.getDate() + 20);
      
      testIdp.certificateExpiry = twentyDaysFromNow;
      await testIdp.save();
      
      const status = await samlService.checkCertificateExpiry(testIdp._id);
      
      expect(status.isExpiringSoon).toBe(true);
      expect(status.daysUntilExpiry).toBeLessThan(30);
    });
  });

  describe('Attribute Mapping', () => {
    test('should map SAML attributes correctly', () => {
      const samlAttributes = {
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'user@example.com',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname': 'John',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname': 'Doe',
        'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': ['admin', 'user']
      };

      const attributeMapping = {
        email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
        firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
        lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
        roles: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'
      };

      const userData = samlService.mapAttributes(samlAttributes, attributeMapping);
      
      expect(userData.email).toBe('user@example.com');
      expect(userData.firstName).toBe('John');
      expect(userData.lastName).toBe('Doe');
      expect(userData.roles).toBe('admin'); // First element of array
    });

    test('should handle missing attributes', () => {
      const samlAttributes = {
        'email': 'user@example.com'
      };

      const attributeMapping = {
        email: 'email',
        firstName: 'firstName',
        lastName: 'lastName'
      };

      const userData = samlService.mapAttributes(samlAttributes, attributeMapping);
      
      expect(userData.email).toBe('user@example.com');
      expect(userData.firstName).toBeUndefined();
      expect(userData.lastName).toBeUndefined();
    });

    test('should handle Map-based attribute mapping', () => {
      const samlAttributes = {
        'email': 'user@example.com'
      };

      const attributeMapping = new Map([
        ['email', 'email'],
        ['firstName', 'firstName']
      ]);

      const userData = samlService.mapAttributes(samlAttributes, attributeMapping);
      
      expect(userData.email).toBe('user@example.com');
    });
  });

  describe('Security Validations', () => {
    test('should extract issuer from SAML response', () => {
      const parsedXml = {
        'samlp:Response': {
          'saml:Issuer': ['http://test-idp.example.com']
        }
      };

      const issuer = samlService.extractIssuer(parsedXml);
      
      expect(issuer).toBe('http://test-idp.example.com');
    });

    test('should extract assertion ID', () => {
      const parsedXml = {
        'samlp:Response': {
          'saml:Assertion': [
            { $: { ID: 'assertion-123' } }
          ]
        }
      };

      const assertionId = samlService.extractAssertionId(parsedXml);
      
      expect(assertionId).toBe('assertion-123');
    });

    test('should generate fallback assertion ID if missing', () => {
      const parsedXml = {
        'samlp:Response': {}
      };

      const assertionId = samlService.extractAssertionId(parsedXml);
      
      expect(assertionId).toContain('assertion-');
      expect(assertionId.length).toBeGreaterThan(10);
    });
  });
});

describe('SAML Service - Integration Tests', () => {
  // These tests would require a mock IdP or test IdP
  describe('End-to-End SSO Flow', () => {
    test.skip('should complete full SSO flow', async () => {
      // TODO: Implement with mock IdP
    });

    test.skip('should handle IdP-initiated SSO', async () => {
      // TODO: Implement with mock IdP
    });

    test.skip('should perform Single Logout', async () => {
      // TODO: Implement with mock IdP
    });
  });
});
