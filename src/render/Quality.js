// Graphics quality presets (Settings › Graphics quality; phones start on Low, others on Medium):
//   Low     the scene straight to the screen, with inverted-hull ink. Wind sway is on (it's a few
//           vertex instructions); no extra grass.
//   Medium  screen-space ink, a soft bloom, a grass field round the player, one sun shadow map.
//   High    all that, plus a light ambient occlusion, cascaded shadows out to 130 m and a wider,
//           denser grass field.
// Medium and High are anti-aliased (multisampled) except on phones, as the plain screen is.
import { TOUCH_DEVICE } from '../core/Device.js';

const MSAA = TOUCH_DEVICE ? 0 : 4;
export const QUALITY = {
  low: { post: false, ink: false, ao: false, bloom: false, csm: false, grass: 0, grassRadius: 0, msaa: 0 },
  medium: { post: true, ink: true, ao: false, bloom: true, csm: false, grass: 16000, grassRadius: 26, msaa: MSAA },
  high: { post: true, ink: true, ao: true, bloom: true, csm: true, grass: 32000, grassRadius: 36, msaa: MSAA },
};

export const qualityOf = (name) => QUALITY[name] ?? QUALITY.medium;
