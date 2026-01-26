# 🔐 S---

## 🚀 Features

### 🔐 Authentication & Security Auth Platform

**Production-Grade Authentication & Authorization Service**

A comprehensive, enterprise-ready authentication and authorization service built with Node.js, featuring RBAC, OAuth integration, advanced security hardening, and horizontal scalability.

---

## 🌟 Key Features

### 🔑 Authentication
- **JWT-based authentication** with access + refresh tokens
- **Token rotation** for enhanced security
- **Secure cookie handling** with httpOnly and sameSite flags
- **Password hashing** with bcrypt (cost factor: 12)
- **Account lockout** after failed login attempts
- **OAuth 2.0** integration (Google, GitHub)

### 🛡️ Authorization
- **Role-Based Access Control (RBAC)**
- **Attribute-Based Access Control (ABAC)** support
- **Permission matrix** system
- **Middleware-driven** authorization checks
- **Policy-driven** logic (not hardcoded)

### 🔒 Security Hardening
- **Rate limiting** on all auth endpoints
- **CSRF protection** for state-changing operations
- **Secure headers** via Helmet.js
- **Input validation** with Joi schemas
- **Brute-force detection** and prevention
- **MongoDB injection** protection
- **XSS protection**

### 📊 Observability
- **Audit logging** for all auth events
- **Correlation IDs** for request tracing
- **Security alerts** for suspicious activities
- **Metrics** tracking (failed logins, token refresh rates)
- **Structured logging** with Winston

### 🧪 Testing
- **Unit tests** for all auth flows
- **Integration tests** for API endpoints
- **Security tests** for attack scenarios
- **Abuse scenario** coverage

### 🚀 Deployment
- **Dockerized** service
- **Environment separation** (dev, staging, prod)
- **Secrets management** best practices
- **Horizontal scaling** ready (stateless architecture)

---

## 📁 Project Structure

```
secure-auth-platform/
├── src/
│   ├── lib/
│   │   ├── security/         # Security middleware & utilities
│   │   ├── rateLimiter/      # Rate limiting configuration
│   │   ├── tokenManager/     # Token generation & validation
│   │   ├── auditLogger/      # Security event logging
│   │   └── oauth/            # OAuth providers
│   ├── models/
│   │   ├── User/             # User model with security features
│   │   ├── RefreshToken/     # Refresh token storage
│   │   └── AuditLog/         # Security audit logs
│   ├── routes/
│   │   ├── auth.js           # Authentication routes
│   │   ├── oauth.js          # OAuth routes
│   │   └── user.js           # User management routes
│   ├── services/
│   │   ├── auth/             # Authentication business logic
│   │   ├── token/            # Token management
│   │   └── oauth/            # OAuth integration
│   ├── middleware/
│   │   ├── rbac.js           # RBAC middleware
│   │   ├── abac.js           # ABAC middleware
│   │   └── bruteforce.js     # Brute-force protection
│   └── validations/          # Joi validation schemas
├── tests/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── security/             # Security & abuse tests
├── docs/
│   ├── auth-flow.md          # Authentication flow diagrams
│   ├── threat-model.md       # Security threat analysis
│   ├── token-strategy.md     # Token management strategy
│   ├── rate-limiting.md      # Rate limiting configuration
│   ├── rbac-permissions.md   # Permission matrix
│   └── deployment.md         # Deployment guide
├── infra/
│   ├── Dockerfile            # Container configuration
│   └── docker-compose.yml    # Multi-service setup
├── config/                   # Configuration files
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js >= 14.x
- MongoDB >= 4.x
- Redis >= 6.x (for token blacklisting)

### Installation

```bash
# Clone the repository
git clone https://github.com/tapas100/node-auth-app.git
cd node-auth-app

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start MongoDB
sudo service mongod start

# Start Redis (for token management)
redis-server

# Start the application
npm run dev
```

### Running with Docker

```bash
# Build the image
npm run docker:build

