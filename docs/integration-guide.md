# Einstrust Integration Guide

## Overview

Einstrust is a **product-agnostic** enterprise authentication service that provides JWT, OAuth 2.0, and SAML 2.0 authentication for ANY application - web apps, mobile backends, API gateways, microservices, and more.

**This is NOT tied to any specific product.** Einstrust works as a standalone SSO service that you can integrate with your application regardless of technology stack.

## Quick Start

### 1. Installation

```bash
git clone https://github.com/tapas100/einstrust.git
cd einstrust
npm install
```

### 2. Configuration

Create `.env` file:

```bash
# Server
NODE_ENV=production
PORT=3000
SAML_SP_BASE_URL=https://your-einstrust-domain.com

# Database
MONGODB_URI=mongodb://localhost:27017/einstrust
REDIS_URL=redis://localhost:6379

# JWT Secrets
JWT_ACCESS_SECRET=your-super-secret-access-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key

# Session
SESSION_SECRET=your-session-secret
```

### 3. Start Service

```bash
# Development
npm run dev

# Production
npm start
```

## Integration Patterns

### Pattern 1: Web Application (React, Vue, Angular)

**Use Case**: Single-page application needs enterprise SSO

```javascript
// 1. Initiate SAML login
async function loginWithSSO() {
  const response = await fetch('https://einstrust.example.com/api/auth/saml/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idpId: 'your-idp-id',  // Get from Einstrust admin
      returnUrl: window.location.origin + '/auth/callback'
    })
  });
  
  const { redirectUrl } = await response.json();
  window.location.href = redirectUrl;  // Redirect to IdP
}

// 2. Handle callback (runs after IdP authentication)
async function handleCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const samlResponse = urlParams.get('SAMLResponse');
  
  const response = await fetch('https://einstrust.example.com/api/auth/saml/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ SAMLResponse: samlResponse })
  });
  
  const { accessToken, refreshToken, user } = await response.json();
  
  // Store tokens
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  
  // Redirect to app
  window.location.href = '/dashboard';
}

// 3. Make authenticated requests
async function fetchProtectedData() {
  const token = localStorage.getItem('accessToken');
  
  const response = await fetch('https://your-api.com/data', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return response.json();
}

// 4. Logout
async function logout() {
  const sessionId = localStorage.getItem('sessionId');
  
  await fetch('https://einstrust.example.com/api/auth/logout', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
    },
    body: JSON.stringify({
      sessionId,
      samlLogout: true  // true = SAML SLO, false = local logout only
    })
  });
  
  localStorage.clear();
  window.location.href = '/login';
}
```

### Pattern 2: API Gateway (FlexGate, Kong, Nginx, Traefik)

**Use Case**: Protect backend APIs with enterprise SSO

```javascript
// Middleware example (Node.js/Express)
const einstrust = {
  baseUrl: process.env.EINSTRUST_URL,
  tenantId: process.env.TENANT_ID
};

async function einstrustAuthMiddleware(req, res, next) {
  // 1. Check for session cookie
  const sessionToken = req.cookies.einstrust_session;
  
  if (!sessionToken) {
    // No session - redirect to SSO
    const initiateUrl = `${einstrust.baseUrl}/api/auth/saml/initiate`;
    const returnUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    
    return res.redirect(
      `${initiateUrl}?returnUrl=${encodeURIComponent(returnUrl)}&tenantId=${einstrust.tenantId}`
    );
  }
  
  // 2. Validate session
  try {
    const response = await fetch(`${einstrust.baseUrl}/api/auth/session`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` }
    });
    
    if (!response.ok) {
      throw new Error('Session invalid');
    }
    
    const { user } = await response.json();
    
    // 3. Add user context to request
    req.user = user;
    next();
  } catch (error) {
    // Session expired - redirect to login
    res.clearCookie('einstrust_session');
    return res.redirect('/login');
  }
}

// Apply to routes
app.use('/api/*', einstrustAuthMiddleware);
```

### Pattern 3: Mobile Backend (Node.js, Python, Go)

**Use Case**: Mobile app needs SSO via WebView

```javascript
// Express.js example
const express = require('express');
const app = express();

// Endpoint 1: Start SSO (mobile opens WebView)
app.get('/auth/mobile/saml/start', async (req, res) => {
  const { deviceId } = req.query;
  
  const response = await fetch('https://einstrust.example.com/api/auth/saml/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idpId: process.env.IDP_ID,
      returnUrl: `${process.env.BACKEND_URL}/auth/mobile/callback?deviceId=${deviceId}`,
      tenantId: 'mobile-app'
    })
  });
  
  const { redirectUrl } = await response.json();
  
  // Return redirect URL to mobile app
  res.json({ redirectUrl });
});

