# SAML Testing Setup (No Docker Required)

## Overview

This guide provides **Docker-free** alternatives for testing SAML integration with Einstrust.

## Option 1: Cloud-Based IdP Services (Recommended)

### 1.1 Okta Developer Account (FREE)

**Best for**: Production-like testing, real SAML flows

**Setup Steps**:

1. **Sign Up** (Free forever for developers)
   ```bash
   # Visit: https://developer.okta.com/signup/
   # Create free developer account
   # Account URL: https://dev-<random>.okta.com
   ```

2. **Create SAML App**
   - Login to Okta admin dashboard
   - Applications → Create App Integration
   - Select "SAML 2.0"
   - Configure:
     ```
     App name: Einstrust Test
     Single sign on URL: http://localhost:3000/api/auth/saml/callback
     Audience URI: http://localhost:3000/saml/metadata
     Name ID format: EmailAddress
     Application username: Email
     ```

3. **Download Metadata**
   - Go to Sign On tab
   - Right-click "Identity Provider metadata" → Copy link
   - Save URL for Einstrust configuration

4. **Create Test User**
   - Directory → People → Add Person
   - Email: test@example.com
   - Assign to SAML app

5. **Configure Einstrust**
   ```bash
   curl -X POST http://localhost:3000/api/admin/idps \
     -H "Authorization: Bearer <admin-token>" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Okta Dev",
       "metadataUrl": "https://dev-<random>.okta.com/app/<app-id>/sso/saml/metadata"
     }'
   ```

6. **Test SSO**
   ```bash
   # Get IdP ID from response above
   curl -X POST http://localhost:3000/api/auth/saml/initiate \
     -H "Content-Type: application/json" \
     -d '{
       "idpId": "<idp-id>",
       "returnUrl": "http://localhost:3000/callback"
     }'
   
   # Open redirectUrl in browser
   # Login with test user credentials
   ```

### 1.2 Auth0 (FREE tier available)

**Setup Steps**:

1. **Sign Up**
   - Visit: https://auth0.com/signup
   - Create free account

2. **Create SAML Application**
   - Applications → Create Application
   - Regular Web Application
   - Settings → Addons → Enable SAML2 Web App
   - Configure callback URL: `http://localhost:3000/api/auth/saml/callback`

3. **Download Metadata**
   - Usage tab → Download SAML Metadata

4. **Configure Einstrust**
   ```bash
   curl -X POST http://localhost:3000/api/admin/idps \
     -H "Authorization: Bearer <admin-token>" \
     -H "Content-Type: application/json" \
     --data-binary @metadata.xml
   ```

### 1.3 Azure AD (FREE with Microsoft account)

**Setup Steps**:

1. **Sign Up**
   - Visit: https://portal.azure.com
   - Create free Azure account

2. **Create Enterprise Application**
   - Azure Active Directory → Enterprise applications
   - New application → Create your own application
   - Select "Integrate any other application you don't find in the gallery (Non-gallery)"

3. **Configure SAML**
   - Single sign-on → SAML
   - Basic SAML Configuration:
     - Identifier: `http://localhost:3000/saml/metadata`
     - Reply URL: `http://localhost:3000/api/auth/saml/callback`

4. **Download Metadata**
   - SAML Signing Certificate → Federation Metadata XML → Download

5. **Create Test User**
   - Users and groups → Add user

## Option 2: SAML Test IdP Services (FREE, No Signup)

### 2.1 SAMLtest.id (FREE, Open Source)

**Best for**: Quick testing, no account needed

```bash
# 1. Upload SP Metadata
# Visit: https://samltest.id/upload.php
# Upload your SP metadata from: http://localhost:3000/api/saml/metadata

# 2. Note the IdP metadata URL
METADATA_URL="https://samltest.id/saml/idp"

# 3. Configure Einstrust
curl -X POST http://localhost:3000/api/admin/idps \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SAMLtest.id",
    "metadataUrl": "'$METADATA_URL'"
  }'

# 4. Test SSO - Use any email address (no password needed)
```

### 2.2 MockSAML.com (FREE)

**Best for**: Automated testing

```bash
# Visit: https://mocksaml.com
# Follow setup instructions
# Configure Einstrust with provided metadata
```

## Option 3: Local Mock IdP (Node.js)

### 3.1 Simple SAML Test IdP (No Docker)

**Install & Run**:

