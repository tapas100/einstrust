# 🔐 Authentication Flow

## Overview

This document details the authentication flows implemented in the Secure Auth Platform, including token strategies, OAuth integration, and security considerations.

---

## 1. Standard Login Flow (JWT with Refresh Tokens)

### Flow Diagram

```
┌──────────┐                                     ┌──────────┐
│  Client  │                                     │  Server  │
└─────┬────┘                                     └────┬─────┘
      │                                               │
      │  1. POST /api/v1/auth/login                  │
      │  { email, password }                          │
      ├──────────────────────────────────────────────>│
      │                                               │
      │                                    2. Validate credentials
      │                                    3. Check lockout status
      │                                    4. Verify password (bcrypt)
      │                                               │
      │  5. Return tokens + user data                 │
      │  {                                            │
      │    user: {...},                               │
      │    accessToken: "eyJh...",  (15 min)         │
      │    refreshToken: "eyJh..." (7 days)          │
      │  }                                            │
      │<──────────────────────────────────────────────┤
      │                                               │
      │  6. Store tokens:                             │
      │     - accessToken → memory/localStorage       │
      │     - refreshToken → httpOnly cookie          │
      │                                               │
      │  7. Subsequent API requests                   │
      │  Authorization: Bearer <accessToken>          │
      ├──────────────────────────────────────────────>│
      │                                               │
      │                                    8. Verify JWT signature
      │                                    9. Check expiration
      │                                    10. Extract user ID
      │                                               │
      │  11. Return protected resource                │
      │<──────────────────────────────────────────────┤
      │                                               │
```

### Token Details

#### Access Token (JWT)
```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "userId": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "roles": ["user"],
    "iat": 1706270400,
    "exp": 1706271300  // 15 minutes
  },
  "signature": "HMACSHA256(...)"
}
```

**Why 15 minutes?**
- Short enough to limit exposure if stolen
- Long enough for reasonable user session
- Balance between security and UX

#### Refresh Token (JWT + DB Record)
```json
{
  "payload": {
    "userId": "507f1f77bcf86cd799439011",
    "tokenId": "uuid-v4",
    "type": "refresh",
    "iat": 1706270400,
    "exp": 1706875200  // 7 days
  }
}
```

**Database Record:**
```json
{
  "_id": "uuid-v4",
  "userId": "507f1f77bcf86cd799439011",
  "token": "hashed-token",
  "family": "uuid-family-id",  // For rotation tracking
  "expiresAt": "2026-02-02T10:00:00Z",
  "isRevoked": false,
  "createdAt": "2026-01-26T10:00:00Z",
  "lastUsedAt": null,
  "metadata": {
    "ip": "192.168.1.1",
    "userAgent": "Mozilla/5.0...",
    "location": "San Francisco, CA"
  }
}
```

---

## 2. Token Refresh Flow

### Why Refresh Tokens Exist

**The Problem:**
- Long-lived access tokens → high security risk if stolen
- Short-lived access tokens → poor UX (constant re-login)

**The Solution:**
- Short-lived access tokens (15 min) for API calls
- Long-lived refresh tokens (7 days) stored securely
- Refresh tokens can be revoked immediately
- Access tokens are stateless (no DB lookup needed)

**Security Benefits:**
1. **Limited Exposure Window:** Stolen access token expires quickly
2. **Revocation Support:** Can invalidate refresh tokens in DB
3. **Scalability:** Access tokens don't require DB checks
4. **Audit Trail:** All refresh events are logged

---

### Flow Diagram

