# 🚀 Quick Start Guide

Get the Secure Auth Platform running in 5 minutes!

---

## Prerequisites

- Node.js 14+ installed
- MongoDB installed and running
- Redis installed and running (optional but recommended)

---

## Step 1: Clone & Install

```bash
# Clone repository
git clone https://github.com/tapas100/node-auth-app.git
cd node-auth-app

# Install dependencies
npm install
```

---

## Step 2: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Generate JWT secrets
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"

# Edit .env and paste the generated secrets
nano .env
```

**Minimum required variables:**
```bash
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/auth-platform
JWT_SECRET=<paste-generated-secret>
JWT_REFRESH_SECRET=<paste-generated-secret>
```

---

## Step 3: Start Services

### Option A: Local Development

```bash
# Start MongoDB
sudo service mongod start

# Start Redis (optional)
redis-server

# Start application
npm run dev
```

### Option B: Docker (Recommended)

```bash
# Start all services (MongoDB + Redis + App)
docker-compose up -d

# View logs
docker-compose logs -f
```

---

## Step 4: Verify

```bash
# Check health
curl http://localhost:3000/health

# Expected output:
# {"status":"healthy","timestamp":"...","uptime":...}
```

---

## Step 5: Test API

### Register a User

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "SecurePass123!"
  }'
```

### Login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!"
  }'
```

**Response:**
```json
{
  "user": {
    "id": "...",
    "name": "Test User",
    "email": "test@example.com",
    "roles": ["admin"]
  },
  "token": "eyJhbGc..."
}
```

### Access Protected Route

```bash
# Replace <TOKEN> with the token from login response
curl http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer <TOKEN>"
```

---

## 🧪 Run Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Security tests only
npm run test:security

# With coverage
npm test -- --coverage
```

---

## 📚 Next Steps

1. **Read Documentation**
   - [README.md](README.md) - Overview
   - [docs/auth-flow.md](docs/auth-flow.md) - Authentication flows
   - [docs/threat-model.md](docs/threat-model.md) - Security analysis
   - [docs/deployment.md](docs/deployment.md) - Production deployment

2. **Explore Features**
   - Token refresh endpoint: `POST /api/v1/auth/refresh`
   - Logout: `POST /api/v1/auth/logout`
   - Rate limiting: Try 6+ failed logins
   - Audit logs: Check MongoDB `auditlogs` collection

3. **Customize**
   - Add OAuth providers (Google, GitHub)
   - Customize roles and permissions
   - Add email verification
   - Configure monitoring

---

## 🐛 Troubleshooting

### MongoDB Connection Error

```bash
# Check if MongoDB is running
sudo service mongod status

# Start MongoDB
sudo service mongod start

# Check connection string in .env
MONGODB_URI=mongodb://localhost:27017/auth-platform
```

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or change port in .env
PORT=3001
```

### Redis Connection Error

```bash
# Redis is optional for development
# App will work without it (in-memory rate limiting)

# To start Redis:
redis-server

# To disable Redis:
# Comment out REDIS_URL in .env
```

### Module Not Found

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

---

## 🎯 Common Use Cases

### 1. Add a New User

```javascript
// Using API
POST /api/v1/auth/register
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

### 2. Change User Role (Admin Only)

```javascript
// Using MongoDB shell
db.users.updateOne(
  { email: "user@example.com" },
  { $set: { roles: ["admin"] } }
)
```

### 3. Revoke All User Tokens

```javascript
// Using MongoDB shell
db.refreshtokens.updateMany(
  { userId: ObjectId("...") },
  { $set: { isRevoked: true, revokedReason: "admin_action" } }
)
```

### 4. View Audit Logs

```javascript
// Using MongoDB shell
db.auditlogs.find({ userId: ObjectId("...") })
  .sort({ timestamp: -1 })
  .limit(20)
  .pretty()
```

---

## 📞 Support

- **Documentation:** [docs/](docs/)
- **Issues:** [GitHub Issues](https://github.com/tapas100/node-auth-app/issues)
- **API Docs:** [Postman Collection](https://documenter.getpostman.com/view/5969791/SzYbyxeL)

---

## ⚡ Quick Commands Cheat Sheet

```bash
# Development
npm run dev                    # Start with nodemon
npm test                       # Run tests
npm run test:security          # Security tests only

# Docker
docker-compose up -d           # Start all services
docker-compose down            # Stop all services
docker-compose logs -f         # View logs
docker-compose ps              # Check status

# MongoDB
mongo                          # Open MongoDB shell
use auth-platform              # Switch to database
db.users.find().pretty()       # View users
db.auditlogs.find().limit(10)  # View audit logs

# Redis
redis-cli                      # Open Redis shell
KEYS *                         # View all keys
GET rl:login:192.168.1.1       # Check rate limit

# Generate secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

**Ready to go!** 🎉

Start building secure applications with production-grade authentication!
