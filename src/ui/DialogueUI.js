// NPC conversation panel: speaker, line of text, notes (a quest board's postings, the war table's
// marks) and option buttons.
import { esc } from './cards.js';

export class DialogueUI {
  constructor(game, el) {
    this.game = game;
    this.el = el;
    this.options = [];
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-i]');
      if (btn) this.options[Number(btn.dataset.i)]?.onClick();
    });
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }

  open({ name, title = '', text, options, notes = [] }) {
    this.options = [...options, { label: 'Leave', onClick: () => this.game.closeMenus() }];
    this.el.innerHTML = `
      <div class="dlg-name">${esc(name)} <small>${esc(title)}</small></div>
      <p>${esc(text)}</p>
      ${notes.length ? `<div class="dlg-notes">${notes.map((n) => `<div class="dlg-note"><b>${esc(n.title)}</b>${n.tag ? `<small>${esc(n.tag)}</small>` : ''}<p>${esc(n.text)}</p></div>`).join('')}</div>` : ''}
      <div class="dlg-options">${this.options.map((o, i) => `<button data-i="${i}" class="${o.cls ?? ''}">${esc(o.label)}</button>`).join('')}</div>`;
    this.el.classList.remove('hidden');
  }

  close() {
    this.el.classList.add('hidden');
  }
}
