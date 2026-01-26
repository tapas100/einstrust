# 🎫 Token Strategy

## Overview

This document explains the token management strategy, including generation, validation, rotation, and revocation mechanisms.

---

## Token Types

### 1. Access Token (Short-Lived)

**Purpose:** Authorize API requests  
**Lifetime:** 15 minutes  
**Storage:** Client memory (or sessionStorage)  
**Format:** JWT (JSON Web Token)

**Structure:**
```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "507f1f77bcf86cd799439011",  // userId
    "email": "user@example.com",
    "roles": ["user", "editor"],
    "permissions": ["read:content", "write:content"],
    "iat": 1706270400,  // Issued at
    "exp": 1706271300,  // Expires at (15 min later)
    "jti": "uuid-v4"    // JWT ID (for blacklisting)
  }
}
```

**Why Short-Lived?**
- **Security**: Limits damage if token is stolen
- **Revocation**: Can wait 15 min for natural expiration vs expensive blacklist operations
- **Fresh Data**: User permissions/roles updated on refresh

**Trade-off:**
- More frequent refresh requests (handled by refresh tokens)
- Slightly more complex client logic

---

### 2. Refresh Token (Long-Lived)

**Purpose:** Obtain new access tokens without re-authentication  
**Lifetime:** 7 days  
**Storage:** httpOnly cookie  
**Format:** JWT + Database record

**Structure:**
```json
{
  "payload": {
    "sub": "507f1f77bcf86cd799439011",  // userId
    "type": "refresh",
    "tokenId": "uuid-v4",
    "family": "family-uuid",  // For rotation tracking
    "iat": 1706270400,
    "exp": 1706875200  // 7 days
  }
}
```

**Database Record:**
```javascript
{
  _id: "uuid-v4",  // Same as tokenId in JWT
  userId: ObjectId("507f1f77bcf86cd799439011"),
  tokenHash: "sha256-hash-of-jwt",  // Don't store raw JWT
  family: "family-uuid",
  parent: "parent-token-id" || null,  // For family tree
  isRevoked: false,
  revokedAt: null,
  revokedReason: null,  // "logout", "suspicious", "expired", etc.
  expiresAt: new Date("2026-02-02T10:00:00Z"),
  createdAt: new Date("2026-01-26T10:00:00Z"),
  lastUsedAt: null,
  usageCount: 0,
  metadata: {
    ip: "192.168.1.1",
    userAgent: "Mozilla/5.0...",
    location: "San Francisco, CA",
    device: "Chrome (macOS)"
  }
}
```

**Why 7 Days?**
- **Balance**: Long enough for good UX, short enough to limit exposure
- **Mobile-Friendly**: Users don't re-login every day
- **Security**: Can revoke if suspicious activity detected

**Why Database Storage?**
- **Immediate Revocation**: Can invalidate token instantly
- **Usage Tracking**: Monitor for suspicious patterns
- **Family Tracking**: Detect token replay attacks

---

## Token Generation

### Access Token Generation

```javascript
import jwt from 'jsonwebtoken';

function generateAccessToken(user) {
  const payload = {
    sub: user._id.toString(),
    email: user.email,
    roles: user.roles,
    permissions: user.getPermissions(),  // Derived from roles
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (15 * 60),  // 15 minutes
    jti: uuidv4()  // Unique ID for this token
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    algorithm: 'HS256'
  });
}
```

**Security Notes:**
- Never include sensitive data (passwords, SSNs, etc.)
- Include minimal data needed for authorization
- Use strong secret (256+ bits entropy)
- Rotate secrets periodically (with grace period)

---

### Refresh Token Generation

```javascript
async function generateRefreshToken(user, metadata = {}) {
  const tokenId = uuidv4();
  const family = uuidv4();  // New family for login
  
  // JWT payload
  const payload = {
    sub: user._id.toString(),
    type: 'refresh',
    tokenId,
    family,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)  // 7 days
  };

  const token = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    algorithm: 'HS256'
  });

  // Store in database
  const tokenHash = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  await RefreshToken.create({
    _id: tokenId,
    userId: user._id,
    tokenHash,
    family,
    parent: null,
    expiresAt: new Date(payload.exp * 1000),
    metadata: {
      ip: metadata.ip,
      userAgent: metadata.userAgent,
      location: await getLocationFromIP(metadata.ip),
      device: parseUserAgent(metadata.userAgent)
    }
  });

  return token;
}
```

