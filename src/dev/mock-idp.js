const express = require('express');
const crypto = require('crypto');

/**
 * Create a Mock SAML IdP for testing (No Docker Required)
 * 
 * This is a simplified SAML Identity Provider for development and testing.
 * DO NOT use in production - use real IdP services (Okta, Azure AD, etc.)
 */
function createMockIdP(port = 7000, options = {}) {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  const ENTITY_ID = options.entityId || `http://localhost:${port}`;
  const SSO_URL = `http://localhost:${port}/sso`;
  const SLO_URL = `http://localhost:${port}/slo`;
  const CALLBACK_URL = options.callbackUrl || 'http://localhost:3000/api/auth/saml/callback';

  // Mock certificate (for testing only)
  const MOCK_CERT = `MIIDXTCCAkWgAwIBAgIJAKL0UG+mRKU7MA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQwHhcNMjQwMTAxMDAwMDAwWhcNMjUxMjMxMjM1OTU5WjBF
MQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50
ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB
CgKCAQEAw7Wa`;

  console.log('\n🔐 Mock SAML IdP Server');
  console.log('========================\n');

  // Home page
  app.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Mock SAML IdP</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            h1 { color: #333; }
            .endpoint { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }
            code { background: #e8e8e8; padding: 2px 6px; border-radius: 3px; }
            .success { color: #28a745; }
            .warning { color: #ffc107; background: #fff3cd; padding: 10px; border-left: 4px solid #ffc107; }
          </style>
        </head>
        <body>
          <h1>🔐 Mock SAML Identity Provider</h1>
          <div class="warning">
            ⚠️ <strong>Development Only</strong> - Do not use in production
          </div>
          
          <h2>Endpoints</h2>
          
          <div class="endpoint">
            <h3>Metadata</h3>
            <p><code>GET /metadata</code></p>
            <p><a href="/metadata" target="_blank">View Metadata XML</a></p>
          </div>

          <div class="endpoint">
            <h3>Single Sign-On (SSO)</h3>
            <p><code>GET /sso</code></p>
            <p>Login endpoint for SAML authentication</p>
          </div>

          <div class="endpoint">
            <h3>Single Logout (SLO)</h3>
            <p><code>POST /slo</code></p>
            <p>Logout endpoint</p>
          </div>

          <h2>Configuration</h2>
          <div class="endpoint">
            <p><strong>Entity ID:</strong> <code>${ENTITY_ID}</code></p>
            <p><strong>SSO URL:</strong> <code>${SSO_URL}</code></p>
            <p><strong>SLO URL:</strong> <code>${SLO_URL}</code></p>
            <p><strong>Callback URL:</strong> <code>${CALLBACK_URL}</code></p>
          </div>

          <h2>Test Users</h2>
          <div class="endpoint">
            <p>Any email works - this is a mock IdP for testing</p>
            <ul>
              <li>Email: <code>test@example.com</code></li>
              <li>Email: <code>admin@example.com</code></li>
              <li>Email: <code>user@example.com</code></li>
            </ul>
          </div>

          <h2>Quick Start</h2>
          <div class="endpoint">
            <pre>
# 1. Configure Einstrust
curl -X POST http://localhost:3000/api/admin/idps \\
  -H "Authorization: Bearer &lt;admin-token&gt;" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Mock IdP",
    "metadataUrl": "http://localhost:${port}/metadata"
  }'

# 2. Initiate SSO
curl -X POST http://localhost:3000/api/auth/saml/initiate \\
  -H "Content-Type: application/json" \\
  -d '{
    "idpId": "&lt;idp-id&gt;",
    "returnUrl": "http://localhost:3000/callback"
  }'
            </pre>
          </div>
        </body>
      </html>
    `);
  });

  // Metadata endpoint
  app.get('/metadata', (req, res) => {
    const currentYear = new Date().getFullYear();
    const expiryYear = currentYear + 1;

    const metadata = `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" 
                  xmlns:ds="http://www.w3.org/2000/09/xmldsig#" 
                  entityID="${ENTITY_ID}">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <ds:KeyInfo>
        <ds:X509Data>
          <ds:X509Certificate>${MOCK_CERT}</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </KeyDescriptor>
    <SingleLogoutService 
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" 
      Location="${SLO_URL}"/>
    <SingleSignOnService 
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" 
      Location="${SSO_URL}"/>
    <SingleSignOnService 
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" 
      Location="${SSO_URL}"/>
  </IDPSSODescriptor>
</EntityDescriptor>`;
    
    res.set('Content-Type', 'application/xml');
    res.send(metadata);
  });

  // SSO endpoint - Show login form
  app.get('/sso', (req, res) => {
    const { SAMLRequest, RelayState } = req.query;

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Mock IdP - Login</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 500px; margin: 100px auto; padding: 20px; }
            h2 { color: #333; text-align: center; }
            form { background: #f9f9f9; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            label { display: block; margin: 15px 0 5px; font-weight: bold; color: #555; }
            input[type="text"], input[type="email"] { 
              width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;
            }
            button { 
              width: 100%; padding: 12px; background: #007bff; color: white; border: none; 
              border-radius: 4px; font-size: 16px; cursor: pointer; margin-top: 20px;
            }
            button:hover { background: #0056b3; }
            .info { background: #e7f3ff; padding: 10px; border-left: 4px solid #007bff; margin-bottom: 20px; }
            .roles { display: flex; gap: 10px; margin-top: 5px; }
            .roles label { display: inline; font-weight: normal; }
          </style>
        </head>
        <body>
          <h2>🔐 Mock SAML IdP</h2>
          <div class="info">
            <strong>Development Testing</strong><br/>
            Enter any email - no password required
          </div>
          <form action="/authenticate" method="POST">
            <input type="hidden" name="SAMLRequest" value="${SAMLRequest || ''}" />
            <input type="hidden" name="RelayState" value="${RelayState || ''}" />
            
            <label>Email Address</label>
            <input type="email" name="email" value="test@example.com" required />
            
            <label>First Name</label>
            <input type="text" name="firstName" value="Test" required />
            
            <label>Last Name</label>
            <input type="text" name="lastName" value="User" required />
            
            <label>Roles (optional)</label>
            <div class="roles">
              <label><input type="checkbox" name="roles" value="admin" /> Admin</label>
              <label><input type="checkbox" name="roles" value="user" checked /> User</label>
            </div>
            
            <button type="submit">🔑 Sign In</button>
          </form>
        </body>
      </html>
    `);
  });

  // POST SSO for direct submissions
  app.post('/sso', (req, res) => {
    res.redirect(`/sso?${new URLSearchParams(req.body).toString()}`);
  });

  // Authentication handler
  app.post('/authenticate', (req, res) => {
    const { email, firstName, lastName, RelayState } = req.body;
    let roles = req.body.roles || [];
    if (typeof roles === 'string') roles = [roles];

    // Generate IDs
    const assertionId = `_${crypto.randomBytes(16).toString('hex')}`;
    const sessionIndex = `_${crypto.randomBytes(16).toString('hex')}`;
    const issueInstant = new Date().toISOString();
    const notBefore = new Date().toISOString();
    const notOnOrAfter = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    // Create mock SAML response (simplified - not signed)
    const samlResponseXml = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" 
                xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" 
                ID="_${crypto.randomBytes(16).toString('hex')}" 
                Version="2.0" 
                IssueInstant="${issueInstant}">
  <saml:Issuer>${ENTITY_ID}</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
  </samlp:Status>
  <saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" 
                  ID="${assertionId}" 
                  Version="2.0" 
                  IssueInstant="${issueInstant}">
    <saml:Issuer>${ENTITY_ID}</saml:Issuer>
    <saml:Subject>
      <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${email}</saml:NameID>
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml:SubjectConfirmationData NotOnOrAfter="${notOnOrAfter}" 
                                     Recipient="${CALLBACK_URL}"/>
      </saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}">
      <saml:AudienceRestriction>
        <saml:Audience>http://localhost:3000/saml/metadata</saml:Audience>
      </saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AuthnStatement AuthnInstant="${issueInstant}" SessionIndex="${sessionIndex}">
      <saml:AuthnContext>
        <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef>
      </saml:AuthnContext>
    </saml:AuthnStatement>
    <saml:AttributeStatement>
      <saml:Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress">
        <saml:AttributeValue>${email}</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname">
        <saml:AttributeValue>${firstName}</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname">
        <saml:AttributeValue>${lastName}</saml:AttributeValue>
      </saml:Attribute>
      ${roles.length > 0 ? `
      <saml:Attribute Name="http://schemas.microsoft.com/ws/2008/06/identity/claims/role">
        ${roles.map(role => `<saml:AttributeValue>${role}</saml:AttributeValue>`).join('\n        ')}
      </saml:Attribute>
      ` : ''}
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`;

    // Base64 encode the SAML response
    const samlResponse = Buffer.from(samlResponseXml).toString('base64');

    // Auto-submit form to Einstrust callback
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Redirecting...</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 100px; }
            .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #007bff; 
                       border-radius: 50%; width: 40px; height: 40px; 
                       animation: spin 1s linear infinite; margin: 20px auto; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </head>
        <body onload="document.forms[0].submit()">
          <h2>Authentication Successful</h2>
          <div class="spinner"></div>
          <p>Redirecting to Einstrust...</p>
          <form method="POST" action="${CALLBACK_URL}">
            <input type="hidden" name="SAMLResponse" value="${samlResponse}" />
            ${RelayState ? `<input type="hidden" name="RelayState" value="${RelayState}" />` : ''}
            <noscript>
              <p>JavaScript is disabled. Click the button below to continue.</p>
              <button type="submit">Continue to Application</button>
            </noscript>
          </form>
        </body>
      </html>
    `);
  });

  // Single Logout endpoint
  app.post('/slo', (req, res) => {
    const { LogoutRequest, RelayState } = req.body;

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Logged Out</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 100px; }
            .success { color: #28a745; font-size: 24px; }
          </style>
        </head>
        <body>
          <div class="success">✅ Successfully Logged Out</div>
          <p>You have been logged out from the Mock IdP</p>
        </body>
      </html>
    `);
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      service: 'mock-saml-idp',
      entityId: ENTITY_ID 
    });
  });

  app.listen(port, () => {
    console.log(`✅ Server Status: Running`);
    console.log(`🌐 Base URL: http://localhost:${port}`);
    console.log(`📄 Metadata: http://localhost:${port}/metadata`);
    console.log(`🔑 SSO URL: http://localhost:${port}/sso`);
    console.log(`🚪 SLO URL: http://localhost:${port}/slo\n`);
    console.log(`💡 Tip: Configure Einstrust with metadata URL above\n`);
  });

  return app;
}

module.exports = createMockIdP;

// Run standalone
if (require.main === module) {
  const port = process.env.MOCK_IDP_PORT || 7000;
  const options = {
    callbackUrl: process.env.CALLBACK_URL || 'http://localhost:3000/api/auth/saml/callback'
  };
  
  createMockIdP(port, options);
}