// Endpoint 2: Handle callback (after IdP auth)
app.post('/auth/mobile/callback', async (req, res) => {
  const { SAMLResponse } = req.body;
  const { deviceId } = req.query;
  
  const response = await fetch('https://einstrust.example.com/api/auth/saml/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ SAMLResponse })
  });
  
  const { accessToken, refreshToken, user } = await response.json();
  
  // Store tokens associated with deviceId (Redis recommended)
  await redis.set(`device:${deviceId}:accessToken`, accessToken, 'EX', 28800); // 8 hours
  await redis.set(`device:${deviceId}:refreshToken`, refreshToken, 'EX', 604800); // 7 days
  
  // Close WebView and return to app
  res.send(`
    <html>
      <script>
        window.close();  // Close WebView
        // Or use deep link: window.location = 'myapp://auth/success';
      </script>
      <body>Authentication successful. You can close this window.</body>
    </html>
  `);
});

// Endpoint 3: Get tokens for API calls
app.get('/auth/mobile/token', async (req, res) => {
  const { deviceId } = req.query;
  
  const accessToken = await redis.get(`device:${deviceId}:accessToken`);
  const refreshToken = await redis.get(`device:${deviceId}:refreshToken`);
  
  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  res.json({ accessToken, refreshToken });
});
```

### Pattern 4: Microservices (Service-to-Service)

**Use Case**: Microservice validates tokens from Einstrust

```javascript
// Token validation middleware
const jwt = require('jsonwebtoken');

async function validateEinstrustToken(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    // Option 1: Validate locally (faster, requires public key)
    const decoded = jwt.verify(token, process.env.EINSTRUST_PUBLIC_KEY);
    req.user = decoded;
    next();
    
  } catch (error) {
    // Option 2: Validate via Einstrust API (slower, always accurate)
    const response = await fetch('https://einstrust.example.com/api/auth/session', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    const { user } = await response.json();
    req.user = user;
    next();
  }
}

// Apply to routes
app.use('/api/orders', validateEinstrustToken, ordersRouter);
app.use('/api/payments', validateEinstrustToken, paymentsRouter);
```

## API Reference

### Authentication Endpoints

#### Initiate SAML SSO
```http
POST /api/auth/saml/initiate
Content-Type: application/json

{
  "idpId": "uuid",
  "returnUrl": "https://your-app.com/callback",
  "tenantId": "optional-tenant-id"
}

Response:
{
  "success": true,
  "redirectUrl": "https://idp.example.com/sso/saml?SAMLRequest=...",
  "requestId": "uuid"
}
```

#### Handle SAML Callback
```http
POST /api/auth/saml/callback
Content-Type: application/json

{
  "SAMLResponse": "base64-encoded-saml-assertion",
  "RelayState": "optional-relay-state"
}

Response:
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "roles": ["admin"]
  },
  "session": {
    "id": "uuid",
    "expiresAt": "2024-01-28T18:00:00Z"
  },
  "accessToken": "jwt-token",
  "refreshToken": "refresh-token",
  "returnUrl": "https://your-app.com/dashboard"
}
```

#### Validate Session
```http
GET /api/auth/session
Authorization: Bearer <accessToken>

Response:
{
  "valid": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe"
  },
  "sessions": [
    {
      "id": "uuid",
      "idp": "Okta Production",
      "expiresAt": "2024-01-28T18:00:00Z",
      "lastActivity": "2024-01-28T14:30:00Z"
    }
  ]
}
```

#### Logout
```http
POST /api/auth/logout
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "sessionId": "uuid",
  "samlLogout": true  // true = SAML SLO, false = local only
}

Response:
{
  "success": true,
  "redirectUrl": "https://idp.example.com/slo/saml?...",  // If SAML SLO
  "message": "Logged out successfully"
}
```

### Metadata Endpoint

#### Get SP Metadata
```http
GET /api/saml/metadata
GET /api/saml/metadata/:tenantId

Response: (XML)
<EntityDescriptor entityID="https://einstrust.example.com">
  <SPSSODescriptor>
    <AssertionConsumerService .../>
    ...
  </SPSSODescriptor>
</EntityDescriptor>
```

### Admin Endpoints

#### Register IdP
```http
POST /api/admin/idps
Authorization: Bearer <adminToken>
Content-Type: application/json

