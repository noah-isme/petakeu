export function quantile(sortedValues: number[], q: number) {
  if (!sortedValues.length) return 0;
  const position = (sortedValues.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const nextValue = sortedValues[base + 1];
  if (nextValue !== undefined) {
    return sortedValues[base] + rest * (nextValue - sortedValues[base]);
  }
  return sortedValues[base];
}

export function buildQuantileLegend(values: number[]) {
  if (!values.length) {
    return [];
  }
  const sorted = [...values].sort((a, b) => a - b);
  const edges = [0.2, 0.4, 0.6, 0.8].map((q) => Math.round(quantile(sorted, q)));
  edges.push(Math.round(sorted[sorted.length - 1]));
  return edges;
}

export function classifyQuantile(value: number, edges: number[]) {
  if (!edges.length) return 0;
  if (value <= edges[0]) return 0;
  if (value <= edges[1]) return 1;
  if (value <= edges[2]) return 2;
  if (value <= edges[3]) return 3;
  return 4;
}
