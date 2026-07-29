import {
  AXIS,
  GRADIENT,
  ZONES,
  altitudeAt,
  formatAltitude,
  journeyY,
  sampleRamp,
} from '../core/theme.js';

/**
 * Chart — the "sounding chart": a full-screen depth profile of the whole site.
 *
 * It's the jump-to-anywhere navigator. The vertical axis is the same column the
 * 3D world uses, tinted with the same GRADIENT, banded by the same ZONES, with
 * one station per section. Click a station (or anywhere on the axis) to travel.
 *
 * Entirely generated from content/sections.js — new sections show up here for
 * free, in the right place, with the right depth.
 */
export class Chart {
  constructor(rail, sections) {
    this.rail = rail;
    this.sections = sections;
    this.open = false;

    this.el = document.getElementById('chart');
    this._build();
    this._bind();
  }

  static gradientCss() {
    // Bottom-to-top CSS gradient matching the world's vertical ramp.
    const lo = AXIS.bottom;
    const hi = AXIS.top;
    return GRADIENT.filter(([y]) => y >= lo - 40 && y <= hi + 40)
      .map(([y, hex]) => `${hex} ${(((y - lo) / (hi - lo)) * 100).toFixed(1)}%`)
      .join(', ');
  }

  _colorAt(t) {
    return sampleRamp(GRADIENT, journeyY(t), (a, b, k) => (k < 0.5 ? a : b));
  }

  _build() {
    const zoneBands = ZONES.map((z, i) => {
      const next = ZONES[i + 1];
      const top = next ? next.at : 1;
      const h = (top - z.at) * 100;
      return `
        <div class="cz" style="bottom:${(z.at * 100).toFixed(2)}%; height:${h.toFixed(2)}%">
          <span class="cz-line" style="--c:${this._colorAt((z.at + top) / 2)}"></span>
          <span class="cz-name">${z.name}</span>
          <span class="cz-code">${z.code}</span>
        </div>`;
    }).join('');

    const stations = this.sections
      .map((s, i) => {
        const side = i % 2 === 0 ? 'left' : 'right';
        const num = String(i + 1).padStart(2, '0');
        const thumb = s.image
          ? `<span class="cs-thumb" style="background-image:url('${s.image}')"></span>`
          : `<span class="cs-thumb is-empty"></span>`;
        return `
          <button class="cs cs-${side}" data-at="${s.at}" data-ui="1"
                  style="bottom:${(s.at * 100).toFixed(2)}%">
            <span class="cs-arm"></span>
            <span class="cs-dot"></span>
            <span class="cs-card">
              ${thumb}
              <span class="cs-text">
                <span class="cs-num">${num} · ${formatAltitude(altitudeAt(s.at))}</span>
                <span class="cs-name">${s.nav}</span>
                <span class="cs-title">${s.title}</span>
              </span>
            </span>
          </button>`;
      })
      .join('');

    // Depth ticks every 10% of the journey, labelled with the flavour altimeter.
    let ticks = '';
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      ticks += `<div class="ct" style="bottom:${t * 100}%"><span>${formatAltitude(
        altitudeAt(t)
      )}</span></div>`;
    }

    this.el.innerHTML = `
      <div class="chart-frame">
        <header class="chart-head">
          <div>
            <div class="chart-kicker">Sounding chart</div>
            <h2 class="chart-title">Select a depth</h2>
          </div>
          <button class="chart-close" data-ui="1" aria-label="Close chart">
            <span></span><span></span>
          </button>
        </header>

        <div class="chart-body">
          <div class="chart-ticks">${ticks}</div>
          <div class="chart-zones">${zoneBands}</div>
          <!-- axis and stations share a coordinate space so stations can sit
               either side of the column without ever colliding -->
          <div class="chart-plot">
            <div class="chart-axis" data-ui="1">
              <div class="chart-axis-fill" style="background:linear-gradient(to top, ${Chart.gradientCss()})"></div>
              <div class="chart-here"><span class="chart-here-label"></span></div>
            </div>
            <div class="chart-stations">${stations}</div>
          </div>
        </div>

        <footer class="chart-foot">
          <span>Sea floor</span>
          <span class="chart-foot-hint">Click a station, or anywhere on the column</span>
          <span>Low earth orbit</span>
        </footer>
      </div>
    `;

    this.here = this.el.querySelector('.chart-here');
    this.hereLabel = this.el.querySelector('.chart-here-label');
    this.axis = this.el.querySelector('.chart-axis');
  }

  _bind() {
    this.el.querySelector('.chart-close').addEventListener('click', () => this.hide());
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el || e.target.classList.contains('chart-frame')) this.hide();
    });

    for (const btn of this.el.querySelectorAll('.cs')) {
      btn.addEventListener('click', () => {
        this.rail.travelTo(parseFloat(btn.dataset.at));
        this.hide();
      });
    }

    // Scrubbing the column itself: click any depth, not just a station.
    this.axis.addEventListener('click', (e) => {
      const r = this.axis.getBoundingClientRect();
      const t = 1 - (e.clientY - r.top) / r.height;
      this.rail.travelTo(Math.min(1, Math.max(0, t)));
      this.hide();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) this.hide();
      else if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey) this.toggle();
    });
  }

  toggle() {
    this.open ? this.hide() : this.show();
  }

  show() {
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

  /** Called from the frame loop so the "you are here" marker tracks the camera. */
  update() {
    if (!this.open) return;
    const t = this.rail.t;
    this.here.style.bottom = `${(t * 100).toFixed(2)}%`;
    this.hereLabel.textContent = formatAltitude(altitudeAt(t));
  }
}
