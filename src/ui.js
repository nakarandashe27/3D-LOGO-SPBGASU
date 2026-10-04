// Панель настроек. Описывается схемой и синхронизируется с состоянием приложения.

const ICONS = {
  circle: '<circle cx="12" cy="12" r="8"/>',
  layers: '<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="m3 13 9 5 9-5"/><path d="m3 17.5 9 5 9-5" opacity=".5"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.4-5.7L20 8.5"/><path d="M20 3.5v5h-5"/>',
  coin: '<ellipse cx="12" cy="10" rx="8" ry="3.5"/><path d="M4 10v4c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-4"/>',
  spin: '<path d="M12 4a8 8 0 1 0 8 8"/><path d="M20 4v4h-4"/><circle cx="12" cy="12" r="2"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/>',
  cube: '<path d="M12 2.8 3.8 7.4v9.2l8.2 4.6 8.2-4.6V7.4z"/><path d="m3.8 7.4 8.2 4.6 8.2-4.6M12 12v9.2"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="m16 10.5 5-3v9l-5-3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 3.5v5h5"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M15 4v16"/>',
  present: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
  drop: '<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z"/>',
  gem: '<path d="M6 4h12l3 5-9 11L3 9z"/><path d="M3 9h18M9 4l3 16 3-16"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
};

export const icon = (name, size = 14) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export function createPanel(root, schema, state, { onChange, onAction }) {
  const updaters = [];
  root.innerHTML = '';

  const header = el('header', 'panel-head');
  header.innerHTML = `<div><div class="panel-title">${schema.title}</div><div class="panel-sub">${schema.subtitle}</div></div>`;
  const resetBtn = el('button', 'icon-btn', icon('reset', 15));
  resetBtn.title = 'Сбросить настройки';
  resetBtn.addEventListener('click', () => onAction('reset'));
  header.appendChild(resetBtn);
  root.appendChild(header);

  const body = el('div', 'panel-body');
  root.appendChild(body);

  for (const section of schema.sections) {
    const sec = el('section', 'sec');
    if (section.title) {
      const head = el('button', 'sec-head', `<span>${section.title}</span>${icon('chevron', 13)}`);
      head.addEventListener('click', () => sec.classList.toggle('collapsed'));
      sec.appendChild(head);
    }
    const content = el('div', 'sec-body');
    sec.appendChild(content);
    for (const ctrl of section.controls) content.appendChild(buildControl(ctrl));
    body.appendChild(sec);
  }

  const footer = el('footer', 'panel-foot');
  for (const a of schema.footer) {
    const b = el('button', `foot-btn ${a.primary ? 'primary' : ''}`, `${icon(a.icon, 14)}<span>${a.label}</span>${a.kbd ? `<kbd>${a.kbd}</kbd>` : ''}`);
    b.addEventListener('click', () => onAction(a.action));
    footer.appendChild(b);
  }
  root.appendChild(footer);

  function buildControl(ctrl) {
    const wrap = el('div', `ctrl ctrl-${ctrl.type}`);
    if (ctrl.label) {
      const lab = el('div', 'ctrl-label', `<span>${ctrl.label}</span>`);
      if (ctrl.type === 'slider') {
        const val = el('span', 'ctrl-value');
        lab.appendChild(val);
        updaters.push((s) => (val.textContent = ctrl.format(s[ctrl.key])));
      }
      wrap.appendChild(lab);
    }

    if (ctrl.type === 'segment' || ctrl.type === 'pills') {
      const group = el('div', ctrl.type === 'segment' ? 'segment' : 'pills');
      if (ctrl.type === 'segment') group.style.setProperty('--n', ctrl.options.length);
      const buttons = ctrl.options.map((opt) => {
        let lead = '';
        if (opt.icon) lead = icon(opt.icon, 13);
        else if (opt.swatch !== undefined)
          lead = opt.swatch ? `<i class="dot" style="background:${opt.swatch}"></i>` : '<i class="dot dot-none"></i>';
        else if (opt.preview !== undefined)
          lead = opt.preview
            ? `<i class="dot dot-pattern" style="background-image:url(${opt.preview})"></i>`
            : '<i class="dot dot-none"></i>';
        const b = el('button', 'opt', `${lead}<span>${opt.label}</span>`);
        b.addEventListener('click', () => onChange(ctrl.key, opt.value));
        group.appendChild(b);
        return [opt.value, b];
      });
      updaters.push((s) => buttons.forEach(([v, b]) => b.classList.toggle('active', s[ctrl.key] === v)));
      wrap.appendChild(group);
    } else if (ctrl.type === 'toggle') {
      const b = el('button', 'toggle', `${ctrl.icon ? icon(ctrl.icon, 13) : ''}<span>${ctrl.text}</span><i class="switch"></i>`);
      b.addEventListener('click', () => onChange(ctrl.key, !state.get()[ctrl.key]));
      updaters.push((s) => b.classList.toggle('on', !!s[ctrl.key]));
      wrap.appendChild(b);
    } else if (ctrl.type === 'slider') {
      const input = el('input', 'slider');
      Object.assign(input, { type: 'range', min: ctrl.min, max: ctrl.max, step: ctrl.step });
      input.addEventListener('input', () => onChange(ctrl.key, Number(input.value)));
      updaters.push((s) => {
        input.value = s[ctrl.key];
        input.style.setProperty('--p', `${((s[ctrl.key] - ctrl.min) / (ctrl.max - ctrl.min)) * 100}%`);
      });
      wrap.appendChild(input);
    } else if (ctrl.type === 'actions') {
      const grid = el('div', 'actions');
      for (const a of ctrl.actions) {
        const b = el('button', 'action', `${icon(a.icon, 14)}<span><b>${a.label}</b><small>${a.hint}</small></span>`);
        b.addEventListener('click', () => onAction(a.action, b));
        grid.appendChild(b);
      }
      wrap.appendChild(grid);
    } else if (ctrl.type === 'note') {
      const n = el('p', 'note');
      updaters.push((s) => (n.textContent = ctrl.text(s)));
      wrap.appendChild(n);
    }
    if (ctrl.visible) updaters.push((s) => (wrap.hidden = !ctrl.visible(s)));
    return wrap;
  }

  const update = (s) => updaters.forEach((u) => u(s));
  update(state.get());
  return { update };
}
