// What the game is running on, as far as controls and graphics care: a phone or tablet (a coarse
// pointer that's also touch) gets touch controls and lighter graphics by default.
const media = (q) => typeof matchMedia === 'function' && matchMedia(q).matches;

export const TOUCH_DEVICE = media('(pointer: coarse)') && (navigator.maxTouchPoints ?? 0) > 0;
