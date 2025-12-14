# CI/CD Workflow Architecture

Visual representation of the GitHub Actions workflow architecture for the Claude Code Dashboard.

## Directory Structure

```
.github/
├── CI_CD_IMPLEMENTATION_SUMMARY.md  # Complete implementation summary
├── SETUP_CHECKLIST.md               # Step-by-step setup checklist
├── WORKFLOWS_GUIDE.md               # Quick start and usage guide
├── WORKFLOW_ARCHITECTURE.md         # This file
├── dependabot.yml                   # Automated dependency updates
└── workflows/
    ├── README.md                    # Detailed workflow documentation
    ├── ci.yml                       # Main CI workflow (367 lines)
    ├── security.yml                 # Security scanning (383 lines)
    ├── docker.yml                   # Docker build & publish (395 lines)
    └── ci-cd.yml                    # Old workflow (deprecated)
```

---

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Actions Workflows                     │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   CI Workflow    │  │Security Workflow │  │Docker Workflow   │
│   (ci.yml)       │  │ (security.yml)   │  │  (docker.yml)    │
└──────────────────┘  └──────────────────┘  └──────────────────┘
        │                     │                      │
        ├─────────────────────┼──────────────────────┤
        │                     │                      │
        v                     v                      v
┌──────────────────────────────────────────────────────────────┐
│                    Trigger Conditions                        │
│                                                              │
│  • Push to main/develop     • Daily at 2 AM UTC            │
│  • Pull requests            • Tags (v*.*.*)                 │
│  • Manual dispatch          • Manual dispatch               │
└──────────────────────────────────────────────────────────────┘
```

---

## CI Workflow (ci.yml)

```
┌─────────────────────────────────────────────────────────────┐
│                     CI Workflow                             │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        v                   v                   v
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│Build & Test  │   │Integration   │   │Code Quality  │
│   Matrix     │   │    Tests     │   │  & Audit     │
└──────────────┘   └──────────────┘   └──────────────┘
        │                   │                   │
        │  ┌────────────────┘                   │
        │  │                                    │
        v  v                                    v
┌──────────────┐                       ┌──────────────┐
│Smoke Tests   │                       │ESLint        │
└──────────────┘                       │npm audit     │
        │                              │Outdated deps │
        │                              └──────────────┘
        v
┌──────────────────────────────────────────────────────┐
│             CI Status Check (Required)                │
│  ✓ Build & Test Matrix                               │
│  ✓ Integration Tests                                 │
│  ✓ Code Quality                                      │
│  ✓ Smoke Tests                                       │
└──────────────────────────────────────────────────────┘
```

### Build & Test Matrix Details

```
┌─────────────────────────────────────────┐
│      Build & Test Matrix                │
│                                         │
│  Node.js 18.x    │    Node.js 20.x     │
├──────────────────┼─────────────────────┤
│  Install deps    │    Install deps     │
│  Lint code       │    Lint code        │
│  Backend tests   │    Backend tests    │
│  Frontend tests  │    Frontend tests   │
│  Build frontend  │    Build frontend   │
│  Verify server   │    Verify server    │
│  Upload coverage │    Upload coverage  │
└──────────────────┴─────────────────────┘
          │                    │
          └────────┬───────────┘
                   │
                   v
          ┌────────────────┐
          │ Upload to      │
          │ Codecov        │
          └────────────────┘
```

---

## Security Workflow (security.yml)

```
┌──────────────────────────────────────────────────────────────┐
│                   Security Workflow                          │
└──────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼──────────────────────┐
        │                   │                      │
        v                   v                      v
┌──────────────┐   ┌──────────────┐      ┌──────────────┐
│  Dependency  │   │   CodeQL     │      │   Secret     │
│    Scan      │   │   Analysis   │      │  Scanning    │
│              │   │    (SAST)    │      │ (TruffleHog) │
└──────────────┘   └──────────────┘      └──────────────┘
        │                   │                      │
        v                   v                      v
┌──────────────┐   ┌──────────────┐      ┌──────────────┐
│   License    │   │   Docker     │      │  Dependency  │
│  Compliance  │   │Image Scan    │      │   Update     │
│              │   │   (Trivy)    │      │    Check     │
└──────────────┘   └──────────────┘      └──────────────┘
        │                   │                      │
        └───────────────────┼──────────────────────┘
                            │
                            v
        ┌────────────────────────────────────┐
        │   Upload to GitHub Security        │
        │   • SARIF results                  │
        │   • Vulnerability reports          │
        │   • Security advisories            │
        └────────────────────────────────────┘
                            │
                            v
        ┌────────────────────────────────────┐
        │    Security Status Check           │
        │  ✓ Dependency Scan                 │
        │  ✓ CodeQL Analysis                 │
        │  ✓ Secret Scanning                 │
        │  ✓ Docker Scan                     │
        └────────────────────────────────────┘
