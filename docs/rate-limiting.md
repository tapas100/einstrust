# ⏱️ Rate Limiting Strategy

## Overview

This document details the rate limiting configuration, implementation, and strategy for protecting the Secure Auth Platform from abuse.

---

## Why Rate Limiting?

### Problems Solved
1. **Brute Force Attacks** - Prevent password guessing
2. **DDoS Protection** - Limit resource exhaustion
3. **API Abuse** - Prevent automated scraping
4. **Cost Control** - Limit infrastructure costs
5. **Fair Usage** - Ensure resources for all users

---

## Rate Limit Configuration

### 1. Login Endpoint

**Endpoint:** `POST /api/v1/auth/login`

```javascript
Window: 15 minutes
Max Requests: 5 per IP
Reset: After window expires
```

**Why 5 attempts?**
- Legitimate users rarely fail login more than 2-3 times
- Allows for typos and forgotten passwords
- Low enough to block brute force (5 attempts × 4 windows/hour = 20 attempts/hour max)

**Response on Limit:**
```json
{
  "error": true,
  "message": "Too many login attempts. Please try again in 15 minutes.",
  "retryAfter": "2026-01-26T10:30:00Z"
}
```

---

### 2. Registration Endpoint

**Endpoint:** `POST /api/v1/auth/register`

```javascript
Window: 1 hour
Max Requests: 3 per IP
Reset: After window expires
```

**Why 3 attempts?**
- Prevent mass account creation
- Legitimate users rarely need multiple attempts
- Stops automated bot registrations

**Response on Limit:**
```json
{
  "error": true,
  "message": "Too many registration attempts. Please try again in 1 hour.",
  "retryAfter": "2026-01-26T11:00:00Z"
}
```

---

### 3. Token Refresh Endpoint

**Endpoint:** `POST /api/v1/auth/refresh`

```javascript
Window: 15 minutes
Max Requests: 10 per IP
Reset: After window expires
```

**Why 10 attempts?**
- Access tokens expire every 15 minutes
- Normal usage = 1 refresh per 15 min
- 10 allows for multiple devices + some buffer
- Prevents token refresh abuse

---

### 4. Password Reset Endpoint

**Endpoint:** `POST /api/v1/auth/forgot-password`

```javascript
Window: 1 hour
Max Requests: 3 per IP
Reset: After window expires
```

**Why 3 attempts?**
- Prevent email enumeration attacks
- Limits spam to user inboxes
- Legitimate users need at most 1-2 attempts

---

### 5. General API Endpoints

**All other endpoints:** `GET/POST/PUT/DELETE /api/v1/*`

```javascript
Window: 15 minutes
Max Requests: 100 per IP
Reset: After window expires
```

**Why 100 requests?**
- Normal user activity: ~1-2 requests per minute
- 100 requests / 15 min = ~6-7 requests/min average
- Allows bursts (page loads) but prevents abuse

---

## Implementation

### Express Rate Limit

```javascript
import rateLimit from 'express-rate-limit';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                    // 5 requests per window
  standardHeaders: true,     // Return RateLimit-* headers
  legacyHeaders: false,      // Disable X-RateLimit-* headers
  message: {
    error: true,
    message: 'Too many login attempts. Please try again later.'
  }
});

// Apply to route
app.post('/api/v1/auth/login', loginLimiter, loginController);
```

---

## Response Headers

### Standard Headers (Draft RFC)

```http
RateLimit-Limit: 5
RateLimit-Remaining: 3
RateLimit-Reset: 1706271300
```

**Explanation:**
- `RateLimit-Limit`: Total requests allowed in window
- `RateLimit-Remaining`: Requests remaining in current window
- `RateLimit-Reset`: Unix timestamp when limit resets

### On Limit Exceeded

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 900
RateLimit-Limit: 5
RateLimit-Remaining: 0
RateLimit-Reset: 1706271300

