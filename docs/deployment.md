# 🚀 Deployment Guide

## Overview

This guide covers deploying the Secure Auth Platform to production environments with best practices for security, scalability, and reliability.

---

## Pre-Deployment Checklist

### Security
- [ ] Generate strong JWT secrets (256+ bits)
- [ ] Enable HTTPS/TLS certificates
- [ ] Configure CORS whitelist
- [ ] Set secure cookie flags
- [ ] Review rate limits
- [ ] Configure firewall rules
- [ ] Set up secrets management (AWS Secrets Manager, Vault)
- [ ] Enable audit logging
- [ ] Configure intrusion detection

### Infrastructure
- [ ] Provision database (MongoDB Atlas or self-hosted)
- [ ] Set up Redis cluster
- [ ] Configure load balancer
- [ ] Set up CDN (CloudFlare, AWS CloudFront)
- [ ] Configure backup strategy
- [ ] Set up monitoring (Datadog, New Relic)
- [ ] Configure alerting
- [ ] Plan disaster recovery

### Application
- [ ] Run all tests (`npm test`)
- [ ] Build Docker image
- [ ] Set environment variables
- [ ] Configure logging level
- [ ] Review database indexes
- [ ] Set up health checks
- [ ] Configure graceful shutdown

---

## Deployment Methods

### 1. Docker Compose (Small Scale)

**Best for:** Development, staging, small production (<1K users)

```bash
# 1. Clone repository
git clone https://github.com/tapas100/node-auth-app.git
cd node-auth-app

# 2. Create .env file
cp .env.example .env
# Edit .env with production values

# 3. Generate secrets
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))" >> .env
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(64).toString('hex'))" >> .env

# 4. Build and start services
docker-compose up -d

# 5. Check health
curl http://localhost:3000/health

# 6. View logs
docker-compose logs -f auth-service
```

**Production Tweaks:**
```yaml
# docker-compose.prod.yml
services:
  auth-service:
    restart: always
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
    environment:
      NODE_ENV: production
```

---

### 2. Kubernetes (Medium to Large Scale)

**Best for:** 10K+ users, high availability requirements

#### Step 1: Create Kubernetes Manifests

**Deployment:**
```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
    spec:
      containers:
      - name: auth-service
        image: yourregistry/secure-auth-platform:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: jwt-secret
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: mongodb-uri
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
```

**Service:**
```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: auth-service
spec:
  selector:
    app: auth-service
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

**Secrets:**
```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: auth-secrets
type: Opaque
stringData:
  jwt-secret: <base64-encoded-secret>
  mongodb-uri: <base64-encoded-uri>
```

#### Step 2: Deploy

```bash
# Create namespace
kubectl create namespace auth-platform

# Create secrets
kubectl apply -f k8s/secrets.yaml -n auth-platform

# Deploy application
kubectl apply -f k8s/deployment.yaml -n auth-platform
kubectl apply -f k8s/service.yaml -n auth-platform

# Check status
kubectl get pods -n auth-platform
kubectl get svc -n auth-platform

# View logs
kubectl logs -f deployment/auth-service -n auth-platform
```

---

### 3. AWS (Elastic Beanstalk / ECS)

**Best for:** AWS ecosystem, managed services

#### Using ECS (Elastic Container Service)

```bash
# 1. Build and push Docker image
docker build -t secure-auth-platform .
docker tag secure-auth-platform:latest <ecr-registry>/secure-auth-platform:latest
docker push <ecr-registry>/secure-auth-platform:latest

# 2. Create ECS task definition
aws ecs register-task-definition --cli-input-json file://ecs-task-definition.json

# 3. Create ECS service
aws ecs create-service \
  --cluster auth-cluster \
  --service-name auth-service \
  --task-definition auth-task \
  --desired-count 3 \
  --load-balancer targetGroupArn=<tg-arn>,containerName=auth-service,containerPort=3000
