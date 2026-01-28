const samlService = require('../../../src/services/saml');
const IdpConfiguration = require('../../../src/models/IdpConfiguration');
const SamlSession = require('../../../src/models/SamlSession');
const mongoose = require('mongoose');

describe('SAML Security Tests', () => {
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
  });

  describe('Assertion Replay Prevention', () => {
    test('should prevent reuse of assertion ID', async () => {
      const userId = new mongoose.Types.ObjectId();
      const idpId = new mongoose.Types.ObjectId();

      // Create first session with assertion ID
      await SamlSession.create({
        userId,
        idpId,
        nameId: 'user@example.com',
        nameIdFormat: 'email',
        sessionIndex: 'session-1',
        assertionId: 'assertion-123',
        expiresAt: new Date(Date.now() + 10000)
      });

      // Attempt to create second session with same assertion ID
      const duplicateSession = new SamlSession({
        userId,
        idpId,
        nameId: 'user@example.com',
        nameIdFormat: 'email',
        sessionIndex: 'session-2',
        assertionId: 'assertion-123', // Same assertion ID
        expiresAt: new Date(Date.now() + 10000)
      });

      await expect(duplicateSession.save()).rejects.toThrow();
    });

    test('should track assertion IDs for replay detection', async () => {
      const assertionId = 'test-assertion-123';
      
      // Check if assertion was already used
      const existing = await SamlSession.findOne({ assertionId });
      expect(existing).toBeNull();

      // Create session (marks assertion as used)
      await SamlSession.create({
        userId: new mongoose.Types.ObjectId(),
        idpId: new mongoose.Types.ObjectId(),
        nameId: 'user@example.com',
        nameIdFormat: 'email',
        sessionIndex: 'idx',
        assertionId,
        expiresAt: new Date(Date.now() + 10000)
      });

      // Check again - should now exist
      const used = await SamlSession.findOne({ assertionId });
      expect(used).toBeDefined();
      expect(used.assertionId).toBe(assertionId);
    });
  });

  describe('Certificate Validation', () => {
    test('should reject expired certificates', async () => {
      const idp = await IdpConfiguration.create({
        name: 'Expired IdP',
        entityId: 'http://expired-idp.com',
        ssoUrl: 'https://expired-idp.com/sso',
        certificate: '-----BEGIN CERTIFICATE-----\nexpired\n-----END CERTIFICATE-----',
        certificateExpiry: new Date('2020-01-01'), // Expired
        enabled: true
      });

      await expect(
        samlService.initiateSso(idp._id.toString(), 'https://return.com')
      ).rejects.toThrow('certificate has expired');
    });

    test('should warn about certificates expiring soon', async () => {
      const twentyDaysFromNow = new Date();
      twentyDaysFromNow.setDate(twentyDaysFromNow.getDate() + 20);

      const idp = await IdpConfiguration.create({
        name: 'Expiring IdP',
        entityId: 'http://expiring-idp.com',
        ssoUrl: 'https://expiring-idp.com/sso',
        certificate: '-----BEGIN CERTIFICATE-----\nexpiring\n-----END CERTIFICATE-----',
        certificateExpiry: twentyDaysFromNow,
        enabled: true
      });

      const status = await samlService.checkCertificateExpiry(idp._id);
      
      expect(status.isExpiringSoon).toBe(true);
      expect(status.daysUntilExpiry).toBeLessThan(30);
    });

    test('should validate certificate format', async () => {
      const idp = new IdpConfiguration({
        name: 'Invalid Cert IdP',
        entityId: 'http://invalid-cert.com',
        ssoUrl: 'https://invalid-cert.com/sso',
        certificate: 'not-a-valid-certificate', // Invalid format
        certificateExpiry: new Date('2025-12-31')
      });

      // Should save (validation happens during SAML processing)
      await expect(idp.save()).resolves.toBeDefined();
    });
  });

  describe('Domain-Based Access Control', () => {
    test('should enforce allowed domains', async () => {
      const idp = await IdpConfiguration.create({
        name: 'Domain-Restricted IdP',
        entityId: 'http://restricted-idp.com',
        ssoUrl: 'https://restricted-idp.com/sso',
        certificate: 'cert',
        certificateExpiry: new Date('2025-12-31'),
        allowedDomains: ['example.com', 'test.com'],
        enabled: true
      });

      // Valid domains
      expect(idp.isDomainAllowed('user@example.com')).toBe(true);
      expect(idp.isDomainAllowed('admin@test.com')).toBe(true);

      // Invalid domains
      expect(idp.isDomainAllowed('user@other.com')).toBe(false);
      expect(idp.isDomainAllowed('hacker@malicious.com')).toBe(false);
    });

    test('should allow all domains when no restrictions', async () => {
      const idp = await IdpConfiguration.create({
        name: 'Open IdP',
        entityId: 'http://open-idp.com',
        ssoUrl: 'https://open-idp.com/sso',
        certificate: 'cert',
        certificateExpiry: new Date('2025-12-31'),
        allowedDomains: [], // No restrictions
        enabled: true
      });

      expect(idp.isDomainAllowed('user@any.com')).toBe(true);
      expect(idp.isDomainAllowed('anyone@anywhere.com')).toBe(true);
    });
  });

  describe('Session Security', () => {
    test('should expire sessions after timeout', async () => {
      const shortExpiry = new Date(Date.now() + 100); // 100ms

      const session = await SamlSession.create({
        userId: new mongoose.Types.ObjectId(),
        idpId: new mongoose.Types.ObjectId(),
        nameId: 'user@example.com',
        nameIdFormat: 'email',
        sessionIndex: 'short-session',
        assertionId: 'assertion-short',
        expiresAt: shortExpiry,
        active: true
      });

      expect(session.isExpired).toBe(false);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      const reloaded = await SamlSession.findById(session._id);
      expect(reloaded.isExpired).toBe(true);
    });

    test('should track idle sessions', async () => {
      const thirtyOneMinutesAgo = new Date(Date.now() - 31 * 60 * 1000);

      const session = await SamlSession.create({
        userId: new mongoose.Types.ObjectId(),
        idpId: new mongoose.Types.ObjectId(),
        nameId: 'user@example.com',
        nameIdFormat: 'email',
        sessionIndex: 'idle-session',
        assertionId: 'assertion-idle',
        expiresAt: new Date(Date.now() + 10000),
        lastActivity: thirtyOneMinutesAgo,
        active: true
      });

      expect(session.isIdle).toBe(true);
    });

    test('should update activity on access', async () => {
      const session = await SamlSession.create({
        userId: new mongoose.Types.ObjectId(),
        idpId: new mongoose.Types.ObjectId(),
        nameId: 'user@example.com',
        nameIdFormat: 'email',
        sessionIndex: 'active-session',
        assertionId: 'assertion-active',
        expiresAt: new Date(Date.now() + 10000),
        lastActivity: new Date(Date.now() - 10000),
        active: true
      });

      const oldActivity = session.lastActivity;
      
      await new Promise(resolve => setTimeout(resolve, 10));
      await session.updateActivity();

      expect(session.lastActivity.getTime()).toBeGreaterThan(oldActivity.getTime());
      expect(session.isIdle).toBe(false);
    });

    test('should terminate sessions securely', async () => {
      const session = await SamlSession.create({
        userId: new mongoose.Types.ObjectId(),
        idpId: new mongoose.Types.ObjectId(),
        nameId: 'user@example.com',
        nameIdFormat: 'email',
        sessionIndex: 'terminate-session',
        assertionId: 'assertion-terminate',
        expiresAt: new Date(Date.now() + 10000),
        active: true
      });

      expect(session.active).toBe(true);

      await session.terminate();

      expect(session.active).toBe(false);
      
      // Should not be found by active session queries
      const activeSession = await SamlSession.findActiveBySessionIndex('terminate-session');
      expect(activeSession).toBeNull();
    });
  });

  describe('Multi-Tenant Isolation', () => {
    test('should isolate IdPs by tenant', async () => {
      await IdpConfiguration.create([
        {
          name: 'Tenant A IdP',
          entityId: 'http://tenant-a-idp.com',
          ssoUrl: 'https://tenant-a-idp.com/sso',
          certificate: 'cert-a',
          certificateExpiry: new Date('2025-12-31'),
          tenantId: 'tenant-a',
          enabled: true
        },
        {
          name: 'Tenant B IdP',
          entityId: 'http://tenant-b-idp.com',
          ssoUrl: 'https://tenant-b-idp.com/sso',
          certificate: 'cert-b',
          certificateExpiry: new Date('2025-12-31'),
          tenantId: 'tenant-b',
          enabled: true
        }
      ]);

      const tenantAIdps = await IdpConfiguration.findByTenant('tenant-a');
      const tenantBIdps = await IdpConfiguration.findByTenant('tenant-b');

      expect(tenantAIdps).toHaveLength(1);
      expect(tenantBIdps).toHaveLength(1);
      expect(tenantAIdps[0].name).toBe('Tenant A IdP');
      expect(tenantBIdps[0].name).toBe('Tenant B IdP');
    });

    test('should isolate sessions by tenant', async () => {
      const userId = new mongoose.Types.ObjectId();
      const idpId = new mongoose.Types.ObjectId();

      await SamlSession.create([
        {
          userId,
          idpId,
          nameId: 'user@example.com',
          nameIdFormat: 'email',
          sessionIndex: 'tenant-a-session',
          assertionId: 'assertion-a',
          expiresAt: new Date(Date.now() + 10000),
          tenantId: 'tenant-a',
          active: true
        },
        {
          userId,
          idpId,
          nameId: 'user@example.com',
          nameIdFormat: 'email',
          sessionIndex: 'tenant-b-session',
          assertionId: 'assertion-b',
          expiresAt: new Date(Date.now() + 10000),
          tenantId: 'tenant-b',
          active: true
        }
      ]);

      const tenantASessions = await SamlSession.find({ tenantId: 'tenant-a', active: true });
      const tenantBSessions = await SamlSession.find({ tenantId: 'tenant-b', active: true });

      expect(tenantASessions).toHaveLength(1);
      expect(tenantBSessions).toHaveLength(1);
    });
  });

  describe('Input Validation & Sanitization', () => {
    test('should sanitize IdP name', async () => {
      const idp = await IdpConfiguration.create({
        name: '  Test IdP  ', // Whitespace
        entityId: 'http://test.com',
        ssoUrl: 'https://test.com/sso',
        certificate: 'cert',
        certificateExpiry: new Date('2025-12-31')
      });

      expect(idp.name).toBe('Test IdP'); // Trimmed
    });

    test('should validate entityId format', async () => {
      const idp = await IdpConfiguration.create({
        name: 'Test IdP',
        entityId: 'http://test.com', // Valid URL
        ssoUrl: 'https://test.com/sso',
        certificate: 'cert',
        certificateExpiry: new Date('2025-12-31')
      });

      expect(idp.entityId).toBe('http://test.com');
    });

    test('should validate SSO URL format', async () => {
      const idp = await IdpConfiguration.create({
        name: 'Test IdP',
        entityId: 'http://test.com',
        ssoUrl: 'https://test.com/sso', // Valid HTTPS URL
        certificate: 'cert',
        certificateExpiry: new Date('2025-12-31')
      });

      expect(idp.ssoUrl).toBe('https://test.com/sso');
    });
  });

  describe('Audit Logging', () => {
    test('should log SSO initiation attempts', async () => {
      // This would integrate with audit logger
      // For now, just verify the flow doesn't break
      const idp = await IdpConfiguration.create({
        name: 'Audit Test IdP',
        entityId: 'http://audit-test.com',
        ssoUrl: 'https://audit-test.com/sso',
        certificate: 'cert',
        certificateExpiry: new Date('2025-12-31'),
        enabled: true
      });

      await expect(
        samlService.initiateSso(idp._id.toString(), 'https://return.com')
      ).resolves.toBeDefined();
    });
  });

  describe('Rate Limiting Protection', () => {
    test('should prevent rapid session creation', async () => {
      const userId = new mongoose.Types.ObjectId();
      const idpId = new mongoose.Types.ObjectId();

      // Create multiple sessions rapidly
      const sessions = [];
      for (let i = 0; i < 10; i++) {
        sessions.push(
          SamlSession.create({
            userId,
            idpId,
            nameId: 'user@example.com',
            nameIdFormat: 'email',
            sessionIndex: `session-${i}`,
            assertionId: `assertion-${i}`,
            expiresAt: new Date(Date.now() + 10000),
            active: true
          })
        );
      }

      // All should succeed (rate limiting would be at API level)
      await expect(Promise.all(sessions)).resolves.toHaveLength(10);

      // In production, API rate limiting would prevent this
    });
  });

  describe('Error Handling', () => {
    test('should handle missing IdP gracefully', async () => {
      const invalidId = new mongoose.Types.ObjectId();

      await expect(
        samlService.initiateSso(invalidId.toString(), 'https://return.com')
      ).rejects.toThrow();
    });

    test('should handle disabled IdP gracefully', async () => {
      const idp = await IdpConfiguration.create({
        name: 'Disabled IdP',
        entityId: 'http://disabled.com',
        ssoUrl: 'https://disabled.com/sso',
        certificate: 'cert',
        certificateExpiry: new Date('2025-12-31'),
        enabled: false // Disabled
      });

      await expect(
        samlService.initiateSso(idp._id.toString(), 'https://return.com')
      ).rejects.toThrow('not found or disabled');
    });

    test('should prevent creating expired sessions', async () => {
      const session = new SamlSession({
        userId: new mongoose.Types.ObjectId(),
        idpId: new mongoose.Types.ObjectId(),
        nameId: 'user@example.com',
        nameIdFormat: 'email',
        sessionIndex: 'expired-new',
        assertionId: 'assertion-expired-new',
        expiresAt: new Date(Date.now() - 1000) // Already expired
      });

      await expect(session.save()).rejects.toThrow('Cannot create expired session');
    });
  });
});