```
┌──────────┐                                     ┌──────────┐
│  Client  │                                     │  Server  │
└─────┬────┘                                     └────┬─────┘
      │                                               │
      │  Access token expired (401 response)          │
      │                                               │
      │  1. POST /api/v1/auth/refresh                 │
      │  Cookie: refreshToken=eyJh...                 │
      ├──────────────────────────────────────────────>│
      │                                               │
      │                                    2. Verify JWT signature
      │                                    3. Check expiration
      │                                    4. Check DB record
      │                                    5. Verify not revoked
      │                                    6. Check token family
      │                                               │
      │                                    7. Revoke old refresh token
      │                                    8. Generate new token pair
      │                                    9. Save new refresh token
      │                                    10. Audit log event
      │                                               │
      │  11. Return new tokens                        │
      │  {                                            │
      │    accessToken: "eyJh...",  (new, 15 min)    │
      │    refreshToken: "eyJh..." (new, 7 days)     │
      │  }                                            │
      │<──────────────────────────────────────────────┤
      │                                               │
      │  12. Update stored tokens                     │
      │                                               │
```

### Token Rotation Strategy

**One-Time Use Tokens:**
- Each refresh token can only be used ONCE
- After use, it's immediately revoked
- New refresh token is issued
- Old token becomes invalid

**Benefit:** Detects token theft/replay attacks

**Example:**
```
Login:        RT1 issued
Refresh #1:   RT1 used → RT2 issued (RT1 revoked)
Refresh #2:   RT2 used → RT3 issued (RT2 revoked)

If RT1 used again → ATTACK DETECTED → Revoke entire family
```

### Token Family Tracking

**Purpose:** Detect concurrent token usage (sign of theft)

```
Family Tree:
RT1 (parent: null)
  └─ RT2 (parent: RT1)
      └─ RT3 (parent: RT2)
          └─ RT4 (parent: RT3)

If RT2 is used AFTER RT3 exists:
→ Someone is replaying an old token
→ Revoke entire family (RT1, RT2, RT3, RT4)
→ Force user to re-login
→ Alert security team
```

---

## 3. Registration Flow

```
┌──────────┐                                     ┌──────────┐
│  Client  │                                     │  Server  │
└─────┬────┘                                     └────┬─────┘
      │                                               │
      │  1. POST /api/v1/auth/register                │
      │  {                                            │
      │    name: "John Doe",                          │
      │    email: "john@example.com",                 │
      │    password: "SecurePass123!"                 │
      │  }                                            │
      ├──────────────────────────────────────────────>│
      │                                               │
      │                                    2. Validate input (Joi)
      │                                    3. Check password strength
      │                                    4. Check email uniqueness
      │                                    5. Hash password (bcrypt, cost: 12)
      │                                    6. Assign default role (user)
      │                                    7. Create user record
      │                                    8. Generate verification token
      │                                    9. Send verification email
      │                                    10. Audit log event
      │                                               │
      │  11. Return user data (no tokens yet)         │
      │  {                                            │
      │    user: {                                    │
      │      id: "...",                               │
      │      name: "John Doe",                        │
      │      email: "john@example.com",               │
      │      roles: ["user"],                         │
      │      emailVerified: false                     │
      │    },                                         │
      │    message: "Verification email sent"         │
      │  }                                            │
      │<──────────────────────────────────────────────┤
      │                                               │
```

**Note:** First user registered automatically gets `admin` role.

---

## 4. Logout Flow

```
┌──────────┐                                     ┌──────────┐
│  Client  │                                     │  Server  │
└─────┬────┘                                     └────┬─────┘
      │                                               │
      │  1. POST /api/v1/auth/logout                  │
      │  Authorization: Bearer <accessToken>          │
      │  Cookie: refreshToken=eyJh...                 │
      ├──────────────────────────────────────────────>│
      │                                               │
      │                                    2. Extract user ID from access token
      │                                    3. Revoke refresh token in DB
      │                                    4. Add access token to Redis blacklist
      │                                       (expires in 15 min automatically)
      │                                    5. Audit log event
      │                                               │
      │  6. Return success                            │
      │  { message: "Logged out successfully" }       │
      │<──────────────────────────────────────────────┤
      │                                               │
      │  7. Clear local tokens                        │
      │                                               │
```

**Redis Blacklist:**
```
Key: `blacklist:${accessToken}`
Value: userId
TTL: 15 minutes (access token expiration)
```

---

