# ADR-007: JWT Authentication with SSO Integration

## Status
Proposed

## Context
Petakeu requires authentication and authorization for:
- Admin dashboard (upload, reports)
- Operator access (regional data)
- Viewer access (read-only)
- Public mode (no auth, limited data)

The organization (Pemprov Jatim) uses SAML/OIDC SSO. We need to integrate with existing identity infrastructure.

## Decision
Implement JWT-based authentication with SSO (SAML/OIDC) integration:

1. **SSO as Identity Provider**: Users authenticate via Pemprov SSO (SAML 2.0 or OIDC)
2. **Backend as Service Provider**: Validates SAML assertions / OIDC tokens
3. **JWT Issuance**: Backend issues short-lived access tokens (15 min) and refresh tokens (7 days)
4. **Token Storage**: HttpOnly Secure cookies (not localStorage)
5. **Role Mapping**: SSO attributes → Petakeu roles (admin, operator, viewer)
6. **Region Scoping**: Operator accounts linked to specific region IDs

## Consequences

### Positive
- **Centralized identity**: Single sign-on across Pemprov applications
- **Security**: Short-lived tokens, secure cookie storage, refresh rotation
- **Scalability**: Stateless JWT validation, no session store needed
- **Audit**: Token contains user ID, roles, region scope for logging

### Negative
- **Complexity**: SAML/OIDC integration, certificate management
- **Token revocation**: Requires token blocklist or short expiry
- **SSO dependency**: SSO downtime = auth downtime
- **Cookie issues**: Cross-domain, mobile, Safari ITP considerations

### Neutral
- Access token: 15 min, RS256, claims: sub, email, roles, regionIds, iat, exp
- Refresh token: 7 days, rotated on use, stored hashed in DB
- Public endpoints: No auth required, public mode via query param

## Alternatives Considered

### 1. Session/Cookie with Redis
- **Pros**: Immediate revocation, simpler
- **Cons**: Stateful, scaling complexity, Redis dependency

### 2. Opaque Tokens (Reference Tokens)
- **Pros**: Immediate revocation, small tokens
- **Cons**: Introspection endpoint adds latency, stateful

### 3. API Keys for Service-to-Service
- **Pros**: Simple for internal services
- **Cons**: Not for user authentication

## Related Decisions
- ADR-004: Technology Stack (Express, Zod for validation)
- ADR-008: BullMQ (background token cleanup)

## Implementation Notes
```typescript
// SSO Configuration
const ssoConfig = {
  saml: {
    entryPoint: process.env.SAML_ENTRY_POINT,
    issuer: process.env.SAML_ISSUER,
    cert: process.env.SAML_CERT,
    callbackUrl: process.env.SAML_CALLBACK_URL,
  },
  oidc: {
    issuer: process.env.OIDC_ISSUER,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
    redirectUri: process.env.OIDC_REDIRECT_URI,
  },
};

// JWT Configuration
const jwtConfig = {
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  algorithm: 'RS256',
  privateKey: process.env.JWT_PRIVATE_KEY,
  publicKey: process.env.JWT_PUBLIC_KEY,
};
```