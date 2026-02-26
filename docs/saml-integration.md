# SAML 2.0 Integration - Product-Agnostic Enterprise SSO

## Overview

Einstrust provides enterprise-grade SAML 2.0 Service Provider (SP) functionality that works with ANY client application - web applications, mobile apps, API gateways, microservices, and more.

**This is NOT a FlexGate-specific API.** Einstrust is a standalone authentication service designed to integrate with any product or platform.

## Architecture

```
┌─────────────────────┐
│  Any Client App     │  (FlexGate, Web App, Mobile App, etc.)
│  - API Gateway      │
│  - Web Application  │
│  - Mobile Backend   │
│  - Microservice     │
└──────────┬──────────┘
           │ HTTP REST API
           │
┌──────────▼──────────┐
│    Einstrust SSO    │
│  ┌───────────────┐  │
│  │ Generic API   │  │  Standard REST endpoints
│  │   Layer       │  │  /api/auth/*, /api/saml/*
│  └───────┬───────┘  │
│          │          │
│  ┌───────▼───────┐  │
│  │ SAML Service  │  │  SAML 2.0 SP implementation
│  │   Provider    │  │  Metadata, Assertions, SSO
│  └───────┬───────┘  │
│          │          │
│  ┌───────▼───────┐  │
│  │  Keycloak/    │  │  Battle-tested SAML engine
│  │  Authentik    │  │  (via Docker)
│  └───────────────┘  │
└─────────────────────┘
           │
           │ SAML Protocol
           │
┌──────────▼──────────┐
│   Identity Provider │
│  (Okta, Azure AD,   │
│   OneLogin, etc.)   │
└─────────────────────┘
```

## Features

### 1. SAML Service Provider
- Full SAML 2.0 Web Browser SSO Profile support
- SP-initiated and IdP-initiated SSO flows
- Single Logout (SLO) support
- Metadata generation and consumption
- Certificate management and validation
- Multiple IdP support (tenant isolation)

### 2. Identity Provider Management
- Dynamic IdP registration via REST API
- Metadata URL auto-fetch and parsing
- Manual metadata XML upload
- Certificate rotation support
- IdP-specific configuration (entity ID, SSO URL, SLO URL)

### 3. Generic REST API
**All endpoints are product-agnostic and work with ANY client:**

#### Authentication Flow
- `POST /api/auth/saml/initiate` - Start SAML SSO flow (any client)
- `POST /api/auth/saml/callback` - Handle SAML assertion (any client)
- `GET /api/auth/session` - Validate active session (any client)
- `POST /api/auth/logout` - End SSO session (any client)

#### Metadata & Configuration
- `GET /api/saml/metadata` - Export SP metadata (for IdP configuration)
- `GET /api/saml/metadata/:tenantId` - Tenant-specific metadata

#### Admin Management (requires admin authentication)
- `POST /api/admin/idps` - Register new IdP
- `GET /api/admin/idps` - List all IdPs
- `GET /api/admin/idps/:id` - Get IdP details
- `PUT /api/admin/idps/:id` - Update IdP configuration
- `DELETE /api/admin/idps/:id` - Remove IdP
- `POST /api/admin/idps/:id/test` - Test IdP connectivity

### 4. Multi-Tenancy Support
- Tenant isolation (each client app can have separate SAML config)
- Per-tenant IdP configuration
- Tenant-specific metadata URLs
- Shared user directory or tenant-specific users

### 5. Security Features
- SAML assertion signature validation
- Certificate chain validation
- Replay attack prevention (assertion ID tracking)
- Time-based assertion validation (NotBefore, NotOnOrAfter)
- Audience restriction validation
- SSL/TLS for all endpoints
- Rate limiting on SSO endpoints

## Data Models

### IdP Configuration
```javascript
{
  id: "uuid",
  tenantId: "optional-tenant-id",  // For multi-tenant isolation
  name: "Okta Production",
  entityId: "http://www.okta.com/exk...",
  ssoUrl: "https://company.okta.com/app/.../sso/saml",
  sloUrl: "https://company.okta.com/app/.../slo/saml",
  certificate: "-----BEGIN CERTIFICATE-----...",
  certificateExpiry: "2025-12-31T23:59:59Z",
  metadataUrl: "https://company.okta.com/app/.../metadata",
  metadataLastFetched: "2024-01-15T10:30:00Z",
  nameIdFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
  attributeMapping: {
    email: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    firstName: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
    lastName: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
    roles: "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
  },
  enabled: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-15T10:30:00Z"
}
```

