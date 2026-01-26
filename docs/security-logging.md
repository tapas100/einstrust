# 📝 Security Logging & Audit Trail

## Overview

Comprehensive security event logging with correlation IDs for tracking, alerting for suspicious activities, and audit trails for compliance.

---

## Why Security Logging?

### Benefits
1. **Incident Response** - Trace attack timelines
2. **Compliance** - GDPR, SOC 2, HIPAA requirements
3. **Forensics** - Investigate security breaches
4. **Monitoring** - Detect suspicious patterns
5. **Accountability** - Track administrative actions

---

## Logged Events

### Authentication Events

| Event | Severity | Description | Triggers |
|-------|----------|-------------|----------|
| `LOGIN_SUCCESS` | info | Successful login | User logs in |
| `LOGIN_FAILED` | warning | Failed login attempt | Wrong password |
| `LOGOUT` | info | User logs out | Explicit logout |
| `LOGOUT_ALL` | warning | All devices logged out | Security measure |

### Token Events

| Event | Severity | Description | Triggers |
|-------|----------|-------------|----------|
| `TOKEN_REFRESH` | info | Access token refreshed | Token rotation |
| `TOKEN_REVOKED` | warning | Token manually revoked | Admin action |
| `TOKEN_REPLAY_DETECTED` | critical | Token reuse detected | Security attack |

### Password Events

| Event | Severity | Description | Triggers |
|-------|----------|-------------|----------|
| `PASSWORD_RESET_REQUEST` | info | Password reset requested | User requests reset |
| `PASSWORD_RESET_SUCCESS` | warning | Password successfully reset | Reset token used |
| `PASSWORD_CHANGED` | warning | Password changed by user | Account settings |

### Account Events

| Event | Severity | Description | Triggers |
|-------|----------|-------------|----------|
| `ACCOUNT_LOCKED` | error | Account locked | Too many failed logins |
| `ACCOUNT_UNLOCKED` | info | Account unlocked | Timeout or admin |
| `REGISTRATION` | info | New user registered | Sign up |
| `EMAIL_VERIFIED` | info | Email verified | Verification link |

### Authorization Events

| Event | Severity | Description | Triggers |
|-------|----------|-------------|----------|
| `ROLE_CHANGED` | warning | User role changed | Admin action |
| `PERMISSION_DENIED` | warning | Unauthorized access attempt | Missing permissions |

### Security Events

| Event | Severity | Description | Triggers |
|-------|----------|-------------|----------|
| `SUSPICIOUS_ACTIVITY` | critical | Suspicious behavior detected | Anomaly detection |
| `BRUTE_FORCE_DETECTED` | critical | Brute force attack | Multiple failed logins |
| `RATE_LIMIT_EXCEEDED` | warning | Rate limit hit | Too many requests |

---

## Log Structure

### Standard Log Entry

```json
{
  "_id": "ObjectId(...)",
  "event": "LOGIN_SUCCESS",
  "userId": "ObjectId(507f1f77bcf86cd799439011)",
  "correlationId": "uuid-v4-correlation-id",
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
  "location": "San Francisco, CA, US",
  "success": true,
  "severity": "info",
  "metadata": {
    "method": "credentials",
    "device": "Chrome (macOS)"
  },
  "timestamp": "2026-01-26T10:30:00.000Z"
}
```

---

## Correlation IDs

### What is a Correlation ID?

A unique identifier (UUID) that tracks related events across the system.

### Benefits

1. **Request Tracing** - Follow a request through multiple services
2. **Debugging** - See all events for a specific user action
3. **Incident Analysis** - Reconstruct attack timeline

### Example Flow

```
User Login Request:
  ├── correlationId: "abc-123"
  │
  ├── LOGIN_FAILED (attempt 1)
  │   └── correlationId: "abc-123"
  │
  ├── LOGIN_FAILED (attempt 2)
  │   └── correlationId: "abc-123"
  │
  └── LOGIN_SUCCESS (attempt 3)
      └── correlationId: "abc-123"

// Query all events for this login:
AuditLog.find({ correlationId: "abc-123" })
```

### Implementation

```javascript
// Middleware to add correlation ID
app.use((req, res, next) => {
  // Use client-provided ID or generate new one
  req.correlationId = req.get('x-correlation-id') || uuidv4();
  res.set('x-correlation-id', req.correlationId);
  next();
});

// In controllers
await auditLogger.log({
  event: 'LOGIN_SUCCESS',
  userId: user._id,
  correlationId: req.correlationId,  // From middleware
  // ...
});
```

---

## Querying Logs

### Get User's Recent Activity

