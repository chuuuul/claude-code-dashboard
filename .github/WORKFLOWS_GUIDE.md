# CI/CD Workflows Quick Start Guide

## Adding Status Badges to README

Add these badges to your README.md to show workflow status:

```markdown
[![CI](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/ci.yml)
[![Security](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/security.yml/badge.svg)](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/security.yml)
[![Docker](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/docker.yml/badge.svg)](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/docker.yml)
[![codecov](https://codecov.io/gh/YOUR_USERNAME/YOUR_REPO/branch/main/graph/badge.svg)](https://codecov.io/gh/YOUR_USERNAME/YOUR_REPO)
```

Replace `YOUR_USERNAME` and `YOUR_REPO` with your actual GitHub username and repository name.

---

## Required GitHub Settings

### 1. Enable GitHub Actions

1. Go to **Settings** → **Actions** → **General**
2. Set "Actions permissions" to "Allow all actions and reusable workflows"
3. Under "Workflow permissions":
   - Select "Read and write permissions"
   - Check "Allow GitHub Actions to create and approve pull requests"

### 2. Configure Branch Protection

1. Go to **Settings** → **Branches**
2. Add rule for `main` branch:
   - **Require pull request reviews**: 1 approval
   - **Require status checks**: Select these checks:
     - `CI Status Check`
     - `Security Status Check`
     - `Build & Test (Node 18.x)`
     - `Code Quality & Security Scan`
   - **Require branches to be up to date**
   - Optional: **Require signed commits**

### 3. Enable GitHub Container Registry

1. Go to **Settings** → **Packages**
2. Ensure public or private access is configured for packages
3. GHCR will automatically create repository on first push

### 4. Configure Environments (Optional)

For deployment workflows:

1. Go to **Settings** → **Environments**
2. Create environments:
   - **staging**: Add reviewers if needed
   - **production**: Add required reviewers

### 5. Enable Security Features

1. Go to **Settings** → **Security & analysis**
2. Enable:
   - **Dependency graph**
   - **Dependabot alerts**
   - **Dependabot security updates**
   - **Code scanning** (CodeQL)
   - **Secret scanning**

---

## Setup Codecov (Optional)

For test coverage reporting:

