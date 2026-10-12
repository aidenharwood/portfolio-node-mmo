// Wind: one clock and one prevailing direction for everything that sways — grass (render/Grass.js)
// and scenery (render/Toon.js addWind, set per scenery type in world/World.js). Gusts roll across
// the land, so neighbouring trees move together and distant ones don't.
export const WIND = {
  time: { value: 0 },      // seconds (main.js advances it)
  strength: { value: 1 },  // 0 stills everything
};

// Where the wind blows from the west-south-west, mostly.
export const WIND_DIR = [0.91, 0.41];

export const WIND_PARS = /* glsl */ `
uniform float uWindTime;
uniform float uWindStrength;
uniform float uWindAmp;
uniform float uWindBase;
`;

// Sways the object-space vertex `v` (before the instance and model matrices): by uWindAmp × the
// square of its height above uWindBase, along the wind in world space (turned back into the
// instance's own frame, so a rotated or scaled tree still bends downwind).
export function windGLSL(v) {
  return /* glsl */ `{
    #ifdef USE_INSTANCING
      vec3 wRoot = instanceMatrix[3].xyz;
      mat3 wToObject = inverse(mat3(instanceMatrix));
    #else
      vec3 wRoot = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      mat3 wToObject = inverse(mat3(modelMatrix));
    #endif
    float wh = max(0.0, ${v}.y - uWindBase);
    float wPhase = uWindTime * 1.5 + dot(wRoot.xz, vec2(0.21, 0.17));
    float wGust = 0.55 + 0.45 * sin(uWindTime * 0.4 - dot(wRoot.xz, vec2(${WIND_DIR[0]}, ${WIND_DIR[1]})) * 0.02);
    vec2 wDir = vec2(${WIND_DIR[0]}, ${WIND_DIR[1]});
    float wAlong = 0.45 + 0.4 * sin(wPhase) + 0.15 * sin(wPhase * 2.3 + 1.1);
    float wAcross = 0.25 * sin(wPhase * 0.83 + 2.0);
    vec2 wWorld = (wDir * wAlong + vec2(-wDir.y, wDir.x) * wAcross) * (uWindAmp * uWindStrength * wGust * wh * wh);
    ${v} += wToObject * vec3(wWorld.x, 0.0, wWorld.y);
  }`;
}