```bash
# 1. Clone test IdP
git clone https://github.com/mcguinness/saml-idp.git
cd saml-idp

# 2. Install dependencies
npm install

# 3. Configure for Einstrust
cat > config.json <<EOF
{
  "port": 7000,
  "cert": "./idp-public-cert.pem",
  "key": "./idp-private-key.pem",
  "issuer": "http://localhost:7000",
  "serviceProviders": {
    "einstrust": {
      "assertEndpoint": "http://localhost:3000/api/auth/saml/callback"
    }
  }
}
EOF

# 4. Generate certificates
openssl req -x509 -new -newkey rsa:2048 -nodes \
  -subj '/C=US/ST=CA/L=SF/O=Test/CN=localhost' \
  -keyout idp-private-key.pem \
  -out idp-public-cert.pem \
  -days 365

# 5. Start IdP
npm start

# IdP running at: http://localhost:7000
# Metadata: http://localhost:7000/metadata
```

**Configure Einstrust**:

```bash
curl -X POST http://localhost:3000/api/admin/idps \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Local Test IdP",
    "metadataUrl": "http://localhost:7000/metadata"
  }'
```

### 3.2 Create Custom Mock IdP (Minimal)

**File**: `tests/mock-idp-server.js`

```javascript
const express = require('express');
const saml = require('samlify');

const app = express();
const PORT = 7000;

// Create IdP
const idp = saml.IdentityProvider({
  entityID: 'http://localhost:7000',
  singleSignOnService: [{
    Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
    Location: 'http://localhost:7000/sso'
  }],
  wantAuthnRequestsSigned: false
});

// Metadata endpoint
app.get('/metadata', (req, res) => {
  res.set('Content-Type', 'text/xml');
  res.send(idp.getMetadata());
});

// SSO endpoint
app.get('/sso', (req, res) => {
  // Auto-authenticate for testing
  const user = {
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User'
  };

  // Create SAML response (simplified)
  res.send(`
    <html>
      <body onload="document.forms[0].submit()">
        <form method="POST" action="http://localhost:3000/api/auth/saml/callback">
          <input type="hidden" name="SAMLResponse" value="base64-saml-response" />
          <noscript><button type="submit">Continue</button></noscript>
        </form>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Mock IdP running at http://localhost:${PORT}`);
  console.log(`Metadata: http://localhost:${PORT}/metadata`);
});
```

**Run**:

```bash
node tests/mock-idp-server.js
```

## Option 4: Manual Testing with SAML Tools

### 4.1 SAML-tracer (Browser Extension)

**Install**:
- Firefox: https://addons.mozilla.org/en-US/firefox/addon/saml-tracer/
- Chrome: https://chrome.google.com/webstore (search "SAML-tracer")

**Usage**:
1. Open SAML-tracer
2. Initiate SSO flow
3. Inspect SAML requests/responses
4. Debug assertion issues

### 4.2 SAML Developer Tools

**Online Tools**:
- SAML Decoder: https://www.samltool.com/decode.php
- SAML Encoder: https://www.samltool.com/encode.php
- SAML Metadata Generator: https://www.samltool.com/sp_metadata.php

## Option 5: Einstrust Built-in Mock IdP

### 5.1 Development Mock IdP

**File**: `src/dev/mock-idp.js`

```javascript
const express = require('express');
const crypto = require('crypto');

