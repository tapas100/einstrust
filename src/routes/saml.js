const express = require('express');
const router = express.Router();
const samlService = require('../services/saml');
const SamlSession = require('../models/SamlSession');
const IdpConfiguration = require('../models/IdpConfiguration');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const auditLogger = require('../lib/auditLogger');

/**
 * @route   POST /api/auth/saml/initiate
 * @desc    Initiate SAML SSO flow (SP-initiated)
 * @access  Public
 * @body    { idpId, returnUrl, tenantId }
 */
router.post('/saml/initiate', async (req, res) => {
  try {
    const { idpId, returnUrl, tenantId } = req.body;

    if (!idpId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: idpId' 
      });
    }

    if (!returnUrl) {
      return res.status(400).json({ 
        error: 'Missing required parameter: returnUrl' 
      });
    }

    const result = await samlService.initiateSso(idpId, returnUrl, tenantId);

    res.json({
      success: true,
      redirectUrl: result.redirectUrl,
      requestId: result.requestId
    });
  } catch (error) {
    auditLogger.log({
      event: 'SAML_INITIATE_ERROR',
      error: error.message,
      ip: req.ip,
      timestamp: new Date()
    });

    res.status(500).json({ 
      error: 'Failed to initiate SAML SSO',
      message: error.message 
    });
  }
});

/**
 * @route   POST /api/auth/saml/callback
 * @desc    Handle SAML assertion callback (from IdP)
 * @access  Public
 * @body    { SAMLResponse, RelayState }
 */
