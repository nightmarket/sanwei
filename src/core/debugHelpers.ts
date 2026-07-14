import type { DebugClass } from "./Debug";

export type DebugContext = {
  debug: DebugClass;
  pane: NonNullable<DebugClass["pane"]>;
};
