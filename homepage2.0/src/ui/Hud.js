import * as THREE from 'three';
import { altitudeAt, formatAltitude, zoneAt } from '../core/theme.js';

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Hud — all the DOM chrome: nav, depth gauge, telemetry, hero title, and the
 * per-node labels that are projected from 3D each frame.
 *
 * Labels live in the DOM rather than in the scene so type stays crisp,
 * selectable and accessible.
 */
export class Hud {
  constructor(rail, nodes, sections, onOpen) {
    this.rail = rail;
    this.nodes = nodes;
    this.sections = sections;
    this.onOpen = onOpen;

    this.el = {
      nav: document.getElementById('nav-list'),
      navCount: document.getElementById('nav-count'),
      labels: document.getElementById('labels'),
      gaugeTicks: document.getElementById('gauge-ticks'),
      gaugeFill: document.getElementById('gauge-fill'),
      gaugeMarker: document.getElementById('gauge-marker'),
      altitude: document.getElementById('altitude'),
      zone: document.getElementById('zone'),
      zoneCode: document.getElementById('zone-code'),
      hero: document.getElementById('hero'),
      telemetry: document.getElementById('telemetry-body'),
      hint: document.getElementById('hint'),
      shell: document.getElementById('hud'),
    };

    this._buildNav();
    this._buildGauge();
    this._buildLabels();

    this._v = new THREE.Vector3();
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this._fps = 60;
  }

  /**
   * The navigator: each station gets an index, a name, its depth readout and a
   * rule that extends when active — a docked instrument list, not a menu bar.
   */
  _buildNav() {
    this.el.navCount.textContent = `${pad2(this.sections.length)} total`;
    this.navItems = this.sections.map((s, i) => {
      const b = document.createElement('button');
      b.className = 'nav-item';
      b.dataset.ui = '1';
      b.innerHTML = `
        <span class="nav-num">${pad2(i + 1)}</span>
        <span class="nav-label">${s.nav}</span>
        <span class="nav-depth">${formatAltitude(altitudeAt(s.at))}</span>
        <span class="nav-rule"></span>
      `;
      b.addEventListener('click', () => this.rail.travelTo(s.at));
      this.el.nav.appendChild(b);
      return { section: s, el: b };
    });
  }

  _buildGauge() {
    // Ticks: dense minor, labelled major.
    const frag = document.createDocumentFragment();
    for (let i = 0; i <= 40; i++) {
      const tick = document.createElement('div');
      tick.className = i % 5 === 0 ? 'tick major' : 'tick';
      tick.style.top = `${(i / 40) * 100}%`;
      frag.appendChild(tick);
    }
    // Section markers on the gauge, clickable.
    for (const s of this.sections) {
      const m = document.createElement('button');
      m.className = 'gauge-node';
      m.dataset.ui = '1';
      m.style.top = `${(1 - s.at) * 100}%`;
      m.title = s.nav;
      m.addEventListener('click', () => this.rail.travelTo(s.at));
      frag.appendChild(m);
    }
    this.el.gaugeTicks.appendChild(frag);
  }

  _buildLabels() {
    this.labels = this.nodes.items.map((item) => {
      const el = document.createElement('div');
      el.className = 'label';
      el.dataset.ui = '1';
      el.innerHTML = `
        <div class="label-kicker">${item.section.kicker ?? ''}</div>
        <h2 class="label-title">${item.section.title}</h2>
        <button class="label-open">
          <span class="label-open-ring"></span>
          <span>Open dossier</span>
        </button>
      `;
      el.querySelector('.label-open').addEventListener('click', (e) => {
        e.stopPropagation();
        this.onOpen(item.section);
      });
      this.el.labels.appendChild(el);
      const { width, height } = item.card.geometry.parameters;
      return { item, el, anchor: new THREE.Vector3(-0.5 * width, -0.62 * height, 0) };
    });
  }

  update(dt, elapsed) {
    const t = this.rail.t;

    // ---- fps (shown in telemetry; also drives nothing else, purely flavor)
    this._fpsAcc += dt;
    this._fpsFrames++;
    if (this._fpsAcc > 0.5) {
      this._fps = Math.round(this._fpsFrames / this._fpsAcc);
      this._fpsAcc = 0;
      this._fpsFrames = 0;
    }

    // ---- gauge + readouts
    const pct = t * 100;
    this.el.gaugeFill.style.height = `${pct}%`;
    this.el.gaugeMarker.style.bottom = `${pct}%`;
    this.el.altitude.textContent = formatAltitude(altitudeAt(t));
    const zone = zoneAt(t);
    if (this.el.zone.textContent !== zone.name) {
      this.el.zone.textContent = zone.name;
      this.el.zoneCode.textContent = zone.code;
      this.el.zone.animate(
        [
          { opacity: 0, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 420, easing: 'cubic-bezier(.2,.9,.2,1)' }
      );
    }

    // ---- telemetry
    const cam = this.rail.camera.position;
    this.el.telemetry.innerHTML = [
      ['TRK', `${(t * 100).toFixed(1)}%`],
      ['VEL', `${(this.rail.velocity * 100).toFixed(2)} u/s`],
      ['POS', `${cam.x.toFixed(1)} ${cam.y.toFixed(1)} ${cam.z.toFixed(1)}`],
      ['FPS', `${this._fps}`],
    ]
      .map(([k, v]) => `<span class="t-row"><i>${k}</i><b>${v}</b></span>`)
      .join('');

    // ---- hero fades as you leave the sea floor
    const heroOpacity = 1 - THREE.MathUtils.smoothstep(t, 0.006, 0.055);
    this.el.hero.style.opacity = heroOpacity;
    this.el.hero.style.transform = `translateY(${-heroOpacity * 0 + (1 - heroOpacity) * -28}px)`;
    this.el.hero.style.pointerEvents = heroOpacity > 0.5 ? 'auto' : 'none';
    this.el.hint.style.opacity = this.rail.idle > 6 && t < 0.02 ? 1 : heroOpacity * 0.9;

    // ---- nav active state
    const active = this.nodes.active;
    for (const n of this.navItems) {
      n.el.classList.toggle('is-active', active?.section === n.section);
    }

    // ---- project labels from 3D to screen
    const cw = window.innerWidth;
    const ch = window.innerHeight;
    for (const { item, el, anchor } of this.labels) {
      if (!item.group.visible || item.focus < 0.02) {
        if (el.style.display !== 'none') el.style.display = 'none';
        continue;
      }
      el.style.display = '';

      // Anchor to the bottom-left of the card, in world space.
      this._v.copy(anchor);
      item.group.localToWorld(this._v);
      this._v.project(this.rail.camera);

      const x = (this._v.x * 0.5 + 0.5) * cw;
      const y = (-this._v.y * 0.5 + 0.5) * ch;
      const behind = this._v.z > 1;

      const o = behind ? 0 : Math.pow(item.focus, 1.4);
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      el.style.opacity = o;
      el.classList.toggle('is-focused', item.focus > 0.65);
      el.style.pointerEvents = item.focus > 0.65 ? 'auto' : 'none';
    }
  }
}