```

### Dependency Scan Flow

```
┌─────────────────────────────────────┐
│      Dependency Scan                │
└─────────────────────────────────────┘
                │
        ┌───────┴────────┐
        │                │
        v                v
┌──────────────┐  ┌──────────────┐
│   Backend    │  │  Frontend    │
│  npm audit   │  │  npm audit   │
└──────────────┘  └──────────────┘
        │                │
        v                v
┌──────────────┐  ┌──────────────┐
│Check Results │  │Check Results │
│ • Critical   │  │ • Critical   │
│ • High       │  │ • High       │
│ • Moderate   │  │ • Moderate   │
└──────────────┘  └──────────────┘
        │                │
        └────────┬───────┘
                 │
                 v
        ┌────────────────┐
        │ Fail if        │
        │ critical > 0   │
        │ Warn if high   │
        └────────────────┘
                 │
                 v
        ┌────────────────┐
        │ Upload audit   │
        │ reports (JSON) │
        └────────────────┘
```

---

## Docker Workflow (docker.yml)

```
┌──────────────────────────────────────────────────────────────┐
│                    Docker Workflow                           │
└──────────────────────────────────────────────────────────────┘
                            │
                            v
        ┌────────────────────────────────────┐
        │   Build & Push Multi-Platform      │
        │   • linux/amd64                    │
        │   • linux/arm64                    │
        │                                    │
        │   Generate:                        │
        │   • SBOM                           │
        │   • Provenance                     │
        └────────────────────────────────────┘
                            │
                            v
        ┌────────────────────────────────────┐
        │        Tag Strategy                │
        │   • Semantic version (1.2.3)       │
        │   • Major.minor (1.2)              │
        │   • Major (1)                      │
        │   • Branch name                    │
        │   • Git SHA                        │
        │   • latest                         │
        └────────────────────────────────────┘
                            │
                            v
        ┌────────────────────────────────────┐
        │      Push to GHCR                  │
        │  ghcr.io/username/repo:tags        │
        └────────────────────────────────────┘
                            │
        ┌───────────────────┴────────────────┐
        │                                    │
        v                                    v
┌──────────────────┐              ┌──────────────────┐
│  Test Image      │              │  Sign Image      │
│  • linux/amd64   │              │  (Cosign)        │
│  • Smoke tests   │              │  (Tags only)     │
│  • Health checks │              └──────────────────┘
└──────────────────┘                        │
        │                                   │
        └───────────────┬───────────────────┘
                        │
                        v
        ┌────────────────────────────────────┐
        │      Create GitHub Release         │
        │  • Changelog                       │
        │  • Installation instructions       │
        │  • Docker image links              │
        └────────────────────────────────────┘
```

### Docker Build Process

```
┌─────────────────────────────────────────┐
│       Multi-Stage Build                 │
└─────────────────────────────────────────┘
                │
        ┌───────┴────────┐
        │                │
        v                v
┌──────────────┐  ┌──────────────┐
│  Frontend    │  │   Backend    │
│   Builder    │  │   Builder    │
│              │  │              │
│ • npm ci     │  │ • npm ci     │
│ • npm build  │  │ • compile    │
└──────────────┘  └──────────────┘
        │                │
        └────────┬───────┘
                 │
                 v
        ┌────────────────┐
        │   Production   │
        │     Image      │
        │                │
        │ • Node.js 18   │
        │ • tmux         │
        │ • Non-root     │
        │ • Health check │
        └────────────────┘
                 │
                 v
        ┌────────────────┐
        │   Build for    │
        │   Platforms    │
        │                │
        │ • amd64        │
        │ • arm64        │
        └────────────────┘
```

---

## Workflow Triggers

```
┌────────────────────────────────────────────────────────┐
│                  Trigger Matrix                        │
├────────────┬──────────┬──────────┬───────┬────────────┤
│ Event      │    CI    │ Security │Docker │ Dependabot │
├────────────┼──────────┼──────────┼───────┼────────────┤
│ Push main  │    ✓     │    ✓     │   ✓   │     -      │
│ Push dev   │    ✓     │    ✓     │   -   │     -      │
│ Pull Req   │    ✓     │    ✓     │   ✓*  │     -      │
│ Tag v*.*   │    -     │    -     │   ✓   │     -      │
│ Schedule   │    -     │    ✓**   │   -   │     ✓***   │
│ Manual     │    ✓     │    ✓     │   ✓   │     -      │
└────────────┴──────────┴──────────┴───────┴────────────┘

  *  Builds but doesn't push
 **  Daily at 2 AM UTC