{
  "error": true,
  "message": "Too many requests. Please try again in 15 minutes.",
  "retryAfter": "2026-01-26T10:30:00Z"
}
```

---

## Advanced Strategies

### 1. Dynamic Rate Limiting

**Concept:** Adjust limits based on user authentication status

```javascript
const dynamicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: async (req) => {
    // Authenticated users get higher limits
    if (req.user) {
      return 200;  // 200 requests for authenticated users
    }
    return 50;     // 50 requests for anonymous users
  }
});
```

**Benefits:**
- Reward authenticated users with higher limits
- Encourage user registration
- Reduce anonymous API abuse

---

### 2. IP-Based + User-Based Limiting

**Problem:** Multiple users behind same IP (NAT, corporate networks)

**Solution:** Layer limits

```javascript
// Layer 1: IP-based limit (broad)
const ipLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,  // Total per IP
  keyGenerator: (req) => req.ip
});

// Layer 2: User-based limit (specific)
const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,   // Per user
  keyGenerator: (req) => req.user?._id || req.ip,
  skip: (req) => !req.user  // Skip if not authenticated
});

// Apply both
app.use('/api/v1', ipLimiter, userLimiter);
```

---

### 3. Redis-Based Rate Limiting

**Why Redis?**
- Distributed rate limiting (multiple servers)
- Shared state across instances
- Fast in-memory operations
- Auto-expiration (TTL)

**Implementation:**

```javascript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:login:'  // Key prefix
  })
});
```

**Redis Keys:**
```
rl:login:192.168.1.1 → 3   (TTL: 900 seconds)
rl:login:10.0.0.5    → 5   (TTL: 120 seconds)
```

---

### 4. Sliding Window Rate Limiting

**Problem:** Fixed windows can be exploited

**Example:**
```
Window 1: 00:00 - 00:15
Window 2: 00:15 - 00:30

User makes:
- 5 requests at 00:14
- 5 requests at 00:16
- Total: 10 requests in 2 minutes (bypassed 5/15min limit)
```

**Solution:** Sliding window

```javascript
import { RateLimiterRedis } from 'rate-limiter-flexible';

const limiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl',
  points: 5,           // Number of requests
  duration: 15 * 60,   // Per 15 minutes
  blockDuration: 15 * 60  // Block for 15 min if exceeded
});

app.use(async (req, res, next) => {
  try {
    await limiter.consume(req.ip);
    next();
  } catch (error) {
    res.status(429).json({
      error: true,
      message: 'Too many requests',
      retryAfter: error.msBeforeNext
    });
  }
});
```

---

## Bypass Strategies

### 1. Whitelist IPs

```javascript
const trustedIPs = [
  '10.0.0.0/8',      // Internal network
  '192.168.1.100',   // Office IP
];

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skip: (req) => {
    // Skip rate limiting for trusted IPs
    return trustedIPs.some(ip => req.ip.startsWith(ip));
  }
});
```

### 2. API Key Tiers

```javascript
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: async (req) => {
    const apiKey = req.get('x-api-key');
    const tier = await getAPIKeyTier(apiKey);
    
    switch (tier) {
      case 'enterprise': return 10000;
      case 'business':   return 1000;
      case 'free':       return 100;
      default:           return 50;
    }
  }
});
```

---

## Monitoring & Alerts

### Metrics to Track

```javascript
// Track rate limit hits
metrics.increment('rate_limit.hit', {
  endpoint: req.path,
  ip: req.ip
});

// Track near-limits (>80% of max)
if (remaining < max * 0.2) {
  metrics.increment('rate_limit.near_limit', {
    endpoint: req.path,
    ip: req.ip
  });
}

// Track unique IPs hitting limits
await redis.sadd('rate_limit:blocked_ips', req.ip);
```

### Alerts

```javascript
// Alert if too many IPs are blocked
const blockedIPCount = await redis.scard('rate_limit:blocked_ips');
if (blockedIPCount > 100) {
  alertOps('High number of rate-limited IPs detected', {
    count: blockedIPCount
  });
}

// Alert if specific IP hits limit repeatedly
const hitCount = await redis.incr(`rate_limit:repeat:${ip}`);
if (hitCount > 10) {
  alertSecurity('IP repeatedly hitting rate limits', {
    ip,
    hitCount
  });
}
```

---

## Testing Rate Limits

### Manual Testing

```bash
# Test login rate limit
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}' \
    -v
  echo "Attempt $i"