---

## Token Rotation

### Why Rotate?

**Problem:** Refresh tokens are long-lived (7 days)
- If stolen, attacker has 7 days to use it
- Can't easily detect theft

**Solution:** One-time use refresh tokens
- Each refresh token can only be used ONCE
- Using token → generates new token + revokes old one
- Replay attack → immediately detected

---

### Rotation Algorithm

```javascript
async function rotateRefreshToken(oldToken, metadata) {
  // 1. Verify old token
  const decoded = jwt.verify(oldToken, process.env.JWT_REFRESH_SECRET);
  
  // 2. Find in database
  const oldTokenHash = hashToken(oldToken);
  const dbToken = await RefreshToken.findOne({
    _id: decoded.tokenId,
    tokenHash: oldTokenHash,
    isRevoked: false
  });

  if (!dbToken) {
    // Token not found or already revoked
    // This could be a replay attack!
    await handleSuspiciousActivity(decoded.sub, decoded.family);
    throw new Error('Invalid refresh token');
  }

  // 3. Check if token has children (already used)
  const hasChildren = await RefreshToken.exists({
    parent: dbToken._id
  });

  if (hasChildren) {
    // This token was already used!
    // Someone is trying to replay an old token
    // REVOKE THE ENTIRE FAMILY
    await revokeTokenFamily(dbToken.family, 'replay_attack');
    await alertSecurityTeam('Token replay detected', {
      userId: decoded.sub,
      family: dbToken.family
    });
    throw new Error('Token replay detected');
  }

  // 4. Revoke old token
  dbToken.isRevoked = true;
  dbToken.revokedAt = new Date();
  dbToken.revokedReason = 'rotated';
  await dbToken.save();

  // 5. Generate new token (same family)
  const newTokenId = uuidv4();
  const newPayload = {
    sub: decoded.sub,
    type: 'refresh',
    tokenId: newTokenId,
    family: dbToken.family,  // SAME family
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
  };

  const newToken = jwt.sign(newPayload, process.env.JWT_REFRESH_SECRET);
  const newTokenHash = hashToken(newToken);

  // 6. Store new token
  await RefreshToken.create({
    _id: newTokenId,
    userId: decoded.sub,
    tokenHash: newTokenHash,
    family: dbToken.family,
    parent: dbToken._id,  // Link to parent
    expiresAt: new Date(newPayload.exp * 1000),
    metadata
  });

  // 7. Return new token pair
  const user = await User.findById(decoded.sub);
  const newAccessToken = generateAccessToken(user);

  return {
    accessToken: newAccessToken,
    refreshToken: newToken
  };
}
```

---

### Token Family Tree

**Example:**
```
Login (Day 1):
  RT1 created (family: F1, parent: null)

Refresh (Day 2):
  RT1 used → RT2 created (family: F1, parent: RT1)
  RT1 revoked

Refresh (Day 3):
  RT2 used → RT3 created (family: F1, parent: RT2)
  RT2 revoked

ATTACK: Replay RT2 on Day 4
  RT2 is revoked (normal)
  But RT2 has children (RT3)!
  → ENTIRE FAMILY REVOKED (F1)
  → User logged out from all devices in this family
  → Security alert sent
```

**Database Query:**
```javascript
// Find all tokens in family
const familyTokens = await RefreshToken.find({ family: 'F1' });

// Revoke all
await RefreshToken.updateMany(
  { family: 'F1' },
  { 
    $set: { 
      isRevoked: true, 
      revokedAt: new Date(),
      revokedReason: 'family_compromised'
    }
  }
);
```

---

## Token Validation

### Access Token Validation

```javascript
async function validateAccessToken(token) {
  try {
    // 1. Verify signature and expiration (local, fast)
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256']
    });

    // 2. Check blacklist (Redis, for logout)
    const isBlacklisted = await redis.exists(`blacklist:${decoded.jti}`);
    if (isBlacklisted) {
      throw new Error('Token has been revoked');
    }

    // 3. Optional: Validate user still exists
    // (Can cache this to avoid DB hit)
    const user = await User.findById(decoded.sub).select('_id roles').lean();
    if (!user) {
      throw new Error('User no longer exists');
    }

    // 4. Optional: Check if roles have changed
    // (Trade-off: Performance vs fresh data)
    const rolesChanged = !arraysEqual(decoded.roles, user.roles);
    if (rolesChanged) {
      // Force token refresh
      throw new Error('Roles have changed, please refresh token');
    }

    return decoded;
  } catch (error) {
    throw new Error('Invalid access token');
  }
}
```

