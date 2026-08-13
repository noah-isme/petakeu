# CI/CD Pipeline Documentation

Complete guide for Continuous Integration and Continuous Deployment for Petakeu.

---

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CI/CD Pipeline Flow                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────┐    ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  Push   │───▶│  CI Build   │───▶│  CI Tests    │───▶│  Artifact     │  │
│  │  / PR   │    │  (Typecheck,│    │  (Unit, Int, │    │  (Docker      │  │
│  │         │    │   Lint)     │    │   E2E)       │    │   Images)     │  │
│  └─────────┘    └─────────────┘    └──────────────┘    └───────┬───────┘  │
│                                                                 │          │
│                          ┌─────────────────────────────────────┘          │
│                          ▼                                                │
│                 ┌───────────────┐    ┌──────────────┐    ┌────────────┐  │
│                 │  Release      │───▶│  Smoke Tests │───▶│  Deploy to │  │
│                 │  Verification │    │  (Health,    │    │  Production│  │
│                 │  (Manual)     │    │   Smoke)     │    │  (Manual)  │  │
│                 └───────────────┘    └──────────────┘    └────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Branch Strategy

```
main ──────────────────────────────────────────────────────▶ (Production)
  ▲
  │ PR merge
  │
develop ───────────────────────────────────────────────────▶ (Staging)
  ▲
  │ PR merge
  │
feature/* ─────────────────────────────────────────────────▶ (Feature branches)
  ▲
  │
hotfix/* ──────────────────────────────────────────────────▶ (Emergency fixes)
```

### Branch Protection Rules

| Branch | Required Reviews | Required Checks | Dismiss Stale Reviews | Require Linear History |
|--------|------------------|-----------------|----------------------|------------------------|
| `main` | 2 | All CI jobs | Yes | Yes |
| `develop` | 1 | All CI jobs | Yes | No |
| `release/*` | 1 | All CI jobs | No | No |

---

## CI Pipeline (GitHub Actions)

### Workflow: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  NODE_VERSION: "20"
  PNPM_VERSION: "8.15.4"

