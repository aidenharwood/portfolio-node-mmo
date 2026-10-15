// NPC conversation panel: speaker, line of text, notes (a quest board's postings, the war table's
// marks) and option buttons.
import { esc } from './cards.js';
import { markHtml } from './questMarks.js';

// A quest card's badge: the mark its quest wears over the giver's head.
const NOTE_MARK = { available: 'offer', ready: 'turnin', active: 'objective' };

const QUEST_KIND_LABEL = { story: 'Story Quest', side: 'Side Quest', errand: 'Errand', contract: 'Warden Contract', hunt: 'Hunt', job: 'Board Posting' };
const QUEST_KIND_CLASS = new Set(Object.keys(QUEST_KIND_LABEL));

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

  open({ name, title = '', text, options, notes = [], questKind = null, step = 'Choose a response' }) {
    this.options = [...options, { label: 'Leave', onClick: () => this.game.closeMenus() }];
    const actionButton = (o, i, extraClass = '') => {
      const classes = (o.cls ?? '').split(/\s+/).filter((c) => QUEST_KIND_CLASS.has(c) || c === 'quest').join(' ');
      return `<button data-i="${i}" class="${classes} ${extraClass}"${i === 0 ? ' data-primary="true"' : ''}><span class="dlg-choice-copy">${o.action ? `<small>${esc(o.action)}</small>` : ''}<span>${esc(o.label)}</span></span></button>`;
    };
    const linked = new Set(notes.map((n) => n.optionIndex).filter(Number.isInteger));
    const actions = this.options.map((o, i) => linked.has(i) ? '' : actionButton(o, i)).join('');
    const kindClass = QUEST_KIND_CLASS.has(questKind) ? questKind : '';
    this.el.classList.toggle('quest-story', kindClass === 'story');
    this.el.classList.toggle('quest-side', kindClass === 'side');
    this.el.innerHTML = `
      <header class="dlg-head"><div><div class="dlg-eyebrow">${esc(QUEST_KIND_LABEL[kindClass] ?? 'Conversation')}</div><div class="dlg-name">${esc(name)}</div>${title ? `<div class="dlg-role">${esc(title)}</div>` : ''}</div>${step ? `<span class="dlg-step">${esc(step)}</span>` : ''}</header>
      <p class="dlg-line">${esc(text)}</p>
      ${notes.length ? `<div class="dlg-notes">${notes.map((n) => `<article class="dlg-note ${esc(n.state ?? '')} ${n.tone ? `qm-${esc(n.tone)}` : ''}"><header>${n.tone ? markHtml({ state: NOTE_MARK[n.state] ?? 'offer', tone: n.tone, n: 1 }) : ''}<b>${esc(n.title)}</b>${n.tag ? `<small>${esc(n.tag)}</small>` : ''}</header><p>${esc(n.text)}</p>${Number.isInteger(n.optionIndex) ? actionButton(this.options[n.optionIndex], n.optionIndex, 'dlg-note-action') : ''}</article>`).join('')}</div>` : ''}
      ${actions ? `<div class="dlg-options">${actions}</div>` : ''}`;
    this.el.classList.remove('hidden');
  }

  close() {
    this.el.classList.add('hidden');
  }
}