1. Go to [codecov.io](https://codecov.io)
2. Sign in with GitHub
3. Add your repository
4. Copy the upload token
5. Add to GitHub Secrets as `CODECOV_TOKEN`

Note: The workflow will work without Codecov, it will just skip coverage upload.

---

## First-Time Workflow Setup

### 1. Remove Old Workflow (if exists)

```bash
# Backup old workflow
mv .github/workflows/ci-cd.yml .github/workflows/ci-cd.yml.backup

# Or delete it
rm .github/workflows/ci-cd.yml
```

### 2. Commit New Workflows

```bash
git add .github/workflows/
git commit -m "ci: Add production-ready GitHub Actions workflows

- Add comprehensive CI workflow with matrix testing
- Add security scanning workflow with CodeQL and Trivy
- Add Docker build workflow with multi-platform support
- Add Dependabot configuration
- Add workflow documentation"

git push origin main
```

### 3. Verify Workflows

1. Go to **Actions** tab in GitHub
2. You should see three workflows:
   - CI
   - Security Scanning
   - Docker Build & Push
3. Click on each to view status

### 4. Test with a Pull Request

```bash
# Create a test branch
git checkout -b test/ci-workflows

# Make a small change
echo "# Test" >> TEST.md

# Commit and push
git add TEST.md
git commit -m "test: Verify CI workflows"
git push origin test/ci-workflows

# Create PR via GitHub UI
```

Check that all workflows run successfully on the PR.

---

## Creating Your First Release

### 1. Prepare for Release

```bash
# Ensure main branch is up to date
git checkout main
git pull origin main

# Verify everything works
npm run verify
```

### 2. Create Release Tag

```bash
# Create and push tag (triggers release workflow)
git tag v1.0.0
git push origin v1.0.0
```

### 3. Monitor Release Workflow

1. Go to **Actions** tab
2. Watch "Docker Build & Push" workflow
3. Verify all jobs complete:
   - Build & Push Multi-Platform Image
   - Test Docker Image
   - Sign Image with Cosign
   - Create GitHub Release

### 4. Verify Release

1. Go to **Releases** tab
2. See auto-generated release notes
3. Docker images available at:
   ```
   ghcr.io/YOUR_USERNAME/YOUR_REPO:1.0.0
   ghcr.io/YOUR_USERNAME/YOUR_REPO:latest
   ```

### 5. Pull and Test Release

```bash
# Pull the released image
docker pull ghcr.io/YOUR_USERNAME/YOUR_REPO:1.0.0

# Run it
docker run -p 3000:3000 \
  -e JWT_SECRET=your-secret \
  -e ADMIN_PASSWORD="YourPassword123!" \
  ghcr.io/YOUR_USERNAME/YOUR_REPO:1.0.0
```

---

## Common Workflows

### Running Manual Security Scan

1. Go to **Actions** tab
2. Select "Security Scanning" workflow
3. Click **Run workflow**
4. Select branch
5. Click **Run workflow** button

### Testing Docker Build Without Release

```bash
# Push to main (builds but doesn't release)
git push origin main

# Or trigger manually
# Go to Actions → Docker Build & Push → Run workflow
```

### Updating Dependencies with Dependabot

Dependabot will automatically:
- Check for updates weekly
- Create PRs for dependency updates
- Group minor/patch updates together

To manually trigger:
1. Go to **Insights** → **Dependency graph** → **Dependabot**
2. Click **Check for updates**

---

## Troubleshooting

### Workflow Not Running

**Check:**
1. Actions are enabled in repository settings
2. Workflow file is in `.github/workflows/`
3. Workflow file has valid YAML syntax
4. Branch matches trigger conditions

### Docker Push Fails

**Error:** "denied: permission_denied"

**Fix:**
1. Verify GITHUB_TOKEN has `packages: write` permission
2. Ensure logged in to GHCR in workflow
3. Check package visibility settings

### CodeQL Analysis Fails

**Error:** "No code found to analyze"

**Fix:**
1. CodeQL needs source code (not just compiled)
2. Ensure build step is included
3. Check `languages` matrix includes correct language

### Test Coverage Upload Fails

**Error:** "Codecov token not found"

**Fix (Option 1 - Use Codecov):**
1. Add `CODECOV_TOKEN` to GitHub Secrets
2. Get token from codecov.io

**Fix (Option 2 - Disable Codecov):**
1. Remove Codecov upload steps from workflow
2. Coverage still runs locally

### Trivy Scan Fails

**Error:** "Vulnerabilities found"

**Expected behavior:**
- Workflow fails on HIGH/CRITICAL vulnerabilities
- Review Trivy output in logs
- Update base image or dependencies
- Re-run workflow

### Node Version Mismatch

**Error:** "Unsupported Node.js version"

**Fix:**
1. Update `NODE_VERSION` in workflow
2. Update `engines.node` in package.json
3. Update Dockerfile base image

---

## Performance Optimization

### Reducing Workflow Time

1. **Enable Caching:**
   - Already enabled for npm via `actions/setup-node`
   - Docker layer caching via GitHub Actions cache

2. **Parallel Jobs:**
   - Most jobs run in parallel
   - Only dependent jobs wait for completion

3. **Matrix Strategy:**
   - Tests run on multiple Node versions in parallel
   - Set `fail-fast: false` for complete testing

4. **Optimize Docker Builds:**
   - Use `.dockerignore` to exclude unnecessary files
   - Multi-stage builds reduce final image size
   - BuildKit caching speeds up rebuilds

### Reducing GitHub Actions Minutes Usage

1. **Concurrency Control:**
   ```yaml
   concurrency:
     group: ${{ github.workflow }}-${{ github.ref }}
     cancel-in-progress: true
   ```
   Cancels outdated workflow runs

2. **Conditional Jobs:**
   - Some jobs only run on specific events
   - Docker push only on non-PR events
   - Security scans on schedule

3. **Self-Hosted Runners (Optional):**
   - For heavy workloads
   - No minute limits
   - Requires infrastructure

---

## Security Best Practices

### Action Version Pinning

All actions are pinned to SHA commits:

```yaml
# Good - pinned to specific SHA
uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1

# Bad - vulnerable to tag hijacking
uses: actions/checkout@v4
```

### Minimal Permissions

Each job specifies only required permissions:

```yaml
permissions:
  contents: read        # Read repository
  packages: write       # Push Docker images
  security-events: write # Upload security results
```

### Secret Management

**Never hardcode secrets:**
```yaml
# Bad
env:
  API_KEY: "secret123"

# Good
env:
  API_KEY: ${{ secrets.API_KEY }}
```

### Supply Chain Security

1. **SBOM Generation:** Docker workflow generates SBOMs
2. **Image Signing:** Cosign signs release images
3. **Provenance:** Build provenance attached to images
4. **Vulnerability Scanning:** Trivy scans all images

---

## Monitoring and Alerts

### Workflow Status Notifications

GitHub automatically sends notifications for:
- Failed workflows (if you're watching the repo)
- Workflow runs you triggered

### Email Notifications

Configure in **Settings** → **Notifications**:
- Actions workflow runs
- Dependabot alerts
- Security alerts

### Slack/Discord Integration

Use GitHub Apps:
1. Install GitHub + Slack integration
2. Configure notifications channel
3. Subscribe to workflow events

### Custom Alerts

Add notification steps to workflows:

```yaml
- name: Notify on failure
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

---

## Advanced Configuration

### Using Different Container Registries

**Docker Hub:**
```yaml
env:
  REGISTRY: docker.io
  IMAGE_NAME: username/repo-name

# Add secrets:
# DOCKERHUB_USERNAME
# DOCKERHUB_TOKEN
```

**AWS ECR:**
```yaml
- name: Login to Amazon ECR
  uses: aws-actions/amazon-ecr-login@v2
  with:
    registry: ${{ secrets.ECR_REGISTRY }}
```

### Adding E2E Tests

```yaml
e2e-tests:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci
    - run: npx playwright install
    - run: npm run test:e2e
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: playwright-report
        path: playwright-report/
```

### Deploy to Production

```yaml
deploy-production:
  needs: test-image
  if: startsWith(github.ref, 'refs/tags/v')
  environment:
    name: production
    url: https://your-app.com
  steps:
    - name: Deploy via SSH
      uses: appleboy/ssh-action@v1
      with:
        host: ${{ secrets.DEPLOY_HOST }}
        username: ${{ secrets.DEPLOY_USER }}
        key: ${{ secrets.DEPLOY_KEY }}
        script: |
          docker pull ghcr.io/${{ github.repository }}:${{ github.ref_name }}
          docker-compose up -d
```

---

## Next Steps

1. **Customize workflows** for your specific needs
2. **Add deployment steps** when ready for production
3. **Configure monitoring** and alerting
4. **Set up Dependabot** for automated updates
5. **Enable branch protection** rules
6. **Review security** scan results regularly

For detailed documentation, see [workflows/README.md](./workflows/README.md).
