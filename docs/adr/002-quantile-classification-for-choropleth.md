# ADR-002: Quantile Classification for Choropleth Maps

## Status
Accepted

## Context
The Petakeu map dashboard visualizes regional payment data using choropleth maps. We needed a classification method to assign colors to regions based on their payment amounts. The classification must be:
- Perceptually uniform (equal visual steps)
- Robust to outliers
- Consistent across reloads
- Suitable for legend generation

## Decision
Use quantile (percentile-based) classification with 5 classes (quintiles) for choropleth maps. Quantile edges are computed per period from the actual data distribution.

## Consequences

### Positive
- **Equal feature count per class**: Each class has ~20% of regions, good visual balance
- **Robust to outliers**: Extreme values don't skew class boundaries
- **Perceptually meaningful**: Viewers see relative ranking, not absolute values
- **Legend consistency**: Class edges derived from data, stable across reloads
- **Standard practice**: Widely used in choropleth cartography

### Negative
- **Hides absolute differences**: Two regions in same class may have very different values
- **Class boundaries change per period**: Can't compare absolute values across time
- **Empty classes possible**: With few regions, some classes may be empty
- **Computational cost**: Must sort values and compute percentiles per request

### Neutral
- 5 classes chosen as balance between detail and cognitive load
- Public mode shows only class labels, not numeric ranges

## Alternatives Considered

### 1. Equal Interval (Equal Width)
- **Pros**: Simple, absolute value comparison across periods
- **Cons**: Skewed by outliers, empty classes with skewed data

### 2. Natural Breaks (Jenks)
- **Pros**: Optimizes within-class variance
- **Cons**: Computationally expensive, unstable with small datasets, not reproducible

### 3. Standard Deviation
- **Pros**: Shows deviation from mean
- **Cons**: Assumes normal distribution, negative values problematic

### 4. Manual/Fixed Breaks
- **Pros**: Consistent across periods, policy-aligned
- **Cons**: Requires domain knowledge, manual maintenance, may not fit data

## Related Decisions
- ADR-003: 15% Cut Rule (affects values being classified)
- ADR-006: Materialized View (pre-computes quantiles per period)

## Implementation Notes
- Quantile edges computed in `geo-service.ts` → `buildQuantileBins()`
- Uses linear interpolation for percentile calculation
- 5 classes (indices 0-4) → colors from light to dark blue palette
- Legend includes min/max for each class
- Cached in Redis with key including period