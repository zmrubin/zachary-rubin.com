/**
 * Chart — the jump-to-anywhere navigator.
 *
 * Left: the six realms as a stack of cards. Right: the stations of whichever
 * realm you're inspecting, plotted against that realm's own axis with its own
 * units. Click a realm to preview it, a station to travel there.
 *
 * Entirely generated from content/realms.js + content/sections.js.
 */
export class Chart {
  constructor(rail, realms) {
    this.rail = rail;
    this.realms = realms;
    this.open = false;
    this.previewId = null;

    this.el = document.getElementById('chart');
    this._build();
    this._bind();

    realms.onChange((realm, phase) => {
      if (phase === 'enter' || phase === 'arrive') {
        this.previewId = realm.id;
        this._renderRealms();
        this._renderProfile();
      }
    });
  }

  _build() {
    this.el.innerHTML = `
      <div class="chart-frame">
        <header class="chart-head">
          <div>
            <div class="chart-kicker">Navigation chart</div>
            <h2 class="chart-title">Six worlds, one bio</h2>
          </div>
          <button class="chart-close" data-ui="1" aria-label="Close chart">
            <span></span><span></span>
          </button>
        </header>

        <div class="chart-body">
          <div class="chart-realms" id="chart-realms" data-scrollable></div>
          <div class="chart-profile" id="chart-profile"></div>
        </div>

        <footer class="chart-foot">
          <span id="chart-foot-a"></span>
          <span class="chart-foot-hint">Click a realm to preview, a station to travel</span>
          <span id="chart-foot-b"></span>
        </footer>
      </div>
    `;
    this.realmsEl = this.el.querySelector('#chart-realms');
    this.profileEl = this.el.querySelector('#chart-profile');
    this.footA = this.el.querySelector('#chart-foot-a');
    this.footB = this.el.querySelector('#chart-foot-b');
  }

