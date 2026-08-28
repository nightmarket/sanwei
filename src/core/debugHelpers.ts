import type { DebugClass } from "./Debug";

/** Returned by `Debug.init()` before a per-app pane is bound. */
export type DebugInitResult = {
  debug: DebugClass;
  pane: DebugClass["pane"];
  inspectorPane: DebugClass["inspectorPane"];
  /** @deprecated use inspectorPane */
  tunePane: DebugClass["inspectorPane"];
};

export type DebugContext = DebugInitResult & {
  pane: NonNullable<DebugClass["pane"]>;
};
