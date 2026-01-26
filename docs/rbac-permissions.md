# 📊 RBAC Permissions Matrix

## Overview

This document defines the complete permission matrix for Role-Based Access Control (RBAC) in the Secure Auth Platform.

---

## Permission Categories

### 1. User Management
- `manage:users` - Create, update, delete user accounts
- `view:users` - View user profiles and lists
- `manage:roles` - Assign and revoke roles
- `view:roles` - View role assignments

### 2. Content Management
- `publish:content` - Publish new content
- `edit:content` - Edit any content
- `delete:content` - Delete any content
- `read:content` - View content
- `edit:own` - Edit own content only
- `delete:own` - Delete own content only

### 3. System Management
- `manage:system` - System configuration
- `manage:settings` - Application settings
- `view:analytics` - View system analytics
- `view:audit_logs` - Access audit logs
- `manage:oauth` - Configure OAuth providers

### 4. Security Operations
- `manage:security` - Security configuration
- `revoke:tokens` - Revoke user tokens
- `view:security_logs` - View security events
- `manage:rate_limits` - Configure rate limits

---

## Complete Permission Matrix

| Permission            | Admin | Moderator | Editor | User | Guest | Description |
|----------------------|-------|-----------|--------|------|-------|-------------|
| **User Management** |
| `manage:users`       | ✅    | ✅        | ❌     | ❌   | ❌    | Create, update, delete users |
| `view:users`         | ✅    | ✅        | ❌     | ❌   | ❌    | View user profiles |
| `manage:roles`       | ✅    | ❌        | ❌     | ❌   | ❌    | Assign/revoke roles |
| `view:roles`         | ✅    | ✅        | ❌     | ❌   | ❌    | View role assignments |
| **Content Management** |
| `publish:content`    | ✅    | ❌        | ✅     | ❌   | ❌    | Publish new content |
| `edit:content`       | ✅    | ✅        | ✅     | ❌   | ❌    | Edit any content |
| `delete:content`     | ✅    | ✅        | ❌     | ❌   | ❌    | Delete any content |
| `read:content`       | ✅    | ✅        | ✅     | ✅   | ✅    | View content |
| `edit:own`           | ✅    | ✅        | ✅     | ✅   | ❌    | Edit own content |
| `delete:own`         | ✅    | ✅        | ✅     | ✅   | ❌    | Delete own content |
| **System Management** |
| `manage:system`      | ✅    | ❌        | ❌     | ❌   | ❌    | System configuration |
| `manage:settings`    | ✅    | ❌        | ❌     | ❌   | ❌    | App settings |
| `view:analytics`     | ✅    | ✅        | ❌     | ❌   | ❌    | View analytics |
| `view:audit_logs`    | ✅    | ✅        | ❌     | ❌   | ❌    | Access audit logs |
| `manage:oauth`       | ✅    | ❌        | ❌     | ❌   | ❌    | Configure OAuth |
| **Security Operations** |
| `manage:security`    | ✅    | ❌        | ❌     | ❌   | ❌    | Security config |
| `revoke:tokens`      | ✅    | ✅        | ❌     | ❌   | ❌    | Revoke tokens |
| `view:security_logs` | ✅    | ✅        | ❌     | ❌   | ❌    | View security events |
| `manage:rate_limits` | ✅    | ❌        | ❌     | ❌   | ❌    | Configure rate limits |

---

## Role Descriptions

### 🔴 Admin
**Full system access** - Can perform all operations

**Use Cases:**
- System administrators
- DevOps engineers
- First user (automatically assigned)

**Permissions:** All permissions

**Risk Level:** Critical - Requires strong authentication

---

### 🟠 Moderator
**Content management + user moderation**

**Use Cases:**
- Community managers
- Content moderators
- Customer support leads

**Permissions:**
- Manage users (view, edit, suspend)
- Edit and delete content
- View analytics and audit logs
- Revoke user tokens

**Risk Level:** High - Can impact users

---

### 🟡 Editor
**Content creation and editing**

**Use Cases:**
- Content creators
- Blog authors
- Editorial staff

**Permissions:**
- Publish new content
- Edit any content
- Read all content
- Edit/delete own content

**Risk Level:** Medium - Limited to content

---

### 🟢 User
**Basic authenticated access**

**Use Cases:**
- Regular users
- Default role for new registrations

**Permissions:**
- Read content
- Edit own content
- Delete own content

**Risk Level:** Low - Self-service only

---

### ⚪ Guest
**Read-only access**

**Use Cases:**
- Anonymous users
- Public API access
- Preview mode

**Permissions:**
- Read public content only

**Risk Level:** Minimal - No write access

---

## Permission Enforcement

### Middleware-Based Authorization

```javascript
// Check single permission
app.get('/api/v1/users', 
  auth,  // Authentication first
  requirePermission('view:users'),  // Then authorization
  getUsersController
);

// Check multiple permissions (OR logic)
app.delete('/api/v1/content/:id',
  auth,
  requireAnyPermission(['delete:content', 'delete:own']),
  deleteContentController
);

// Check role directly
app.post('/api/v1/system/config',
  auth,
  requireRole('admin'),
  updateSystemConfigController
);
```

### Resource-Based Authorization

