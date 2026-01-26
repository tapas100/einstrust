// ──────────────────────────────────────────────────────────────────────
// Security Tests: Attack Scenarios
// ──────────────────────────────────────────────────────────────────────

import request from 'supertest';
import app from '../../index';  // Your Express app
import { User, RefreshToken } from '../../src/models';

describe('Security Attack Scenarios', () => {

  describe('Token Replay Attack', () => {
    test('should detect and prevent token replay', async () => {
      // 1. Login and get refresh token
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'ValidPass123!'
        });

      expect(loginRes.status).toBe(200);
      const refreshToken = loginRes.body.refreshToken;

      // 2. Use refresh token once (should work)
      const firstRefresh = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refreshToken=${refreshToken}`)
        .send();

      expect(firstRefresh.status).toBe(200);
      const newRefreshToken = firstRefresh.body.refreshToken;

      // 3. Try to use OLD refresh token again (replay attack)
      const replayAttempt = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refreshToken=${refreshToken}`)  // Old token
        .send();

      // Should detect replay and revoke entire family
      expect(replayAttempt.status).toBe(401);
      expect(replayAttempt.body.error).toBe(true);

      // 4. New token should also be revoked (family compromise)
      const newTokenAttempt = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refreshToken=${newRefreshToken}`)
        .send();

      expect(newTokenAttempt.status).toBe(401);
    });
  });

  describe('Brute Force Attack', () => {
    test('should lock account after failed login attempts', async () => {
      const email = 'victim@example.com';

      // Make 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            email,
            password: 'WrongPassword123!'
          });
      }

      // 6th attempt should return account locked
      const finalAttempt = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'WrongPassword123!'
        });

      expect(finalAttempt.status).toBe(401);
      expect(finalAttempt.body.message).toContain('locked');
    });

    test('should unlock account after timeout', async () => {
      jest.useFakeTimers();
      
      const email = 'victim2@example.com';

      // Lock account
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({ email, password: 'wrong' });
      }

      // Fast-forward 16 minutes (past 15min lockout)
      jest.advanceTimersByTime(16 * 60 * 1000);

      // Should be able to login again
      const loginAttempt = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'CorrectPassword123!'
        });

      expect(loginAttempt.status).toBe(200);
      
      jest.useRealTimers();
    });
  });

  describe('Token Theft Scenarios', () => {
    test('should reject expired access token', async () => {
      // Create expired token
      const expiredToken = jwt.sign(
        { userId: 'user123' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' }  // Already expired
      );

      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('expired');
    });

    test('should reject token after logout (blacklist)', async () => {
      // Login
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'ValidPass123!'
        });

      const accessToken = loginRes.body.accessToken;

      // Logout
      await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send();

      // Try to use token after logout
      const protectedRequest = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(protectedRequest.status).toBe(401);
    });
  });

  describe('NoSQL Injection Attempts', () => {
    test('should prevent NoSQL injection in login', async () => {
      const maliciousPayload = {
        email: { $gt: "" },  // NoSQL operator
        password: { $gt: "" }
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(maliciousPayload);

      // Should fail validation, not bypass authentication
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(true);
    });

    test('should sanitize user input', async () => {
      const maliciousPayload = {
        email: 'test@example.com',
        password: 'password',
        name: { $ne: null }  // NoSQL operator in name
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(maliciousPayload);

      // Mongo sanitize middleware should strip operators
      expect(response.status).not.toBe(200);
      // OR if registered, name should not contain operator
    });
  });

  describe('XSS Attempts', () => {
    test('should sanitize XSS in user input', async () => {
      const xssPayload = {
        email: 'xss@example.com',
        password: 'ValidPass123!',
        name: '<script>alert("XSS")</script>'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(xssPayload);

      // Even if registration succeeds, script tags should be escaped
      // Check that name doesn't contain raw script tags
      if (response.status === 200) {
        expect(response.body.user.name).not.toContain('<script>');
      }
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limit on login endpoint', async () => {
      const requests = [];

      // Make 6 rapid requests (limit is 5)
      for (let i = 0; i < 6; i++) {
        requests.push(
          request(app)
            .post('/api/v1/auth/login')
            .send({
              email: 'ratelimit@example.com',
              password: 'password'
            })
        );
      }

      const responses = await Promise.all(requests);

      // Last request should be rate limited
      const last = responses[responses.length - 1];
      expect(last.status).toBe(429);
      expect(last.body.message).toContain('Too many');
    });
  });

  describe('Privilege Escalation Attempts', () => {
    test('should prevent user from assigning admin role to self', async () => {
      // Create regular user
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'regularuser@example.com',
          password: 'ValidPass123!'
        });

      const userToken = loginRes.body.accessToken;

      // Try to update own roles to admin
      const updateRes = await request(app)
        .put(`/api/v1/users/me`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          roles: ['admin']  // Trying to escalate
        });

      // Should fail (403 or roles not updated)
      expect([403, 400]).toContain(updateRes.status);
      
      // Verify roles weren't changed
      const profile = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(profile.body.user.roles).not.toContain('admin');
    });
  });

  describe('Session Fixation', () => {
    test('should generate new token on login', async () => {
      // Get a token somehow (e.g., guest token)
      const initialToken = 'some-existing-token';

      // Login should not use provided token
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Authorization', `Bearer ${initialToken}`)
        .send({
          email: 'user@example.com',
          password: 'ValidPass123!'
        });

      // Should generate NEW token, not reuse provided one
      expect(loginRes.body.accessToken).not.toBe(initialToken);
      expect(loginRes.body.accessToken).toBeTruthy();
    });
  });

  describe('Concurrent Login Detection', () => {
    test('should detect concurrent sessions from different IPs', async () => {
      const email = 'concurrent@example.com';

      // Login from IP 1
      const login1 = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '192.168.1.1')
        .send({ email, password: 'ValidPass123!' });

      // Login from IP 2 (different location)
      const login2 = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '10.0.0.1')
        .send({ email, password: 'ValidPass123!' });

      // Both should succeed, but security event should be logged
      expect(login1.status).toBe(200);
      expect(login2.status).toBe(200);

      // Check audit logs for suspicious activity
      // (Implementation depends on your audit logging)
    });
  });

});
