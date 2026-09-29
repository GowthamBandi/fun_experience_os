import type { PrototypeState } from "../scenarios/state";
import type { ActivitySegment, SegmentResult } from "../entities";

export function selectSessionSegmentResults(state: PrototypeState, sessionId: string): SegmentResult[] {
  return (state.segmentResults ?? []).filter((r) => r.sessionId === sessionId);
}

/** Step types that produce a result (a score or an outcome). */
export const SCORED_SEGMENT_TYPES: ReadonlyArray<ActivitySegment["type"]> = ["Match", "Round", "Activity"];

/** A step needs a result when it is a scored type and it actually ran. */
export function segmentNeedsResult(seg: ActivitySegment): boolean {
  return SCORED_SEGMENT_TYPES.includes(seg.type) && (seg.status === "Completed" || seg.status === "Active" || seg.status === "Paused");
}

export const isFinalResult = (r?: SegmentResult) => r?.status === "Confirmed" || r?.status === "Corrected";

export function selectResultsProgress(state: PrototypeState, sessionId: string) {
  const segments = (state.activitySegments ?? []).filter((s) => s.sessionId === sessionId).sort((a, b) => a.sequence - b.sequence);
  const results = selectSessionSegmentResults(state, sessionId);
  const needing = segments.filter(segmentNeedsResult);
  const confirmed = needing.filter((s) => isFinalResult(results.find((r) => r.segmentId === s.id)));
  const drafts = needing.filter((s) => results.find((r) => r.segmentId === s.id)?.status === "Draft");
  return {
    segments,
    results,
    requiredCount: needing.length,
    confirmedCount: confirmed.length,
    draftCount: drafts.length,
    outstanding: needing.filter((s) => !isFinalResult(results.find((r) => r.segmentId === s.id))),
    isComplete: confirmed.length === needing.length,
  };
}