{
  "name": "Okta Production",
  "metadataUrl": "https://company.okta.com/app/exk.../metadata",
  "tenantId": "my-company",
  "attributeMapping": {
    "email": "email",
    "firstName": "firstName",
    "lastName": "lastName",
    "roles": "roles"
  },
  "allowedDomains": ["example.com"]
}

Response:
{
  "success": true,
  "idp": {
    "id": "uuid",
    "name": "Okta Production",
    "entityId": "http://www.okta.com/exk...",
    "enabled": true,
    "certificateExpiry": "2025-12-31T23:59:59Z"
  }
}
```

#### List IdPs
```http
GET /api/admin/idps?tenantId=my-company&enabled=true
Authorization: Bearer <adminToken>

Response:
{
  "success": true,
  "count": 2,
  "idps": [...]
}
```

## Language-Specific Examples

### Python (Flask/FastAPI)

```python
import requests
from flask import Flask, redirect, request, session

app = Flask(__name__)
EINSTRUST_URL = "https://einstrust.example.com"

@app.route('/login')
def login():
    # Initiate SAML SSO
    response = requests.post(f"{EINSTRUST_URL}/api/auth/saml/initiate", json={
        "idpId": "your-idp-id",
        "returnUrl": f"{request.host_url}callback"
    })
    
    data = response.json()
    return redirect(data['redirectUrl'])

@app.route('/callback', methods=['POST'])
def callback():
    # Handle SAML callback
    saml_response = request.form.get('SAMLResponse')
    
    response = requests.post(f"{EINSTRUST_URL}/api/auth/saml/callback", json={
        "SAMLResponse": saml_response
    })
    
    data = response.json()
    session['access_token'] = data['accessToken']
    session['user'] = data['user']
    
    return redirect('/dashboard')

@app.route('/api/protected')
def protected():
    # Validate token
    token = session.get('access_token')
    
    response = requests.get(
        f"{EINSTRUST_URL}/api/auth/session",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    if response.status_code != 200:
        return {"error": "Unauthorized"}, 401
    
    return {"data": "Protected resource"}
```

### Java (Spring Boot)

```java
@RestController
public class AuthController {
    
    @Value("${einstrust.url}")
    private String einstrustUrl;
    
    @GetMapping("/login")
    public ResponseEntity<?> login() {
        RestTemplate restTemplate = new RestTemplate();
        
        Map<String, String> request = new HashMap<>();
        request.put("idpId", "your-idp-id");
        request.put("returnUrl", "http://localhost:8080/callback");
        
        ResponseEntity<Map> response = restTemplate.postForEntity(
            einstrustUrl + "/api/auth/saml/initiate",
            request,
            Map.class
        );
        
        String redirectUrl = (String) response.getBody().get("redirectUrl");
        return ResponseEntity.status(302).header("Location", redirectUrl).build();
    }
    
    @PostMapping("/callback")
    public ResponseEntity<?> callback(@RequestParam String SAMLResponse) {
        RestTemplate restTemplate = new RestTemplate();
        
        Map<String, String> request = new HashMap<>();
        request.put("SAMLResponse", SAMLResponse);
        
        ResponseEntity<Map> response = restTemplate.postForEntity(
            einstrustUrl + "/api/auth/saml/callback",
            request,
            Map.class
        );
        
        // Store tokens in session
        return ResponseEntity.ok(response.getBody());
    }
}
```

## Security Best Practices

1. **Always use HTTPS** in production
2. **Validate SSL certificates** when calling Einstrust APIs
3. **Store tokens securely** (httpOnly cookies for web, secure storage for mobile)
4. **Implement token refresh** before expiration
5. **Use short-lived access tokens** (15 minutes recommended)
6. **Enable CORS properly** for your domains only
7. **Rate limit** authentication endpoints
8. **Monitor** for suspicious authentication patterns

## Troubleshooting

### Issue: "IdP not found"
- Verify IdP is registered in Einstrust admin
- Check IdP is enabled
- Ensure correct `idpId` in request

### Issue: "Certificate expired"
- Refresh IdP metadata: `POST /api/admin/idps/:id/refresh-metadata`
- Check certificate expiry date
- Contact IdP administrator

### Issue: "Domain not allowed"
- Check `allowedDomains` configuration for IdP
- Update allowed domains: `PUT /api/admin/idps/:id`

### Issue: "Session expired"
- Implement token refresh logic
- Check session timeout settings
- Verify system clocks are synchronized

## Support

- Documentation: https://github.com/tapas100/einstrust/docs
- Issues: https://github.com/tapas100/einstrust/issues
- Email: support@einstrust.example.com

## License

See LICENSE file in repository.
