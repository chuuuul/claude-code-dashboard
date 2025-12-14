# GitHub Actions Workflows

This directory contains the CI/CD workflows for the Claude Code Dashboard project.

## Overview

The project uses a multi-workflow approach with separation of concerns:

1. **CI Workflow** (`ci.yml`) - Continuous Integration
2. **Security Workflow** (`security.yml`) - Security scanning and compliance
3. **Docker Workflow** (`docker.yml`) - Container builds and releases

## Workflows

### 1. CI Workflow (`ci.yml`)

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Manual dispatch

**Jobs:**

#### Build & Test Matrix
- Tests on Node.js 18.x and 20.x
- Installs backend and frontend dependencies
- Runs ESLint on both codebases
- Executes unit tests with coverage
- Builds frontend (Vite)
- Verifies server startup
- Uploads coverage to Codecov

#### Integration Tests
- Runs integration tests
- Requires tmux for session management tests
- Uploads integration test coverage

#### Code Quality
- Runs linters for backend and frontend
- Performs security audits with `npm audit`
- Checks for outdated dependencies
- CodeQL integration (security analysis)

#### Smoke Tests
- Runs smoke tests against built application
- Verifies core functionality

#### CI Status Check
- Aggregates all job results
- Fails if critical jobs fail
- Required check for PR merges

**Caching:**
- npm dependencies cached via `actions/setup-node`
- Reduces installation time

**Artifacts:**
- Build artifacts (7 days retention)
- Coverage reports (uploaded to Codecov)

---

### 2. Security Workflow (`security.yml`)

**Triggers:**
- Push to `main` or `develop`
- Pull requests
- Daily schedule (2 AM UTC)
- Manual dispatch

**Jobs:**

#### Dependency Vulnerability Scan
- Runs `npm audit` on backend and frontend
- Fails on critical vulnerabilities
- Warns on high-severity issues
- Uploads audit reports (30 days retention)

#### License Compliance
- Checks dependency licenses
- Ensures compliance with project requirements

#### CodeQL Analysis (SAST)
- Static application security testing
- Analyzes JavaScript/TypeScript code
- Detects security vulnerabilities and code quality issues
- Results uploaded to GitHub Security tab

#### Secret Scanning
- Uses TruffleHog to detect secrets in code
- Scans full git history
- Only reports verified secrets

#### Docker Image Scanning
- Uses Trivy to scan Docker images
- Detects vulnerabilities in base images and dependencies
- Uploads results to GitHub Security (SARIF format)
- Fails on critical/high vulnerabilities

#### Dependency Update Check
- Runs on schedule (daily)
- Generates report of outdated dependencies
- Helps maintain up-to-date dependencies

#### Security Status Check
- Aggregates all security job results
- Fails on critical security issues

---

### 3. Docker Workflow (`docker.yml`)

**Triggers:**
- Push to tags matching `v*.*.*` (semantic versioning)
- Push to `main` branch
- Pull requests
- Manual dispatch

**Jobs:**

#### Build & Push Multi-Platform Image
- Builds for `linux/amd64` and `linux/arm64`
- Uses Docker Buildx for multi-platform support
- Pushes to GitHub Container Registry (ghcr.io)
- Generates SBOMs and provenance attestations

**Image Tags:**
- Semantic version (e.g., `1.2.3` from `v1.2.3`)
- Major.minor (e.g., `1.2` from `v1.2.3`)
- Major version (e.g., `1` from `v1.2.3`)
- Branch name
- Git SHA with branch prefix
- `latest` for default branch

**Metadata:**
- OCI-compliant labels
- Build date, VCS ref, version
- Vendor and license information

#### Test Docker Image
- Pulls and tests built images
- Verifies non-root user execution
- Checks installed dependencies (Node.js, tmux)
- Runs comprehensive smoke tests
- Tests health endpoint and security headers

#### Sign Image (for releases)
- Uses Cosign for image signing
- Provides supply chain security
- Only runs on version tags

#### Create GitHub Release
- Automatically creates GitHub releases for tags
- Generates changelog from git commits
- Includes installation instructions

---

## Configuration

### Required Secrets

The workflows use GitHub's default `GITHUB_TOKEN` for most operations. No additional secrets are required for basic functionality.

**Optional Secrets:**

For Codecov integration (optional):
- `CODECOV_TOKEN` - For uploading coverage reports

For Docker Hub (alternative to GHCR):
- `DOCKERHUB_USERNAME` - Docker Hub username
- `DOCKERHUB_TOKEN` - Docker Hub access token

### Environment Variables

Configured in workflow files:

```yaml
NODE_VERSION: '18.x'           # Primary Node.js version
REGISTRY: ghcr.io              # Container registry
IMAGE_NAME: ${{ github.repository }}  # Docker image name
```

### Branch Protection Rules

Recommended branch protection for `main`:

- Require pull request reviews (1 approver)
- Require status checks to pass:
  - `CI Status Check` (from ci.yml)
  - `Security Status Check` (from security.yml)
- Require branches to be up to date
- Require signed commits (optional)

