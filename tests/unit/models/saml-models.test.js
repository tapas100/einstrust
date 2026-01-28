const mongoose = require('mongoose');
const IdpConfiguration = require('../../../src/models/IdpConfiguration');
const SamlSession = require('../../../src/models/SamlSession');

describe('IdpConfiguration Model', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/einstrust_test');
    }
  });

  afterAll(async () => {
    await IdpConfiguration.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await IdpConfiguration.deleteMany({});
  });

  describe('Schema Validation', () => {
    test('should create valid IdP configuration', async () => {
      const idp = new IdpConfiguration({
        name: 'Test IdP',
        entityId: 'http://test-idp.example.com',
        ssoUrl: 'https://test-idp.example.com/sso',
        certificate: '-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----',
        certificateExpiry: new Date('2025-12-31'),
        enabled: true
      });

      const saved = await idp.save();
      
      expect(saved._id).toBeDefined();
      expect(saved.name).toBe('Test IdP');
      expect(saved.enabled).toBe(true);
    });

    test('should require name', async () => {
      const idp = new IdpConfiguration({
        entityId: 'http://test-idp.example.com',
        ssoUrl: 'https://test-idp.example.com/sso',
        certificate: 'cert',
        certificateExpiry: new Date()
      });

      await expect(idp.save()).rejects.toThrow();
    });

    test('should require entityId', async () => {
      const idp = new IdpConfiguration({
        name: 'Test IdP',
        ssoUrl: 'https://test-idp.example.com/sso',
        certificate: 'cert',
        certificateExpiry: new Date()
      });

      await expect(idp.save()).rejects.toThrow();
    });

    test('should enforce unique entityId', async () => {
      const idp1 = await IdpConfiguration.create({
        name: 'IdP 1',
        entityId: 'http://same-entity-id.com',
        ssoUrl: 'https://idp1.com/sso',
        certificate: 'cert1',
        certificateExpiry: new Date('2025-12-31')
      });

      const idp2 = new IdpConfiguration({
        name: 'IdP 2',
        entityId: 'http://same-entity-id.com',
        ssoUrl: 'https://idp2.com/sso',
        certificate: 'cert2',
        certificateExpiry: new Date('2025-12-31')
      });

      await expect(idp2.save()).rejects.toThrow();
    });

    test('should set default values', async () => {
      const idp = await IdpConfiguration.create({
        name: 'Test IdP',
        entityId: 'http://test.com',
        ssoUrl: 'https://test.com/sso',
        certificate: 'cert',
        certificateExpiry: new Date('2025-12-31')
      });

      expect(idp.enabled).toBe(true);
      expect(idp.tenantId).toBeNull();
      expect(idp.sloUrl).toBeNull();
      expect(idp.nameIdFormat).toBe('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress');
      expect(idp.allowedDomains).toEqual([]);
    });
  });

  describe('Virtual Properties', () => {
    test('should detect certificate expiring soon', async () => {
      const twentyDaysFromNow = new Date();
      twentyDaysFromNow.setDate(twentyDaysFromNow.getDate() + 20);

      const idp = await IdpConfiguration.create({
        name: 'Test IdP',
        entityId: 'http://test.com',
        ssoUrl: 'https://test.com/sso',
        certificate: 'cert',
        certificateExpiry: twentyDaysFromNow
      });

      expect(idp.isCertificateExpiringSoon).toBe(true);
      expect(idp.isCertificateExpired).toBe(false);
    });

    test('should detect expired certificate', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const idp = await IdpConfiguration.create({
        name: 'Test IdP',
        entityId: 'http://test.com',
        ssoUrl: 'https://test.com/sso',
        certificate: 'cert',
        certificateExpiry: yesterday
      });

      expect(idp.isCertificateExpired).toBe(true);
      expect(idp.isCertificateExpiringSoon).toBe(true);
    });

    test('should detect valid certificate', async () => {
      const sixtyDaysFromNow = new Date();
      sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);

      const idp = await IdpConfiguration.create({
        name: 'Test IdP',
        entityId: 'http://test.com',
        ssoUrl: 'https://test.com/sso',
        certificate: 'cert',
        certificateExpiry: sixtyDaysFromNow
      });

      expect(idp.isCertificateExpired).toBe(false);
      expect(idp.isCertificateExpiringSoon).toBe(false);
    });
  });

  describe('Instance Methods', () => {
    test('should validate allowed domain', async () => {
      const idp = await IdpConfiguration.create({
        name: 'Test IdP',
        entityId: 'http://test.com',
        ssoUrl: 'https://test.com/sso',
        certificate: 'cert',
        certificateExpiry: new Date('2025-12-31'),
        allowedDomains: ['example.com', 'test.com']
      });

      expect(idp.isDomainAllowed('user@example.com')).toBe(true);
      expect(idp.isDomainAllowed('user@test.com')).toBe(true);
      expect(idp.isDomainAllowed('user@other.com')).toBe(false);
    });

    test('should allow all domains if no restrictions', async () => {
      const idp = await IdpConfiguration.create({
        name: 'Test IdP',
        entityId: 'http://test.com',
        ssoUrl: 'https://test.com/sso',
        certificate: 'cert',
        certificateExpiry: new Date('2025-12-31'),
        allowedDomains: []
      });

      expect(idp.isDomainAllowed('user@example.com')).toBe(true);
      expect(idp.isDomainAllowed('user@anything.com')).toBe(true);
    });
  });

  describe('Static Methods', () => {
    beforeEach(async () => {
      await IdpConfiguration.create([
        {
          name: 'IdP 1',
          entityId: 'http://idp1.com',
          ssoUrl: 'https://idp1.com/sso',
          certificate: 'cert1',
          certificateExpiry: new Date('2025-12-31'),
          enabled: true
        },
        {
          name: 'IdP 2',
          entityId: 'http://idp2.com',
          ssoUrl: 'https://idp2.com/sso',
          certificate: 'cert2',
          certificateExpiry: new Date('2025-12-31'),
          enabled: false
        },
        {
          name: 'IdP 3',
          entityId: 'http://idp3.com',
          ssoUrl: 'https://idp3.com/sso',
          certificate: 'cert3',
          certificateExpiry: new Date('2025-12-31'),
          tenantId: 'tenant-123',
          enabled: true
        }
      ]);
    });

    test('should find IdP by entity ID', async () => {
      const idp = await IdpConfiguration.findByEntityId('http://idp1.com');
      
      expect(idp).toBeDefined();
      expect(idp.name).toBe('IdP 1');
    });

    test('should not find disabled IdP', async () => {
      const idp = await IdpConfiguration.findByEntityId('http://idp2.com');
      
      expect(idp).toBeNull();
    });

    test('should find IdPs by tenant', async () => {
      const idps = await IdpConfiguration.findByTenant('tenant-123');
      
      expect(idps).toHaveLength(1);
      expect(idps[0].name).toBe('IdP 3');
    });

    test('should return empty array for non-existent tenant', async () => {
      const idps = await IdpConfiguration.findByTenant('non-existent');
      
      expect(idps).toHaveLength(0);
    });
  });
});