function createMockIdP(port = 7000) {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  const ENTITY_ID = `http://localhost:${port}`;
  const SSO_URL = `http://localhost:${port}/sso`;

  // Metadata endpoint
  app.get('/metadata', (req, res) => {
    const metadata = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${ENTITY_ID}">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <SingleSignOnService 
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" 
      Location="${SSO_URL}"/>
    <KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>MockCertificate</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </KeyDescriptor>
  </IDPSSODescriptor>
</EntityDescriptor>`;
    
    res.set('Content-Type', 'application/xml');
    res.send(metadata);
  });

  // Login page
  app.get('/sso', (req, res) => {
    res.send(`
      <html>
        <body>
          <h2>Mock SAML IdP - Login</h2>
          <form action="/authenticate" method="POST">
            <input type="hidden" name="SAMLRequest" value="${req.query.SAMLRequest || ''}" />
            <input type="hidden" name="RelayState" value="${req.query.RelayState || ''}" />
            <label>Email: <input type="email" name="email" value="test@example.com" /></label><br/>
            <label>First Name: <input type="text" name="firstName" value="Test" /></label><br/>
            <label>Last Name: <input type="text" name="lastName" value="User" /></label><br/>
            <button type="submit">Login</button>
          </form>
        </body>
      </html>
    `);
  });

  // Authentication handler
  app.post('/authenticate', (req, res) => {
    const { email, firstName, lastName, RelayState } = req.body;

    // Create mock SAML response
    const assertionId = crypto.randomBytes(16).toString('hex');
    const sessionIndex = crypto.randomBytes(16).toString('hex');
    
    const samlResponse = Buffer.from(`
      <samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
        <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${ENTITY_ID}</saml:Issuer>
        <saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${assertionId}">
          <saml:Subject>
            <saml:NameID>${email}</saml:NameID>
          </saml:Subject>
          <saml:AuthnStatement SessionIndex="${sessionIndex}">
            <saml:AuthnContext>
              <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef>
            </saml:AuthnContext>
          </saml:AuthnStatement>
          <saml:AttributeStatement>
            <saml:Attribute Name="email"><saml:AttributeValue>${email}</saml:AttributeValue></saml:Attribute>
            <saml:Attribute Name="firstName"><saml:AttributeValue>${firstName}</saml:AttributeValue></saml:Attribute>
            <saml:Attribute Name="lastName"><saml:AttributeValue>${lastName}</saml:AttributeValue></saml:Attribute>
          </saml:AttributeStatement>
        </saml:Assertion>
      </samlp:Response>
    `).toString('base64');

    // Auto-submit form to Einstrust callback
    res.send(`
      <html>
        <body onload="document.forms[0].submit()">
          <form method="POST" action="http://localhost:3000/api/auth/saml/callback">
            <input type="hidden" name="SAMLResponse" value="${samlResponse}" />
            <input type="hidden" name="RelayState" value="${RelayState || ''}" />
            <noscript><button type="submit">Continue</button></noscript>
          </form>
          <p>Redirecting...</p>
        </body>
      </html>
    `);
  });

  app.listen(port, () => {
    console.log(`\n🔐 Mock SAML IdP running at http://localhost:${port}`);
    console.log(`📄 Metadata: http://localhost:${port}/metadata`);
    console.log(`🔑 SSO URL: http://localhost:${port}/sso\n`);
  });

  return app;
}

module.exports = createMockIdP;

// Run standalone
if (require.main === module) {
  createMockIdP(7000);
}
```

**Usage**:

```bash
# Start mock IdP
node src/dev/mock-idp.js

# Configure Einstrust
curl -X POST http://localhost:3000/api/admin/idps \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mock IdP",
    "metadataUrl": "http://localhost:7000/metadata"
  }'

# Test SSO
curl -X POST http://localhost:3000/api/auth/saml/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "idpId": "<idp-id>",
    "returnUrl": "http://localhost:3000/callback"
  }'
```

## Comparison Matrix

| Option | Setup Time | Realism | Cost | Best For |
|--------|-----------|---------|------|----------|
| **Okta Dev** | 10 min | ⭐⭐⭐⭐⭐ | FREE | Production-like testing |
| **Auth0** | 10 min | ⭐⭐⭐⭐ | FREE tier | Quick testing |
| **Azure AD** | 15 min | ⭐⭐⭐⭐⭐ | FREE | Enterprise testing |
| **SAMLtest.id** | 5 min | ⭐⭐⭐ | FREE | Quick validation |
| **Local Node.js Mock** | 5 min | ⭐⭐ | FREE | Offline testing |
| **Built-in Mock** | 2 min | ⭐⭐ | FREE | Development |

## Recommended Testing Flow

1. **Development**: Use built-in mock IdP
2. **Integration Testing**: Use SAMLtest.id or local Node.js mock
3. **Pre-Production**: Use Okta Dev or Azure AD
4. **Production**: Real enterprise IdP (Okta, Azure AD, OneLogin, etc.)

## Troubleshooting

### Issue: "Certificate validation failed"
**Solution**: Use mock IdP for testing (no real certificate needed)

### Issue: "Assertion replay detected"
**Solution**: Clear SAML sessions: `db.saml_sessions.deleteMany({})`

### Issue: "Domain not allowed"
**Solution**: Update IdP configuration to allow test domain

### Issue: "IdP metadata fetch failed"
**Solution**: Check IdP is running and metadata URL is accessible

## Next Steps

1. Choose testing approach above
2. Configure IdP
3. Run tests: `npm test`
4. Validate SSO flow end-to-end

## Resources

- SAML 2.0 Spec: https://docs.oasis-open.org/security/saml/v2.0/
- Okta SAML Guide: https://developer.okta.com/docs/guides/saml-application-setup/
- SAML Debugging: https://www.samltool.com/
