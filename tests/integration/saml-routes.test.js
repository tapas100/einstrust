const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const samlRoutes = require('../../../src/routes/saml');
const IdpConfiguration = require('../../../src/models/IdpConfiguration');
const SamlSession = require('../../../src/models/SamlSession');
const User = require('../../../src/models/User');

// Create test app
const app = express();
app.use(express.json());
app.use('/api', samlRoutes);

// Mock authentication middleware
jest.mock('../../../src/middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = {
      id: 'test-user-id',
      email: 'test@example.com'
    };
    next();
  }
}));

jest.mock('../../../src/middleware/rbac', () => ({
  requireRole: (role) => (req, res, next) => next()
}));

describe('SAML API Routes', () => {
  let testIdp;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/einstrust_test');
    }
  });

  afterAll(async () => {
    await IdpConfiguration.deleteMany({});
    await SamlSession.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await IdpConfiguration.deleteMany({});
    await SamlSession.deleteMany({});

    // Create test IdP
    testIdp = await IdpConfiguration.create({
      name: 'Test IdP',
      entityId: 'http://test-idp.example.com',
      ssoUrl: 'https://test-idp.example.com/sso',
      sloUrl: 'https://test-idp.example.com/slo',
      certificate: '-----BEGIN CERTIFICATE-----\nMIIDXTCCAkWgAwIBAgIJAKL0UG+mRKU7MA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV\n-----END CERTIFICATE-----',
      certificateExpiry: new Date('2025-12-31'),
      enabled: true
    });
  });

  describe('POST /api/auth/saml/initiate', () => {
    test('should initiate SAML SSO successfully', async () => {
      const response = await request(app)
        .post('/api/auth/saml/initiate')
        .send({
          idpId: testIdp._id.toString(),
          returnUrl: 'https://myapp.com/callback',
          tenantId: 'test-tenant'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.redirectUrl).toBeDefined();
      expect(response.body.redirectUrl).toContain('test-idp.example.com');
      expect(response.body.requestId).toBeDefined();
    });

    test('should return 400 if idpId is missing', async () => {
      const response = await request(app)
        .post('/api/auth/saml/initiate')
        .send({
          returnUrl: 'https://myapp.com/callback'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required parameter: idpId');
    });

    test('should return 400 if returnUrl is missing', async () => {
      const response = await request(app)
        .post('/api/auth/saml/initiate')
        .send({
          idpId: testIdp._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required parameter: returnUrl');
    });

    test('should return 500 with invalid idpId', async () => {
      const invalidId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .post('/api/auth/saml/initiate')
        .send({
          idpId: invalidId.toString(),
          returnUrl: 'https://myapp.com/callback'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/auth/saml/callback', () => {
    test('should return 400 if SAMLResponse is missing', async () => {
      const response = await request(app)
        .post('/api/auth/saml/callback')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing SAML response');
    });

    test.skip('should process valid SAML assertion', async () => {
      // TODO: Implement with mock SAML response
      const mockSamlResponse = 'base64-encoded-saml-response';

      const response = await request(app)
        .post('/api/auth/saml/callback')
        .send({
          SAMLResponse: mockSamlResponse
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.accessToken).toBeDefined();
    });
  });

  describe('GET /api/auth/session', () => {
    test('should validate active session', async () => {
      const response = await request(app)
        .get('/api/auth/session')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body.user).toBeDefined();
    });
  });

  describe('POST /api/auth/logout', () => {
    test('should logout successfully (local)', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer test-token')
        .send({
          samlLogout: false
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Logged out successfully');
    });

    test.skip('should initiate SAML SLO', async () => {
      // TODO: Implement with active session
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer test-token')
        .send({
          sessionId: 'test-session-id',
          samlLogout: true
        });

      expect(response.status).toBe(200);
      expect(response.body.redirectUrl).toBeDefined();
    });
  });

  describe('GET /api/saml/metadata', () => {
    test('should return SP metadata XML', async () => {
      const response = await request(app)
        .get('/api/saml/metadata');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('xml');
      expect(response.text).toContain('EntityDescriptor');
      expect(response.text).toContain('SPSSODescriptor');
    });

    test('should return tenant-specific metadata', async () => {
      const response = await request(app)
        .get('/api/saml/metadata?tenantId=test-tenant');

      expect(response.status).toBe(200);
      expect(response.text).toContain('EntityDescriptor');
    });
  });

  describe('GET /api/saml/metadata/:tenantId', () => {
    test('should return tenant-specific metadata by path', async () => {
      const response = await request(app)
        .get('/api/saml/metadata/test-tenant');

      expect(response.status).toBe(200);
      expect(response.text).toContain('EntityDescriptor');
    });
  });

  describe('Admin IdP Management', () => {
    describe('POST /api/admin/idps', () => {
      test('should create IdP from metadata URL', async () => {
        // Mock fetch for this test
        global.fetch = jest.fn().mockResolvedValue({
          text: async () => `<?xml version="1.0"?>
            <EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="http://new-idp.example.com">
              <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
                <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" 
                                     Location="https://new-idp.example.com/sso"/>
                <KeyDescriptor use="signing">
                  <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
                    <ds:X509Data>
                      <ds:X509Certificate>MIIDXTCCAkWgAwIBAgIJAKL0UG+mRKU7MA0GCSqGSIb3DQEBCwUA</ds:X509Certificate>
                    </ds:X509Data>
                  </ds:KeyInfo>
                </KeyDescriptor>
              </IDPSSODescriptor>
            </EntityDescriptor>`
        });

        const response = await request(app)
          .post('/api/admin/idps')
          .set('Authorization', 'Bearer admin-token')
          .send({
            name: 'New IdP',
            metadataUrl: 'https://new-idp.example.com/metadata'
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.idp).toBeDefined();
        expect(response.body.idp.name).toBe('New IdP');
      });

      test('should return 400 if name is missing', async () => {
        const response = await request(app)
          .post('/api/admin/idps')
          .set('Authorization', 'Bearer admin-token')
          .send({
            metadataUrl: 'https://idp.example.com/metadata'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Name is required');
      });

      test('should return 400 if metadata is missing', async () => {
        const response = await request(app)
          .post('/api/admin/idps')
          .set('Authorization', 'Bearer admin-token')
          .send({
            name: 'Test IdP'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('metadataUrl or metadataXml');
      });
    });

    describe('GET /api/admin/idps', () => {
      test('should list all IdPs', async () => {
        const response = await request(app)
          .get('/api/admin/idps')
          .set('Authorization', 'Bearer admin-token');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.idps).toBeDefined();
        expect(Array.isArray(response.body.idps)).toBe(true);
        expect(response.body.count).toBeGreaterThan(0);
      });

      test('should filter by tenantId', async () => {
        const response = await request(app)
          .get('/api/admin/idps?tenantId=test-tenant')
          .set('Authorization', 'Bearer admin-token');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      test('should filter by enabled status', async () => {
        const response = await request(app)
          .get('/api/admin/idps?enabled=true')
          .set('Authorization', 'Bearer admin-token');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    describe('GET /api/admin/idps/:id', () => {
      test('should get IdP details', async () => {
        const response = await request(app)
          .get(`/api/admin/idps/${testIdp._id}`)
          .set('Authorization', 'Bearer admin-token');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.idp.id).toBe(testIdp._id.toString());
        expect(response.body.idp.name).toBe('Test IdP');
      });

      test('should return 404 for non-existent IdP', async () => {
        const invalidId = new mongoose.Types.ObjectId();

        const response = await request(app)
          .get(`/api/admin/idps/${invalidId}`)
          .set('Authorization', 'Bearer admin-token');

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('IdP not found');
      });
    });

    describe('PUT /api/admin/idps/:id', () => {
      test('should update IdP configuration', async () => {
        const response = await request(app)
          .put(`/api/admin/idps/${testIdp._id}`)
          .set('Authorization', 'Bearer admin-token')
          .send({
            name: 'Updated IdP Name',
            enabled: false
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.idp.name).toBe('Updated IdP Name');
        expect(response.body.idp.enabled).toBe(false);
      });

      test('should return 404 for non-existent IdP', async () => {
        const invalidId = new mongoose.Types.ObjectId();

        const response = await request(app)
          .put(`/api/admin/idps/${invalidId}`)
          .set('Authorization', 'Bearer admin-token')
          .send({
            name: 'Updated Name'
          });

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('IdP not found');
      });
    });

    describe('DELETE /api/admin/idps/:id', () => {
      test('should delete IdP', async () => {
        const response = await request(app)
          .delete(`/api/admin/idps/${testIdp._id}`)
          .set('Authorization', 'Bearer admin-token');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('IdP deleted successfully');

        // Verify deletion
        const deletedIdp = await IdpConfiguration.findById(testIdp._id);
        expect(deletedIdp).toBeNull();
      });

      test('should return 404 for non-existent IdP', async () => {
        const invalidId = new mongoose.Types.ObjectId();

        const response = await request(app)
          .delete(`/api/admin/idps/${invalidId}`)
          .set('Authorization', 'Bearer admin-token');

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('IdP not found');
      });
    });

    describe('POST /api/admin/idps/:id/refresh-metadata', () => {
      beforeEach(() => {
        testIdp.metadataUrl = 'https://test-idp.example.com/metadata';
      });

      test.skip('should refresh IdP metadata', async () => {
        // TODO: Mock fetch for metadata refresh
        const response = await request(app)
          .post(`/api/admin/idps/${testIdp._id}/refresh-metadata`)
          .set('Authorization', 'Bearer admin-token');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      test('should return 400 if no metadata URL configured', async () => {
        testIdp.metadataUrl = null;
        await testIdp.save();

        const response = await request(app)
          .post(`/api/admin/idps/${testIdp._id}/refresh-metadata`)
          .set('Authorization', 'Bearer admin-token');

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('No metadata URL configured');
      });
    });
  });
});