**Performance:**
- JWT verification: ~0.1ms (local)
- Redis blacklist check: ~0.5ms
- User lookup (cached): ~1ms
- **Total: ~2ms**

---

### Refresh Token Validation

```javascript
async function validateRefreshToken(token) {
  try {
    // 1. Verify signature and expiration
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    // 2. Find in database
    const tokenHash = hashToken(token);
    const dbToken = await RefreshToken.findOne({
      _id: decoded.tokenId,
      tokenHash,
      userId: decoded.sub
    });

    if (!dbToken) {
      throw new Error('Token not found');
    }

    // 3. Check if revoked
    if (dbToken.isRevoked) {
      throw new Error('Token has been revoked');
    }

    // 4. Check expiration (double-check)
    if (new Date() > dbToken.expiresAt) {
      throw new Error('Token has expired');
    }

    // 5. Update usage tracking
    dbToken.lastUsedAt = new Date();
    dbToken.usageCount += 1;
    await dbToken.save();

    return decoded;
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
}
```

---

## Token Revocation

### 1. Logout (Single Device)

```javascript
async function logout(accessToken, refreshToken) {
  const accessDecoded = jwt.decode(accessToken);
  const refreshDecoded = jwt.decode(refreshToken);

  // 1. Blacklist access token (Redis, expires in 15 min)
  await redis.setex(
    `blacklist:${accessDecoded.jti}`,
    15 * 60,  // TTL: remaining time on token
    accessDecoded.sub
  );

  // 2. Revoke refresh token in database
  await RefreshToken.updateOne(
    { _id: refreshDecoded.tokenId },
    { 
      $set: { 
        isRevoked: true, 
        revokedAt: new Date(),
        revokedReason: 'logout'
      }
    }
  );

  // 3. Audit log
  await AuditLog.create({
    event: 'LOGOUT',
    userId: accessDecoded.sub,
    correlationId: uuidv4(),
    metadata: { tokenId: refreshDecoded.tokenId }
  });
}
```

---

### 2. Logout All Devices

```javascript
async function logoutAllDevices(userId) {
  // 1. Revoke all refresh tokens for user
  await RefreshToken.updateMany(
    { userId, isRevoked: false },
    { 
      $set: { 
        isRevoked: true, 
        revokedAt: new Date(),
        revokedReason: 'logout_all'
      }
    }
  );

  // 2. Note: Access tokens will expire naturally (15 min)
  // Optional: Track all JTIs and blacklist them

  // 3. Audit log
  await AuditLog.create({
    event: 'LOGOUT_ALL_DEVICES',
    userId,
    correlationId: uuidv4()
  });
}
```

---

### 3. Security-Triggered Revocation

```javascript
async function revokeOnSecurity(userId, reason) {
  // 1. Revoke all tokens
  await RefreshToken.updateMany(
    { userId },
    { 
      $set: { 
        isRevoked: true, 
        revokedAt: new Date(),
        revokedReason: reason  // 'suspicious_activity', 'password_change', etc.
      }
    }
  );

  // 2. Force password reset
  await User.updateOne(
    { _id: userId },
    { $set: { mustResetPassword: true } }
  );

  // 3. Alert user
  await sendEmail({
    to: user.email,
    subject: 'Security Alert: All Sessions Terminated',
    template: 'security-alert',
    data: { reason }
  });

  // 4. Alert security team
  await alertSecurityTeam('Tokens revoked for security', {
    userId,
    reason
  });
}
```

---

## Token Fingerprinting

**Purpose:** Detect token theft by tracking request context

