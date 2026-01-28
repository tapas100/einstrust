# SAML Testing Guide - Phase 2 Complete

## Overview

This guide covers the comprehensive testing suite for SAML 2.0 implementation in Einstrust.

## Test Suite Structure

```
tests/
├── unit/
│   ├── services/
│   │   └── saml.test.js          # SAML service layer tests (12 tests)
│   └── models/
│       └── saml-models.test.js    # IdP & Session model tests (30+ tests)
├── integration/
│   └── saml-routes.test.js        # API endpoint tests (20+ tests)
└── security/
    └── saml-security.test.js      # Security validation tests (15+ tests)
```

## Running Tests

### All SAML Tests
```bash
npm run test:saml
```

### Unit Tests Only
```bash
npm run test:saml:unit
```

### Integration Tests Only
```bash
npm run test:saml:integration
```

### Security Tests Only
```bash
npm run test:saml:security
```

### All Tests with Coverage
```bash
npm test
```

### Watch Mode (Development)
```bash
npm run test:watch
```

## Test Categories

### 1. Unit Tests - SAML Service (12 tests)

**File**: `tests/unit/services/saml.test.js`

- ✅ Service Provider Configuration
  - Initialize SP configuration
  - Generate SP metadata XML
  - Generate tenant-specific metadata

- ✅ IdP Metadata Parsing
  - Parse IdP metadata XML
  - Handle invalid metadata
  - Extract certificate expiry

- ✅ SSO Initiation
  - Initiate SSO successfully
  - Fail with disabled IdP
  - Fail with expired certificate
  - Fail with invalid IdP ID

- ✅ Certificate Validation
  - Detect certificate expiry status
  - Detect expired certificates
  - Detect certificates expiring soon

- ✅ Attribute Mapping
  - Map SAML attributes correctly
  - Handle missing attributes
  - Handle Map-based mapping

- ✅ Security Validations
  - Extract issuer from SAML response
  - Extract assertion ID
  - Generate fallback assertion ID

### 2. Unit Tests - Models (30+ tests)

**File**: `tests/unit/models/saml-models.test.js`

**IdpConfiguration Model** (15 tests):
- ✅ Schema validation (name, entityId, etc.)
- ✅ Unique entity ID enforcement
- ✅ Default values
- ✅ Virtual properties (certificate expiry detection)
- ✅ Instance methods (domain validation)
- ✅ Static methods (findByEntityId, findByTenant)

**SamlSession Model** (15 tests):
- ✅ Schema validation (userId, sessionIndex, etc.)
- ✅ Unique sessionIndex/assertionId enforcement
- ✅ Default values
- ✅ Virtual properties (isExpired, isIdle)
- ✅ Instance methods (updateActivity, terminate)
- ✅ Static methods (findActiveBySessionIndex, cleanupExpired)
- ✅ Pre-save hooks (prevent expired sessions)

### 3. Integration Tests - API Routes (20+ tests)

**File**: `tests/integration/saml-routes.test.js`

**Authentication Endpoints**:
- ✅ POST /api/auth/saml/initiate
  - Initiate SSO successfully
  - Return 400 if idpId missing
  - Return 400 if returnUrl missing
  - Return 500 with invalid idpId

- ✅ POST /api/auth/saml/callback
  - Return 400 if SAMLResponse missing
  - Process valid SAML assertion (mocked)

- ✅ GET /api/auth/session
  - Validate active session

- ✅ POST /api/auth/logout
  - Logout successfully (local)
  - Initiate SAML SLO

**Metadata Endpoints**:
- ✅ GET /api/saml/metadata
  - Return SP metadata XML
  - Return tenant-specific metadata

**Admin IdP Management** (13 tests):
- ✅ POST /api/admin/idps
  - Create IdP from metadata URL
  - Return 400 if name missing
  - Return 400 if metadata missing

- ✅ GET /api/admin/idps
  - List all IdPs
  - Filter by tenantId
  - Filter by enabled status

- ✅ GET /api/admin/idps/:id
  - Get IdP details
  - Return 404 for non-existent IdP

- ✅ PUT /api/admin/idps/:id
  - Update IdP configuration
  - Return 404 for non-existent IdP

- ✅ DELETE /api/admin/idps/:id
  - Delete IdP successfully
  - Return 404 for non-existent IdP

- ✅ POST /api/admin/idps/:id/refresh-metadata
  - Return 400 if no metadata URL

### 4. Security Tests (15+ tests)

**File**: `tests/security/saml-security.test.js`

- ✅ Assertion Replay Prevention
  - Prevent reuse of assertion ID
  - Track assertion IDs for replay detection

- ✅ Certificate Validation
  - Reject expired certificates
  - Warn about certificates expiring soon
  - Validate certificate format

- ✅ Domain-Based Access Control
  - Enforce allowed domains
  - Allow all domains when no restrictions

- ✅ Session Security
  - Expire sessions after timeout
  - Track idle sessions
  - Update activity on access
  - Terminate sessions securely

- ✅ Multi-Tenant Isolation
  - Isolate IdPs by tenant
  - Isolate sessions by tenant