## 5. OAuth Flow (Google Example)

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│  Client  │         │  Server  │         │  Google  │
└─────┬────┘         └────┬─────┘         └────┬─────┘
      │                   │                     │
      │  1. Click "Login with Google"          │
      ├──────────────────>│                     │
      │                   │                     │
      │  2. Redirect to Google OAuth            │
      │  + state (CSRF protection)              │
      │  + redirect_uri                         │
      │<──────────────────┤                     │
      │                   │                     │
      │  3. User authorizes                     │
      ├────────────────────────────────────────>│
      │                   │                     │
      │  4. Redirect to callback                │
      │  + authorization code                   │
      │  + state                                │
      │<────────────────────────────────────────┤
      │                   │                     │
      │  5. Forward to server callback          │
      ├──────────────────>│                     │
      │                   │                     │
      │                   │  6. Exchange code for tokens
      │                   ├────────────────────>│
      │                   │                     │
      │                   │  7. Return tokens + profile
      │                   │<────────────────────┤
      │                   │                     │
      │                   │  8. Verify state
      │                   │  9. Check if user exists (email)
      │                   │  10. Create/update user
      │                   │  11. Link OAuth account
      │                   │  12. Generate JWT tokens
      │                   │  13. Audit log event
      │                   │                     │
      │  14. Return tokens                      │
      │<──────────────────┤                     │
      │                   │                     │
```

### OAuth vs JWT

**OAuth 2.0:**
- **Purpose:** Authorization framework
- **Use Case:** Delegated access ("Login with Google")
- **Token Type:** Opaque access tokens (provider-specific)
- **Validation:** Call provider API
- **Revocation:** Provider-controlled

**JWT:**
- **Purpose:** Token format (can be used with OAuth)
- **Use Case:** Stateless authentication
- **Token Type:** Self-contained (signed JSON)
- **Validation:** Verify signature locally
- **Revocation:** Blacklist or short expiration

**When to Use:**
- **OAuth:** Third-party integrations, social login, API access delegation
- **JWT:** Internal API authentication, microservices, stateless sessions
- **Both:** OAuth for initial authentication → issue JWT for subsequent requests

---

## 6. Password Reset Flow

```
┌──────────┐                                     ┌──────────┐
│  Client  │                                     │  Server  │
└─────┬────┘                                     └────┬─────┘
      │                                               │
      │  1. POST /api/v1/auth/forgot-password         │
      │  { email: "user@example.com" }                │
      ├──────────────────────────────────────────────>│
      │                                               │
      │                                    2. Find user by email
      │                                    3. Generate reset token (JWT, 1hr exp)
      │                                    4. Store token hash in DB
      │                                    5. Send reset email with link
      │                                    6. Audit log event
      │                                               │
      │  7. Return success (always, prevent enum)     │
      │  { message: "If email exists, reset sent" }   │
      │<──────────────────────────────────────────────┤
      │                                               │
      │  --- User clicks email link ---               │
      │                                               │
      │  8. POST /api/v1/auth/reset-password          │
      │  {                                            │
      │    token: "reset-token-from-email",           │
      │    newPassword: "NewSecurePass123!"           │
      │  }                                            │
      ├──────────────────────────────────────────────>│
      │                                               │
      │                                    9. Verify token signature
      │                                    10. Check expiration
      │                                    11. Check token not used
      │                                    12. Validate new password
      │                                    13. Hash new password
      │                                    14. Update user
      │                                    15. Invalidate all sessions
      │                                    16. Mark token as used
      │                                    17. Audit log event
      │                                               │
      │  18. Return success                           │
      │  { message: "Password reset successful" }     │
      │<──────────────────────────────────────────────┤
      │                                               │
```

---

## 7. Account Lockout Flow

```
Login Attempt #1 (failed)
  → failedAttempts = 1
  → No lockout

Login Attempt #2 (failed)
  → failedAttempts = 2
  → No lockout

Login Attempt #3 (failed)
  → failedAttempts = 3
  → Require CAPTCHA

Login Attempt #4 (failed, with CAPTCHA)
  → failedAttempts = 4
  → No lockout

