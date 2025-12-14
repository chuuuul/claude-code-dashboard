# CI/CD Setup Checklist

Use this checklist to ensure your CI/CD pipeline is properly configured.

## Initial Setup

### 1. GitHub Repository Settings

- [ ] Go to **Settings** → **Actions** → **General**
  - [ ] Set "Actions permissions" to "Allow all actions and reusable workflows"
  - [ ] Enable "Read and write permissions" under Workflow permissions
  - [ ] Check "Allow GitHub Actions to create and approve pull requests"

- [ ] Go to **Settings** → **Security & analysis**
  - [ ] Enable "Dependency graph"
  - [ ] Enable "Dependabot alerts"
  - [ ] Enable "Dependabot security updates"
  - [ ] Enable "Code scanning" (CodeQL)
  - [ ] Enable "Secret scanning"

- [ ] Go to **Settings** → **Branches**
  - [ ] Add branch protection rule for `main`:
    - [ ] Require pull request reviews (1 approval)
    - [ ] Require status checks to pass:
      - [ ] `CI Status Check`
      - [ ] `Security Status Check`
      - [ ] `Build & Test (Node 18.x)`
    - [ ] Require branches to be up to date
    - [ ] Optional: Require signed commits

### 2. Update README Badges

- [ ] Open `README.md`
- [ ] Replace `USERNAME/REPO` in badge URLs with your GitHub username and repository name
  ```markdown
  [![CI](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/ci.yml)
  ```

### 3. Remove Old Workflow (if exists)

- [ ] Backup old workflow file:
  ```bash
  mv .github/workflows/ci-cd.yml .github/workflows/ci-cd.yml.backup
  ```
  Or delete it:
  ```bash
  rm .github/workflows/ci-cd.yml
  ```

### 4. Commit New Workflows

- [ ] Review all workflow files:
  - [ ] `.github/workflows/ci.yml`
  - [ ] `.github/workflows/security.yml`
  - [ ] `.github/workflows/docker.yml`
  - [ ] `.github/dependabot.yml`

- [ ] Commit and push:
  ```bash
  git add .github/
  git commit -m "ci: Add production-ready GitHub Actions workflows"
  git push origin main
  ```

### 5. Verify Workflows

- [ ] Go to **Actions** tab in GitHub
- [ ] Verify three workflows appear:
  - [ ] CI
  - [ ] Security Scanning
  - [ ] Docker Build & Push
- [ ] Check that workflows run successfully

## Optional Enhancements

### 6. Codecov Integration (Optional)

