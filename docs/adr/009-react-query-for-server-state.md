# ADR-009: React Query for Server State Management

## Status
Accepted

## Context
The Petakeu frontend needs to manage server state (API data) including:
- Choropleth map data (period-dependent, cacheable)
- Region summaries (on-demand, per region)
- Upload history (polling for status updates)
- Report jobs (polling for completion)
- Fiscal/RankFin/DefisitWatch data (tab-dependent)

We need a solution that handles caching, deduplication, background updates, and polling.

## Decision
Use TanStack Query (React Query) v5 for all server state management.

## Consequences

### Positive
- **Automatic caching**: Stale-while-revalidate, configurable cache times
- **Request deduplication**: Multiple components requesting same data = 1 network request
- **Background refetching**: Fresh data without blocking UI
- **Polling built-in**: `refetchInterval` for upload/report status
- **DevTools**: Excellent debugging, cache inspection
- **TypeScript**: Full type inference from query functions
- **Mutations**: Optimistic updates, rollback, invalidation

### Negative
- **Learning curve**: Concepts (queries, mutations, keys, invalidation)
- **Bundle size**: ~13KB gzipped
- **Over-fetching risk**: Easy to fetch unused data if not careful
- **Server state only**: Not for client state (use Zustand/Context for UI state)

### Neutral
- Query keys: `['regions', { level, parent }]`, `['choropleth', period]`, `['regionSummary', regionId, from, to]`
- Cache times: choropleth 5min, regionSummary 2min, uploads 30s (polling)
- Retry: 3 attempts with exponential backoff
- Persist: Not persisted (session only)

## Alternatives Considered

### 1. SWR (Stale While Revalidate)
- **Pros**: Smaller, simpler API, Vercel maintained
- **Cons**: Less features (no mutations, no DevTools, less polling control)

### 2. Redux Toolkit Query (RTK Query)
- **Pros**: Integrated with Redux, good TS
- **Cons**: Requires Redux, more boilerplate, larger bundle

### 3. Apollo Client (GraphQL)
- **Pros**: GraphQL features, normalization
- **Cons**: Overkill for REST, larger bundle

### 4. Custom Hooks + Context
- **Pros**: Zero dependencies
- **Cons**: Reinventing wheel, no dedup, no background refresh, bug-prone

## Related Decisions
- ADR-001: MSW (React Query works seamlessly with MSW)
- ADR-004: Technology Stack (React Query selected)

## Implementation Notes
```typescript
// Query Client setup
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,  // 2 minutes
      gcTime: 1000 * 60 * 10,    // 10 minutes
      retry: 3,
      refetchOnWindowFocus: false,
    },
  },
});

// Query keys factory
export const queryKeys = {
  regions: (params?: RegionListParams) => ['regions', params] as const,
  choropleth: (period: string) => ['choropleth', period] as const,
  regionSummary: (regionId: string, from?: string, to?: string) => 
    ['regionSummary', regionId, from, to] as const,
  uploads: () => ['uploads'] as const,
  reportJobs: () => ['reportJobs'] as const,
};

// Usage in hooks
export function useChoropleth(period: string) {
  return useQuery({
    queryKey: queryKeys.choropleth(period),
    queryFn: () => apiClient.getChoropleth(period),
    enabled: !!period,
  });
}

export function useRegionSummary(regionId: string, from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.regionSummary(regionId, from, to),
    queryFn: () => apiClient.getRegionSummary(regionId, from, to),
    enabled: !!regionId && !!from && !!to,
  });
}

// Mutation for upload
export function useUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => apiClient.uploadFile(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.uploads() });
    },
  });
}
```