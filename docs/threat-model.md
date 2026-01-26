# 🔍 Threat Model

## Overview

This document outlines the security threats, attack vectors, and mitigation strategies for the Secure Auth Platform.

---

## Threat Categories

### 1. Authentication Threats

#### 1.1 Credential Stuffing
**Description:** Attackers use leaked credentials from other breaches to attempt login.

**Likelihood:** High  
**Impact:** High  
**Risk Level:** 🔴 Critical

**Mitigation:**
- ✅ Rate limiting (5 attempts per 15 min per IP)
- ✅ Account lockout after failed attempts
- ✅ IP-based tracking and blocking
- ✅ CAPTCHA after 3 failed attempts
- ✅ Alert system for suspicious patterns

**Detection:**
- Monitor failed login attempts per account
- Track login attempts from unusual locations
- Correlation IDs for pattern analysis

---

#### 1.2 Brute Force Attacks
**Description:** Systematic password guessing attempts.

**Likelihood:** Medium  
**Impact:** High  
**Risk Level:** 🟠 High

**Mitigation:**
- ✅ Progressive delays (exponential backoff)
- ✅ Strong password policy enforcement
- ✅ Account lockout mechanism
- ✅ Rate limiting at multiple layers (IP, account, global)

**Detection:**
- Failed login metrics
- Velocity checks
- Audit logs with correlation IDs

---

#### 1.3 Session Hijacking
**Description:** Attacker steals and uses valid session tokens.

**Likelihood:** Medium  
**Impact:** High  
**Risk Level:** 🟠 High

**Mitigation:**
- ✅ httpOnly cookies (prevent XSS theft)
- ✅ Secure flag (HTTPS only)
- ✅ sameSite flag (CSRF protection)
- ✅ Short-lived access tokens (15 min)
- ✅ Token rotation on refresh
- ✅ Token fingerprinting (IP + User-Agent tracking)

**Detection:**
- Concurrent session detection
- Geographic anomaly detection
- User-Agent changes

---

### 2. Authorization Threats

#### 2.1 Privilege Escalation
**Description:** User gains unauthorized elevated privileges.

**Likelihood:** Low  
**Impact:** Critical  
**Risk Level:** 🟠 High

**Mitigation:**
- ✅ RBAC with strict permission checks
- ✅ Middleware-driven authorization (not in-code checks)
- ✅ Input validation on role changes
- ✅ Admin actions require re-authentication
- ✅ Audit logging of all role changes

**Detection:**
- Monitor role change events
- Alert on suspicious permission requests
- Regular permission audits

---

#### 2.2 Insecure Direct Object References (IDOR)
**Description:** User accesses resources they shouldn't by manipulating IDs.

**Likelihood:** Medium  
**Impact:** Medium  
**Risk Level:** 🟡 Medium

**Mitigation:**
- ✅ Authorization checks on every resource access
- ✅ Context-aware permissions (user can only access their own data)
- ✅ UUID usage instead of sequential IDs
- ✅ Input validation

**Detection:**
- Monitor unauthorized access attempts
- Audit logs for suspicious patterns

---

### 3. Token-Based Threats

#### 3.1 JWT Token Replay
**Description:** Stolen token is reused by attacker.

**Likelihood:** Medium  
**Impact:** High  
**Risk Level:** 🟠 High

**Mitigation:**
- ✅ Short token expiration (15 min)
- ✅ Refresh token rotation (one-time use)
- ✅ Token fingerprinting (IP + User-Agent)
- ✅ Redis-based token blacklist for logout
- ✅ Concurrent use detection

**Detection:**
- Multiple concurrent sessions from different IPs
- Token use after logout event
- Geographic impossibility (e.g., US → China in 5 min)

---

#### 3.2 Token Theft via XSS
**Description:** JavaScript injection steals tokens from browser.

**Likelihood:** Low  
**Impact:** High  
**Risk Level:** 🟡 Medium

**Mitigation:**
- ✅ httpOnly cookies (tokens not accessible to JS)
- ✅ Content Security Policy (CSP)
- ✅ Input sanitization
- ✅ Output encoding
- ✅ XSS protection headers

**Detection:**
- Monitor for CSP violations
- Unusual JavaScript execution patterns

---

#### 3.3 Refresh Token Compromise
**Description:** Long-lived refresh token is stolen and used.

**Likelihood:** Low  
**Impact:** Critical  
**Risk Level:** 🟠 High

**Mitigation:**
- ✅ Token rotation (invalidate on use)
- ✅ Secure storage (httpOnly, Secure, sameSite)
- ✅ Concurrent use detection
- ✅ 7-day expiration (balance security vs UX)
- ✅ Family tracking (detect token reuse)