router.post('/saml/callback', async (req, res) => {
  try {
    const { SAMLResponse, RelayState } = req.body;

    if (!SAMLResponse) {
      return res.status(400).json({ 
        error: 'Missing SAML response' 
      });
    }

    const result = await samlService.processAssertion(SAMLResponse, RelayState);

    // Set session cookie
    res.cookie('einstrust_session', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000 // 8 hours
    });

    res.json({
      success: true,
      user: result.user,
      session: result.session,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      returnUrl: result.returnUrl
    });
  } catch (error) {
    auditLogger.log({
      event: 'SAML_CALLBACK_ERROR',
      error: error.message,
      ip: req.ip,
      timestamp: new Date()
    });

    res.status(401).json({ 
      error: 'SAML authentication failed',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/auth/session
 * @desc    Validate active SAML session
 * @access  Protected
 */
router.get('/session', authenticateToken, async (req, res) => {
  try {
    // User is already authenticated by authenticateToken middleware
    const sessions = await SamlSession.findActiveByUser(req.user.id);

    res.json({
      valid: true,
      user: req.user,
      sessions: sessions.map(s => ({
        id: s._id,
        idp: s.idpId.name,
        expiresAt: s.expiresAt,
        lastActivity: s.lastActivity
      }))
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Session validation failed',
      message: error.message 
    });
  }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout and terminate SAML session
 * @access  Protected
 */
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const { sessionId, samlLogout } = req.body;

    if (samlLogout && sessionId) {
      // Initiate SAML SLO
      const result = await samlService.initiateSlo(sessionId);
      
      // Clear session cookie
      res.clearCookie('einstrust_session');
      
      return res.json({
        success: true,
        redirectUrl: result.redirectUrl,
        message: 'SAML logout initiated'
      });
    } else {
      // Local logout only
      await SamlSession.terminateAllForUser(req.user.id);
      
      // Clear session cookie
      res.clearCookie('einstrust_session');
      
      auditLogger.log({
        event: 'LOCAL_LOGOUT',
        userId: req.user.id,
        timestamp: new Date()
      });

      return res.json({
        success: true,
        message: 'Logged out successfully'
      });
    }
  } catch (error) {
    auditLogger.log({
      event: 'LOGOUT_ERROR',
      userId: req.user.id,
      error: error.message,
      timestamp: new Date()
    });

    res.status(500).json({ 
      error: 'Logout failed',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/saml/metadata
 * @desc    Get Service Provider metadata XML
 * @access  Public
 */
router.get('/metadata', (req, res) => {
  try {
    const { tenantId } = req.query;
    const metadata = samlService.generateMetadata(tenantId);

    res.set('Content-Type', 'application/xml');
    res.send(metadata);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to generate metadata',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/saml/metadata/:tenantId
 * @desc    Get tenant-specific SP metadata
 * @access  Public
 */
router.get('/metadata/:tenantId', (req, res) => {
  try {
    const { tenantId } = req.params;
    const metadata = samlService.generateMetadata(tenantId);

    res.set('Content-Type', 'application/xml');
    res.send(metadata);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to generate metadata',
      message: error.message 
    });
  }
});

/**
 * Admin Routes - IdP Management
 */

/**
 * @route   POST /api/admin/idps
 * @desc    Register new Identity Provider
 * @access  Admin only
 * @body    { name, metadataUrl, metadataXml, tenantId, attributeMapping, allowedDomains }
 */
router.post('/admin/idps', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { name, metadataUrl, metadataXml, tenantId, attributeMapping, allowedDomains } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!metadataUrl && !metadataXml) {
      return res.status(400).json({ 
        error: 'Either metadataUrl or metadataXml is required' 
      });
    }

    // Parse metadata
    const metadata = await samlService.parseIdpMetadata(metadataUrl || metadataXml);

    // Create IdP configuration
    const idpConfig = new IdpConfiguration({
      name,
      entityId: metadata.entityId,
      ssoUrl: metadata.ssoUrl,
      sloUrl: metadata.sloUrl,
      certificate: metadata.certificate,
      certificateExpiry: metadata.certificateExpiry,
      metadataUrl: metadataUrl || null,
      metadataLastFetched: metadataUrl ? new Date() : null,
      tenantId: tenantId || null,
      attributeMapping: attributeMapping || undefined,
      allowedDomains: allowedDomains || [],
      metadata: metadata.metadata,
      enabled: true
    });

    await idpConfig.save();

    auditLogger.log({
      event: 'IDP_CREATED',
      idpId: idpConfig._id,
      name: idpConfig.name,
      adminId: req.user.id,
      timestamp: new Date()
    });

    res.status(201).json({
      success: true,
      idp: {
        id: idpConfig._id,
        name: idpConfig.name,
        entityId: idpConfig.entityId,
        enabled: idpConfig.enabled,
        certificateExpiry: idpConfig.certificateExpiry
      }
    });
  } catch (error) {
    auditLogger.log({
      event: 'IDP_CREATE_ERROR',
      error: error.message,
      adminId: req.user.id,
      timestamp: new Date()
    });

    res.status(500).json({ 
      error: 'Failed to create IdP',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/admin/idps
 * @desc    List all Identity Providers
 * @access  Admin only
 */
router.get('/admin/idps', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { tenantId, enabled } = req.query;
    
    const filter = {};
    if (tenantId) filter.tenantId = tenantId;
    if (enabled !== undefined) filter.enabled = enabled === 'true';

    const idps = await IdpConfiguration.find(filter).select('-certificate -metadata');

    res.json({
      success: true,
      count: idps.length,
      idps: idps.map(idp => ({
        id: idp._id,
        name: idp.name,
        entityId: idp.entityId,
        enabled: idp.enabled,
        tenantId: idp.tenantId,
        certificateExpiry: idp.certificateExpiry,
        isCertificateExpired: idp.isCertificateExpired,
        isCertificateExpiringSoon: idp.isCertificateExpiringSoon,
        createdAt: idp.createdAt,
        updatedAt: idp.updatedAt
      }))
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch IdPs',
      message: error.message 
    });
  }
});

/**
 * @route   GET /api/admin/idps/:id
 * @desc    Get IdP details
 * @access  Admin only
 */
router.get('/admin/idps/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const idp = await IdpConfiguration.findById(req.params.id);

    if (!idp) {
      return res.status(404).json({ error: 'IdP not found' });
    }

    res.json({
      success: true,
      idp: {
        id: idp._id,
        name: idp.name,
        entityId: idp.entityId,
        ssoUrl: idp.ssoUrl,
        sloUrl: idp.sloUrl,
        certificateExpiry: idp.certificateExpiry,
        isCertificateExpired: idp.isCertificateExpired,
        isCertificateExpiringSoon: idp.isCertificateExpiringSoon,
        metadataUrl: idp.metadataUrl,
        metadataLastFetched: idp.metadataLastFetched,
        nameIdFormat: idp.nameIdFormat,
        attributeMapping: idp.attributeMapping,
        enabled: idp.enabled,
        tenantId: idp.tenantId,
        allowedDomains: idp.allowedDomains,
        createdAt: idp.createdAt,
        updatedAt: idp.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch IdP',
      message: error.message 
    });
  }
});

/**
 * @route   PUT /api/admin/idps/:id
 * @desc    Update IdP configuration
 * @access  Admin only
 */
router.put('/admin/idps/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { name, enabled, attributeMapping, allowedDomains } = req.body;

    const idp = await IdpConfiguration.findById(req.params.id);

    if (!idp) {
      return res.status(404).json({ error: 'IdP not found' });
    }

    // Update allowed fields
    if (name) idp.name = name;
    if (enabled !== undefined) idp.enabled = enabled;
    if (attributeMapping) idp.attributeMapping = attributeMapping;
    if (allowedDomains) idp.allowedDomains = allowedDomains;

    await idp.save();

    auditLogger.log({
      event: 'IDP_UPDATED',
      idpId: idp._id,
      adminId: req.user.id,
      timestamp: new Date()
    });

    res.json({
      success: true,
      idp: {
        id: idp._id,
        name: idp.name,
        enabled: idp.enabled
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to update IdP',
      message: error.message 
    });
  }
});

/**
 * @route   DELETE /api/admin/idps/:id
 * @desc    Delete IdP configuration
 * @access  Admin only
 */
router.delete('/admin/idps/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const idp = await IdpConfiguration.findById(req.params.id);

    if (!idp) {
      return res.status(404).json({ error: 'IdP not found' });
    }

    await IdpConfiguration.findByIdAndDelete(req.params.id);

    auditLogger.log({
      event: 'IDP_DELETED',
      idpId: req.params.id,
      name: idp.name,
      adminId: req.user.id,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'IdP deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to delete IdP',
      message: error.message 
    });
  }
});

/**
 * @route   POST /api/admin/idps/:id/refresh-metadata
 * @desc    Refresh IdP metadata from URL
 * @access  Admin only
 */
router.post('/admin/idps/:id/refresh-metadata', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const idp = await IdpConfiguration.findById(req.params.id);

    if (!idp) {
      return res.status(404).json({ error: 'IdP not found' });
    }

    if (!idp.metadataUrl) {
      return res.status(400).json({ error: 'No metadata URL configured' });
    }

    // Fetch and parse latest metadata
    const metadata = await samlService.parseIdpMetadata(idp.metadataUrl);

    // Update IdP configuration
    idp.entityId = metadata.entityId;
    idp.ssoUrl = metadata.ssoUrl;
    idp.sloUrl = metadata.sloUrl;
    idp.certificate = metadata.certificate;
    idp.certificateExpiry = metadata.certificateExpiry;
    idp.metadata = metadata.metadata;
    idp.metadataLastFetched = new Date();

    await idp.save();

    auditLogger.log({
      event: 'IDP_METADATA_REFRESHED',
      idpId: idp._id,
      adminId: req.user.id,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Metadata refreshed successfully',
      certificateExpiry: idp.certificateExpiry
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to refresh metadata',
      message: error.message 
    });
  }
});

module.exports = router;
