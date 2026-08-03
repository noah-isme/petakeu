# ADR-004: Technology Stack Choices

## Status
Accepted

## Context
Starting a new project requires selecting the core technology stack. Decisions should optimize for team productivity, long-term maintainability, ecosystem maturity, and alignment with organizational standards (Pemprov Jatim).

## Decision

### Frontend
| Technology | Version | Rationale |
|------------|---------|-----------|
| **React** | 18.3 | Mature, large ecosystem, team familiarity |
| **TypeScript** | 5.4 | Type safety, IDE support, refactoring confidence |
| **Vite** | 5.2 | Fast dev server, optimized builds, ES modules |
| **React Router** | 6.23 | Standard routing, nested routes, data loading |
| **TanStack Query** | 5.27 | Server state management, caching, deduplication |
| **Leaflet + React-Leaflet** | 1.9 / 4.2 | Lightweight maps, open source, GeoJSON native |
| **Recharts** | 2.15 | React-native charts, composable, accessible |
| **Radix UI** | 1.1 | Accessible primitives, unstyled, composable |
| **Tailwind CSS** | 4.1 | Utility-first, fast iteration, small bundle |
| **Framer Motion** | 12.23 | Animation library, declarative, performant |
| **Lucide React** | 0.546 | Clean icons, tree-shakeable, consistent |
| **MSW** | 1.3 | API mocking, service worker level, realistic |

### Backend
| Technology | Version | Rationale |
|------------|---------|-----------|
| **Node.js** | 20 LTS | JavaScript everywhere, large ecosystem |
| **Express** | 4.19 | Minimal, flexible, mature middleware |
| **TypeScript** | 5.4 | Shared types with frontend |
| **PostgreSQL + PostGIS** | 16 / 3.4 | Geospatial standard, ACID, mature |
| **Redis** | 7 | Caching, sessions, queues |
| **MinIO** | RELEASE.2024 | S3-compatible, self-hosted, open source |
| **Zod** | 3.23 | Schema validation, TypeScript inference |
| **Multer** | 1.4 | File upload handling |
| **xlsx** | 0.18 | Excel parsing |
| **Vitest** | 1.5 | Fast, Vite-native testing |

### DevOps
| Technology | Rationale |
|------------|-----------|
| **pnpm** | Fast, disk-efficient, monorepo support |
| **Turbo** | Build orchestration, caching |
| **Docker** | Containerization, consistency |
| **Docker Compose** | Local dev, CI services |
| **GitHub Actions** | CI/CD, integrated with repo |

## Consequences

### Positive
- **TypeScript end-to-end**: Shared types between frontend/backend
- **Modern stack**: Good performance, developer experience
- **Open source**: No vendor lock-in, community support
- **Geospatial native**: PostGIS + Leaflet + GeoJSON
- **Monorepo ready**: Turbo + pnpm workspaces

### Negative
- **React-Leaflet v4**: Requires React 18, migration from v3
- **Tailwind v4**: Major changes from v3, learning curve
- **MSW v1**: v2 has breaking changes, migration needed
- **xlsx library**: Large bundle, limited streaming support

## Alternatives Considered

### Frontend Framework
| Option | Verdict |
|--------|---------|
| Next.js | Rejected - SSR not needed, adds complexity |
| SvelteKit | Rejected - Team less familiar |
| Vue 3 | Rejected - Team standardized on React |

### Map Library
| Option | Verdict |
|--------|---------|
| Mapbox GL JS | Rejected - Commercial license, cost |
| OpenLayers | Rejected - Heavier API, steeper learning |
| Google Maps | Rejected - Cost, licensing |

### Backend Framework
| Option | Verdict |
|--------|---------|
| NestJS | Rejected - Overhead for current scope |
| Fastify | Considered - Faster but less middleware |
| Go/Python | Rejected - Team is JavaScript/TypeScript |

### Database
| Option | Verdict |
|--------|---------|
| MongoDB | Rejected - No PostGIS equivalent |
| MySQL | Rejected - Limited geospatial |
| BigQuery | Rejected - Cost, latency for real-time |

## Related Decisions
- ADR-001: MSW (part of this stack)
- ADR-005: PostGIS (database choice)
- ADR-009: React Query (state management)
- ADR-010: Tailwind CSS (styling)

## Implementation Notes
- All versions pinned in `package.json`
- Renovate/Dependabot for updates
- Document upgrade procedures for major versions