```javascript
const events = await AuditLog.find({ userId: user._id })
  .sort({ timestamp: -1 })
  .limit(50)
  .lean();
```

### Track Single Request

```javascript
const events = await AuditLog.find({ correlationId: 'abc-123' })
  .sort({ timestamp: 1 })
  .lean();

// Example output:
[
  { timestamp: '10:30:00', event: 'LOGIN_FAILED', metadata: { reason: 'invalid_password' } },
  { timestamp: '10:30:15', event: 'LOGIN_FAILED', metadata: { reason: 'invalid_password' } },
  { timestamp: '10:30:30', event: 'LOGIN_SUCCESS' }
]
```

### Find Suspicious Activity

```javascript
// Failed logins from same IP
const suspiciousIP = await AuditLog.aggregate([
  {
    $match: {
      event: 'LOGIN_FAILED',
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }
  },
  {
    $group: {
      _id: '$ip',
      count: { $sum: 1 },
      users: { $addToSet: '$metadata.email' }
    }
  },
  {
    $match: { count: { $gte: 10 } }  // 10+ failed logins
  },
  {
    $sort: { count: -1 }
  }
]);

// Example output:
[
  { _id: '192.168.1.100', count: 25, users: ['user1@example.com', 'user2@example.com'] }
]
```

### Geographic Anomaly

```javascript
// User logs in from unusual location
const userLogins = await AuditLog.find({
  userId: user._id,
  event: 'LOGIN_SUCCESS',
  timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }  // Last 30 days
})
  .select('location timestamp')
  .sort({ timestamp: -1 })
  .lean();

// Detect if last login is from different country than previous 10
const locations = userLogins.map(l => l.location);
const lastCountry = extractCountry(locations[0]);
const previousCountries = locations.slice(1, 11).map(extractCountry);

if (!previousCountries.includes(lastCountry)) {
  // Alert: Login from new country
}
```

---

## Alerting

### Real-Time Alerts

```javascript
// Alert on critical events
async function checkAndAlert(event) {
  if (event.severity === 'critical') {
    await alertSecurityTeam({
      event: event.event,
      userId: event.userId,
      ip: event.ip,
      timestamp: event.timestamp,
      metadata: event.metadata
    });
  }
}

// After logging
await auditLogger.log({ ... });
await checkAndAlert(event);
```

### Pattern-Based Alerts

```javascript
// Check for brute force pattern
async function checkBruteForce(ip) {
  const failedAttempts = await AuditLog.countDocuments({
    ip,
    event: 'LOGIN_FAILED',
    timestamp: { $gte: new Date(Date.now() - 15 * 60 * 1000) }  // Last 15 min
  });
  
  if (failedAttempts >= 5) {
    await alertSecurityTeam({
      type: 'BRUTE_FORCE_DETECTED',
      ip,
      attempts: failedAttempts
    });
  }
}
```

---

## Monitoring Dashboard

### Key Metrics

```javascript
// Failed login rate
const failedLoginRate = await AuditLog.countDocuments({
  event: 'LOGIN_FAILED',
  timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) }  // Last hour
});

// Successful login rate
const successfulLoginRate = await AuditLog.countDocuments({
  event: 'LOGIN_SUCCESS',
  timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
});

// Success rate
const successRate = successfulLoginRate / (successfulLoginRate + failedLoginRate);

// Token refresh rate
const refreshRate = await AuditLog.countDocuments({
  event: 'TOKEN_REFRESH',
  timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
});

// Account lockouts
const lockouts = await AuditLog.countDocuments({
  event: 'ACCOUNT_LOCKED',
  timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
});
```

### Dashboard Example

```
═══════════════════════════════════════════════════════════
  SECURITY DASHBOARD - Last 24 Hours
═══════════════════════════════════════════════════════════

Authentication:
  ✅ Successful Logins:        1,245
  ❌ Failed Logins:              87  (6.5% failure rate)
  🔒 Account Lockouts:            3
  
Token Management:
  🔄 Token Refreshes:          2,150
  🚫 Tokens Revoked:              12
  ⚠️  Token Replay Detected:       0

Security Events:
  🚨 Suspicious Activity:          1
  🔥 Brute Force Attempts:         2
  ⏱️  Rate Limits Hit:             45

Top Failed Login IPs:
  1. 192.168.1.100  (25 attempts)
  2. 10.0.0.50      (18 attempts)
  3. 172.16.0.1     (12 attempts)

Recent Critical Events:
  [10:30] TOKEN_REPLAY_DETECTED - User ID: 507f... IP: 192.168.1.1
  [09:15] BRUTE_FORCE_DETECTED - IP: 192.168.1.100
═══════════════════════════════════════════════════════════
```