- ✅ Input Validation & Sanitization
  - Sanitize IdP name
  - Validate entityId format
  - Validate SSO URL format

- ✅ Error Handling
  - Handle missing IdP gracefully
  - Handle disabled IdP gracefully
  - Prevent creating expired sessions

## Mock IdP Server (No Docker)

### Quick Start

**Start Mock IdP**:
```bash
npm run mock-idp
```

**Run Einstrust + Mock IdP Together**:
```bash
npm run dev:with-idp
```

### Configuration

1. **Start Mock IdP**:
   ```bash
   node src/dev/mock-idp.js
   ```
   - Metadata: http://localhost:7000/metadata
   - SSO URL: http://localhost:7000/sso

2. **Configure Einstrust**:
   ```bash
   curl -X POST http://localhost:3000/api/admin/idps \
     -H "Authorization: Bearer <admin-token>" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Mock IdP",
       "metadataUrl": "http://localhost:7000/metadata"
     }'
   ```

3. **Test SSO Flow**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/saml/initiate \
     -H "Content-Type: application/json" \
     -d '{
       "idpId": "<idp-id-from-step-2>",
       "returnUrl": "http://localhost:3000/callback"
     }'
   ```
   Open the `redirectUrl` in browser and login.

### Mock IdP Features

- ✅ Full SAML 2.0 metadata
- ✅ SSO login page (no password required)
- ✅ Custom user attributes
- ✅ Role assignment
- ✅ Single Logout support
- ✅ Web UI for testing
- ✅ No external dependencies
- ✅ No Docker required

## Test Database Setup

### MongoDB Test Database

**Option 1: Use Environment Variable**
```bash
export MONGODB_TEST_URI=mongodb://localhost:27017/einstrust_test
npm test
```

**Option 2: In-Memory MongoDB (Recommended)**
```bash
npm install --save-dev mongodb-memory-server
```

Update `jest.config.js`:
```javascript
module.exports = {
  preset: '@shelf/jest-mongodb',
  // ... other config
};
```

## Cloud IdP Testing (Production-like)

See `docs/saml-testing-no-docker.md` for:
- ✅ Okta Developer Account (FREE)
- ✅ Auth0 (FREE tier)
- ✅ Azure AD (FREE with Microsoft account)
- ✅ SAMLtest.id (FREE, no signup)

## Coverage Goals

| Category | Goal | Current |
|----------|------|---------|
| **Overall** | 80%+ | 🎯 TBD |
| **SAML Service** | 90%+ | 🎯 TBD |
| **Models** | 95%+ | 🎯 TBD |
| **Routes** | 85%+ | 🎯 TBD |
| **Security** | 100% | 🎯 TBD |

## Running Tests

```bash
# Run all tests with coverage
npm test

# Run only SAML tests
npm run test:saml

# Run tests in watch mode
npm run test:watch

# Run specific test file
npx jest tests/unit/services/saml.test.js

# Run with verbose output
npx jest --verbose

# Update snapshots
npx jest --updateSnapshot
```

## CI/CD Integration

### GitHub Actions

`.github/workflows/test.yml`:
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      mongodb:
        image: mongo:latest
        ports:
          - 27017:27017
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm ci
      - run: npm run mock-idp &
      - run: npm test
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Debugging Tests

### Enable Debug Logs
```bash
DEBUG=einstrust:* npm test
```

### Run Single Test
```bash
npx jest -t "should initiate SSO successfully"
```

### Inspect SAML Responses
Use SAML-tracer browser extension:
- Firefox: https://addons.mozilla.org/en-US/firefox/addon/saml-tracer/
- Chrome: Search "SAML-tracer" in Chrome Web Store

## Manual Testing Checklist

- [ ] SSO initiation redirects to IdP
- [ ] IdP login form works
- [ ] SAML assertion is processed
- [ ] User is created/updated
- [ ] Session is created
- [ ] Access token is returned
- [ ] Token validates correctly
- [ ] Logout works (local)
- [ ] SAML SLO works
- [ ] Certificate expiry warnings
- [ ] Domain restrictions work
- [ ] Multi-tenant isolation
- [ ] Replay attack prevention
- [ ] Assertion expiry validation

## Next Steps

1. **Run Full Test Suite**:
   ```bash
   npm test
   ```

2. **Fix Any Failing Tests**

3. **Achieve 80%+ Coverage**

4. **Add E2E Tests** (Future):
   - Playwright/Puppeteer for browser automation
   - Full SSO flow simulation
   - Multi-browser testing

5. **Performance Testing** (Future):
   - Load testing with k6/Artillery
   - SSO endpoint performance
   - Session lookup performance

## Resources

- Jest Documentation: https://jestjs.io/docs/getting-started
- Supertest: https://github.com/visionmedia/supertest
- SAML Debugging: https://www.samltool.com/
- Mock IdP Source: `src/dev/mock-idp.js`

## Support

- Issues: https://github.com/tapas100/einstrust/issues
- Documentation: `docs/saml-integration.md`
- Integration Guide: `docs/integration-guide.md`
