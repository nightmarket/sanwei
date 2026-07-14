export const isTouchDevice = () => {
  if (typeof window !== "undefined" && navigator) {
    const userAgent = navigator.userAgent;

    return (
      window.matchMedia?.("(pointer: coarse)").matches ||
      navigator.maxTouchPoints > 0 ||
      userAgent.match(/Android/i) ||
      userAgent.match(/webOS/i) ||
      userAgent.match(/iPhone/i) ||
      userAgent.match(/iPad/i) ||
      userAgent.match(/iPod/i) ||
      userAgent.match(/BlackBerry/i) ||
      userAgent.match(/Windows Phone/i)
    );
  }

  return false;
};

export interface PointerEvents {
  move: string;
  up: string;
  down: string;
  wheel?: string;
}

export let events: PointerEvents = {} as PointerEvents;

if (isTouchDevice()) {
  events = {
    move: "touchmove",
    up: "touchend",
    down: "touchstart",
  };
} else {
  events = {
    move: "mousemove",
    up: "mouseup",
    down: "mousedown",
    wheel: "wheel",
  };
}

export const getPos = (e: MouseEvent | TouchEvent) => {
  const x = "changedTouches" in e ? (e as TouchEvent).changedTouches[0].clientX : (e as MouseEvent).clientX;
  const y = "changedTouches" in e ? (e as TouchEvent).changedTouches[0].clientY : (e as MouseEvent).clientY;

  return {
    x,
    y,
    target: e.target,
  };
};
