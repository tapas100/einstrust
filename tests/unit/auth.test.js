// ──────────────────────────────────────────────────────────────────────
// Unit Tests: Authentication Service
// ──────────────────────────────────────────────────────────────────────

import { AuthService } from '../../src/services/auth';
import { User } from '../../src/models';
import bcrypt from 'bcryptjs';

describe('AuthService', () => {
  
  describe('login', () => {
    test('should successfully login with valid credentials', async () => {
      // Mock user
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        password: await bcrypt.hash('password123', 12),
        roles: ['user'],
        failedLoginAttempts: 0,
        lockoutUntil: null,
        isLocked: () => false,
        incrementFailedLogins: jest.fn(),
        resetFailedLogins: jest.fn(),
        generateAuthToken: jest.fn().mockResolvedValue('access-token'),
        transform: () => ({ id: 'user123', email: 'test@example.com' })
      };

      // Mock User.findByCredentials
      User.findByCredentials = jest.fn().mockResolvedValue(mockUser);

      const result = await AuthService.login({
        email: 'test@example.com',
        password: 'password123'
      });

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('token');
      expect(result.user.email).toBe('test@example.com');
      expect(mockUser.resetFailedLogins).toHaveBeenCalled();
    });

    test('should fail login with invalid password', async () => {
      User.findByCredentials = jest.fn().mockRejectedValue(
        new Error('Invalid credentials')
      );

      await expect(
        AuthService.login({
          email: 'test@example.com',
          password: 'wrongpassword'
        })
      ).rejects.toThrow();
    });

    test('should fail login when account is locked', async () => {
      User.findByCredentials = jest.fn().mockRejectedValue(
        new Error('Account locked. Try again in 15 minutes.')
      );

      await expect(
        AuthService.login({
          email: 'test@example.com',
          password: 'password123'
        })
      ).rejects.toThrow('Account locked');
    });
  });

  describe('register', () => {
    test('should register new user with default role', async () => {
      // Mock no existing users
      User.find = jest.fn().mockResolvedValue([]);
      User.isEmailTaken = jest.fn().mockResolvedValue(false);

      const mockUser = {
        _id: 'newuser123',
        email: 'newuser@example.com',
        roles: ['user'],
        save: jest.fn().mockResolvedValue(this),
        transform: () => ({ id: 'newuser123', email: 'newuser@example.com', roles: ['user'] })
      };

      // Mock User constructor
      global.User = jest.fn().mockImplementation(() => mockUser);

      const result = await AuthService.register({
        email: 'newuser@example.com',
        password: 'SecurePass123!',
        name: 'New User'
      });

      expect(result).toHaveProperty('email', 'newuser@example.com');
    });

    test('should fail registration with duplicate email', async () => {
      User.find = jest.fn().mockResolvedValue([{ /* existing user */ }]);
      User.isEmailTaken = jest.fn().mockResolvedValue(true);

      await expect(
        AuthService.register({
          email: 'existing@example.com',
          password: 'password123',
          name: 'Duplicate User'
        })
      ).rejects.toThrow('Email already exist');
    });

    test('should assign admin role to first user', async () => {
      // Mock no existing users
      User.find = jest.fn().mockResolvedValue([]);
      User.isEmailTaken = jest.fn().mockResolvedValue(false);

      const mockUser = {
        _id: 'firstuser',
        email: 'first@example.com',
        roles: ['admin'],  // Should be admin
        save: jest.fn().mockResolvedValue(this),
        transform: () => ({ id: 'firstuser', email: 'first@example.com', roles: ['admin'] })
      };

      global.User = jest.fn().mockImplementation(() => mockUser);

      const result = await AuthService.register({
        email: 'first@example.com',
        password: 'password123',
        name: 'First User'
      });

      expect(result.roles).toContain('admin');
    });
  });
});
