// ────────────────────────────────────────────────────────────────────────────────
// RBAC (Role-Based Access Control) Configuration
// ────────────────────────────────────────────────────────────────────────────────

export const ROLES = {
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  EDITOR: 'editor',
  USER: 'user',
  GUEST: 'guest'
};

// Permission definitions
export const PERMISSIONS = {
  // Admin - Full system access
  [ROLES.ADMIN]: [
    'manage:users',
    'manage:roles',
    'manage:system',
    'publish:content',
    'edit:content',
    'delete:content',
    'read:content',
    'view:analytics',
    'manage:settings'
  ],
  
  // Moderator - Content management + user moderation
  [ROLES.MODERATOR]: [
    'manage:users',
    'edit:content',
    'delete:content',
    'read:content',
    'view:analytics'
  ],
  
  // Editor - Content creation and editing
  [ROLES.EDITOR]: [
    'publish:content',
    'edit:content',
    'read:content'
  ],
  
  // User - Basic authenticated access
  [ROLES.USER]: [
    'read:content',
    'edit:own',
    'delete:own'
  ],
  
  // Guest - Read-only access (may not be needed for auth service)
  [ROLES.GUEST]: [
    'read:content'
  ]
};

// Helper function to check if role has permission
export function hasPermission(role, permission) {
  const rolePermissions = PERMISSIONS[role] || [];
  return rolePermissions.includes(permission);
}

// Helper function to get all permissions for a role
export function getRolePermissions(role) {
  return PERMISSIONS[role] || [];
}

// Helper function to check if one role is higher than another
export function isRoleHigherThan(role1, role2) {
  const hierarchy = {
    [ROLES.ADMIN]: 5,
    [ROLES.MODERATOR]: 4,
    [ROLES.EDITOR]: 3,
    [ROLES.USER]: 2,
    [ROLES.GUEST]: 1
  };
  
  return (hierarchy[role1] || 0) > (hierarchy[role2] || 0);
}