---

## Log Retention

### Retention Policy

```javascript
// Severity-based retention
const RETENTION = {
  info: 30 days,
  warning: 90 days,
  error: 180 days,
  critical: 365 days (1 year)
};

// Compliance: Keep critical security events for 1 year
```

### Cleanup Job

```javascript
import cron from 'node-cron';

// Run daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  // Delete old info logs (30 days)
  await AuditLog.deleteMany({
    severity: 'info',
    timestamp: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  });
  
  // Delete old warning logs (90 days)
  await AuditLog.deleteMany({
    severity: 'warning',
    timestamp: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
  });
  
  // Delete old error logs (180 days)
  await AuditLog.deleteMany({
    severity: 'error',
    timestamp: { $lt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }
  });
  
  // Critical logs kept for 1 year
  await AuditLog.deleteMany({
    severity: 'critical',
    timestamp: { $lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
  });
  
  logger.info('Audit log cleanup completed');
});
```

---

## Compliance

### GDPR

**Right to Access:**
```javascript
// User requests their audit logs
const userLogs = await AuditLog.find({ userId: user._id })
  .select('-_id event timestamp metadata')
  .lean();

// Return as JSON export
res.json({ auditTrail: userLogs });
```

**Right to Erasure:**
```javascript
// Anonymize user's audit logs (can't delete for compliance)
await AuditLog.updateMany(
  { userId: user._id },
  { 
    $set: { 
      userId: null,
      'metadata.email': '[REDACTED]',
      'metadata.anonymized': true
    }
  }
);
```

### SOC 2

**Requirements Met:**
- ✅ All authentication events logged
- ✅ All authorization changes logged
- ✅ All administrative actions logged
- ✅ Tamper-proof logs (append-only)
- ✅ Log retention policy enforced

---

## Best Practices

### ✅ DO
- Log all security-relevant events
- Use correlation IDs for request tracing
- Include contextual metadata (IP, user agent, location)
- Set appropriate severity levels
- Implement log retention policies
- Monitor for suspicious patterns
- Alert on critical events in real-time
- Protect logs from tampering
- Regular log analysis

### ❌ DON'T
- Log sensitive data (passwords, tokens, SSNs)
- Log personally identifiable information without consent
- Rely only on application logs (use centralized logging)
- Ignore log storage costs
- Delete logs needed for compliance
- Log synchronously (impacts performance)
- Expose raw logs to users
- Skip log rotation/cleanup

---

## Integration with External Tools

### Elasticsearch (ELK Stack)

```javascript
import { Client } from '@elastic/elasticsearch';

const esClient = new Client({ node: process.env.ELASTICSEARCH_URL });

// Send logs to Elasticsearch
async function logToElasticsearch(event) {
  await esClient.index({
    index: 'audit-logs',
    document: {
      ...event,
      '@timestamp': new Date()
    }
  });
}
```

### Datadog

```javascript
import { metrics, trace } from '@datadog/browser-logs';

// Send security metrics
metrics.increment('auth.login.failed', {
  tags: [`ip:${ip}`, `severity:warning`]
});

// Trace suspicious activity
trace.logEvent('SUSPICIOUS_ACTIVITY', {
  userId,
  ip,
  reason
});
```

### Splunk

```javascript
import SplunkLogger from 'splunk-logging';

const splunk = new SplunkLogger({
  token: process.env.SPLUNK_TOKEN,
  url: process.env.SPLUNK_URL
});

splunk.send({
  message: event,
  severity: event.severity
});
```

---

## Example Queries

### Who accessed what?

```javascript
const accessLogs = await AuditLog.find({
  event: { $in: ['LOGIN_SUCCESS', 'TOKEN_REFRESH'] },
  timestamp: { $gte: startDate, $lte: endDate }
})
  .populate('userId', 'email name')
  .sort({ timestamp: -1 });
```

### What happened to this user?

```javascript
const userActivity = await AuditLog.find({ userId: user._id })
  .sort({ timestamp: -1 })
  .limit(100);
```

### When did this IP first appear?

```javascript
const firstSeen = await AuditLog.findOne({ ip: '192.168.1.1' })
  .sort({ timestamp: 1 });
```

### Which admin performed this action?

```javascript
const adminAction = await AuditLog.findOne({
  event: 'ROLE_CHANGED',
  'metadata.targetUserId': targetUser._id
})
  .populate('userId', 'email name');
```

---

**Last Updated:** January 26, 2026  
**Author:** Security Team  
**Review Frequency:** Quarterly