Login Attempt #5 (failed)
  → failedAttempts = 5
  → ACCOUNT LOCKED
  → lockedUntil = now + 15 minutes
  → Send alert email to user

Login Attempt #6 (within lockout period)
  → Return 423 Locked
  → "Account locked until X time"

After 15 minutes:
  → lockedUntil expired
  → failedAttempts reset to 0
  → User can try again

Successful Login:
  → failedAttempts reset to 0
  → lockedUntil = null
```

---

## 8. Multi-Device Session Management

**Scenario:** User logs in from multiple devices

```
Device A: Login → RT-A1
Device B: Login → RT-B1
Device C: Login → RT-C1

Each device has its own token family
Logout from Device A → Only revokes RT-A family
Devices B & C still work

"Logout All Devices" → Revokes all token families
```

**Database Structure:**
```json
{
  "userId": "507f...",
  "sessions": [
    {
      "family": "family-uuid-A",
      "device": "iPhone 13",
      "location": "San Francisco",
      "lastActive": "2026-01-26T10:00:00Z"
    },
    {
      "family": "family-uuid-B",
      "device": "Chrome (Windows)",
      "location": "New York",
      "lastActive": "2026-01-26T09:30:00Z"
    }
  ]
}
```

---

## Security Considerations

### 1. Token Storage (Client-Side)

**❌ BAD: localStorage**
```javascript
localStorage.setItem('accessToken', token);
// Vulnerable to XSS attacks
```

**✅ GOOD: httpOnly Cookie (Refresh Token)**
```javascript
res.cookie('refreshToken', token, {
  httpOnly: true,    // Not accessible to JavaScript
  secure: true,      // HTTPS only
  sameSite: 'strict', // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});
```

**✅ ACCEPTABLE: Memory (Access Token)**
```javascript
// Store in app state/memory (lost on page refresh)
// User will auto-refresh using httpOnly refresh token
```

### 2. Token Validation Layers

**Access Token Validation:**
1. Signature verification (JWT secret)
2. Expiration check
3. User existence check (cached)
4. Blacklist check (Redis, for logout)

**Refresh Token Validation:**
1. Signature verification
2. Expiration check
3. Database record exists
4. Not revoked
5. Token family valid (no replay)
6. IP/User-Agent fingerprint match (optional)

### 3. Rate Limiting by Endpoint

```
Login:           5 requests / 15 min per IP
Registration:    3 requests / 1 hour per IP
Refresh:         10 requests / 15 min per IP
Password Reset:  3 requests / 1 hour per email
```

---

## Performance Optimization

### 1. Stateless Access Tokens
- No database lookup for every API call
- JWT verification is CPU-bound (fast)
- Can cache user data in token payload

### 2. Redis for Fast Lookups
- Token blacklist (logout)
- Rate limiting counters
- Session tracking
- Sub-millisecond response times

### 3. Token Caching Strategy
```
Access token validation:
  1. Check signature (local, fast)
  2. Check expiration (local, fast)
  3. Check blacklist (Redis, <1ms)
  ✅ No database call needed

Refresh token validation:
  1. Check signature (local, fast)
  2. Check DB (MongoDB, ~5-10ms)
  3. Update last used timestamp (async)
```

---

## Testing Scenarios

### Unit Tests
- [ ] Token generation
- [ ] Token validation (valid, expired, invalid signature)
- [ ] Password hashing and comparison
- [ ] Token rotation logic
- [ ] Token family tracking

### Integration Tests
- [ ] Full login flow
- [ ] Token refresh flow
- [ ] Logout and blacklisting
- [ ] OAuth flow
- [ ] Password reset flow
- [ ] Account lockout

### Security Tests
- [ ] Token replay attack (should fail)
- [ ] Expired token usage (should fail)
- [ ] Concurrent token usage (should detect and revoke)
- [ ] Brute force protection (should lock account)
- [ ] CSRF attack on OAuth (state parameter should prevent)
- [ ] XSS token theft (httpOnly should prevent)

---

**Last Updated:** January 26, 2026  
**Author:** Security Team  
**Review Frequency:** Quarterly