- [ ] Go to [codecov.io](https://codecov.io)
- [ ] Sign in with GitHub
- [ ] Add your repository
- [ ] Copy the upload token
- [ ] Add to GitHub Secrets:
  - **Name:** `CODECOV_TOKEN`
  - **Value:** [Your Codecov token]
- [ ] Update README badge:
  ```markdown
  [![codecov](https://codecov.io/gh/USERNAME/REPO/branch/main/graph/badge.svg)](https://codecov.io/gh/USERNAME/REPO)
  ```

### 7. Configure Environments (for deployments)

- [ ] Go to **Settings** → **Environments**
- [ ] Create `staging` environment:
  - [ ] Add deployment protection rules if needed
  - [ ] Add reviewers (optional)
- [ ] Create `production` environment:
  - [ ] Add required reviewers
  - [ ] Set deployment branch pattern: `v*`

### 8. Alternative Container Registry (Optional)

**Docker Hub:**
- [ ] Create Docker Hub account
- [ ] Create access token
- [ ] Add GitHub Secrets:
  - **Name:** `DOCKERHUB_USERNAME`
  - **Value:** [Your Docker Hub username]
  - **Name:** `DOCKERHUB_TOKEN`
  - **Value:** [Your Docker Hub token]
- [ ] Update `docker.yml` workflow to use Docker Hub

**AWS ECR:**
- [ ] Set up AWS ECR repository
- [ ] Configure AWS credentials as GitHub Secrets:
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `ECR_REGISTRY`
- [ ] Update `docker.yml` to use ECR

## Testing

### 9. Test with Pull Request

- [ ] Create test branch:
  ```bash
  git checkout -b test/ci-workflows
  ```

- [ ] Make a small change:
  ```bash
  echo "# Test" >> TEST.md
  git add TEST.md
  git commit -m "test: Verify CI workflows"
  git push origin test/ci-workflows
  ```

- [ ] Create PR via GitHub UI
- [ ] Verify all workflows run:
  - [ ] CI workflow completes successfully
  - [ ] Security workflow completes successfully
  - [ ] Docker workflow builds (but doesn't push)
- [ ] Check status checks appear on PR
- [ ] Merge PR after verification

### 10. Test Release Process

- [ ] Ensure main branch is up to date:
  ```bash
  git checkout main
  git pull origin main
  ```

- [ ] Create release tag:
  ```bash
  git tag v1.0.0
  git push origin v1.0.0
  ```

- [ ] Go to **Actions** tab
- [ ] Verify "Docker Build & Push" workflow runs
- [ ] Check all jobs complete:
  - [ ] Build & Push Multi-Platform Image
  - [ ] Test Docker Image (linux/amd64)
  - [ ] Sign Image with Cosign
  - [ ] Create GitHub Release

- [ ] Go to **Releases** tab
- [ ] Verify release `v1.0.0` was created
- [ ] Check release notes are auto-generated

- [ ] Verify Docker images:
  ```bash
  docker pull ghcr.io/YOUR_USERNAME/YOUR_REPO:1.0.0
  docker pull ghcr.io/YOUR_USERNAME/YOUR_REPO:latest
  ```

### 11. Test Security Scanning

- [ ] Go to **Actions** tab
- [ ] Click "Security Scanning" workflow
- [ ] Click "Run workflow"
- [ ] Select `main` branch
- [ ] Click "Run workflow" button
- [ ] Wait for completion
- [ ] Go to **Security** → **Code scanning**
- [ ] Verify CodeQL results appear
- [ ] Review any findings

## Monitoring

### 12. Set Up Notifications

- [ ] Go to **Settings** → **Notifications**
- [ ] Configure workflow notifications:
  - [ ] Enable email notifications for failed workflows
  - [ ] Enable Dependabot alerts
  - [ ] Enable security alerts

### 13. Review Security Findings

- [ ] Go to **Security** tab
- [ ] Review:
  - [ ] Dependabot alerts
  - [ ] Code scanning alerts (CodeQL)
  - [ ] Secret scanning alerts
- [ ] Address any critical findings

### 14. Monitor Workflow Performance

- [ ] Go to **Actions** tab
- [ ] Review workflow run times
- [ ] Check for any consistent failures
- [ ] Review caching effectiveness

## Maintenance

### 15. Regular Checks (Weekly)

- [ ] Review Dependabot PRs
- [ ] Check security scan results
- [ ] Monitor workflow success rates
- [ ] Review outdated dependencies report

### 16. Regular Checks (Monthly)

- [ ] Update action versions if needed
- [ ] Review and update branch protection rules
- [ ] Audit user access and permissions
- [ ] Review security policies

### 17. Regular Checks (Quarterly)

- [ ] Full security audit
- [ ] Review and update CI/CD strategy
- [ ] Performance optimization review
- [ ] Update documentation

## Troubleshooting

### Common Issues

**Workflows not running:**
- [ ] Check if Actions are enabled
- [ ] Verify workflow file syntax (YAML)
- [ ] Check branch name matches trigger conditions

**Docker push fails:**
- [ ] Verify GITHUB_TOKEN permissions
- [ ] Check package visibility settings
- [ ] Ensure logged in to registry

**Tests failing:**
- [ ] Review test logs
- [ ] Check environment variables
- [ ] Verify dependencies are installed
- [ ] Ensure tmux is available (for integration tests)

**Security scan failures:**
- [ ] Review vulnerability details
- [ ] Update dependencies
- [ ] Check for false positives
- [ ] Add exceptions if necessary

## Advanced Configuration

### 18. Self-Hosted Runners (Optional)

- [ ] Set up self-hosted runner infrastructure
- [ ] Configure runner groups
- [ ] Update workflows to use self-hosted runners
- [ ] Implement runner auto-scaling

### 19. Custom Deployment Scripts

- [ ] Create deployment scripts in `scripts/` directory
- [ ] Update docker.yml with deployment steps
- [ ] Test deployment to staging
- [ ] Document deployment process

### 20. Integration with External Services

- [ ] Set up Slack/Discord notifications
- [ ] Configure monitoring dashboards
- [ ] Integrate with incident management
- [ ] Set up performance tracking

## Completion

Once you've completed all checklist items:

- [ ] All workflows running successfully
- [ ] Branch protection configured
- [ ] Security scanning active
- [ ] Dependabot configured
- [ ] Documentation updated
- [ ] Team members trained

**Congratulations! Your CI/CD pipeline is production-ready.**

---

## Quick Reference

### Workflow Triggers

| Workflow | Push (main) | Pull Request | Tags | Schedule | Manual |
|----------|-------------|--------------|------|----------|--------|
| CI       | ✓           | ✓            | -    | -        | ✓      |
| Security | ✓           | ✓            | -    | Daily    | ✓      |
| Docker   | ✓           | ✓            | ✓    | -        | ✓      |

### Required Status Checks

- `CI Status Check` - Must pass for PR merge
- `Security Status Check` - Must pass for PR merge
- `Build & Test (Node 18.x)` - Recommended

### Useful Links

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Workflow Documentation](.github/workflows/README.md)
- [Quick Start Guide](.github/WORKFLOWS_GUIDE.md)
- [Dependabot Configuration](https://docs.github.com/en/code-security/dependabot)
- [CodeQL Documentation](https://codeql.github.com/)
