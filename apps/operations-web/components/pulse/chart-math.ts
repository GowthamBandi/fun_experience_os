const r = (n: number) => String(Math.round(n * 100) / 100);

export type ChartPoint = { x: number; y: number };

// Values mapped into a width×height box, top = max. A flat or single series sits mid-height.
export function chartPoints(values: number[], width: number, height: number): ChartPoint[] {
  const vs = values.filter((v) => Number.isFinite(v));
  if (vs.length === 0) return [];
  const series = vs.length === 1 ? [vs[0], vs[0]] : vs;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min;
  const step = width / (series.length - 1);
  return series.map((v, i) => ({ x: i * step, y: span === 0 ? height / 2 : height - ((v - min) / span) * height }));
}

export function chartPath(values: number[], width: number, height: number): { line: string; area: string } {
  const pts = chartPoints(values, width, height);
  if (pts.length === 0) return { line: "", area: "" };
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${r(p.x)},${r(p.y)}`).join(" ");
  return { line, area: `${line} L${r(width)},${r(height)} L0,${r(height)} Z` };
}
