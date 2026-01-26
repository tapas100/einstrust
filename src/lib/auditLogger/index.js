import { AuditLog } from '../../models';
import { v4 as uuidv4 } from 'uuid';

// ────────────────────────────────────────────────────────────────────────────────
// Audit Logger - Security Event Tracking
// ────────────────────────────────────────────────────────────────────────────────

class AuditLogger {
  
  /**
   * Log an audit event
   * @param {Object} params - Event parameters
   * @param {string} params.event - Event type (LOGIN_SUCCESS, LOGIN_FAILED, etc.)
   * @param {string} params.userId - User ID (optional)
   * @param {string} params.correlationId - Correlation ID for tracing
   * @param {string} params.ip - Client IP address
   * @param {string} params.userAgent - Client user agent
   * @param {boolean} params.success - Whether the event was successful
   * @param {string} params.severity - Event severity (info, warning, error, critical)
   * @param {Object} params.metadata - Additional event data
   */
  async log({ 
    event, 
    userId = null, 
    correlationId = null, 
    ip, 
    userAgent = null,
    location = null,
    success = true, 
    severity = 'info', 
    metadata = {} 
  }) {
    try {
      await AuditLog.create({
        event,
        userId,
        correlationId: correlationId || uuidv4(),
        ip,
        userAgent,
        location,
        success,
        severity,
        metadata,
        timestamp: new Date()
      });
    } catch (error) {
      // Don't let audit logging failures break the app
      console.error('Audit logging failed:', error);
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Authentication Events
  // ──────────────────────────────────────────────────────────────

  async logLoginSuccess(userId, req, correlationId) {
    await this.log({
      event: 'LOGIN_SUCCESS',
      userId,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: true,
      severity: 'info',
      metadata: {
        method: 'credentials'
      }
    });
  }

  async logLoginFailed(email, reason, req, correlationId) {
    await this.log({
      event: 'LOGIN_FAILED',
      userId: null,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: false,
      severity: 'warning',
      metadata: {
        email,
        reason
      }
    });
  }

  async logLogout(userId, req, correlationId) {
    await this.log({
      event: 'LOGOUT',
      userId,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: true,
      severity: 'info'
    });
  }

  async logLogoutAll(userId, req, correlationId) {
    await this.log({
      event: 'LOGOUT_ALL',
      userId,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: true,
      severity: 'warning',
      metadata: {
        reason: 'User initiated logout from all devices'
      }
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Token Events
  // ──────────────────────────────────────────────────────────────

  async logTokenRefresh(userId, req, correlationId) {
    await this.log({
      event: 'TOKEN_REFRESH',
      userId,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: true,
      severity: 'info'
    });
  }

  async logTokenRevoked(userId, reason, req, correlationId) {
    await this.log({
      event: 'TOKEN_REVOKED',
      userId,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: true,
      severity: 'warning',
      metadata: { reason }
    });
  }

  async logTokenReplayDetected(userId, familyId, req, correlationId) {
    await this.log({
      event: 'TOKEN_REPLAY_DETECTED',
      userId,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: false,
      severity: 'critical',
      metadata: {
        familyId,
        action: 'All tokens in family revoked'
      }
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Password Events
  // ──────────────────────────────────────────────────────────────

  async logPasswordResetRequest(email, req, correlationId) {
    await this.log({
      event: 'PASSWORD_RESET_REQUEST',
      userId: null,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: true,
      severity: 'info',
      metadata: { email }
    });
  }

  async logPasswordResetSuccess(userId, req, correlationId) {
    await this.log({
      event: 'PASSWORD_RESET_SUCCESS',
      userId,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: true,
      severity: 'warning',
      metadata: {
        action: 'All sessions invalidated'
      }
    });
  }

  async logPasswordChanged(userId, req, correlationId) {
    await this.log({
      event: 'PASSWORD_CHANGED',
      userId,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: true,
      severity: 'warning'
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Account Events
  // ──────────────────────────────────────────────────────────────

  async logAccountLocked(userId, reason, req, correlationId) {
    await this.log({
      event: 'ACCOUNT_LOCKED',
      userId,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: true,
      severity: 'error',
      metadata: { reason }
    });
  }

  async logAccountUnlocked(userId, req, correlationId) {
    await this.log({
      event: 'ACCOUNT_UNLOCKED',
      userId,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: true,
      severity: 'info'
    });
  }

  async logRegistration(userId, req, correlationId) {
    await this.log({
      event: 'REGISTRATION',
      userId,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: true,
      severity: 'info'
    });
  }

  async logEmailVerified(userId, req, correlationId) {
    await this.log({
      event: 'EMAIL_VERIFIED',
      userId,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: true,
      severity: 'info'
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Authorization Events
  // ──────────────────────────────────────────────────────────────

  async logRoleChanged(userId, oldRoles, newRoles, changedBy, req, correlationId) {
    await this.log({
      event: 'ROLE_CHANGED',
      userId,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: true,
      severity: 'warning',
      metadata: {
        oldRoles,
        newRoles,
        changedBy
      }
    });
  }

  async logPermissionDenied(userId, resource, action, req, correlationId) {
    await this.log({
      event: 'PERMISSION_DENIED',
      userId,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: false,
      severity: 'warning',
      metadata: {
        resource,
        action
      }
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Security Events
  // ──────────────────────────────────────────────────────────────

  async logSuspiciousActivity(userId, reason, req, correlationId) {
    await this.log({
      event: 'SUSPICIOUS_ACTIVITY',
      userId,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: false,
      severity: 'critical',
      metadata: { reason }
    });
  }

  async logBruteForceDetected(email, req, correlationId) {
    await this.log({
      event: 'BRUTE_FORCE_DETECTED',
      userId: null,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: false,
      severity: 'critical',
      metadata: { email }
    });
  }

  async logRateLimitExceeded(endpoint, req, correlationId) {
    await this.log({
      event: 'RATE_LIMIT_EXCEEDED',
      userId: req.user?._id || null,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: false,
      severity: 'warning',
      metadata: { endpoint }
    });
  }

  // ──────────────────────────────────────────────────────────────
  // OAuth Events
  // ──────────────────────────────────────────────────────────────

  async logOAuthConnected(userId, provider, req, correlationId) {
    await this.log({
      event: 'OAUTH_CONNECTED',
      userId,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: true,
      severity: 'info',
      metadata: { provider }
    });
  }

  async logOAuthDisconnected(userId, provider, req, correlationId) {
    await this.log({
      event: 'OAUTH_DISCONNECTED',
      userId,
      correlationId,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent'),
      success: true,
      severity: 'info',
      metadata: { provider }
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Utility Methods
  // ──────────────────────────────────────────────────────────────

  getClientIP(req) {
    return req.ip || 
           req.headers['x-forwarded-for']?.split(',')[0].trim() || 
           req.headers['x-real-ip'] || 
           req.connection?.remoteAddress ||
           'unknown';
  }

  generateCorrelationId() {
    return uuidv4();
  }

  /**
   * Middleware to add correlation ID to requests
   */
  correlationMiddleware() {
    return (req, res, next) => {
      req.correlationId = req.get('x-correlation-id') || uuidv4();
      res.set('x-correlation-id', req.correlationId);
      next();
    };
  }

  /**
   * Middleware to log all requests
   */
  requestLogger() {
    return async (req, res, next) => {
      const startTime = Date.now();
      
      // Log request
      res.on('finish', async () => {
        const duration = Date.now() - startTime;
        
        // Only log important routes
        if (req.path.startsWith('/api/v1/auth') || req.path.startsWith('/api/v1/users')) {
          try {
            await this.log({
              event: 'API_REQUEST',
              userId: req.user?._id || null,
              correlationId: req.correlationId,
              ip: this.getClientIP(req),
              userAgent: req.get('user-agent'),
              success: res.statusCode < 400,
              severity: res.statusCode >= 500 ? 'error' : (res.statusCode >= 400 ? 'warning' : 'info'),
              metadata: {
                method: req.method,
                path: req.path,
                statusCode: res.statusCode,
                duration
              }
            });
          } catch (error) {
            console.error('Request logging failed:', error);
          }
        }
      });
      
      next();
    };
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();
export default auditLogger;
