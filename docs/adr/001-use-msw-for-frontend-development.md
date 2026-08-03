# ADR-001: Use MSW for Frontend Development

## Status
Accepted

## Context
The Petakeu frontend development started before the backend was ready. We needed a way to develop and test the frontend UI (map visualizations, admin dashboard, report generation) without waiting for the backend API implementation.

## Decision
Use Mock Service Worker (MSW) to intercept network requests at the service worker level and provide realistic mock responses for all API endpoints.

## Consequences

### Positive
- **Parallel development**: Frontend team can work independently of backend
- **Realistic testing**: MSW intercepts actual fetch/XHR requests, testing real network layer
- **Scenario testing**: Easy to simulate different data states (normal, spike, missing-geometry)
- **Public mode testing**: Can test public/private mode switching via query params
- **No API changes needed**: Frontend code works identically with MSW or real backend
- **CI/CD compatible**: Works in headless browsers for E2E tests

### Negative
- **Maintenance burden**: Mock handlers must stay in sync with API contracts
- **Dual implementation**: API logic exists in both MSW handlers and backend controllers
- **False confidence**: MSW may not catch backend-specific issues (DB constraints, race conditions)
- **Bundle size**: MSW adds ~50KB to development bundle

### Neutral
- Requires service worker registration in development only
- MSW handlers serve as living API documentation

## Alternatives Considered

### 1. JSON Server / Mock API Server
- **Pros**: Separate process, can be shared across projects
- **Cons**: Additional infrastructure, network latency, CORS complexity

### 2. Manual Mocking in Components
- **Pros**: No extra dependencies
- **Cons**: Invasive, doesn't test network layer, hard to maintain

### 3. Cypress/MSW Network Stubbing Only for Tests
- **Pros**: Only in test environment
- **Cons**: Can't develop against mocks interactively

### 4. GraphQL Mocking (if using GraphQL)
- **Pros**: Schema-driven
- **Cons**: Not applicable (REST API)

## Related Decisions
- ADR-004: Technology Stack Choices (MSW part of stack)
- ADR-009: React Query for Server State Management (works with MSW)

## Implementation Notes
- MSW initialized in `apps/web/src/main.tsx` only in development
- Handlers in `apps/web/src/mocks/handlers.ts` cover all API endpoints
- Scenarios configured via `VITE_SCENARIO` env or `?scenario=` query param
- Public mode via `VITE_PUBLIC_MODE` or `?public=1`