**Detection:**
- Multiple refresh attempts with same token
- Refresh from unusual location
- Parent token used after child token issued

---

### 4. Injection Attacks

#### 4.1 NoSQL Injection
**Description:** Malicious query operators in MongoDB.

**Likelihood:** Medium  
**Impact:** Critical  
**Risk Level:** 🟠 High

**Mitigation:**
- ✅ express-mongo-sanitize middleware
- ✅ Joi schema validation
- ✅ Parameterized queries
- ✅ Input type checking

**Example Attack:**
```json
{
  "email": {"$gt": ""},
  "password": {"$gt": ""}
}
```

**Detection:**
- Input validation failures
- Unusual query patterns
- Error logs

---

#### 4.2 XSS (Cross-Site Scripting)
**Description:** Malicious scripts injected into responses.

**Likelihood:** Low  
**Impact:** High  
**Risk Level:** 🟡 Medium

**Mitigation:**
- ✅ Input sanitization
- ✅ Output encoding
- ✅ Content Security Policy
- ✅ httpOnly cookies
- ✅ XSS protection headers (Helmet.js)

**Detection:**
- CSP violation reports
- Input validation failures

---

### 5. Denial of Service (DoS)

#### 5.1 Rate Limit Bypass
**Description:** Overwhelming the service with requests.

**Likelihood:** High  
**Impact:** Medium  
**Risk Level:** 🟠 High

**Mitigation:**
- ✅ Multi-layer rate limiting (IP, account, global)
- ✅ Redis-based distributed rate limiting
- ✅ Request size limits
- ✅ Timeout configurations
- ✅ Load balancer with DDoS protection (production)

**Detection:**
- Request volume metrics
- 429 (Too Many Requests) response tracking
- Unusual traffic patterns

---

#### 5.2 Resource Exhaustion
**Description:** Expensive operations causing server overload.

**Likelihood:** Medium  
**Impact:** Medium  
**Risk Level:** 🟡 Medium

**Mitigation:**
- ✅ Request payload size limits
- ✅ Query complexity limits
- ✅ Database connection pooling
- ✅ Timeout configurations
- ✅ Rate limiting

**Detection:**
- CPU/Memory metrics
- Database query performance
- Response time monitoring

---

### 6. Man-in-the-Middle (MITM)

#### 6.1 TLS Downgrade
**Description:** Force connection to unencrypted HTTP.

**Likelihood:** Low  
**Impact:** Critical  
**Risk Level:** 🟡 Medium

**Mitigation:**
- ✅ HSTS (HTTP Strict Transport Security)
- ✅ Secure cookie flag (HTTPS only)
- ✅ Redirect HTTP → HTTPS
- ✅ TLS 1.2+ only
- ✅ Strong cipher suites

**Detection:**
- Monitor for HTTP connections (should be 0)
- TLS version tracking

---

### 7. OAuth-Specific Threats

#### 7.1 Authorization Code Interception
**Description:** Attacker steals OAuth authorization code.

**Likelihood:** Low  
**Impact:** High  
**Risk Level:** 🟡 Medium

**Mitigation:**
- ✅ PKCE (Proof Key for Code Exchange)
- ✅ State parameter validation (CSRF protection)
- ✅ Short-lived authorization codes (10 min)
- ✅ One-time use codes
- ✅ Redirect URI validation

**Detection:**
- Multiple code redemption attempts
- Mismatched state parameters

---

#### 7.2 Account Takeover via OAuth
**Description:** Attacker links their OAuth account to victim's email.

**Likelihood:** Low  
**Impact:** High  
**Risk Level:** 🟡 Medium

**Mitigation:**
- ✅ Email verification before account linking
- ✅ Notify user of new OAuth connections
- ✅ Require password for sensitive OAuth operations
- ✅ User can view/revoke connected accounts

**Detection:**
- New OAuth connection notifications
- Unusual OAuth provider changes

---

## Risk Matrix

