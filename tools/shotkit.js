// Dev helper for scripted checks: pins the clock, pumps frames and captures portraits through the
// dev server's /__shot endpoint (serve.py). Usage in the console: await import('/tools/shotkit.js')
import * as THREE from 'three';

const g = window.game;
g.state = 'playing';
g.hud.hideOverlay();
g.clock.getDelta = () => 1 / 60;

const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 300);

export const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(); };

export async function shot(name, target, { dist = 4.2, yaw = 0.5, height = 1.1, pitch = 0.08, fov = 35, useGameCamera = false } = {}) {
  let c = g.camera;
  if (!useGameCamera) {
    c = cam;
    c.fov = fov;
    c.aspect = innerWidth / innerHeight;
    c.updateProjectionMatrix();
    const t = target.clone();
    t.y += height;
    c.position.set(t.x + Math.sin(yaw) * dist * Math.cos(pitch), t.y + Math.sin(pitch) * dist, t.z + Math.cos(yaw) * dist * Math.cos(pitch));
    c.lookAt(t);
  }
  g.renderer.render(g.scene, c);
  const url = g.renderer.domElement.toDataURL('image/png');
  return (await fetch(`/__shot/${name}`, { method: 'POST', body: url })).status;
}

// Contact sheets: several captures tiled into one image (fewer files to review).
let sheet = null;
export function beginSheet(cols = 3, rows = 2, w = 480, h = 360) {
  const c = document.createElement('canvas');
  c.width = cols * w;
  c.height = rows * h;
  sheet = { c, ctx: c.getContext('2d'), cols, w, h, i: 0 };
}
export function tile(target, opts = {}, label = '') {
  const { ctx, cols, w, h } = sheet;
  let c = g.camera;
  if (!opts.useGameCamera) {
    c = cam;
    c.fov = opts.fov ?? 35;
    c.aspect = w / h;
    c.updateProjectionMatrix();
    const t = target.clone();
    t.y += opts.height ?? 1.1;
    const dist = opts.dist ?? 4.2;
    const yaw = opts.yaw ?? 0.5;
    const pitch = opts.pitch ?? 0.08;
    c.position.set(t.x + Math.sin(yaw) * dist * Math.cos(pitch), t.y + Math.sin(pitch) * dist, t.z + Math.cos(yaw) * dist * Math.cos(pitch));
    c.lookAt(t);
  }
  g.renderer.render(g.scene, c);
  const x = (sheet.i % cols) * w;
  const y = Math.floor(sheet.i / cols) * h;
  ctx.drawImage(g.renderer.domElement, 0, 0, g.renderer.domElement.width, g.renderer.domElement.height, x, y, w, h);
  ctx.fillStyle = '#000a';
  ctx.fillRect(x, y, w, 22);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(label, x + 6, y + 16);
  sheet.i++;
  if (c === cam) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
}
export async function endSheet(name) {
  const url = sheet.c.toDataURL('image/png');
  sheet = null;
  return (await fetch(`/__shot/${name}`, { method: 'POST', body: url })).status;
}

export const key = (code, type = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, { code }));
export const tap = (code) => { key(code); step(1); key(code, 'keyup'); step(1); };

Object.assign(window, { THREE, step, shot, key, tap, beginSheet, tile, endSheet });
export { THREE, g };
