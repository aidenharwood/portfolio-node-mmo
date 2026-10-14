// Chat (online only). Enter opens the line, Enter sends, Esc closes it without pausing; '/' opens
// it ready for a command. Channels: world (default), /s nearby, /p party, /ra raid, /w Name whisper,
// /who, /r replies to the last whisper; party commands /invite /accept /decline /leave /kick
// /promote; raid groups /raid form|invite|accept|decline|leave|kick|promote|disband.
// Recent lines fade out of the log while chat is closed.
import { esc } from './cards.js';

const KEEP = 60;
const SHOW_FOR = 14000;
const HISTORY = 20;

export class ChatUI {
  constructor(game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.id = 'chat';
    this.el.className = 'hidden';
    this.el.innerHTML = '<div class="chat-log"></div><form class="chat-line hidden"><span class="chat-ch">World</span><input maxlength="200" autocomplete="off" spellcheck="false"></form>';
    document.body.appendChild(this.el);
    this.log = this.el.querySelector('.chat-log');
    this.form = this.el.querySelector('.chat-line');
    this.input = this.form.querySelector('input');
    this.chLabel = this.form.querySelector('.chat-ch');
    this.lastWhisper = null;
    this.history = [];
    this.histIndex = -1;

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.send();
    });
    // Keys typed here never reach the game (Input ignores text fields); Esc and Enter are handled
    // here and stopped so they don't pause the game or reopen the chat.
    this.input.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
      else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
        if (!this.history.length) return;
        this.histIndex = Math.max(-1, Math.min(this.history.length - 1, this.histIndex + (e.code === 'ArrowUp' ? 1 : -1)));
        this.input.value = this.histIndex < 0 ? '' : this.history[this.histIndex];
      } else if (e.code === 'Enter') e.stopPropagation();
    });
    this.input.addEventListener('input', () => this.updateChannel());
    this.input.addEventListener('blur', () => { if (this.isOpen) setTimeout(() => this.close(), 0); });
  }

  get isOpen() { return !this.form.classList.contains('hidden'); }

  show() { this.el.classList.remove('hidden'); }

  hide() {
    this.close();
    this.el.classList.add('hidden');
  }

  clear() { this.log.innerHTML = ''; }

  open(prefix = '') {
    if (!this.game.net.inWorld) return;
    this.show();
    this.game.input.keys.clear();
    this.form.classList.remove('hidden');
    this.el.classList.add('open');
    this.input.value = prefix;
    this.histIndex = -1;
    this.updateChannel();
    this.input.focus();
  }

  close() {
    if (!this.isOpen) return;
    this.form.classList.add('hidden');
    this.el.classList.remove('open');
    this.input.value = '';
    this.input.blur();
    this.game.input.keys.clear();
  }

  updateChannel() {
    const v = this.input.value;
    const [label, cls] = /^\/s\s/i.test(v) ? ['Say', 'say'] : /^\/(w|r)\s/i.test(v) ? ['Whisper', 'whisper'] : /^\/p(arty)?\s/i.test(v) ? ['Party', 'party'] : /^\/ra\s/i.test(v) ? ['Raid', 'raid'] : /^\/g\s/i.test(v) ? ['Guild', 'guild'] : v.startsWith('/') ? ['Command', 'system'] : ['World', 'world'];
    this.chLabel.textContent = label;
    this.chLabel.className = `chat-ch ${cls}`;
  }

  send() {
    let text = this.input.value.trim();
    this.close();
    if (!text) return;
    this.history.unshift(text);
    this.history.length = Math.min(this.history.length, HISTORY);
    const reply = /^\/r\s+(.+)$/i.exec(text);
    if (reply) {
      if (!this.lastWhisper) { this.add({ ch: 'system', text: 'Nobody has whispered to you yet.' }); return; }
      text = `/w ${this.lastWhisper} ${reply[1]}`;
    }
    this.game.net.send({ t: 'chat', text });
  }

  add({ ch, from, to, text, ti }) {
    const me = this.game.net.character?.name;
    if (ch === 'whisper' && from && from !== me) this.lastWhisper = from;
    const line = document.createElement('div');
    line.className = `chat-msg ${ch}`;
    let who = '';
    if (ch === 'whisper') who = from === me ? `To ${esc(to)}: ` : `${esc(from)} whispers: `;
    else if (from) who = `${ch === 'say' ? '' : ch === 'party' ? '<i>[Party]</i> ' : ch === 'raid' ? '<i>[Raid]</i> ' : ch === 'guild' ? '<i>[Guild]</i> ' : '<i>[World]</i> '}<b>${esc(from)}</b>${ti ? ` <small class="chat-title">${esc(ti)}</small>` : ''}: `;
    line.innerHTML = `${who}${esc(text)}`;
    line.dataset.at = Date.now();
    this.log.appendChild(line);
    while (this.log.children.length > KEEP) this.log.firstChild.remove();
    this.log.scrollTop = this.log.scrollHeight;
    this.show();
  }

  // Lines fade once they're old (all stay visible while the chat is open).
  update() {
    if (this.el.classList.contains('hidden')) return;
    const now = Date.now();
    for (const line of this.log.children) line.classList.toggle('old', now - line.dataset.at > SHOW_FOR);
  }
}
