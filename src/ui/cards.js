// Shared item card markup (loot pop-up, inventory detail, trader).
import { weaponInfo, weaponStatLines, armorInfo, armorStatLines } from '../items/describe.js';
import { isArmor, itemValue } from '../items/items.js';

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const comparable = (a, b) => b && a !== b && (isArmor(a) ? isArmor(b) && a.slot === b.slot : !isArmor(b) && a.cls === b.cls);

export function itemCardHTML(item, { compare = null, thumb = '', footer = '' } = {}) {
  const armor = isArmor(item);
  const info = armor ? armorInfo(item, itemValue(item)) : weaponInfo(item);
  const linesOf = (it) => (isArmor(it) ? armorStatLines(it) : weaponStatLines(it));
  const cmp = comparable(item, compare) ? linesOf(compare) : null;
  const rows = linesOf(item).map((line) => {
    let arrow = '';
    const other = cmp?.find((c) => c.key === line.key);
    if (cmp && (!other || Math.abs(other.value - line.value) > 1e-6)) {
      const better = ((line.value > (other?.value ?? 0)) === line.higher);
      arrow = `<span class="${better ? 'up' : 'down'}">${better ? '▲' : '▼'}</span>`;
    }
    return `<tr><td>${line.label}</td><td>${line.text} ${arrow}</td></tr>`;
  }).join('');
  const element = info.element ? `<div class="lc-el" style="color:${info.element.css}">◆ ${info.element.label}</div>` : '';
  const perks = info.perks.map((pk) => `<div class="lc-perk ${pk.legendary ? 'legendary' : ''}"><b>${esc(pk.name)}</b> — ${esc(pk.desc)}</div>`).join('');
  return `
    <div class="card" style="--rc:${info.color}">
      ${thumb ? `<img class="lc-thumb" src="${thumb}" alt="">` : ''}
      <div class="lc-name">${esc(info.name)}</div>
      <div class="lc-sub">${info.subtitle}</div>
      <div class="lc-mfr">${esc(info.manufacturer)} · ${info.value}g</div>
      <div class="lc-parts">${info.components.map(esc).join(' · ')}</div>
      <table>${rows}</table>
      ${info.how ? `<div class="lc-how">${esc(info.how)}</div>` : ''}
      ${element}${perks}
      <div class="lc-blurb">“${esc(info.blurb)}”</div>
      ${footer}
    </div>`;
}

// Back-compat alias.
export const weaponCardHTML = itemCardHTML;
