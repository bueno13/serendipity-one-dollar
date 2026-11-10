export function formatUsd(v: number | null): string {
  if (v == null) return "Cost unavailable";
  if (v < 0.01) return `$${v.toFixed(6)}`;
  return `$${v.toFixed(4)}`;
}

export function formatTokens(n: number): string {
  return n.toLocaleString("en-US");
}
