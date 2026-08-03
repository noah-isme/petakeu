# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records for the Petakeu project. Each ADR documents a significant architectural decision, its context, and consequences.

---

## ADR Index

| ID | Title | Status | Date |
|----|-------|--------|------|
| [001](001-use-msw-for-frontend-development.md) | Use MSW for Frontend Development | Accepted | 2025-10-16 |
| [002](002-quantile-classification-for-choropleth.md) | Quantile Classification for Choropleth Maps | Accepted | 2025-10-16 |
| [003](003-15-percent-cut-rule.md) | 15% Cut Rule for Net Amounts | Accepted | 2025-10-16 |
| [004](004-tech-stack-choices.md) | Technology Stack Choices | Accepted | 2025-10-16 |
| [005](005-postgis-for-geospatial-data.md) | PostGIS for Geospatial Data | Accepted | 2025-10-16 |
| [006](006-materialized-view-for-aggregations.md) | Materialized View for Payment Aggregations | Accepted | 2025-10-16 |
| [007](007-jwt-auth-with-sso.md) | JWT Authentication with SSO Integration | Proposed | 2025-10-16 |
| [008](008-bullmq-for-background-jobs.md) | BullMQ for Background Job Processing | Proposed | 2025-10-16 |
| [009](009-react-query-for-server-state.md) | React Query for Server State Management | Accepted | 2025-10-16 |
| [010](010-tailwindcss-for-styling.md) | Tailwind CSS for Styling | Accepted | 2025-10-16 |

---

## ADR Template

When creating a new ADR, use this template:

```markdown
# ADR-XXX: Title

## Status
[Proposed | Accepted | Rejected | Deprecated | Superseded]

## Context
What is the issue that we're seeing that is motivating this decision or change?

## Decision
What is the change that we're proposing and/or doing?

## Consequences
What becomes easier or more difficult to do because of this change?

### Positive
- 

### Negative
- 

### Neutral
- 

## Alternatives Considered
What other options were evaluated?

## Related Decisions
- ADR-XXX: Related decision
```

---

## Creating a New ADR

1. Copy the template above
2. Name the file with the next sequential number: `NNN-short-title.md`
3. Fill in all sections
4. Update this index with the new ADR
5. Submit for review

---

## Guidelines

- **One decision per ADR** - Keep focused
- **Immutable once accepted** - Don't edit accepted ADRs, create new ones that supersede
- **Include context** - Future readers need to understand why
- **Document alternatives** - Shows due diligence
- **Link related ADRs** - Builds knowledge graph