jobs:
  # ─────────────────────────────────────────────────────────────
  # Static Analysis
  # ─────────────────────────────────────────────────────────────
  static-analysis:
    name: Static Analysis
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: TypeScript type check
        run: pnpm typecheck

      - name: ESLint
        run: pnpm lint

      - name: Prettier check
        run: pnpm format --check

  # ─────────────────────────────────────────────────────────────
  # Unit Tests
  # ─────────────────────────────────────────────────────────────
  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run unit tests (server)
        run: pnpm --filter @petakeu/server test --run --reporter=junit
        env:
          VITEST_POOL: forks

      - name: Run unit tests (web)
        run: pnpm --filter @petakeu/web test --run --reporter=junit
        env:
          VITEST_POOL: forks

      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: |
            apps/server/coverage
            apps/web/coverage
          retention-days: 7

  # ─────────────────────────────────────────────────────────────
  # Integration Tests (with Testcontainers)
  # ─────────────────────────────────────────────────────────────
  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    timeout-minutes: 20
    services:
      postgres:
        image: postgis/postgis:16-3.4
        env:
          POSTGRES_DB: petakeu
          POSTGRES_USER: petakeu
          POSTGRES_PASSWORD: petakeu
        ports: [5432:5432]
        options: >-
          --health-cmd "pg_isready -U petakeu"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports: [6379:6379]
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run migrations
        run: |
          export DATABASE_URL="postgresql://petakeu:petakeu@localhost:5432/petakeu"
          export REDIS_URL="redis://localhost:6379"
          psql "$DATABASE_URL" -f apps/server/migrations/001_init.sql

      - name: Seed test data
        run: |
          export DATABASE_URL="postgresql://petakeu:petakeu@localhost:5432/petakeu"
          psql "$DATABASE_URL" -f tests/sql/seed_test_data.sql

      - name: Run integration tests
        run: pnpm test:integration
        env:
          DATABASE_URL: postgresql://petakeu:petakeu@localhost:5432/petakeu
          REDIS_URL: redis://localhost:6379

  # ─────────────────────────────────────────────────────────────
  # E2E Tests (Playwright)
  # ─────────────────────────────────────────────────────────────
  e2e-tests:
    name: E2E Tests
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build web
        run: pnpm --filter @petakeu/web build

      - name: Install Playwright browsers
        run: pnpm --filter @petakeu/web exec playwright install --with-deps chromium

      - name: Start dev server
        run: |
          pnpm --filter @petakeu/web dev &
          sleep 10

      - name: Run E2E tests
        run: pnpm --filter @petakeu/web test:e2e --project=chromium
        env:
          PLAYWRIGHT_BASE_URL: http://localhost:5173

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: apps/web/test-results/
          retention-days: 7

      - name: Upload screenshots on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-screenshots
          path: apps/web/test-results/**/*.png
          retention-days: 7

  # ─────────────────────────────────────────────────────────────
  # Security Scans
  # ─────────────────────────────────────────────────────────────
  security-scan:
    name: Security Scan
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Dependency audit (server)
        run: pnpm --filter @petakeu/server audit --prod --audit-level=high

      - name: Dependency audit (web)
        run: pnpm --filter @petakeu/web audit --prod --audit-level=high

      - name: Trivy container scan (server)
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: "petakeu/server:latest"
          format: "sarif"
          output: "trivy-server.sarif"

      - name: Trivy container scan (web)
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: "petakeu/web:latest"
          format: "sarif"
          output: "trivy-web.sarif"

      - name: Upload Trivy results
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: "trivy-*.sarif"

  # ─────────────────────────────────────────────────────────────
  # Build Docker Images
  # ─────────────────────────────────────────────────────────────
  build-images:
    name: Build Docker Images
    runs-on: ubuntu-latest
    needs: [static-analysis, unit-tests, integration-tests, e2e-tests, security-scan]
    if: github.event_name == 'push' && (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop')
    timeout-minutes: 30
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata (server)
        id: meta-server
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}/server
          tags: |
            type=ref,event=branch
            type=sha,prefix=
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push server
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./apps/server/Dockerfile
          push: true
          tags: ${{ steps.meta-server.outputs.tags }}
          labels: ${{ steps.meta-server.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Extract metadata (web)
        id: meta-web
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}/web
          tags: |
            type=ref,event=branch
            type=sha,prefix=
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push web
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./apps/web/Dockerfile
          push: true
          tags: ${{ steps.meta-web.outputs.tags }}
          labels: ${{ steps.meta-web.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ─────────────────────────────────────────────────────────────
  # Deploy to Staging
  # ─────────────────────────────────────────────────────────────
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: build-images
    if: github.ref == 'refs/heads/develop'
    environment: staging
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy to staging
        run: |
          # Using SSH to staging server
          ssh ${{ secrets.STAGING_SSH_USER }}@${{ secrets.STAGING_HOST }} << 'EOF'
            cd /opt/petakeu
            docker compose -f docker-compose.prod.yml pull
            docker compose -f docker-compose.prod.yml up -d --remove-orphans
            docker image prune -f
          EOF
        env:
          STAGING_SSH_KEY: ${{ secrets.STAGING_SSH_KEY }}

      - name: Health check
        run: |
          sleep 15
          curl -f https://staging.petakeu.go.id/health
          curl -f https://api.staging.petakeu.go.id/health

      - name: Run smoke tests
        run: |
          pnpm --filter @petakeu/web test:e2e --project=chromium --grep "smoke"
        env:
          PLAYWRIGHT_BASE_URL: https://staging.petakeu.go.id
```

---

## CD Pipeline (Deployment)

### Staging Release Verification (Manual, protected)

The repository's protected staging gate is
`.github/workflows/deploy-staging.yml`. It is intentionally triggered with
`workflow_dispatch` so a release owner can select the candidate SHA/tag and
the required baseline or confirmation phase after backups are captured.

```bash
gh workflow run deploy-staging.yml \
  -f ref=<release-sha-or-tag> \
  -f phase=baseline \
  -f test_period=2026-08
```

The workflow validates protected `staging` environment secrets, runs the
read-only preflight, live integration/security/browser/performance contracts,
fails when required tests are skipped, and uploads redacted evidence with
14-day retention. Run `phase=confirmation` only after the baseline gate and
manual upload confirmation/cancellation checks pass. The complete operator
sequence is in [the R4 staging runbook](r4-staging-release-verification.md).

### Production Deployment (Manual)

```yaml
# .github/workflows/deploy-production.yml
name: Deploy Production

on:
  workflow_dispatch:
    inputs:
      version:
        description: "Version to deploy (tag or sha)"
        required: true
        type: string
      confirm:
        description: "Type 'DEPLOY' to confirm"
        required: true
        type: string

jobs:
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Validate confirmation
        if: inputs.confirm != 'DEPLOY'
        run: exit 1

      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy to production
        run: |
          # Blue-green or rolling deployment
          ssh ${{ secrets.PROD_SSH_USER }}@${{ secrets.PROD_HOST }} << 'EOF'
            cd /opt/petakeu
            
            # Pull new images
            docker compose -f docker-compose.prod.yml pull
            
            # Rolling update (zero-downtime)
            docker compose -f docker-compose.prod.yml up -d --no-deps api
            sleep 10
            docker compose -f docker-compose.prod.yml up -d --no-deps web
            
            # Verify
            curl -f https://petakeu.go.id/health
            curl -f https://api.petakeu.go.id/health
            
            # Cleanup
            docker image prune -f
          EOF
        env:
          PROD_SSH_KEY: ${{ secrets.PROD_SSH_KEY }}

      - name: Post-deployment smoke tests
        run: |
          pnpm --filter @petakeu/web test:e2e --project=chromium --grep "smoke|critical"
        env:
          PLAYWRIGHT_BASE_URL: https://petakeu.go.id

      - name: Create deployment record
        run: |
          gh api repos/${{ github.repository }}/deployments \
            -f environment=production \
            -f ref=${{ inputs.version }} \
            -f description="Production deployment ${{ inputs.version }}" \
            -f auto_merge=false
```

---

## Environment Configurations

### GitHub Environments

| Environment | URL | Protection Rules |
|-------------|-----|------------------|
| `staging` | https://staging.petakeu.go.id | Manual protected release verification |
| `production` | https://petakeu.go.id | Manual approval, 2 reviewers |

### Required Secrets

| Secret | Description | Staging | Production |
|--------|-------------|---------|------------|
| `STAGING_SSH_KEY` | SSH private key for staging | ✅ | |
| `STAGING_HOST` | Staging server hostname | ✅ | |
| `STAGING_SSH_USER` | SSH user for staging | ✅ | |
| `PROD_SSH_KEY` | SSH private key for production | | ✅ |
| `PROD_HOST` | Production server hostname | | ✅ |
| `PROD_SSH_USER` | SSH user for production | | ✅ |
| `DATABASE_URL` | Production DB URL | | ✅ (in env file) |
| `REDIS_URL` | Production Redis URL | | ✅ (in env file) |
| `AUTH_SECRET` | JWT secret | | ✅ (in env file) |

---

## Release Process

### Versioning (Semantic Versioning)

```
MAJOR.MINOR.PATCH
  │    │    └── Bug fixes
  │    └─────── New features (backward compatible)
  └──────────── Breaking changes
```

### Release Flow

```bash
# 1. Create release branch from develop
git checkout develop
git pull
git checkout -b release/v1.2.0

# 2. Update version
# Update package.json version in all workspaces
pnpm version 1.2.0 --no-git-tag-version

# 3. Update CHANGELOG.md
# Add release notes

# 4. Create PR to main
git add .
git commit -m "chore: release v1.2.0"
git push origin release/v1.2.0
# Create PR: release/v1.2.0 → main

# 5. After PR merged to main
# Tag is created automatically by workflow
git checkout main
git pull

# 6. GitHub Actions creates release
# - Builds Docker images with version tag
# - Creates GitHub Release with notes
# - Deploys to staging (for verification)

# 7. Manual production deployment
# Run "Deploy Production" workflow with version tag
```

### GitHub Release Workflow

```yaml
# .github/workflows/release.yml
name: Create Release

on:
  push:
    branches: [main]
    tags: ["v*"]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate changelog
        run: |
          # Extract changelog for this version
          # or use conventional-changelog

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          generate_release_notes: true
          draft: false
          prerelease: false
```

---

## Rollback Procedures

### Quick Rollback (Staging)

```bash
# Rollback to previous Docker image
ssh staging << 'EOF'
  cd /opt/petakeu
  docker compose -f docker-compose.prod.yml pull petakeu/server:previous-tag
  docker compose -f docker-compose.prod.yml up -d --no-deps api web
EOF
```

### Production Rollback

```bash
# Option 1: GitHub Actions workflow dispatch
gh workflow run deploy-production.yml -f version=v1.1.0 -f confirm=DEPLOY

# Option 2: Manual Kubernetes (if using K8s)
kubectl rollout undo deployment/petakeu-api -n production
kubectl rollout undo deployment/petakeu-web -n production

# Option 3: Database rollback (if migration issue)
# 1. Stop API
# 2. Restore DB from backup
# 3. Restart API
```

---

## Monitoring & Alerts

### CI/CD Metrics to Track

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Build time | < 10 min | > 15 min |
| Test pass rate | 100% | < 100% |
| Deployment frequency | Daily | < Weekly |
| Lead time (commit → prod) | < 1 hour | > 4 hours |
| Change failure rate | < 5% | > 10% |
| MTTR (Mean Time To Recovery) | < 30 min | > 1 hour |

### GitHub Actions Notifications

```yaml
# Add to workflows for Slack/email notifications
- name: Notify on failure
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: failure
    channel: "#ci-cd-alerts"
    text: "❌ ${{ github.workflow }} failed on ${{ github.ref }}"
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

---

## Local Development CI Simulation

```bash
# Run all CI checks locally before pushing
pnpm lint          # ESLint
pnpm typecheck     # TypeScript
pnpm format:check  # Prettier
pnpm test          # Unit tests
pnpm test:e2e      # E2E tests (requires dev server)

# Or use turbo
pnpm turbo run lint typecheck test
```

### Pre-commit Hooks (Optional)

```bash
# Install husky
pnpm add -D husky lint-staged

# Configure in package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css}": ["prettier --write"]
  }
}

# Enable
pnpm husky install
```

---

## Pipeline Maintenance

### Regular Tasks

| Task | Frequency | Owner |
|------|-----------|-------|
| Update GitHub Actions versions | Monthly | Platform |
| Update Node.js/pnpm versions | Quarterly | Platform |
| Review and update dependencies | Monthly | Team |
| Clean up old workflow runs | Monthly | Platform |
| Review pipeline performance | Weekly | Platform |
| Update test browsers | Monthly | Frontend |

### Pipeline Optimization

| Optimization | Status |
|--------------|--------|
| Cache pnpm dependencies | ✅ |
| Cache Docker layers | ✅ |
| Parallel job execution | ✅ |
| Test sharding | 🔄 Planned |
| Selective test runs (affected only) | 🔄 Planned |
| Self-hosted runners for E2E | 🔄 Planned |

---

## Troubleshooting

### Common CI Failures

| Error | Cause | Fix |
|-------|-------|-----|
| `pnpm install` fails | Lockfile out of sync | `pnpm install` locally, commit lockfile |
| TypeScript errors | New types not committed | Run `pnpm typecheck` locally |
| E2E flaky | Timing/race conditions | Add waits, retry logic |
| Docker build fails | Missing files in context | Check `.dockerignore` |
| Testcontainers timeout | Docker not available | Ensure Docker in CI runner |

### Debugging Failed Runs

```bash
# Download workflow artifacts
gh run download <run-id>

# View logs
gh run view <run-id> --log

# Re-run failed jobs
gh run rerun <run-id> --failed

# SSH into CI runner (GitHub hosted - not possible)
# Use self-hosted for debugging
```

---

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Build Push Action](https://github.com/docker/build-push-action)
- [Playwright CI](https://playwright.dev/docs/ci)
- [Testcontainers](https://testcontainers.com/)
- [Trivy Scanner](https://aquasecurity.github.io/trivy/)
- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