# Run the container
npm run docker:run
```

---

## 🔐 Authentication Flow

### Access Token + Refresh Token Strategy

**Why we use refresh tokens:**

1. **Security**: Short-lived access tokens limit exposure window
2. **Revocation**: Can invalidate refresh tokens without affecting active sessions
3. **Scalability**: Stateless access tokens reduce database lookups
4. **User Experience**: Seamless re-authentication without login

**Flow:**

```
1. User logs in → Server returns access token (15min) + refresh token (7d)
2. Client stores refresh token securely (httpOnly cookie)
3. Client uses access token for API requests
4. Access token expires → Client sends refresh token
5. Server validates refresh token → Issues new access + refresh token pair
6. Old refresh token is rotated (invalidated)
```

See [docs/auth-flow.md](./docs/auth-flow.md) for detailed diagrams.

---

## 🛡️ Authorization System

### Role-Based Access Control (RBAC)

**Default Roles:**
- `admin` - Full system access
- `moderator` - Content management + user moderation
- `editor` - Content creation and editing
- `user` - Basic authenticated access
- `guest` - Read-only access

**Permission Matrix:**

| Role      | manage_users | publish_content | edit_content | read_content | delete_content |
|-----------|--------------|-----------------|--------------|--------------|----------------|
| admin     | ✅           | ✅              | ✅           | ✅           | ✅             |
| moderator | ✅           | ❌              | ✅           | ✅           | ✅             |
| editor    | ❌           | ✅              | ✅           | ✅           | ❌             |
| user      | ❌           | ❌              | ❌           | ✅           | ❌             |
| guest     | ❌           | ❌              | ❌           | ✅           | ❌             |

See [docs/rbac-permissions.md](./docs/rbac-permissions.md) for the complete permission matrix.

---

## 🔒 Security Features

### Rate Limiting

```javascript
// Login endpoint: 5 attempts per 15 minutes per IP
// Token refresh: 10 attempts per 15 minutes per IP
// Registration: 3 attempts per hour per IP
```

See [docs/rate-limiting.md](./docs/rate-limiting.md) for configuration details.

### Brute-Force Protection

- Account lockout after 5 failed attempts
- Progressive delays (exponential backoff)
- IP-based tracking
- CAPTCHA requirement after 3 failed attempts

### Password Policy

- Minimum 8 characters
- Must contain: uppercase, lowercase, number, special character
- Cannot contain common passwords (dictionary check)
- Cannot reuse last 5 passwords
- Hashed with bcrypt (cost factor: 12)

---

## 📊 API Endpoints

### Authentication

```
POST   /api/v1/auth/register       - Register new user
POST   /api/v1/auth/login          - Login with credentials
POST   /api/v1/auth/logout         - Logout (invalidate tokens)
POST   /api/v1/auth/refresh        - Refresh access token
POST   /api/v1/auth/forgot-password - Request password reset
POST   /api/v1/auth/reset-password - Reset password with token
```

### OAuth

```
GET    /api/v1/oauth/google        - Initiate Google OAuth
GET    /api/v1/oauth/google/callback - Google OAuth callback
GET    /api/v1/oauth/github        - Initiate GitHub OAuth
GET    /api/v1/oauth/github/callback - GitHub OAuth callback
```

### User Management

```
GET    /api/v1/users/me            - Get current user profile
PUT    /api/v1/users/me            - Update current user
DELETE /api/v1/users/me            - Delete account
GET    /api/v1/users/:id           - Get user by ID (admin only)
PUT    /api/v1/users/:id/roles     - Update user roles (admin only)
```

**Full API Documentation:** [Postman Collection](https://documenter.getpostman.com/view/5969791/SzYbyxeL?version=latest)

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run security tests only
npm run test:security

# View coverage report
npm test -- --coverage
```

### Test Coverage

- **Unit Tests**: Authentication logic, token validation, password hashing
- **Integration Tests**: API endpoints, middleware chains, database operations
- **Security Tests**: 
  - Token replay attacks
  - Expired token handling
  - Concurrent login scenarios
  - Brute-force attempts
  - SQL/NoSQL injection attempts
  - XSS attempts

---

## 🔧 Configuration

### Environment Variables

```bash
# Server
PORT=3000
NODE_ENV=production

# Database
MONGODB_URI=mongodb://localhost:27017/auth-platform
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=<your-super-secret-key>
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# OAuth
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GITHUB_CLIENT_ID=<your-github-client-id>
GITHUB_CLIENT_SECRET=<your-github-client-secret>

# Security
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION=900000  # 15 minutes in ms
RATE_LIMIT_WINDOW=900000 # 15 minutes in ms
```

---

## 📈 Monitoring & Observability

### Audit Logs

All security events are logged with correlation IDs for tracing. See [docs/security-logging.md](./docs/security-logging.md) for details.

---

## 🎯 Design Decisions & Trade-offs

### Stateless Authentication

**Decision:** Use JWT for access tokens (stateless)

**Why:**
- Horizontal scaling without session storage
- Reduced database lookups
- Better performance under load

**Trade-off:**
- Cannot immediately revoke access tokens
- Mitigated with short expiration (15 min) + refresh token rotation

### Token Rotation

**Decision:** Rotate refresh tokens on every use

**Why:**
- Prevents token replay attacks
- Limits damage from token theft
- Detects concurrent token usage

**Trade-off:**
- Slightly more complex client logic
- Additional database writes

### Redis for Token Blacklisting

**Decision:** Use Redis for revoked token tracking

**Why:**
- Fast in-memory lookups
- TTL support (auto-cleanup)
- Scales horizontally

**Trade-off:**
- Additional infrastructure dependency
- Requires Redis availability

---

## 🚀 Scaling Considerations

### What We'd Change at Scale

**100K+ users:**
- Add Redis cluster for distributed rate limiting
- Implement CDN for static assets
- Add read replicas for MongoDB

**1M+ users:**
- Microservices architecture (separate auth service)
- Event-driven architecture with message queues
- Distributed tracing (Jaeger/OpenTelemetry)
- Multi-region deployment

**10M+ users:**
- Dedicated identity provider (Keycloak/Auth0)
- Geographically distributed databases
- Edge authentication (Cloudflare Workers)
- Advanced fraud detection with ML

---

## 🔍 Threat Model

See [docs/threat-model.md](./docs/threat-model.md) for comprehensive threat analysis.

---

## 📄 License

ISC License

---

## 👨‍💻 Author

**Tapas Mahanta** - [@tapas100](https://github.com/tapas100)
