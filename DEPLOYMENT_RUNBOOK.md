# Deployment Runbook
## Claude Code Dashboard - Operational Guide

---

## Quick Start

### Local Development
```bash
# Setup
git clone <repo>
cd terminal
cp .env.example .env
npm install
npm run build

# Run with docker-compose (dev)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Access
open http://localhost:3000
docker-compose logs -f
```

### Production Deployment
```bash
# Setup
git clone <repo>
cd terminal
cp .env.production.example .env.production

# Edit .env.production and set production values
nano .env.production

# Deploy
./scripts/deploy.sh production v1.0.0

# Verify
curl http://localhost:3000/health
./scripts/smoke-tests.sh http://localhost:3000
```

---

## Pre-Deployment Checklist

### Security
- [ ] JWT_SECRET is strong (32+ characters, random)
- [ ] Not using default ngrok credentials
- [ ] All environment files have restricted permissions (600)
- [ ] Secrets not committed to version control
- [ ] Database path uses persistent storage
- [ ] ALLOWED_PROJECT_ROOTS and ALLOWED_FILE_ROOTS are restrictive

### Infrastructure
- [ ] Docker and Docker Compose installed
- [ ] Sufficient disk space for database backups
- [ ] Network access verified (localhost port 3000 or Nginx reverse proxy)
- [ ] Time synchronization enabled (for JWT validation)
- [ ] Persistent storage volumes configured

### Monitoring
- [ ] Health check endpoint configured
- [ ] Logs are collected and monitored
- [ ] Alert thresholds defined
- [ ] Backup verification complete

---

## Deployment Procedures

### Standard Deployment

#### Step 1: Prepare
```bash
# Pull latest code
git pull origin main

# Review changes
git log --oneline -10

# Update dependencies
npm ci
npm audit

# Build test
npm run build
npm run test
```

#### Step 2: Create Release Tag
```bash
# Tag release
git tag -a v1.0.1 -m "Release v1.0.1 - Security updates"
git push origin v1.0.1

# This will trigger CI/CD pipeline automatically
```

#### Step 3: Verify Deployment
```bash
# Check health
curl http://localhost:3000/health | jq

# Run smoke tests
./scripts/smoke-tests.sh http://localhost:3000

# Check logs
docker-compose logs --tail=50
```

#### Step 4: Monitor
```bash
# Watch logs for 5 minutes
watch -n 5 'docker-compose logs --tail=20'

# Check memory/CPU usage
docker stats claude-code-dashboard
```

### Rolling Back

#### If Deployment Fails
```bash
# 1. Identify last good version
git tag | grep "^v" | sort -V | tail -5

# 2. Rollback to previous tag
git checkout v1.0.0
docker-compose down
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 3. Verify rollback
./scripts/smoke-tests.sh http://localhost:3000

# 4. Investigate failure
docker-compose logs --tail=100 > /tmp/failure-logs.txt
```

### Blue/Green Deployment

When available:
```bash
# 1. Start green instance with new image
export IMAGE_TAG=v1.0.1
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d dashboard-green

# 2. Verify green is healthy
curl http://localhost:3001/health

# 3. Switch traffic (via Nginx)
# Update Nginx to point to green
docker-compose restart nginx

# 4. Keep blue running for 5 minutes (quick rollback)
sleep 300

# 5. Stop blue
docker-compose down -f docker-compose.blue.yml

# 6. Rename green to blue for next cycle
docker rename claude-dashboard-green claude-dashboard-blue
```

---

## Monitoring & Troubleshooting

### Health Checks

#### Application Health
```bash
# Full health report
curl http://localhost:3000/health | jq

# Expected output:
# {
#   "status": "healthy",
#   "checks": {
#     "server": "ok",
#     "database": "ok",
#     "tmux": "ok"
#   },
#   "uptime": 3600,
#   "timestamp": "2024-12-15T10:30:00Z",
#   "version": "1.0.0"
# }
```

#### Database Health
```bash
# Connect to container
docker-compose exec dashboard bash

# Inside container, test DB
sqlite3 /app/data/dashboard.db "PRAGMA integrity_check;"

# Expected: "ok"
```

#### tmux Server Health
```bash
# Check tmux sessions
docker-compose exec dashboard tmux -L claude-dashboard list-sessions

# Expected: Lists all active sessions
```

