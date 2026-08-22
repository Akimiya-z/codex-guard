/**
 * Crash-recovery repair for an interrupted session log. It preserves a fully
 * written final turn and supplies the missing tool, step, and turn boundaries
 * needed to resume with a provider-valid transcript, plus the activity-time
 * read that must skip the end-seed boundary — which this module does
 * not write (`Session`'s constructor does) but whose synthetic closers can
 * inherit that boundary's timestamp, the one real coupling between the two.
 * @module @deepseek-ai/dsh-session/repair
 */
import type { SessionEvent } from './types.ts';
/**
 * The `time` of the log's last event representing actual work, skipping the
 * `session/end-seed` boundary — picking a session up is not activity, so
 * activity ordering must exclude it.
 *
 * Excluded by type, so a pickup time still leaks when a boundary is the last
 * event of an open turn: {@link interruptedTurnClosers} copies it onto the
 * synthetic `turn/end`, which this counts as work. Reachable only by seeding an
 * unbalanced log directly — `load()` balances first.
 * @param events - the log to scan, in seq order.
 * @returns the latest non-boundary event's `time`, or undefined when there is none.
 */
export declare function lastActivityTime(events: readonly SessionEvent[]): number | undefined;
/** Recovery code for an assistant tool request that never reached a recorded call start. */
export declare const TOOL_NOT_STARTED = "TOOL_NOT_STARTED";
/** Recovery code for a recorded tool call whose completed outcome was not durably recorded. */
export declare const TOOL_OUTCOME_UNKNOWN = "TOOL_OUTCOME_UNKNOWN";
/**
 * Return deterministic synthetic events that close an open tail turn. Unmatched
 * calls receive error results first, followed by an open `step/end` and an
 * interrupted `turn/end`; sequences continue the log and timestamps reuse the
 * last real event. A balanced or empty log returns no events.
 *
 * @param events - the loaded durable log to scan (a valid committed prefix, possibly with a crash tail).
 * @returns the synthetic closer events to append after `events`, in order; empty when the log is already balanced.
 */
export declare function interruptedTurnClosers(events: readonly SessionEvent[]): SessionEvent[];
//# sourceMappingURL=repair.d.ts.map