```

**Task Definition:**
```json
{
  "family": "auth-task",
  "containerDefinitions": [
    {
      "name": "auth-service",
      "image": "<ecr-registry>/secure-auth-platform:latest",
      "cpu": 256,
      "memory": 512,
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "JWT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:jwt-secret"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/auth-service",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

---

## Environment Configuration

### Production Environment Variables

```bash
# Server
NODE_ENV=production
PORT=3000

# Database (Use managed service)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/auth-platform?retryWrites=true&w=majority

# Redis (Use managed service)
REDIS_URL=redis://username:password@redis-cluster.example.com:6379

# JWT Secrets (Generate with crypto.randomBytes)
JWT_SECRET=<64-byte-hex-string>
JWT_REFRESH_SECRET=<64-byte-hex-string>
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# Security
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION=900000
COOKIE_SECRET_KEY=<strong-secret>

# CORS (Whitelist your domains)
ALLOWED_ORIGINS=https://app.example.com,https://www.example.com

# OAuth (Production credentials)
GOOGLE_CLIENT_ID=<production-id>
GOOGLE_CLIENT_SECRET=<production-secret>
GITHUB_CLIENT_ID=<production-id>
GITHUB_CLIENT_SECRET=<production-secret>
```

---

## Database Setup

### MongoDB Atlas (Recommended)

```bash
# 1. Create cluster at mongodb.com/cloud/atlas
# 2. Whitelist application IPs
# 3. Create database user
# 4. Get connection string
# 5. Configure in .env:
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/auth-platform
```

### Self-Hosted MongoDB

```bash
# 1. Install MongoDB
sudo apt-get install -y mongodb-org

# 2. Configure replica set (for production)
# /etc/mongod.conf
replication:
  replSetName: "rs0"

# 3. Initialize replica set
mongo --eval "rs.initiate()"

# 4. Create admin user
mongo admin --eval 'db.createUser({user:"admin",pwd:"<password>",roles:["root"]})'

# 5. Enable authentication
# /etc/mongod.conf
security:
  authorization: enabled
```

---

## Redis Setup

### Redis Cloud (Recommended)

```bash
# Use Redis Labs, AWS ElastiCache, or similar
REDIS_URL=redis://:password@redis-endpoint:port
```

### Self-Hosted Redis Cluster

```bash
# 1. Install Redis
sudo apt-get install redis-server

# 2. Configure cluster
# /etc/redis/redis.conf
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
appendonly yes

# 3. Create cluster
redis-cli --cluster create \
  127.0.0.1:7000 127.0.0.1:7001 127.0.0.1:7002 \
  127.0.0.1:7003 127.0.0.1:7004 127.0.0.1:7005 \
  --cluster-replicas 1
```

---

## SSL/TLS Configuration

### Using Let's Encrypt (Free)

```bash
# 1. Install Certbot
sudo apt-get install certbot

# 2. Generate certificate
sudo certbot certonly --standalone -d api.example.com

# 3. Configure Nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;
    
    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# 4. Auto-renewal
sudo certbot renew --dry-run
```

---

## Monitoring & Logging

### Health Checks

```javascript
// Add to index.js
app.get('/health', async (req, res) => {
  try {
    // Check database
    await mongoose.connection.db.admin().ping();
    
    // Check Redis
    await redisClient.ping();
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date(),
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});
```

### Logging with Winston

```javascript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

---

## Scaling Strategies

### Horizontal Scaling

```
┌─────────────┐
│Load Balancer│
└──────┬──────┘
       │
   ┌───┴───┬───────┬───────┐
   │       │       │       │
┌──▼──┐ ┌──▼──┐ ┌──▼──┐ ┌──▼──┐
│App 1│ │App 2│ │App 3│ │App N│
└──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘
   │       │       │       │
   └───┬───┴───────┴───────┘
       │
   ┌───▼────┐
   │ Redis  │ (Shared state)
   └────────┘
```

**Configure:**
- Use Redis for rate limiting (shared across instances)
- Use Redis for token blacklist
- Stateless application design (no in-memory sessions)

---

## Backup & Recovery

### Database Backups

```bash
# Automated MongoDB backup (cron)
#!/bin/bash
BACKUP_DIR="/backups/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)

mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/$DATE"

# Keep last 7 days
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} \;
```

### Disaster Recovery Plan

1. **Database Failure**
   - Restore from latest backup
   - Point-in-time recovery (if using MongoDB Atlas)
   - ETA: 15-30 minutes

2. **Redis Failure**
   - Token blacklist lost → minor impact
   - Rate limits reset → temporary inconvenience
   - ETA: 5 minutes (start new instance)

3. **Application Failure**
   - Load balancer routes to healthy instances
   - Auto-scaling adds new instances
   - ETA: 2-5 minutes

---

## Security Hardening

### Checklist

- [ ] Run as non-root user
- [ ] Disable directory listing
- [ ] Set security headers (Helmet.js)
- [ ] Enable HTTPS redirect
- [ ] Configure HSTS
- [ ] Set up WAF (Web Application Firewall)
- [ ] Enable DDoS protection (CloudFlare)
- [ ] Regular security audits
- [ ] Dependency scanning (`npm audit`)
- [ ] Penetration testing

---

## Performance Optimization

### Application Level

```javascript
// Enable compression
import compression from 'compression';
app.use(compression());

// Enable caching
import apicache from 'apicache';
let cache = apicache.middleware;
app.get('/api/v1/public-data', cache('5 minutes'), handler);

// Database connection pooling
mongoose.connect(uri, {
  poolSize: 10,  // Maintain up to 10 socket connections
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});
```

### Database Optimization

```javascript
// Add indexes
userSchema.index({ email: 1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
refreshTokenSchema.index({ family: 1, isRevoked: 1 });

// Use lean queries (skip Mongoose overhead)
const users = await User.find().lean();
```

---

## Troubleshooting

### High CPU Usage
- Check for expensive database queries
- Review rate limiting configuration
- Monitor bcrypt cost factor (12 is appropriate)

### Memory Leaks
- Use `clinic` to profile: `clinic doctor -- node index.js`
- Check for unclosed database connections
- Review event listeners

### Slow Response Times
- Enable query logging
- Add database indexes
- Use Redis caching
- Check network latency

---

## Post-Deployment

### Monitoring Checklist

- [ ] Set up uptime monitoring (UptimeRobot, Pingdom)
- [ ] Configure error alerting (Sentry, Rollbar)
- [ ] Monitor application metrics (CPU, memory, requests/sec)
- [ ] Track security events (failed logins, rate limits)
- [ ] Set up log aggregation (ELK, Splunk)

### Maintenance

- Daily: Review error logs
- Weekly: Check security alerts
- Monthly: Dependency updates, security patches
- Quarterly: Performance review, capacity planning

---

**Last Updated:** January 26, 2026  
**Author:** DevOps Team
