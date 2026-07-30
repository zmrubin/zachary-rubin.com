import * as THREE from 'three';

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Hud — all the DOM chrome: the realm switcher, the station navigator, the
 * gauge, telemetry, the transit banner, and the per-node labels projected from
 * 3D each frame.
 *
 * Everything realm-specific comes from the active realm's `readout()`, `axisEnds`
 * and `axisTicks`, plus the accent/scheme in its metadata — so a new theme gets
 * a correctly-labelled instrument panel without touching this file.
 *
 * Labels live in the DOM rather than the scene so type stays crisp, selectable
 * and accessible.
 */
export class Hud {
  constructor(rail, realms, onOpen) {
    this.rail = rail;
    this.realms = realms;
    this.onOpen = onOpen;

    this.el = {
      realmList: document.getElementById('realm-list'),
      nav: document.getElementById('nav-list'),
      navCount: document.getElementById('nav-count'),
      navRealm: document.getElementById('nav-realm'),
      labels: document.getElementById('labels'),
      gaugeTicks: document.getElementById('gauge-ticks'),
      gaugeFill: document.getElementById('gauge-fill'),
      gaugeMarker: document.getElementById('gauge-marker'),
      gaugeAxis: document.getElementById('gauge-axis'),
      readout: document.getElementById('readout'),
      zone: document.getElementById('zone'),
      zoneCode: document.getElementById('zone-code'),
      hero: document.getElementById('hero'),
      telemetry: document.getElementById('telemetry-body'),
      hint: document.getElementById('hint'),
      depart: document.getElementById('depart'),
      departLabel: document.getElementById('depart-label'),
      departFill: document.getElementById('depart-fill'),
      transit: document.getElementById('transit'),
      transitFrom: document.getElementById('transit-from'),
      transitTo: document.getElementById('transit-to'),
      transitBlurb: document.getElementById('transit-blurb'),
      transitFill: document.getElementById('transit-fill'),
    };

    this._buildRealmSwitcher();
    this._v = new THREE.Vector3();
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this._fps = 60;
    this.labels = [];

    realms.onChange((realm, phase) => this._onRealmChange(realm, phase));
  }

  // ------------------------------------------------------------- switcher
  _buildRealmSwitcher() {
    this.realmItems = this.realms.all.map((meta, i) => {
      const b = document.createElement('button');
      b.className = 'realm-item';
      b.dataset.ui = '1';
      b.dataset.realm = meta.id;
      b.style.setProperty('--realm-accent', meta.accent);
      b.innerHTML = `
        <span class="realm-swatch"></span>
        <span class="realm-code">${meta.code}</span>
        <span class="realm-name">${meta.label}</span>
      `;
      b.addEventListener('click', () => this.realms.travelTo(meta.id, 0));
      this.el.realmList.appendChild(b);
      return { meta, el: b, index: i };
    });
  }

  // ------------------------------------------------------------ per realm
  /** Rebuild everything that depends on which realm is active. */
  _onRealmChange(realm, phase) {
    if (phase === 'depart') return;
    if (!realm) return;

    const meta = realm.meta;

    // Retheme the whole HUD from the realm's palette.
    const root = document.documentElement;
    root.style.setProperty('--accent', meta.accent);
    root.style.setProperty('--accent-warm', meta.accentWarm ?? meta.accent);
    root.dataset.scheme = meta.scheme ?? 'dark';
    root.dataset.realm = meta.id;

    for (const r of this.realmItems) r.el.classList.toggle('is-active', r.meta.id === meta.id);

    this.el.navRealm.textContent = meta.label;
    this._buildNav(realm);
    this._buildGauge(realm);
    this._buildLabels(realm);

    this.el.hero.classList.toggle('is-first', this.realms.index === 0);
  }