done

# 6th request should return 429
```

### Automated Tests

```javascript
describe('Rate Limiting', () => {
  test('Should block after 5 failed logins', async () => {
    // Make 5 requests
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'wrong' });
    }
    
    // 6th request should be blocked
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'wrong' });
    
    expect(response.status).toBe(429);
    expect(response.body.error).toBe(true);
  });
  
  test('Should reset after window expires', async () => {
    jest.useFakeTimers();
    
    // Hit limit
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'wrong' });
    }
    
    // Fast-forward 16 minutes
    jest.advanceTimersByTime(16 * 60 * 1000);
    
    // Should work again
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'correct' });
    
    expect(response.status).toBe(200);
  });
});
```

---

## Client-Side Handling

### Respect Rate Limit Headers

```javascript
async function makeRequest(url, options) {
  const response = await fetch(url, options);
  
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const resetTime = new Date(retryAfter * 1000);
    
    throw new Error(`Rate limited. Retry after ${resetTime.toLocaleString()}`);
  }
  
  // Track remaining requests
  const remaining = response.headers.get('RateLimit-Remaining');
  if (remaining < 10) {
    console.warn(`Low rate limit remaining: ${remaining}`);
  }
  
  return response;
}
```

### Exponential Backoff

```javascript
async function makeRequestWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await makeRequest(url, options);
    } catch (error) {
      if (error.message.includes('Rate limited')) {
        const delay = Math.pow(2, i) * 1000;  // 1s, 2s, 4s
        console.log(`Retrying in ${delay}ms...`);
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }
  
  throw new Error('Max retries exceeded');
}
```

---

## Production Considerations

### Load Balancer Integration

**Problem:** Multiple servers, IP-based limiting doesn't work

**Solutions:**

1. **Redis Store** (Recommended)
   - Shared state across all servers
   - Consistent limits

2. **Sticky Sessions**
   - Route same IP to same server
   - Not recommended (uneven load)

3. **True Client IP**
   ```javascript
   app.set('trust proxy', 1);  // Trust first proxy
   
   // Now req.ip contains real client IP
   ```

### DDoS Protection Layers

```
Layer 1: CDN/CloudFlare (Global)
  ↓ 10000+ req/min → blocked

Layer 2: Load Balancer (Regional)
  ↓ 1000+ req/min → rate limited

Layer 3: Application (Per-endpoint)
  ↓ 100 req/15min → rate limited

Layer 4: Account-level (Per-user)
  ↓ 50 req/15min → rate limited
```

---

## Best Practices

### ✅ DO
- Use Redis for distributed systems
- Return informative error messages
- Include `Retry-After` header
- Monitor rate limit hits
- Test limits in staging
- Document limits in API docs
- Use sliding windows when possible
- Layer multiple rate limiters
- Whitelist internal services

### ❌ DON'T
- Use only in-memory limits (multi-server)
- Set limits too low (bad UX)
- Set limits too high (no protection)
- Forget to test bypass scenarios
- Block without notification
- Use fixed windows for critical endpoints
- Trust client-side rate limiting
- Expose limit values in code (use env vars)

---

## Troubleshooting

### Issue: Legitimate Users Blocked

**Causes:**
- Limits too strict
- Shared IPs (corporate NAT)
- Automated testing hitting API

**Solutions:**
- Increase limits for authenticated users
- Use user-based limiting (not just IP)
- Whitelist known good IPs
- Implement CAPTCHA after soft limit

### Issue: Limits Not Working

**Checks:**
- Redis connection working?
- Trust proxy configured?
- Getting correct IP from req.ip?
- Store persisting across restarts?

### Issue: Performance Degradation

**Causes:**
- Redis latency
- Too many rate limiters
- Complex keyGenerator functions

**Solutions:**
- Optimize Redis queries
- Combine limiters where possible
- Cache user tier lookups

---

**Last Updated:** January 26, 2026  
**Author:** Security Team  
**Review Frequency:** Quarterly