*** Weekly on Monday
```

---

## Status Checks for PR Merges

```
┌───────────────────────────────────────────────────────┐
│           Required Status Checks                      │
├───────────────────────────────────────────────────────┤
│                                                       │
│  ✓  CI Status Check                                  │
│     ├─ Build & Test (Node 18.x)                      │
│     ├─ Build & Test (Node 20.x)                      │
│     ├─ Integration Tests                             │
│     ├─ Code Quality                                  │
│     └─ Smoke Tests                                   │
│                                                       │
│  ✓  Security Status Check                            │
│     ├─ Dependency Scan                               │
│     ├─ License Check                                 │
│     ├─ CodeQL Analysis                               │
│     ├─ Secret Scan                                   │
│     └─ Docker Scan                                   │
│                                                       │
│  ○  Docker Build (optional)                          │
│     └─ Build & Test                                  │
│                                                       │
└───────────────────────────────────────────────────────┘
```

---

## Artifact Flow

```
┌──────────────────────────────────────────────────────┐
│               Artifact Generation                    │
└──────────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        v               v               v
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Build        │ │ Test         │ │ Security     │
│ Artifacts    │ │ Coverage     │ │ Reports      │
│              │ │              │ │              │
│ • Frontend   │ │ • LCOV       │ │ • SARIF      │
│ • Backend    │ │ • JSON       │ │ • JSON       │
│              │ │              │ │              │
│ 7 days       │ │ Codecov      │ │ 30 days      │
└──────────────┘ └──────────────┘ └──────────────┘
        │               │               │
        v               v               v
┌──────────────────────────────────────────────┐
│          GitHub Storage                      │
│                                              │
│  • Actions Artifacts                         │
│  • Codecov Dashboard                         │
│  • Security Tab (SARIF)                      │
└──────────────────────────────────────────────┘
```

---

## Security Integration Points

```
┌──────────────────────────────────────────────────────┐
│          GitHub Security Features                    │
└──────────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        v               v               v
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Dependabot   │ │ Code         │ │ Secret       │
│ Alerts       │ │ Scanning     │ │ Scanning     │
│              │ │              │ │              │
│ • Automated  │ │ • CodeQL     │ │ • TruffleHog │
│ • Weekly PRs │ │ • SARIF      │ │ • Verified   │
│ • Grouped    │ │ • Daily      │ │              │
└──────────────┘ └──────────────┘ └──────────────┘
        │               │               │
        v               v               v
┌──────────────────────────────────────────────┐
│         Security Advisories                  │
│                                              │
│  Centralized security dashboard              │
│  • View all vulnerabilities                  │
│  • Track remediation                         │
│  • Configure notifications                   │
└──────────────────────────────────────────────┘
```

---

## Caching Strategy

```
┌──────────────────────────────────────────────────────┐
│                Cache Architecture                    │
└──────────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        v               v               v
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ npm          │ │ Docker       │ │ Build        │
│ Dependencies │ │ Layers       │ │ Outputs      │
│              │ │              │ │              │
│ • package-   │ │ • BuildKit   │ │ • Frontend   │
│   lock.json  │ │ • Multi-     │ │ • Artifacts  │
│ • Node       │ │   stage      │ │              │
│   version    │ │              │ │              │
└──────────────┘ └──────────────┘ └──────────────┘
        │               │               │
        v               v               v
┌──────────────────────────────────────────────┐
│        GitHub Actions Cache                  │
│                                              │
│  • 10GB limit per repository                 │
│  • 7-day retention (unused)                  │
│  • Automatic cleanup                         │
└──────────────────────────────────────────────┘
```

---

## Deployment Pipeline (Future)

```
┌──────────────────────────────────────────────────────┐
│          Production Deployment Flow                  │
│              (Ready for Implementation)              │
└──────────────────────────────────────────────────────┘
                        │
                        v
        ┌────────────────────────────────┐
        │   Tag Release (v1.2.3)         │
        └────────────────────────────────┘
                        │
                        v
        ┌────────────────────────────────┐
        │   CI Workflow Passes           │
        └────────────────────────────────┘
                        │
                        v
        ┌────────────────────────────────┐
        │   Security Scan Passes         │
        └────────────────────────────────┘
                        │
                        v
        ┌────────────────────────────────┐
        │   Docker Build & Push          │
        └────────────────────────────────┘
                        │
                        v
        ┌────────────────────────────────┐
        │   Image Testing & Signing      │
        └────────────────────────────────┘
                        │
                        v
        ┌────────────────────────────────┐
        │   Deploy to Staging            │
        │   (Environment: staging)       │
        └────────────────────────────────┘
                        │
                        v
        ┌────────────────────────────────┐
        │   Manual Approval Required     │
        └────────────────────────────────┘
                        │
                        v
        ┌────────────────────────────────┐
        │   Deploy to Production         │
        │   (Environment: production)    │
        └────────────────────────────────┘
                        │
                        v
        ┌────────────────────────────────┐
        │   Create GitHub Release        │
        └────────────────────────────────┘