| Threat                     | Likelihood | Impact   | Risk Level | Status |
|----------------------------|------------|----------|------------|--------|
| Credential Stuffing        | High       | High     | 🔴 Critical | ✅ Mitigated |
| Brute Force                | Medium     | High     | 🟠 High    | ✅ Mitigated |
| Session Hijacking          | Medium     | High     | 🟠 High    | ✅ Mitigated |
| Privilege Escalation       | Low        | Critical | 🟠 High    | ✅ Mitigated |
| IDOR                       | Medium     | Medium   | 🟡 Medium  | ✅ Mitigated |
| JWT Replay                 | Medium     | High     | 🟠 High    | ✅ Mitigated |
| XSS Token Theft            | Low        | High     | 🟡 Medium  | ✅ Mitigated |
| Refresh Token Compromise   | Low        | Critical | 🟠 High    | ✅ Mitigated |
| NoSQL Injection            | Medium     | Critical | 🟠 High    | ✅ Mitigated |
| XSS                        | Low        | High     | 🟡 Medium  | ✅ Mitigated |
| Rate Limit Bypass          | High       | Medium   | 🟠 High    | ✅ Mitigated |
| Resource Exhaustion        | Medium     | Medium   | 🟡 Medium  | ✅ Mitigated |
| TLS Downgrade              | Low        | Critical | 🟡 Medium  | ✅ Mitigated |
| OAuth Code Interception    | Low        | High     | 🟡 Medium  | ✅ Mitigated |
| OAuth Account Takeover     | Low        | High     | 🟡 Medium  | ✅ Mitigated |

---

## Incident Response Procedures

### 1. Suspected Token Compromise

**Immediate Actions:**
1. Identify affected user(s)
2. Invalidate all tokens for user (blacklist in Redis)
3. Force password reset
4. Notify user via email
5. Review audit logs for unauthorized actions

**Investigation:**
1. Check correlation IDs for attack timeline
2. Review IP addresses and locations
3. Analyze access patterns
4. Identify data accessed/modified

**Prevention:**
1. Review detection rules
2. Adjust rate limits if needed
3. Update security alerts

---

### 2. Brute Force Attack Detected

**Immediate Actions:**
1. Block attacking IP addresses
2. Verify account lockout is working
3. Check for any successful compromises

**Investigation:**
1. Identify attack pattern (distributed vs single source)
2. Check for credential lists being used
3. Review affected accounts

**Prevention:**
1. Lower rate limits temporarily
2. Enable CAPTCHA for all logins (temporary)
3. Consider IP reputation services

---

### 3. Privilege Escalation Attempt

**Immediate Actions:**
1. Revoke elevated permissions
2. Lock affected account
3. Alert security team
4. Preserve evidence (logs, database state)

**Investigation:**
1. Review authorization logs
2. Check for code vulnerabilities
3. Audit all role changes in time window
4. Check for other affected accounts

**Prevention:**
1. Code review of authorization logic
2. Add additional checks
3. Implement re-authentication for sensitive operations

---

## Security Monitoring Checklist

**Real-time Alerts:**
- [ ] Failed login attempts > 5 per account
- [ ] Failed login attempts > 20 per IP
- [ ] Account lockouts
- [ ] Privilege escalation attempts
- [ ] Token reuse detection
- [ ] Geographic anomalies
- [ ] Rate limit violations

**Daily Reviews:**
- [ ] Audit log analysis
- [ ] Failed authentication trends
- [ ] New OAuth connections
- [ ] Role changes
- [ ] Password resets

**Weekly Reviews:**
- [ ] Security metrics dashboard
- [ ] Threat pattern analysis
- [ ] Rate limit effectiveness
- [ ] Token blacklist size

**Monthly Reviews:**
- [ ] Threat model updates
- [ ] Incident response drills
- [ ] Security dependency updates
- [ ] Penetration testing results

---

## Compliance Considerations

### GDPR
- ✅ Right to erasure (user deletion)
- ✅ Data portability (user export)
- ✅ Audit logging (data access tracking)
- ✅ Consent management (OAuth permissions)

### OWASP Top 10 (2021)
- ✅ A01: Broken Access Control → RBAC + ABAC
- ✅ A02: Cryptographic Failures → bcrypt, HTTPS, secure cookies
- ✅ A03: Injection → Input validation, sanitization
- ✅ A04: Insecure Design → Threat modeling, security by design
- ✅ A05: Security Misconfiguration → Helmet, secure defaults
- ✅ A06: Vulnerable Components → Dependency scanning
- ✅ A07: Authentication Failures → MFA, rate limiting, lockout
- ✅ A08: Software & Data Integrity → JWT signature verification
- ✅ A09: Logging Failures → Comprehensive audit logging
- ✅ A10: SSRF → Input validation, URL allowlists

---

## Future Enhancements

**Short-term (3 months):**
- [ ] Multi-factor authentication (TOTP)
- [ ] Biometric authentication support
- [ ] Advanced fraud detection (ML-based)
- [ ] Honeypot accounts

**Long-term (6-12 months):**
- [ ] Zero-trust architecture
- [ ] Behavioral analytics
- [ ] Decentralized identity (DID)
- [ ] Passwordless authentication (WebAuthn)

---

**Last Updated:** January 26, 2026  
**Review Frequency:** Quarterly  
**Next Review:** April 26, 2026
