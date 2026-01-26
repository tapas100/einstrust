// ──────────────────────────────────────────────────────────────────────
// Test Setup - Runs before all tests
// ──────────────────────────────────────────────────────────────────────

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-not-for-production';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key';
process.env.MONGODB_URI = 'mongodb://localhost:27017/auth-platform-test';
process.env.REDIS_URL = 'redis://localhost:6379/1';  // Use DB 1 for tests

// Increase timeout for integration tests
jest.setTimeout(10000);

// Mock console.log in tests to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging
  error: console.error,
};
