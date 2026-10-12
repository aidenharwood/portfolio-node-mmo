// Elemental damage types. `status` keys into combat/Status.js.
export const ELEMENTS = {
  none:      { id: 'none',      label: '',          prefix: '',          color: 0xfff1a8, css: '#ffffff' },
  fire:      { id: 'fire',      label: 'Fire',      prefix: 'Searing',   color: 0xff6a1f, css: '#ff8a3d', status: 'burn' },
  shock:     { id: 'shock',     label: 'Shock',     prefix: 'Crackling', color: 0x58cfff, css: '#58cfff', status: 'shock' },
  frost:     { id: 'frost',     label: 'Frost',     prefix: 'Frozen',    color: 0xbff4ff, css: '#bff4ff', status: 'chill' },
  corrosive: { id: 'corrosive', label: 'Corrosive', prefix: 'Caustic',   color: 0x9be22d, css: '#9be22d', status: 'corrode' },
};

export const ELEMENT_IDS = ['fire', 'shock', 'frost', 'corrosive'];
