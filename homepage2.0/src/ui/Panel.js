/**
 * Panel — the detail overlay for a section. Content comes straight from the
 * section object, so nothing here needs touching when sections are added.
 */
export class Panel {
  constructor() {
    this.el = document.getElementById('panel');
    this.body = document.getElementById('panel-body');
    this.open = false;

    document.getElementById('panel-close').addEventListener('click', () => this.close());
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) this.close();
    });
  }

  show(section) {
    this.body.innerHTML = `
      <div class="panel-kicker">${section.kicker ?? ''}</div>
      <h2 class="panel-title">${section.title}</h2>
      ${section.body.map((p) => `<p>${p}</p>`).join('')}
      ${
        section.tags?.length
          ? `<ul class="panel-tags">${section.tags.map((t) => `<li>${t}</li>`).join('')}</ul>`
          : ''
      }
      ${
        section.links?.length
          ? `<div class="panel-links">${section.links
              .map((l) => `<a href="${l.href}">${l.label}</a>`)
              .join('')}</div>`
          : ''
      }
    `;
    this.el.classList.add('is-open');
    this.el.setAttribute('aria-hidden', 'false');
    this.open = true;
    if (location.hash !== `#${section.id}`) {
      history.replaceState(null, '', `#${section.id}`);
    }
  }

  close() {
    this.el.classList.remove('is-open');
    this.el.setAttribute('aria-hidden', 'true');
    this.open = false;
  }
}