```

---

## Performance Metrics

```
┌──────────────────────────────────────────────────────┐
│           Expected Workflow Times                    │
├──────────────────────────────────────────────────────┤
│                                                      │
│  CI Workflow:                ~8-12 minutes          │
│  ├─ Build & Test Matrix      5-7 minutes            │
│  ├─ Integration Tests        2-3 minutes            │
│  ├─ Code Quality             1-2 minutes            │
│  └─ Smoke Tests              1-2 minutes            │
│                                                      │
│  Security Workflow:          ~10-15 minutes         │
│  ├─ Dependency Scan          1-2 minutes            │
│  ├─ CodeQL Analysis          4-6 minutes            │
│  ├─ Secret Scan              2-3 minutes            │
│  └─ Docker Scan              3-4 minutes            │
│                                                      │
│  Docker Workflow:            ~15-25 minutes         │
│  ├─ Multi-platform Build     10-15 minutes          │
│  ├─ Image Testing            3-5 minutes            │
│  ├─ Image Signing            1-2 minutes            │
│  └─ Create Release           1-2 minutes            │
│                                                      │
└──────────────────────────────────────────────────────┘

Times vary based on:
• Code changes
• Cache hit rate
• GitHub Actions runner availability
• Network conditions
```

---

## Success Criteria

```
┌──────────────────────────────────────────────────────┐
│              Workflow Success Criteria               │
├──────────────────────────────────────────────────────┤
│                                                      │
│  CI Workflow Success:                                │
│  ✓ All tests pass on Node 18.x and 20.x            │
│  ✓ Code coverage meets minimum threshold            │
│  ✓ No linting errors                                │
│  ✓ Frontend builds successfully                     │
│  ✓ Server starts and health check passes            │
│                                                      │
│  Security Workflow Success:                          │
│  ✓ No critical vulnerabilities                      │
│  ✓ High vulnerabilities acknowledged or fixed       │
│  ✓ No secrets detected in code                      │
│  ✓ CodeQL analysis passes                           │
│  ✓ License compliance verified                      │
│                                                      │
│  Docker Workflow Success:                            │
│  ✓ Multi-platform build completes                   │
│  ✓ All platform images pass smoke tests             │
│  ✓ No critical/high vulnerabilities in image        │
│  ✓ Images pushed to registry                        │
│  ✓ Release created (for tags)                       │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Maintenance Schedule

```
┌──────────────────────────────────────────────────────┐
│            Automated Maintenance                     │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Daily (2 AM UTC):                                   │
│  • Security vulnerability scan                       │
│  • Dependency update check                           │
│  • Audit report generation                           │
│                                                      │
│  Weekly (Monday 9 AM UTC):                           │
│  • Backend dependency updates (Dependabot)           │
│  • Frontend dependency updates (Dependabot)          │
│                                                      │
│  Weekly (Tuesday 9 AM UTC):                          │
│  • GitHub Actions updates (Dependabot)               │
│                                                      │
│  Weekly (Wednesday 9 AM UTC):                        │
│  • Docker base image updates (Dependabot)            │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Key Takeaways

1. **Separation of Concerns**: Three independent workflows for CI, Security, and Docker
2. **Parallel Execution**: Jobs run in parallel where possible for speed
3. **Comprehensive Testing**: Multiple Node versions, unit, integration, and smoke tests
4. **Security First**: Multi-layer security scanning with automated reporting
5. **Production Ready**: Multi-platform Docker builds with signing and SBOM
6. **Developer Friendly**: Clear status checks, comprehensive documentation
7. **Automated Maintenance**: Dependabot keeps dependencies up to date
8. **Performance Optimized**: Intelligent caching and concurrency control

For detailed implementation information, see:
- [CI/CD Implementation Summary](./CI_CD_IMPLEMENTATION_SUMMARY.md)
- [Setup Checklist](./SETUP_CHECKLIST.md)
- [Workflows Guide](./WORKFLOWS_GUIDE.md)
- [Workflow Documentation](./workflows/README.md)