---

## Workflow Best Practices

### Security

1. **Pinned Action Versions**: All actions are pinned to specific SHA commits
   - Prevents supply chain attacks
   - Example: `actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11`

2. **Minimal Permissions**: Each job uses least-privilege permissions
   ```yaml
   permissions:
     contents: read
     packages: write
   ```

3. **Secret Management**: Uses GitHub Secrets, never hardcoded
4. **Security Scanning**: Multiple layers (dependencies, code, containers, secrets)

### Performance

1. **Concurrency Control**: Prevents duplicate workflow runs
   ```yaml
   concurrency:
     group: ${{ github.workflow }}-${{ github.ref }}
     cancel-in-progress: true
   ```

2. **Caching**: npm dependencies cached for faster installs
3. **Parallel Jobs**: Independent jobs run in parallel
4. **Timeout Limits**: All jobs have reasonable timeouts

### Reliability

1. **Fail-Fast Control**: Matrix builds continue even if one fails
   ```yaml
   strategy:
     fail-fast: false
   ```

2. **Continue-on-Error**: Non-critical steps don't block workflow
3. **Proper Error Handling**: Clear error messages and exit codes
4. **Artifact Retention**: Build artifacts retained for investigation

---

## Usage Examples

### Running Workflows Locally

#### Simulate CI locally:
```bash
# Install dependencies
npm ci
cd client && npm ci && cd ..

# Run linters
npm run lint
cd client && npm run lint && cd ..

# Run tests
npm run test:unit
npm run test:integration

# Build frontend
npm run build
```

#### Test Docker build locally:
```bash
# Build image
docker build -t claude-dashboard:local .

# Run smoke test
docker run -d --name test \
  -p 3000:3000 \
  -e JWT_SECRET=test-secret \
  -e ADMIN_PASSWORD="Test123!" \
  claude-dashboard:local

# Health check
curl http://localhost:3000/health

# Cleanup
docker stop test && docker rm test
```

#### Security scanning locally:
```bash
# npm audit
npm audit --audit-level=moderate

# Trivy scan
docker pull aquasec/trivy:latest
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image claude-dashboard:local
```

---

## Triggering Workflows

### Manual Workflow Dispatch

All workflows support manual triggering via GitHub UI:

1. Go to **Actions** tab
2. Select workflow
3. Click **Run workflow**
4. Choose branch and any inputs

### Creating a Release

To trigger a release build:

```bash
# Tag a version
git tag v1.2.3
git push origin v1.2.3
```

This triggers:
- Full CI pipeline
- Security scanning
- Docker build for multiple platforms
- Image signing with Cosign
- GitHub Release creation

### Pull Request Workflow

When opening a PR:
1. CI workflow runs (build, test, lint)
2. Security workflow runs (except scheduled jobs)
3. Docker workflow runs build (but doesn't push)
4. All checks must pass before merge

---

## Monitoring & Debugging

### Viewing Workflow Status

- **Actions Tab**: See all workflow runs
- **Pull Requests**: Status checks appear automatically
- **Branches**: Branch protection shows required checks

### Debugging Failed Workflows

1. **Check Logs**: Click on failed job for detailed logs
2. **Artifacts**: Download build artifacts for investigation
3. **Re-run Jobs**: Re-run failed jobs or entire workflow
4. **Local Reproduction**: Use examples above to reproduce locally

### Common Issues

**npm install failures:**
- Check `package-lock.json` is committed
- Verify Node.js version compatibility

**Test failures:**
- Review test logs in job output
- Check environment variable configuration
- Ensure tmux is installed (for integration tests)

**Docker build failures:**
- Verify Dockerfile syntax
- Check `.dockerignore` configuration
- Ensure all required files are copied

**Security scan failures:**
- Review vulnerability details
- Update dependencies with `npm update`
- Check for false positives

---

## Maintenance

### Updating Action Versions

Action versions are pinned to SHA commits. To update:

1. Check for new versions on action's GitHub repo
2. Find the commit SHA for the version
3. Update workflow files with new SHA
4. Test in a branch before merging

Example:
```yaml
# Before
uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1

# After (hypothetical v4.2.0)
uses: actions/checkout@<new-sha> # v4.2.0
```

### Dependency Updates

1. **Scheduled Scans**: Security workflow checks daily
2. **Dependabot**: Configure Dependabot for automated PRs
3. **Manual Review**: Quarterly review of all dependencies

### Workflow Optimization

Periodically review:
- Job execution times
- Cache hit rates
- Artifact sizes
- Test coverage trends

---

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Buildx Documentation](https://docs.docker.com/buildx/working-with-buildx/)
- [CodeQL Documentation](https://codeql.github.com/docs/)
- [Trivy Documentation](https://aquasecurity.github.io/trivy/)
- [Cosign Documentation](https://docs.sigstore.dev/cosign/overview/)

---

## Support

For issues with workflows:
1. Check workflow logs for error details
2. Review this documentation
3. Search GitHub Issues
4. Create new issue with workflow logs attached
