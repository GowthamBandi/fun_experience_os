import type { PrototypeState } from "../scenarios/state";
import type { SegmentResult } from "../entities";

export function selectSessionSegmentResults(state: PrototypeState, sessionId: string): SegmentResult[] {
  return (state.segmentResults ?? []).filter((r) => r.sessionId === sessionId);
}

export function selectSegmentResultBySegmentId(state: PrototypeState, segmentId: string): SegmentResult | undefined {
  return (state.segmentResults ?? []).find((r) => r.segmentId === segmentId);
}
