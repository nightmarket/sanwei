/** Ordered update phases. Lower numbers run first. Folio-compatible slots. */
export const TICK_ORDER = {
  TIME: 0,
  INPUT: 0,
  PHYSICS_PRE: 2,
  PHYSICS_STEP: 3,
  PHYSICS_SYNC: 4,
  PHYSICS_POST: 6,
  CYCLES: 8,
  AI: 8,
  WIND: 9,
  LIGHTING: 9,
  WORLD: 10,
  INSTANCED: 13,
  AUDIO: 14,
  RENDER: 998,
} as const;

export type TickOrder = (typeof TICK_ORDER)[keyof typeof TICK_ORDER];