### Common Issues

#### Issue: Health check returns "degraded"
```bash
# Check which component is failing
curl http://localhost:3000/health | jq '.checks'

# If database: "error"
# → Verify /app/data is writable
# → Check SQLite file permissions

# If tmux: "error"
# → tmux service may have crashed
# → Restart container: docker-compose restart dashboard

# If claude: "not-installed"
# → Claude CLI not available in container
# → This is expected if not using ngrok
```

#### Issue: Container exits immediately
```bash
# Check logs
docker-compose logs dashboard | tail -50

# Common causes:
# 1. JWT_SECRET not set or invalid
# 2. ALLOWED_PROJECT_ROOTS not writable
# 3. Port 3000 already in use
# 4. Database corruption

# Recovery:
# 1. Fix configuration
# 2. Delete corrupted database (backup first!)
# 3. Restart: docker-compose up -d
```

#### Issue: High memory usage
```bash
# Check memory usage
docker stats --no-stream claude-code-dashboard

# Identify which process
docker-compose exec dashboard ps aux --sort=-%mem

# If Node.js using too much:
# 1. Check for memory leaks in logs
# 2. Restart container: docker-compose restart dashboard
# 3. Review long-running sessions
```

#### Issue: Slow responses
```bash
# Check database performance
docker-compose exec dashboard \
  sqlite3 /app/data/dashboard.db \
  "SELECT name FROM sqlite_master WHERE type='table';"

# Analyze slow queries
docker-compose exec dashboard \
  sqlite3 /app/data/dashboard.db \
  "EXPLAIN QUERY PLAN SELECT * FROM sessions;"

# If needed, rebuild indices
docker-compose exec dashboard \
  sqlite3 /app/data/dashboard.db \
  "VACUUM; ANALYZE;"
```

---

## Backup & Recovery

### Automated Backup (if configured)
```bash
# Check backup service status
docker-compose logs backup | tail -20

# Manual backup
docker-compose exec backup /scripts/backup.sh

# List backups
ls -lh ./backups/
```

### Manual Backup
```bash
# Create backup
docker-compose exec dashboard \
  sqlite3 /app/data/dashboard.db \
  ".backup /tmp/dashboard_backup.db"

# Verify backup
sqlite3 /tmp/dashboard_backup.db "PRAGMA integrity_check;"

# Copy to safe location
cp /tmp/dashboard_backup.db /mnt/backups/dashboard_$(date +%Y%m%d_%H%M%S).db
```

### Disaster Recovery

#### Complete Data Loss
```bash
# 1. Stop application
docker-compose down

# 2. Remove corrupted database
rm /app/data/dashboard.db

# 3. Restore from backup (if available)
gunzip < /mnt/backups/dashboard_20241215_020000.db.gz > /app/data/dashboard.db

# 4. Verify restored database
sqlite3 /app/data/dashboard.db "PRAGMA integrity_check;"

# 5. Restart application
docker-compose up -d

# 6. Verify health
./scripts/smoke-tests.sh http://localhost:3000
```

---

## Scheduled Maintenance

### Daily Tasks
```bash
# Check health
curl http://localhost:3000/health

# Verify backups completed
ls -lh /mnt/backups/ | head -10

# Review logs for errors
docker-compose logs --since 24h | grep ERROR | wc -l
```

### Weekly Tasks
```bash
# Update dependencies
npm outdated
npm update --save

# Security audit
npm audit

# Database maintenance
docker-compose exec dashboard \
  sqlite3 /app/data/dashboard.db "VACUUM; ANALYZE;"

# Check disk space
df -h | grep -E "data|backups"
```

### Monthly Tasks
```bash
# Update base image
docker pull node:18-slim

# Rebuild application
docker-compose build --no-cache dashboard

# Test in staging first
./scripts/deploy.sh staging

# Plan production upgrade
git log --oneline main | head -20
```

### Quarterly Tasks
```bash
# Security audit
npm audit fix

# Dependency updates
npm update

# Load testing
npm run test:e2e

# Disaster recovery drill
# (restore from backup to test environment)
```

---

## Performance Tuning

