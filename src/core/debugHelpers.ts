import type { DebugClass } from "./Debug";

export type DebugContext = {
  debug: DebugClass;
  pane: NonNullable<DebugClass["pane"]>;
  /** Performance + scene inspect controls (may be null if Debug failed to create it). */
  inspectorPane: DebugClass["inspectorPane"];
  /** @deprecated use inspectorPane */
  tunePane: DebugClass["inspectorPane"];
};