  _buildNav(realm) {
    const stations = this.realms.stationsIn(realm.id);
    this.el.nav.innerHTML = '';
    this.el.navCount.textContent = `${pad2(stations.length)} total`;

    this.navItems = stations.map((st, i) => {
      const b = document.createElement('button');
      b.className = `nav-item${st.crossLink ? ' is-cross' : ''}`;
      b.dataset.ui = '1';
      const readout = realm.readout(st.at);
      b.innerHTML = `
        <span class="nav-num">${pad2(i + 1)}</span>
        <span class="nav-label">${st.section.nav}</span>
        <span class="nav-depth">${st.crossLink ? '↗' : readout.value}</span>
        <span class="nav-rule"></span>
      `;
      b.title = st.crossLink
        ? `${st.section.nav} — lives in ${this.realms.realmOf(st.section.id)}`
        : st.section.title;
      b.addEventListener('click', () => {
        if (st.crossLink) this.realms.goToSection(st.section.id);
        else this.rail.travelTo(st.at);
      });
      this.el.nav.appendChild(b);
      return { station: st, el: b };
    });
  }

  _buildGauge(realm) {
    this.el.gaugeTicks.innerHTML = '';
    const frag = document.createDocumentFragment();

    const ticks = realm.axisTicks ?? [];
    for (let i = 0; i <= 40; i++) {
      const tick = document.createElement('div');
      tick.className = i % 5 === 0 ? 'tick major' : 'tick';
      tick.style.top = `${(i / 40) * 100}%`;
      frag.appendChild(tick);
    }
    for (const st of this.realms.stationsIn(realm.id)) {
      const m = document.createElement('button');
      m.className = `gauge-node${st.crossLink ? ' is-cross' : ''}`;
      m.dataset.ui = '1';
      m.style.top = `${(1 - st.at) * 100}%`;
      m.title = st.section.nav;
      m.addEventListener('click', () => {
        if (st.crossLink) this.realms.goToSection(st.section.id);
        else this.rail.travelTo(st.at);
      });
      frag.appendChild(m);
    }
    this.el.gaugeTicks.appendChild(frag);

    const ends = realm.axisEnds;
    this.el.gaugeAxis.textContent = realm.readout(0).axis;
    void ticks;
    void ends;
  }

  _buildLabels(realm) {
    this.el.labels.innerHTML = '';
    this.labels = realm.nodes.items.map((item) => {
      const el = document.createElement('div');
      el.className = `label${item.crossLink ? ' is-cross' : ''}`;
      el.dataset.ui = '1';
      const homeRealm = item.crossLink ? this.realms.realmOf(item.section.id) : null;
      const homeMeta = homeRealm ? this.realms.all.find((r) => r.id === homeRealm) : null;

      el.innerHTML = `
        <div class="label-kicker">${
          item.crossLink ? `Also in ${homeMeta?.label ?? ''}` : item.section.kicker ?? ''
        }</div>
        <h2 class="label-title">${item.section.title}</h2>
        <button class="label-open">
          <span class="label-open-ring"></span>
          <span>${item.crossLink ? `Jump to ${homeMeta?.label ?? 'home'}` : 'Open dossier'}</span>
        </button>
      `;
      el.querySelector('.label-open').addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.crossLink) this.realms.goToSection(item.section.id);
        else this.onOpen(item.section);
      });
      this.el.labels.appendChild(el);