```javascript
function generateFingerprint(req) {
  const components = [
    req.ip,
    req.get('user-agent'),
    // Don't include: headers that change frequently
  ];
  
  return crypto
    .createHash('sha256')
    .update(components.join('|'))
    .digest('hex');
}

// On token creation
const fingerprint = generateFingerprint(req);
await RefreshToken.create({
  // ...other fields
  fingerprint
});

// On token use
const currentFingerprint = generateFingerprint(req);
if (dbToken.fingerprint !== currentFingerprint) {
  // Fingerprint mismatch!
  // Could be:
  // 1. NAT/proxy change (common)
  // 2. VPN change
  // 3. Token theft (rare but possible)
  
  // Strategy: Allow but alert
  await alertSecurityTeam('Token fingerprint mismatch', {
    userId: dbToken.userId,
    original: dbToken.fingerprint,
    current: currentFingerprint
  });
  
  // Optional: Force re-authentication
  // throw new Error('Security check failed');
}
```

**Trade-off:**
- ✅ Adds security layer
- ❌ False positives (legitimate IP changes)
- ❌ Privacy concerns (tracking IPs)

**Recommendation:** Use for alerting, not blocking

---

## Token Cleanup

### Automatic Cleanup (Cron Job)

```javascript
// Run daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  // 1. Delete expired tokens
  const result = await RefreshToken.deleteMany({
    expiresAt: { $lt: new Date() }
  });
  
  logger.info(`Cleaned up ${result.deletedCount} expired tokens`);

  // 2. Delete old revoked tokens (older than 30 days)
  const oldRevoked = await RefreshToken.deleteMany({
    isRevoked: true,
    revokedAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  });
  
  logger.info(`Cleaned up ${oldRevoked.deletedCount} old revoked tokens`);
});
```

---

## Monitoring & Metrics

### Key Metrics to Track

```javascript
// Token issuance rate
metrics.increment('tokens.access.issued');
metrics.increment('tokens.refresh.issued');

// Token validation success/failure
metrics.increment('tokens.access.valid');
metrics.increment('tokens.access.invalid');
metrics.increment('tokens.access.expired');

// Refresh token rotation
metrics.increment('tokens.refresh.rotated');
metrics.increment('tokens.refresh.replay_detected');

// Revocation events
metrics.increment('tokens.revoked.logout');
metrics.increment('tokens.revoked.security');
metrics.increment('tokens.revoked.suspicious');

// Token lifetime
metrics.histogram('tokens.access.lifetime', tokenLifetime);
```

### Alerts

```javascript
// Alert if replay attacks spike
if (replayAttacks > 10 per hour) {
  alertSecurityTeam('High rate of token replay attacks');
}

// Alert if validation failures spike
if (validationFailures > 100 per minute) {
  alertSecurityTeam('High rate of token validation failures');
}

// Alert if token family revocations spike
if (familyRevocations > 5 per hour) {
  alertSecurityTeam('Unusual token family revocations');
}
```

---

## Best Practices

### ✅ DO
- Use strong secrets (256+ bits, randomly generated)
- Rotate secrets periodically (with grace period for old tokens)
- Implement token rotation (one-time use refresh tokens)
- Use httpOnly cookies for refresh tokens
- Implement token blacklist for logout
- Track token families for replay detection
- Log all token events (issuance, validation, revocation)
- Set appropriate expiration times (balance security vs UX)
- Use correlation IDs for debugging
- Monitor token metrics and set up alerts

### ❌ DON'T
- Store sensitive data in tokens (passwords, SSNs, etc.)
- Use predictable token IDs (use UUIDs)
- Store raw tokens in database (hash them)
- Use localStorage for refresh tokens (XSS vulnerability)
- Allow infinite token refresh (enforce expiration)
- Ignore token replay detection
- Skip audit logging
- Use weak secrets or commit them to git
- Allow token use after security events (password change, etc.)

---

## Scaling Considerations

### At 1K Users
- Single MongoDB instance
- Redis on same server
- Current implementation works well

### At 100K Users
- MongoDB replica set (1 primary + 2 secondaries)
- Redis cluster (3 nodes)
- Read replicas for token validation
- Consider token validation caching

### At 1M+ Users
- Sharded MongoDB (shard by userId)
- Redis Cluster (6+ nodes)
- Separate token service (microservice)
- Consider distributed caching (CDN for public keys)
- Consider dedicated key management service (AWS KMS, Vault)

---

**Last Updated:** January 26, 2026  
**Author:** Security Team  
**Review Frequency:** Quarterly