### SAML Session
```javascript
{
  id: "uuid",
  userId: "uuid",
  tenantId: "optional-tenant-id",
  idpId: "uuid",
  nameId: "user@example.com",
  sessionIndex: "saml-session-index",
  assertionId: "id-abc123",  // For replay prevention
  createdAt: "2024-01-28T10:00:00Z",
  expiresAt: "2024-01-28T18:00:00Z",
  lastActivity: "2024-01-28T10:00:00Z",
  attributes: {
    email: "user@example.com",
    firstName: "John",
    lastName: "Doe",
    roles: ["admin", "user"]
  }
}
```

### User (Extended)
```javascript
{
  // Existing fields...
  samlNameId: "user@example.com",  // SAML NameID
  samlSessionIndex: "session-idx",
  identityProvider: "okta",
  tenantId: "optional-tenant-id",
  lastSamlLogin: "2024-01-28T10:00:00Z"
}
```

## Integration Examples

### Example 1: Web Application (React/Next.js)

```javascript
// Client-side: Initiate SSO
async function loginWithSAML(tenantId) {
  const response = await fetch('https://einstrust.example.com/api/auth/saml/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      tenantId: tenantId,  // Optional
      returnUrl: window.location.origin + '/auth/callback'
    })
  });
  
  const { redirectUrl } = await response.json();
  window.location.href = redirectUrl;  // Redirect to IdP
}

// Server-side callback handler
app.post('/auth/callback', async (req, res) => {
  const { SAMLResponse } = req.body;
  
  const response = await fetch('https://einstrust.example.com/api/auth/saml/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ SAMLResponse })
  });
  
  const { accessToken, refreshToken, user } = await response.json();
  
  // Set cookies/session and redirect
  res.cookie('token', accessToken, { httpOnly: true });
  res.redirect('/dashboard');
});
```

### Example 2: API Gateway (FlexGate, Kong, Nginx)

```javascript
// FlexGate plugin configuration
{
  "name": "einstrust-sso",
  "config": {
    "einstrust_url": "https://einstrust.example.com",
    "tenant_id": "flexgate-prod",
    "session_cookie": "einstrust_session",
    "bypass_paths": ["/public", "/health"]
  }
}

// Middleware logic (pseudo-code)
async function authenticate(request) {
  const sessionCookie = request.cookies.einstrust_session;
  
  if (!sessionCookie) {
    // Redirect to SAML initiate
    return redirect(`${EINSTRUST_URL}/api/auth/saml/initiate?returnUrl=${request.url}`);
  }
  
  // Validate session
  const session = await fetch(`${EINSTRUST_URL}/api/auth/session`, {
    headers: { 'Authorization': `Bearer ${sessionCookie}` }
  });
  
  if (!session.valid) {
    return redirect(`${EINSTRUST_URL}/api/auth/saml/initiate?returnUrl=${request.url}`);
  }
  
  // Add user context to request
  request.user = session.user;
  return next();
}
```

### Example 3: Mobile Backend (Node.js/Express)

```javascript
const express = require('express');
const app = express();

// Start SAML flow (mobile app opens WebView)
app.get('/auth/saml/start', async (req, res) => {
  const response = await fetch('https://einstrust.example.com/api/auth/saml/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      returnUrl: `${process.env.APP_URL}/auth/callback`,
      mobile: true  // Optional flag
    })
  });
  
  const { redirectUrl } = await response.json();
  res.json({ redirectUrl });
});

// Callback receives tokens
app.post('/auth/callback', async (req, res) => {
  const { SAMLResponse } = req.body;
  
  const response = await fetch('https://einstrust.example.com/api/auth/saml/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ SAMLResponse })
  });
  
  const { accessToken, refreshToken, user } = await response.json();
  
  // Return tokens to mobile app (close WebView)
  res.json({ accessToken, refreshToken, user });
});
```

### Example 4: cURL Testing

```bash
# 1. Initiate SSO (get redirect URL)
curl -X POST https://einstrust.example.com/api/auth/saml/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "my-app",
    "returnUrl": "https://myapp.com/callback"
  }'

# Response:
# {
#   "redirectUrl": "https://idp.example.com/sso/saml?SAMLRequest=...",
#   "requestId": "uuid"
# }

# 2. After IdP authentication, handle callback
# (IdP POSTs SAMLResponse to returnUrl, your app forwards to Einstrust)
curl -X POST https://einstrust.example.com/api/auth/saml/callback \
  -H "Content-Type: application/json" \
  -d '{
    "SAMLResponse": "base64-encoded-saml-assertion"
  }'

# Response:
# {
#   "accessToken": "jwt-token",
#   "refreshToken": "refresh-token",
#   "user": {
#     "id": "uuid",
#     "email": "user@example.com",
#     "firstName": "John",
#     "lastName": "Doe",
#     "roles": ["admin"]
#   }
# }

# 3. Validate session
curl -X GET https://einstrust.example.com/api/auth/session \
  -H "Authorization: Bearer <accessToken>"

# 4. Logout
curl -X POST https://einstrust.example.com/api/auth/logout \
  -H "Authorization: Bearer <accessToken>"
```