      const { width, height } = item.card.geometry.parameters;
      return { item, el, anchor: new THREE.Vector3(-0.5 * width, -0.62 * height, 0) };
    });
  }

  // ----------------------------------------------------------------- frame
  update(dt, elapsed) {
    const realm = this.realms.active;
    if (!realm) return;

    const tr = this.realms.transitionProgress;
    this._updateTransit(tr);
    if (tr) return; // the banner owns the screen during a realm change

    const t = this.rail.t;

    // ---- fps
    this._fpsAcc += dt;
    this._fpsFrames++;
    if (this._fpsAcc > 0.5) {
      this._fps = Math.round(this._fpsFrames / this._fpsAcc);
      this._fpsAcc = 0;
      this._fpsFrames = 0;
    }

    // ---- gauge + readouts
    const r = realm.readout(t);
    this.el.gaugeFill.style.height = `${t * 100}%`;
    this.el.gaugeMarker.style.bottom = `${t * 100}%`;
    this.el.readout.textContent = r.value;
    if (this.el.zone.textContent !== r.zone) {
      this.el.zone.textContent = r.zone;
      this.el.zoneCode.textContent = r.code;
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
      ['RLM', realm.meta.code],
      ['TRK', `${(t * 100).toFixed(1)}%`],
      ['POS', `${cam.x.toFixed(0)} ${cam.y.toFixed(0)} ${cam.z.toFixed(0)}`],
      ['FPS', `${this._fps}`],
    ]
      .map(([k, v]) => `<span class="t-row"><i>${k}</i><b>${v}</b></span>`)
      .join('');

    // ---- hero, only in the first realm
    const isFirst = this.realms.index === 0;
    const heroOpacity = isFirst ? 1 - THREE.MathUtils.smoothstep(t, 0.006, 0.055) : 0;
    this.el.hero.style.opacity = heroOpacity;
    this.el.hero.style.pointerEvents = heroOpacity > 0.5 ? 'auto' : 'none';
    this.el.hint.style.opacity = heroOpacity * 0.9;

    // ---- departure affordance
    this._updateDepart();

    // ---- nav active state
    const active = realm.nodes.active;
    for (const n of this.navItems ?? []) {
      n.el.classList.toggle('is-active', active?.at === n.station.at);
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
      this._v.copy(anchor);
      item.group.localToWorld(this._v);
      this._v.project(this.rail.camera);

      const x = (this._v.x * 0.5 + 0.5) * cw;
      const y = (-this._v.y * 0.5 + 0.5) * ch;
      const behind = this._v.z > 1;

      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      el.style.opacity = behind ? 0 : Math.pow(item.focus, 1.4);
      el.classList.toggle('is-focused', item.focus > 0.65);
      el.style.pointerEvents = item.focus > 0.65 ? 'auto' : 'none';
    }
  }

  /** "Keep scrolling to leave" — shows how much pressure is built up. */
  _updateDepart() {
    const os = this.rail.overscroll;
    const dir = Math.sign(os);
    const can = dir > 0 ? this.rail.canDepart.next : this.rail.canDepart.prev;
    const amount = Math.min(Math.abs(os) / 0.34, 1);

    if (!can || amount < 0.04) {
      this.el.depart.classList.remove('is-on');
      return;
    }
    const next = this.realms.all[this.realms.index + dir];
    if (!next) {
      this.el.depart.classList.remove('is-on');
      return;
    }
    this.el.depart.classList.add('is-on');
    this.el.depart.classList.toggle('is-back', dir < 0);
    this.el.departLabel.textContent = `${dir > 0 ? 'Depart to' : 'Back to'} ${next.label}`;
    this.el.departFill.style.transform = `scaleX(${amount.toFixed(3)})`;
  }

  /** The transit banner shown while a realm change is in flight. */
  _updateTransit(tr) {
    if (!tr) {
      this.el.transit.classList.remove('is-on');
      document.body.classList.remove('in-transit');
      return;
    }
    // Station labels belong to a realm that's mid-swap; showing them over the
    // gate leaves the previous world's captions floating on the new one.
    document.body.classList.add('in-transit');
    this.el.depart.classList.remove('is-on');
    this.el.transit.classList.add('is-on');
    this.el.transitFrom.textContent = tr.from?.label ?? '—';
    this.el.transitTo.textContent = tr.to.label;
    this.el.transitBlurb.textContent = tr.p < 0.5 ? tr.from?.kicker ?? '' : tr.to.kicker;
    this.el.transitFill.style.transform = `scaleX(${tr.p.toFixed(3)})`;
  }
}