```javascript
// Check ownership for 'own' permissions
app.put('/api/v1/users/:id',
  auth,
  async (req, res, next) => {
    const user = req.user;
    const targetUserId = req.params.id;
    
    // Admins can edit any user
    if (user.hasPermission('manage:users')) {
      return next();
    }
    
    // Users can edit themselves
    if (user._id.toString() === targetUserId && user.hasPermission('edit:own')) {
      return next();
    }
    
    return res.status(403).json({ error: 'Insufficient permissions' });
  },
  updateUserController
);
```

---

## Adding Custom Permissions

### Step 1: Define Permission

```javascript
// src/lib/roles/index.js

export const PERMISSIONS = {
  [ROLES.ADMIN]: [
    // ...existing permissions
    'export:data',  // NEW PERMISSION
  ],
  // ...
};
```

### Step 2: Create Middleware

```javascript
// src/middleware/rbac.js

export const requireDataExport = requirePermission('export:data');
```

### Step 3: Apply to Route

```javascript
// src/routes/data.js

router.get('/export', 
  auth, 
  requireDataExport, 
  exportDataController
);
```

---

## Attribute-Based Access Control (ABAC)

For more complex authorization scenarios beyond roles:

### Example: Time-Based Access

```javascript
function requireBusinessHours(req, res, next) {
  const hour = new Date().getHours();
  const isBusinessHours = hour >= 9 && hour < 17;
  
  if (!isBusinessHours && !req.user.hasRole('admin')) {
    return res.status(403).json({ 
      error: 'This operation is only allowed during business hours (9 AM - 5 PM)'
    });
  }
  
  next();
}
```

### Example: Location-Based Access

```javascript
function requireLocation(allowedCountries) {
  return async (req, res, next) => {
    const userCountry = await getCountryFromIP(req.ip);
    
    if (!allowedCountries.includes(userCountry) && !req.user.hasRole('admin')) {
      return res.status(403).json({ 
        error: 'This operation is not available in your region'
      });
    }
    
    next();
  };
}

// Usage
router.post('/restricted-operation', 
  auth, 
  requireLocation(['US', 'CA', 'GB']), 
  operationController
);
```

### Example: Resource Ownership

```javascript
async function requireOwnership(resourceType) {
  return async (req, res, next) => {
    const resourceId = req.params.id;
    const userId = req.user._id;
    
    // Admins bypass ownership check
    if (req.user.hasRole('admin')) {
      return next();
    }
    
    const resource = await getResource(resourceType, resourceId);
    
    if (resource.ownerId.toString() !== userId.toString()) {
      return res.status(403).json({ 
        error: 'You can only access your own resources'
      });
    }
    
    next();
  };
}
```

---

## Testing Permissions

### Unit Tests

```javascript
describe('RBAC Permissions', () => {
  test('Admin has all permissions', () => {
    const user = createUser({ roles: ['admin'] });
    expect(user.hasPermission('manage:users')).toBe(true);
    expect(user.hasPermission('manage:system')).toBe(true);
  });
  
  test('User cannot manage other users', () => {
    const user = createUser({ roles: ['user'] });
    expect(user.hasPermission('manage:users')).toBe(false);
  });
  
  test('Editor can publish content', () => {
    const user = createUser({ roles: ['editor'] });
    expect(user.hasPermission('publish:content')).toBe(true);
    expect(user.hasPermission('delete:content')).toBe(false);
  });
});
```

### Integration Tests

```javascript
describe('Permission Enforcement', () => {
  test('User cannot access admin endpoint', async () => {
    const token = await createUserToken({ roles: ['user'] });
    
    const response = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(403);
    expect(response.body.error).toContain('Insufficient permissions');
  });
  
  test('Admin can access all endpoints', async () => {
    const token = await createUserToken({ roles: ['admin'] });
    
    const response = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(200);
  });
});
```

---

## Security Best Practices

### ✅ DO
- **Principle of Least Privilege** - Give minimum permissions needed
- **Explicit Denials** - Default to deny, explicitly allow
- **Middleware Enforcement** - Check permissions before controller logic
- **Audit All Changes** - Log role and permission changes
- **Regular Reviews** - Audit user permissions quarterly
- **Separation of Duties** - No single user should have all critical permissions

### ❌ DON'T
- **Hardcode Checks** - Use middleware, not inline permission checks
- **Trust Client** - Always validate permissions server-side
- **Overload Roles** - Keep roles focused and specific
- **Skip Logging** - Always audit permission denials
- **Expose Admin APIs** - Keep admin endpoints on separate routes

---

## Migration Guide

### Adding New Role

1. Define role in `src/lib/roles/index.js`
2. Define permissions for role
3. Update hierarchy if needed
4. Create migration script for existing users
5. Update documentation
6. Add tests

### Changing Permissions

1. Update permission matrix
2. Run impact analysis (who loses access?)
3. Notify affected users
4. Deploy during maintenance window
5. Monitor audit logs for permission denials

---

## Role Hierarchy

```
admin (Level 5)
  ├── All permissions
  └── Can manage all roles

moderator (Level 4)
  ├── User management
  ├── Content moderation
  └── Cannot manage roles

editor (Level 3)
  ├── Content management
  └── Cannot manage users

user (Level 2)
  ├── Basic access
  └── Self-service only

guest (Level 1)
  └── Read-only
```

**Hierarchy Rules:**
- Higher roles can perform all actions of lower roles
- Higher roles can manage lower roles (but not same or higher)
- Admin is the only role that can manage itself

---

**Last Updated:** January 26, 2026  
**Author:** Security Team  
**Review Frequency:** Quarterly