### Database Optimization
```bash
# Enable WAL mode (better concurrency)
docker-compose exec dashboard \
  sqlite3 /app/data/dashboard.db \
  "PRAGMA journal_mode = WAL;"

# Optimize page size for SSD
docker-compose exec dashboard \
  sqlite3 /app/data/dashboard.db \
  "PRAGMA page_size = 4096;"

# Tune cache
docker-compose exec dashboard \
  sqlite3 /app/data/dashboard.db \
  "PRAGMA cache_size = 10000;"
```

### Resource Limits
```yaml
# In docker-compose.prod.yml
services:
  dashboard:
    deploy:
      resources:
        limits:
          cpus: '2'           # Maximum 2 CPU cores
          memory: 1G          # Maximum 1GB memory
        reservations:
          cpus: '0.5'         # Minimum 0.5 CPU cores
          memory: 256M        # Minimum 256MB memory
```

---

## Security Operations

### Log Monitoring
```bash
# Watch for authentication failures
docker-compose logs | grep -i "unauthorized\|failed\|denied"

# Monitor file system access
docker-compose exec dashboard \
  tail -f /tmp/access.log | grep "/files"

# Check for suspicious session activity
docker-compose exec dashboard \
  sqlite3 /app/data/dashboard.db \
  "SELECT * FROM audit_logs WHERE action LIKE '%error%' LIMIT 10;"
```

### Regular Security Checks
```bash
# Verify ownership
docker-compose exec dashboard ls -la /app | grep claude

# Check capabilities
docker-compose exec dashboard capsh --print

# Test JWT expiration
curl -H "Authorization: Bearer expired-token" \
  http://localhost:3000/api/sessions

# Test path validation
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/files?path=../../../etc/passwd"
```

---

## Escalation Procedures

### Critical Issues (Down)
1. **Immediately**
   - Notify on-call team (Slack channel)
   - Start incident log
   - Begin rollback if new deployment

2. **5 minutes**
   - Collect diagnostic info:
     ```bash
     docker-compose logs > /tmp/incident_$(date +%s).txt
     docker stats --no-stream > /tmp/stats_$(date +%s).txt
     ```
   - Attempt restart: `docker-compose restart dashboard`

3. **15 minutes**
   - If restart fails, rollback to previous version
   - Investigate logs for root cause
   - Escalate to infrastructure team

### High Priority Issues (Degraded)
- Health check passing but slow responses
- Database errors in logs but service online
- Unusual resource usage

**Action:**
```bash
# 1. Analyze issue
docker-compose logs --since 1h | grep -i "error\|warn"

# 2. Decide: fix vs. wait
# - If fixable: apply fix and verify
# - If not: plan maintenance window

# 3. Communicate status
# - Update incident status
# - Estimate resolution time
```

---

## On-Call Handoff

### End-of-Shift Checklist
```bash
# Health status
curl http://localhost:3000/health

# Recent errors in logs
docker-compose logs --since 8h | grep ERROR | wc -l

# Database integrity
docker-compose exec dashboard \
  sqlite3 /app/data/dashboard.db "PRAGMA integrity_check;" | head -1

# Backup status
ls -lhtr /mnt/backups | tail -5

# Disk usage
df -h | grep -E "data|backups"

# Active sessions
docker-compose exec dashboard \
  sqlite3 /app/data/dashboard.db \
  "SELECT COUNT(*) FROM sessions WHERE status='active';"
```

### Handoff Note Template
```
[Date] [Time] - Shift Handoff

Status: [Healthy/Warning/Critical]
Session Count: [N active sessions]
Recent Issues: [None/List issues and actions taken]
Pending: [Any outstanding issues to monitor]
Next Scheduled Maintenance: [Date/Time]

Contact if needed:
- On-call: [Name] [Phone]
- Escalation: [Name] [Phone]
```

---

## Additional Resources

- **DEVOPS_ASSESSMENT.md** - Comprehensive evaluation and recommendations
- **CLAUDE_CODE_DASHBOARD_PLAN.md** - Technical architecture and design
- **CI/CD Pipeline** - `.github/workflows/ci-cd.yml`
- **Container Configuration** - `Dockerfile`, `docker-compose.yml`
- **Deployment Scripts** - `scripts/deploy.sh`, `scripts/smoke-tests.sh`

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-12 | Initial deployment runbook |
| | | - Basic deployment procedures |
| | | - Troubleshooting guide |
| | | - Monitoring instructions |
| | | - Backup and recovery |

