# Security Documentation

Comprehensive security guide for Petakeu covering authentication, authorization, data protection, and compliance.

---

## Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Security Layers                        │
├─────────────────────────────────────────────────────────────┤
│  Network: VPC, Security Groups, WAF, DDoS Protection       │
├─────────────────────────────────────────────────────────────┤
│  Transport: TLS 1.3 everywhere (API, DB, Redis, MinIO)     │
├─────────────────────────────────────────────────────────────┤
│  Application: JWT Auth, RBAC, Input Validation, Rate Limit │
├─────────────────────────────────────────────────────────────┤
│  Data: Encryption at Rest, Field-level Encryption, Masking │
├─────────────────────────────────────────────────────────────┤
│  Audit: Structured Logging, Audit Trail, SIEM Integration  │
└─────────────────────────────────────────────────────────────┘
```

---

## Authentication

### JWT Implementation (Planned)

**Current State:** Not yet implemented - MSW mocks all endpoints without auth.

**Planned Implementation:**

```typescript
// Token Structure
interface JWTPayload {
  sub: string;           // User ID
  email: string;         // User email
  roles: string[];       // ['admin', 'operator', 'viewer']
  regionIds?: string[];  // Region scope (for operator/viewer)
  iat: number;           // Issued at
  exp: number;           // Expires at
  iss: string;           // Issuer: "petakeu"
  aud: string;           // Audience: "petakeu-api"
}
```

**Token Flow:**
```
1. User → SSO (SAML/OIDC) → Identity Provider
2. IdP → Callback → Backend validates SAML/OIDC response
3. Backend → Issues JWT (15 min access, 7 day refresh)
4. Client → Stores tokens (HttpOnly cookie + memory)
5. Requests → Authorization: Bearer <access_token>
6. Middleware → Validates JWT, extracts claims
7. RBAC Middleware → Checks permissions per endpoint
```

### SSO Integration (Pemprov)

| Provider | Protocol | Status |
|----------|----------|--------|
| Pemprov SSO | SAML 2.0 | Planned |
| Keycloak (self-hosted) | OIDC | Alternative |
| Azure AD | OIDC | Future |

**SAML Configuration:**
```env
SAML_ENTRY_POINT=https://sso.pemprov.go.id/saml2/idp/SSOService.php
SAML_ISSUER=petakeu-api
SAML_CERT=-----BEGIN CERTIFICATE-----...
SAML_CALLBACK_URL=https://api.petakeu.go.id/auth/saml/callback
```

---

## Authorization (RBAC)

### Role Definitions

| Role | Description | Permissions |
|------|-------------|-------------|
| **Admin** | Pemprov Administrator | Full access to all endpoints, user management, system config |
| **Operator** | BPKAD/Bappeda Staff | Upload, Reports, Regional data (scoped to assigned regions) |
| **Viewer** | Read-only stakeholders | Choropleth, Region Summary, Public Reports |
| **Public** | Unauthenticated | Choropleth (quantile only), Public Reports |

### Permission Matrix

| Endpoint | Admin | Operator | Viewer | Public |
|----------|-------|----------|--------|--------|
| `GET /health` | ✅ | ✅ | ✅ | ✅ |
| `GET /api/regions` | ✅ | ✅* | ✅* | ✅* |
| `GET /api/regions/:id/summary` | ✅ | ✅* | ✅* | ❌ (public mode) |
| `GET /api/geo/choropleth` | ✅ | ✅ | ✅ | ✅ (class only) |
| `POST /api/uploads` | ✅ | ✅* | ❌ | ❌ |
| `GET /api/uploads` | ✅ | ✅* | ❌ | ❌ |
| `POST /api/reports/export` | ✅ | ✅* | ❌ | ❌ |
| `GET /api/reports` | ✅ | ✅* | ❌ | ❌ |
| `GET /api/rank` | ✅ | ✅ | ✅ | ❌ |
| `GET /api/surplus-defisit` | ✅ | ✅ | ✅ | ❌ |
| `GET /api/alert` | ✅ | ✅ | ✅ | ❌ |
| `GET /api/rankfin/*` | ✅ | ✅ | ✅ | ✅ (public) |
| `GET /api/defisitwatch/*` | ✅ | ✅ | ❌ | ❌ |

* Scoped to assigned regions for Operator

### Region Scoping

```typescript
// Operator can only access assigned regions
interface User {
  id: string;
  roles: string[];
  regionScope?: string[];  // Null = all regions (Admin)
}

// Middleware checks
function checkRegionAccess(user: User, regionId: string): boolean {
  if (user.roles.includes('admin')) return true;
  if (!user.regionScope) return false;
  return user.regionScope.includes(regionId);
}
```

---

## Data Protection

### Encryption

| Data State | Method | Details |
|------------|--------|---------|
| **In Transit** | TLS 1.3 | All connections: API, DB, Redis, MinIO, Inter-service |
| **At Rest (DB)** | AES-256 | PostgreSQL TDE / Cloud provider encryption |
| **At Rest (Redis)** | AES-256 | Redis Enterprise / Cloud provider encryption |
| **At Rest (MinIO)** | SSE-S3 / SSE-KMS | Server-side encryption |
| **Secrets** | Vault/SealedSecrets | Never in code, env, or Docker images |

### Field-Level Encryption (Planned)

```sql
-- Sensitive fields encrypted at application layer
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,                    -- Hashed for lookup
  email_encrypted BYTEA NOT NULL,         -- AES-256-GCM
  phone_encrypted BYTEA,                  -- AES-256-GCM
  encryption_key_id TEXT NOT NULL         -- Key rotation reference
);
```

### Data Masking

| Field | Masking Rule | Public Mode |
|-------|-------------|-------------|
| `amount` | Hidden | ✅ (show class only) |
| `cut15Amount` | Hidden | ✅ |
| `netAmount` | Hidden | ✅ |
| `monthlyBreakdown` | Hidden | ✅ |
| `reportUrl` | Hidden | ✅ |
| `trend` | Hidden | ✅ |
| `regionId/name` | Visible | ✅ |
| `classIndex/Label` | Visible | ✅ |

---

## Input Validation

### Validation Rules

| Endpoint | Validation |
|----------|------------|
| `POST /api/uploads` | File: .xlsx only, ≤10MB, valid headers, positive amounts, valid periods, valid region codes |
| `POST /api/reports/export` | Region IDs exist, period format YYYY-MM, format in [pdf, excel] |
| `GET /api/regions` | Level in [province, regency, district, village], parent UUID valid |
| `GET /api/geo/choropleth` | Period YYYY-MM, scenario in [normal, spike, missing-geometry] |
| `GET /api/regions/:id/summary` | ID UUID, from/to YYYY-MM, from ≤ to |

### Implementation

```typescript
// Using Zod for schema validation
import { z } from "zod";

export const uploadFileSchema = z.object({
  file: z.instanceof(File).refine(
    (f) => f.size <= 10 * 1024 * 1024,
    "File too large (max 10MB)"
  ).refine(
    (f) => f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Only .xlsx files allowed"
  ),
});

export const reportRequestSchema = z.object({
  regionId: z.string().uuid(),
  periodFrom: z.string().regex(/^\d{4}-\d{2}$/),
  periodTo: z.string().regex(/^\d{4}-\d{2}$/),
  format: z.enum(["pdf", "excel"]),
}).refine((data) => data.periodFrom <= data.periodTo, {
  message: "periodFrom must be before periodTo",
  path: ["periodTo"],
});
```

---

## Rate Limiting

### Limits

| Tier | Requests/Minute | Burst | Scope |
|------|-----------------|-------|-------|
| **Authenticated** | 120 | 20 | Per user |
| **Anonymous** | 30 | 5 | Per IP |
| **Upload** | 10 | 2 | Per user |
| **Reports** | 20 | 3 | Per user |

### Implementation

```typescript
// Redis-backed rate limiter
import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";

export const apiRateLimiter = rateLimit({
  store: new RedisStore({ client: redisClient, prefix: "rl:" }),
  windowMs: 60 * 1000,
  max: (req) => req.user ? 120 : 30,
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (req, res) => {
    res.status(429).json({ error: "Too many requests" });
  },
});
```

---

## Audit Logging

### Log Structure

```json
{
  "timestamp": "2025-08-03T10:30:00.000Z",
  "level": "info",
  "event": "upload.created",
  "requestId": "req-abc123",
  "userId": "user-xyz789",
  "userRoles": ["operator"],
  "regionId": "region-3374",
  "resource": "upload",
  "resourceId": "upload-uuid",
  "action": "create",
  "outcome": "success",
  "details": {
    "filename": "payments_2025-08.xlsx",
    "size": 2048576,
    "hash": "sha256:..."
  },
  "ip": "203.0.113.195",
  "userAgent": "Mozilla/5.0..."
}
```

### Audited Events

| Event | Resource | Details |
|-------|----------|---------|
| `auth.login` | user | success/failed, method (SSO/password) |
| `auth.logout` | user | - |
| `upload.created` | upload | filename, size, hash |
| `upload.parsed` | upload | row counts, error count |
| `upload.failed` | upload | error details |
| `report.requested` | report | regionIds, period, format |
| `report.downloaded` | report | jobId, format |
| `region.summary.accessed` | region | regionId, from, to |
| `choropleth.accessed` | map | period, publicMode |
| `user.created` | user | byAdmin, roles, regionScope |
| `user.updated` | user | changedFields |
| `config.changed` | system | key, oldValue, newValue |

### Retention

| Log Type | Retention | Storage |
|----------|-----------|---------|
| Audit logs | 7 years | Immutable (WORM) / SIEM |
| Application logs | 90 days | Elasticsearch/CloudWatch |
| Access logs | 30 days | S3/GCS |
| Debug logs | 7 days | Local/CloudWatch |

---

## Security Headers

### Nginx Configuration (Web)

```nginx
# Security headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.petakeu.go.id;" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

# HSTS (enable after cert verified)
# add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

### Express Configuration (API)

```typescript
import helmet from "helmet";

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https://api.petakeu.go.id"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));
```

---

## Vulnerability Management

### Dependency Scanning

```bash
# Local
pnpm audit --prod
pnpm audit fix

# CI/CD
# - Snyk / GitHub Dependabot / Trivy
# - Run on every PR and scheduled weekly
# - Fail build on HIGH/CRITICAL
```

### Container Scanning

```bash
# Trivy scan
trivy image petakeu/api:latest
trivy image petakeu/web:latest

# Scan in CI/CD pipeline
# Fail on CRITICAL/HIGH vulnerabilities
```

### Penetration Testing

| Frequency | Scope | Provider |
|-----------|-------|----------|
| Annual | Full application | External certified |
| Quarterly | API + Infrastructure | Internal |
| On major release | Changed components | Internal |

---

## Incident Response

### Security Incident Classification

| Severity | Criteria | Response Time | Escalation |
|----------|----------|---------------|------------|
| **P1 - Critical** | Active breach, data exfiltration, RCE | 15 min | CISO, Legal, PR |
| **P2 - High** | Vulnerability exploited, unauthorized access | 1 hour | Security Lead, Platform |
| **P3 - Medium** | Suspicious activity, failed exploit attempt | 4 hours | Security Team |
| **P4 - Low** | Policy violation, scan detection | 24 hours | Security Team |

### Response Playbooks

**P1 - Data Breach:**
1. Isolate affected systems (network segmentation)
2. Preserve evidence (disk images, logs)
3. Notify CISO → Legal → Regulator (72h per UU PDP)
4. Assess scope (what data, how many users)
5. Remediate vulnerability
6. Notify affected users
7. Post-incident review (within 2 weeks)

**P2 - Auth Bypass:**
1. Revoke compromised tokens/sessions
2. Force password reset for affected users
3. Patch authentication logic
4. Review audit logs for unauthorized actions
5. Deploy fix

---

## Compliance

### Indonesian Regulations

| Regulation | Requirement | Implementation |
|------------|-------------|----------------|
| **UU PDP (Personal Data Protection)** | Consent, purpose limitation, data minimization, breach notification (72h) | Privacy by design, audit logs, DPO appointed |
| **UU ITE (Electronic Information)** | Data integrity, authenticity, non-repudiation | Digital signatures, audit trails |
| **Perpres 95/2018 (E-Government)** | Interoperability, security standards | API standards, SSO integration |
| **BSSN Guidelines** | Cyber security for government systems | Classification, encryption, monitoring |

### Data Classification

| Classification | Examples | Protection |
|----------------|----------|------------|
| **Publik** | Choropleth classes, region names, public reports | Standard |
| **Internal** | Payment amounts, trends, uploads, reports | Encrypted, RBAC |
| **Terbatas** | User PII, audit logs, system configs | Encrypted, restricted access, audit |
| **Rahasia** | Secrets, keys, passwords | Vault, rotation, no logging |

---

## Security Checklist (Pre-Production)

### Authentication & Authorization
- [ ] SSO integrated and tested
- [ ] JWT implementation complete with proper validation
- [ ] RBAC enforced on all endpoints
- [ ] Region scoping enforced for operators
- [ ] Public mode properly hides sensitive data
- [ ] Session management secure (HttpOnly, Secure, SameSite)

### Data Protection
- [ ] TLS 1.3 everywhere (API, DB, Redis, MinIO, inter-service)
- [ ] Encryption at rest enabled for all data stores
- [ ] Secrets in Vault/SealedSecrets, not in code/env
- [ ] Field-level encryption for PII
- [ ] Data masking in public mode verified
- [ ] Backup encryption enabled

### Input Validation & Rate Limiting
- [ ] All endpoints validated with Zod schemas
- [ ] File upload restrictions enforced
- [ ] Rate limiting configured and tested
- [ ] CORS restricted to frontend domain

### Monitoring & Audit
- [ ] Structured logging with request IDs
- [ ] Audit logs for all security events
- [ ] Log retention policies configured
- [ ] SIEM integration for alerting
- [ ] Anomaly detection on auth/access patterns

### Infrastructure
- [ ] Database not publicly accessible
- [ ] Redis not publicly accessible
- [ ] MinIO not publicly accessible
- [ ] Security groups / network policies restrictive
- [ ] WAF configured
- [ ] DDoS protection enabled

### Operations
- [ ] Dependency scanning in CI/CD
- [ ] Container scanning in CI/CD
- [ ] Penetration test scheduled
- [ ] Incident response plan documented
- [ ] Runbooks for common security incidents
- [ ] On-call rotation with security contacts
- [ ] Secret rotation schedule (quarterly)

---

## Contacts

| Role | Name | Contact | PGP Key |
|------|------|---------|---------|
| CISO | - | ciso@petakeu.go.id | - |
| Security Lead | - | security@petakeu.go.id | - |
| DPO (Data Protection Officer) | - | dpo@petakeu.go.id | - |
| Platform Team | - | platform@petakeu.go.id | - |
| On-call (24/7) | - | +62-XXX-XXXXXXX | - |

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [UU No. 27 Tahun 2022 - Perlindungan Data Pribadi](https://jdih.kominfo.go.id/produk_hukum/view/1523/uu-no-27-tahun-2022)
- [BSSN Cyber Security Guidelines](https://bssn.go.id/)