## Admin API Examples

### Register New IdP

```bash
curl -X POST https://einstrust.example.com/api/admin/idps \
  -H "Authorization: Bearer <adminToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Okta Production",
    "metadataUrl": "https://company.okta.com/app/exk.../metadata",
    "tenantId": "my-company",
    "attributeMapping": {
      "email": "email",
      "firstName": "firstName",
      "lastName": "lastName"
    }
  }'
```

### Get SP Metadata (for IdP configuration)

```bash
curl https://einstrust.example.com/api/saml/metadata

# Returns XML metadata for configuring the IdP:
# <EntityDescriptor entityID="https://einstrust.example.com">
#   <SPSSODescriptor>
#     <AssertionConsumerService .../>
#     ...
#   </SPSSODescriptor>
# </EntityDescriptor>
```

## Implementation Phases

### Phase 1: Core SAML Service (Week 1)
- [ ] SAML types and models
- [ ] SAML service layer (using `samlify` or `passport-saml`)
- [ ] Metadata generation and parsing
- [ ] Certificate validation
- [ ] Basic SP-initiated SSO flow
- [ ] Unit tests

### Phase 2: REST API (Week 1-2)
- [ ] `/api/auth/saml/initiate` endpoint
- [ ] `/api/auth/saml/callback` endpoint
- [ ] `/api/auth/session` validation
- [ ] `/api/auth/logout` endpoint
- [ ] `/api/saml/metadata` generation
- [ ] Integration tests

### Phase 3: IdP Management (Week 2)
- [ ] MongoDB schema for IdP configuration
- [ ] CRUD endpoints (`/api/admin/idps/*`)
- [ ] Metadata URL auto-fetch
- [ ] Certificate expiry monitoring
- [ ] Admin UI integration (optional)

### Phase 4: Security & Production (Week 2-3)
- [ ] Assertion replay prevention
- [ ] Rate limiting on SSO endpoints
- [ ] Comprehensive security testing
- [ ] Docker integration with Keycloak/Authentik
- [ ] Production deployment guide

### Phase 5: Documentation (Week 3)
- [ ] API reference documentation
- [ ] Integration guides (web, mobile, API gateway)
- [ ] Example implementations (React, Node.js, Python)
- [ ] Troubleshooting guide
- [ ] Security best practices

## Technology Stack

- **SAML Library**: `samlify` (lightweight, well-maintained)
- **Alternative**: `passport-saml` (if using Passport.js)
- **XML Parsing**: `xml2js`, `xmlbuilder2`
- **Certificate**: `node-forge` for certificate validation
- **Backend**: Keycloak or Authentik (Docker) - optional enhancement
- **Testing**: Jest, supertest, SAML test IdP

## Security Considerations

1. **Assertion Validation**
   - Signature verification
   - Certificate chain validation
   - Timestamp validation (NotBefore, NotOnOrAfter)
   - Audience restriction
   - Recipient validation

2. **Replay Attack Prevention**
   - Track used assertion IDs
   - Short assertion lifetime (5 minutes)
   - Redis-based assertion ID cache

3. **Session Management**
   - Secure session cookies (httpOnly, secure, sameSite)
   - Session timeout (8 hours default)
   - Activity-based session refresh
   - Single logout support

4. **Certificate Management**
   - Automated metadata refresh (daily)
   - Certificate expiry warnings (30 days)
   - Multiple certificate support (rotation)

5. **Rate Limiting**
   - SSO initiate: 10 requests/minute per IP
   - Callback: 20 requests/minute per IP
   - Admin API: 100 requests/hour per admin

## Success Metrics

- ✅ Support for major IdPs (Okta, Azure AD, OneLogin, Auth0, Google Workspace)
- ✅ Generic REST API works with ANY client (not just FlexGate)
- ✅ SP and IdP-initiated SSO flows
- ✅ Single Logout (SLO) support
- ✅ Multi-tenant isolation
- ✅ 90%+ test coverage
- ✅ Comprehensive documentation with examples
- ✅ Security audit passed
- ✅ Production deployment ready

## Estimated Timeline

- **Phase 1**: 20-24 hours (Core SAML service)
- **Phase 2**: 12-16 hours (REST API)
- **Phase 3**: 8-12 hours (IdP management)
- **Phase 4**: 16-20 hours (Security & production)
- **Phase 5**: 8-12 hours (Documentation)

**Total**: 64-84 hours (8-10.5 working days)

## Future Enhancements

- LDAP/Active Directory integration
- SCIM 2.0 user provisioning
- Multi-factor authentication (MFA)
- Advanced RBAC mapping from SAML attributes
- SAML artifact binding
- Enhanced audit logging
- Real-time IdP health monitoring