describe('SamlSession Model', () => {
  let testUserId;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/einstrust_test');
    }
    testUserId = new mongoose.Types.ObjectId();
  });

  afterAll(async () => {
    await SamlSession.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await SamlSession.deleteMany({});
  });

  describe('Schema Validation', () => {
    test('should create valid SAML session', async () => {
      const session = new SamlSession({
        userId: testUserId,
        idpId: new mongoose.Types.ObjectId(),
        nameId: 'user@example.com',
        nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        sessionIndex: 'session-index-123',
        assertionId: 'assertion-id-123',
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
        active: true
      });

      const saved = await session.save();
      
      expect(saved._id).toBeDefined();
      expect(saved.active).toBe(true);
    });

    test('should require userId', async () => {
      const session = new SamlSession({
        idpId: new mongoose.Types.ObjectId(),
        nameId: 'user@example.com',
        nameIdFormat: 'emailAddress',
        sessionIndex: 'idx',
        assertionId: 'aid',
        expiresAt: new Date()
      });

      await expect(session.save()).rejects.toThrow();
    });

    test('should enforce unique sessionIndex', async () => {
      await SamlSession.create({
        userId: testUserId,
        idpId: new mongoose.Types.ObjectId(),
        nameId: 'user1@example.com',
        nameIdFormat: 'emailAddress',
        sessionIndex: 'unique-session',
        assertionId: 'assertion-1',
        expiresAt: new Date(Date.now() + 1000)
      });

      const session2 = new SamlSession({
        userId: new mongoose.Types.ObjectId(),
        idpId: new mongoose.Types.ObjectId(),
        nameId: 'user2@example.com',
        nameIdFormat: 'emailAddress',
        sessionIndex: 'unique-session',
        assertionId: 'assertion-2',
        expiresAt: new Date(Date.now() + 1000)
      });

      await expect(session2.save()).rejects.toThrow();
    });

    test('should enforce unique assertionId', async () => {
      await SamlSession.create({
        userId: testUserId,
        idpId: new mongoose.Types.ObjectId(),
        nameId: 'user1@example.com',
        nameIdFormat: 'emailAddress',
        sessionIndex: 'session-1',
        assertionId: 'unique-assertion',
        expiresAt: new Date(Date.now() + 1000)
      });

      const session2 = new SamlSession({
        userId: new mongoose.Types.ObjectId(),
        idpId: new mongoose.Types.ObjectId(),
        nameId: 'user2@example.com',
        nameIdFormat: 'emailAddress',
        sessionIndex: 'session-2',
        assertionId: 'unique-assertion',
        expiresAt: new Date(Date.now() + 1000)
      });

      await expect(session2.save()).rejects.toThrow();
    });

    test('should set default values', async () => {
      const session = await SamlSession.create({
        userId: testUserId,
        idpId: new mongoose.Types.ObjectId(),
        nameId: 'user@example.com',
        nameIdFormat: 'emailAddress',
        sessionIndex: 'idx',
        assertionId: 'aid',
        expiresAt: new Date(Date.now() + 1000)
      });

      expect(session.active).toBe(true);
      expect(session.lastActivity).toBeInstanceOf(Date);
      expect(session.attributes).toBeInstanceOf(Map);
    });
  });

  describe('Virtual Properties', () => {
    test('should detect expired session', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const session = await SamlSession.create({
        userId: testUserId,
        idpId: new mongoose.Types.ObjectId(),
        nameId: 'user@example.com',
        nameIdFormat: 'emailAddress',
        sessionIndex: 'idx-1',
        assertionId: 'aid-1',
        expiresAt: yesterday
      });

      expect(session.isExpired).toBe(true);
    });

    test('should detect active session', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const session = await SamlSession.create({
        userId: testUserId,
        idpId: new mongoose.Types.ObjectId(),
        nameId: 'user@example.com',
        nameIdFormat: 'emailAddress',
        sessionIndex: 'idx-2',
        assertionId: 'aid-2',
        expiresAt: tomorrow
      });

      expect(session.isExpired).toBe(false);
    });

    test('should detect idle session', async () => {
      const session = await SamlSession.create({
        userId: testUserId,
        idpId: new mongoose.Types.ObjectId(),
        nameId: 'user@example.com',
        nameIdFormat: 'emailAddress',
        sessionIndex: 'idx-3',
        assertionId: 'aid-3',
        expiresAt: new Date(Date.now() + 1000),
        lastActivity: new Date(Date.now() - 31 * 60 * 1000) // 31 minutes ago
      });

      expect(session.isIdle).toBe(true);
    });
  });

  describe('Instance Methods', () => {
    test('should update activity timestamp', async () => {
      const session = await SamlSession.create({
        userId: testUserId,
        idpId: new mongoose.Types.ObjectId(),
        nameId: 'user@example.com',
        nameIdFormat: 'emailAddress',
        sessionIndex: 'idx-4',
        assertionId: 'aid-4',
        expiresAt: new Date(Date.now() + 1000),
        lastActivity: new Date(Date.now() - 1000)
      });

      const oldActivity = session.lastActivity;
      
      await new Promise(resolve => setTimeout(resolve, 100));
      await session.updateActivity();

      expect(session.lastActivity.getTime()).toBeGreaterThan(oldActivity.getTime());
    });

    test('should terminate session', async () => {
      const session = await SamlSession.create({
        userId: testUserId,
        idpId: new mongoose.Types.ObjectId(),
        nameId: 'user@example.com',
        nameIdFormat: 'emailAddress',
        sessionIndex: 'idx-5',
        assertionId: 'aid-5',
        expiresAt: new Date(Date.now() + 1000),
        active: true
      });

      await session.terminate();

      expect(session.active).toBe(false);
    });
  });

  describe('Static Methods', () => {
    beforeEach(async () => {
      const idpId = new mongoose.Types.ObjectId();
      
      await SamlSession.create([
        {
          userId: testUserId,
          idpId,
          nameId: 'user@example.com',
          nameIdFormat: 'email',
          sessionIndex: 'active-session-1',
          assertionId: 'assertion-1',
          expiresAt: new Date(Date.now() + 1000),
          active: true
        },
        {
          userId: testUserId,
          idpId,
          nameId: 'user@example.com',
          nameIdFormat: 'email',
          sessionIndex: 'expired-session',
          assertionId: 'assertion-2',
          expiresAt: new Date(Date.now() - 1000),
          active: true
        },
        {
          userId: testUserId,
          idpId,
          nameId: 'user@example.com',
          nameIdFormat: 'email',
          sessionIndex: 'inactive-session',
          assertionId: 'assertion-3',
          expiresAt: new Date(Date.now() + 1000),
          active: false
        }
      ]);
    });

    test('should find active session by session index', async () => {
      const session = await SamlSession.findActiveBySessionIndex('active-session-1');
      
      expect(session).toBeDefined();
      expect(session.active).toBe(true);
    });

    test('should not find expired session', async () => {
      const session = await SamlSession.findActiveBySessionIndex('expired-session');
      
      expect(session).toBeNull();
    });

    test('should not find inactive session', async () => {
      const session = await SamlSession.findActiveBySessionIndex('inactive-session');
      
      expect(session).toBeNull();
    });

    test('should find all active sessions for user', async () => {
      const sessions = await SamlSession.findActiveByUser(testUserId);
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionIndex).toBe('active-session-1');
    });

    test('should terminate all sessions for user', async () => {
      await SamlSession.terminateAllForUser(testUserId);
      
      const activeSessions = await SamlSession.findActiveByUser(testUserId);
      expect(activeSessions).toHaveLength(0);
    });

    test('should cleanup expired sessions', async () => {
      const deleted = await SamlSession.cleanupExpired();
      
      expect(deleted.deletedCount).toBeGreaterThan(0);
    });
  });

  describe('Pre-save Hooks', () => {
    test('should prevent creating expired session', async () => {
      const session = new SamlSession({
        userId: testUserId,
        idpId: new mongoose.Types.ObjectId(),
        nameId: 'user@example.com',
        nameIdFormat: 'email',
        sessionIndex: 'new-session',
        assertionId: 'new-assertion',
        expiresAt: new Date(Date.now() - 1000) // Already expired
      });

      await expect(session.save()).rejects.toThrow('Cannot create expired session');
    });
  });
});
