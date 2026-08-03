# ADR-003: 15% Cut Rule for Net Amounts

## Status
Accepted

## Context
Petakeu displays regional payment data with a "15% cut" concept. This represents a standard deduction (e.g., administrative fee, transfer fee) applied to gross payments before showing net amounts to regions. The business rule requires showing both gross and net amounts.

## Decision
Apply a fixed 15% deduction to all payment amounts to calculate "net amount" (amount after cut). This is applied consistently across all regions, periods, and payment sources.

## Consequences

### Positive
- **Simple and transparent**: Easy to explain, audit, and verify
- **Consistent**: Same rule for all regions, no regional variation
- **Performant**: Simple multiplication, no complex logic
- **Audit-friendly**: Clear formula: `net = gross * 0.85`, `cut = gross * 0.15`

### Negative
- **Inflexible**: Cannot accommodate region-specific or source-specific rates
- **Hardcoded business logic**: Changing rate requires code deployment
- **No historical tracking**: Rate changes not versioned in data

### Neutral
- Rate defined as constant `0.15` in code
- Applied in materialized view: `amount * 0.15 AS cut_amount`
- Both gross and net stored/returned for transparency

## Alternatives Considered

### 1. Configurable Rate per Region/Source
- **Pros**: Flexible, matches real-world variation
- **Cons**: Complex configuration, harder to audit, more DB columns

### 2. Rate Stored in Database with History
- **Pros**: Auditable, historical accuracy
- **Cons**: Over-engineered for current requirements, adds complexity

### 3. No Cut (Show Only Gross)
- **Pros**: Simplest
- **Cons**: Doesn't meet business requirement for net amounts

## Related Decisions
- ADR-002: Quantile Classification (applied to gross amounts)
- ADR-006: Materialized View (stores cut_amount and net_amount)

## Implementation Notes
- Constant `CUT_RATE = 0.15` used in:
  - `geo-service.ts`: `normalizedValue: cut15Amount`
  - `region-service.ts`: `cut15Amount = totalAmount * 0.15`
  - Materialized view: `amount * 0.15 AS cut_amount`
  - MSW handlers: `record.amount * 0.15`
- If rate changes: update constant, rebuild MV, redeploy