  _bind() {
    this.el.querySelector('.chart-close').addEventListener('click', () => this.hide());
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el || e.target.classList.contains('chart-frame')) this.hide();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) this.hide();
      else if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey) {
        if (!e.target.closest?.('input, textarea')) this.toggle();
      }
    });
  }

  // ------------------------------------------------------------ realm list
  _renderRealms() {
    const activeId = this.realms.active?.id;
    this.realmsEl.innerHTML = this.realms.all
      .map((m, i) => {
        const count = this.realms.stationsIn(m.id).filter((s) => !s.crossLink).length;
        return `
        <button class="cr${m.id === this.previewId ? ' is-preview' : ''}${
          m.id === activeId ? ' is-here' : ''
        }" data-ui="1" data-realm="${m.id}" style="--realm-accent:${m.accent}">
          <span class="cr-bar"></span>
          <span class="cr-body">
            <span class="cr-top">
              <span class="cr-code">${String(i + 1).padStart(2, '0')} · ${m.code}</span>
              ${m.id === activeId ? '<span class="cr-here">You are here</span>' : ''}
            </span>
            <span class="cr-name">${m.label}</span>
            <span class="cr-blurb">${m.blurb}</span>
            <span class="cr-meta">${count} station${count === 1 ? '' : 's'} · ${m.kicker}</span>
          </span>
        </button>`;
      })
      .join('');

    for (const btn of this.realmsEl.querySelectorAll('.cr')) {
      btn.addEventListener('mouseenter', () => {
        this.previewId = btn.dataset.realm;
        this._renderRealms();
        this._renderProfile();
      });
      btn.addEventListener('click', () => {
        const id = btn.dataset.realm;
        if (id === this.realms.active?.id) this.hide();
        else {
          this.realms.travelTo(id, 0);
          this.hide();
        }
      });
    }
  }

  // --------------------------------------------------------------- profile
  _renderProfile() {
    const meta = this.realms.all.find((m) => m.id === this.previewId);
    if (!meta) return;

    const realm = this.realms.get(meta.id);
    const stations = this.realms.stationsIn(meta.id);
    const isHere = this.realms.active?.id === meta.id;

    const ticks = (realm?.axisTicks ?? [])
      .map(
        (tk) =>
          `<div class="ct" style="bottom:${(tk.at * 100).toFixed(1)}%"><span>${tk.label}</span></div>`
      )
      .join('');

    const rows = stations
      .map((st, i) => {
        const side = i % 2 === 0 ? 'left' : 'right';
        const thumb =
          !st.crossLink && st.section.image
            ? `<span class="cs-thumb" style="background-image:url('${st.section.image}')"></span>`
            : `<span class="cs-thumb is-empty"></span>`;
        const home = st.crossLink ? this.realms.realmOf(st.section.id) : null;
        const homeMeta = home ? this.realms.all.find((r) => r.id === home) : null;
        return `
          <button class="cs cs-${side}${st.crossLink ? ' is-cross' : ''}"
                  data-ui="1" data-at="${st.at}" data-id="${st.section.id}"
                  data-cross="${st.crossLink ? 1 : 0}"
                  style="bottom:${(st.at * 100).toFixed(2)}%">
            <span class="cs-arm"></span>
            <span class="cs-dot"></span>
            <span class="cs-card">
              ${thumb}
              <span class="cs-text">
                <span class="cs-num">${String(i + 1).padStart(2, '0')}${
                  st.crossLink ? ` · ↗ ${homeMeta?.label ?? ''}` : ''
                }</span>
                <span class="cs-name">${st.section.nav}</span>
                <span class="cs-title">${st.section.title}</span>
              </span>
            </span>
          </button>`;
      })
      .join('');

    this.profileEl.innerHTML = `
      <div class="cp-head" style="--realm-accent:${meta.accent}">
        <span class="cp-code">${meta.code}</span>
        <span class="cp-name">${meta.label}</span>
        <span class="cp-axis">${realm?.readout(0).axis ?? ''}</span>
      </div>
      <div class="cp-plot" style="--realm-accent:${meta.accent}">
        <div class="chart-ticks">${ticks}</div>
        <div class="chart-plot">
          <div class="chart-axis" data-ui="1">
            <div class="chart-axis-fill"></div>
            ${isHere ? '<div class="chart-here"><span class="chart-here-label"></span></div>' : ''}
          </div>
          <div class="chart-stations">${rows}</div>
        </div>
      </div>
    `;

    this.here = this.profileEl.querySelector('.chart-here');
    this.hereLabel = this.profileEl.querySelector('.chart-here-label');
    this.axis = this.profileEl.querySelector('.chart-axis');

    const ends = realm?.axisEnds ?? ['', ''];
    this.footA.textContent = ends[0];
    this.footB.textContent = ends[1];

    for (const btn of this.profileEl.querySelectorAll('.cs')) {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (btn.dataset.cross === '1') this.realms.goToSection(id);
        else if (meta.id === this.realms.active?.id) this.rail.travelTo(parseFloat(btn.dataset.at));
        else this.realms.travelTo(meta.id, parseFloat(btn.dataset.at));
        this.hide();
      });
    }

    // Scrubbing the column itself: any position, not just a station.
    this.axis?.addEventListener('click', (e) => {
      const r = this.axis.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
      if (meta.id === this.realms.active?.id) this.rail.travelTo(t);
      else this.realms.travelTo(meta.id, t);
      this.hide();
    });
  }

  // ------------------------------------------------------------------ open
  toggle() {
    this.open ? this.hide() : this.show();
  }

  show() {
    this.previewId = this.realms.active?.id ?? this.realms.all[0].id;
    this._renderRealms();
    this._renderProfile();
    this.el.classList.add('is-open');
    this.el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('chart-open');
    this.open = true;
  }

  hide() {
    this.el.classList.remove('is-open');
    this.el.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('chart-open');
    this.open = false;
  }

  update() {
    if (!this.open || !this.here) return;
    const t = this.rail.t;
    this.here.style.bottom = `${(t * 100).toFixed(2)}%`;
    const realm = this.realms.active;
    if (realm && this.hereLabel) this.hereLabel.textContent = realm.readout(t).value;
  }
}
