import * as THREE from 'three';
import { NOISE_GLSL } from '../core/theme.js';

const CARD_H = 5.4;

/**
 * Can this browser decode WebM at all? Safari mostly can't, and where it can it
 * ignores the alpha channel, so cut-out cards fall back to the still there.
 */
let _alphaVideo;
function canPlayAlphaVideo() {
  if (_alphaVideo === undefined) {
    const v = document.createElement('video');
    const webm = !!v.canPlayType('video/webm; codecs="vp9"');
    const safari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
    _alphaVideo = webm && !safari;
  }
  return _alphaVideo;
}

/**
 * Nodes — the content beacons for one realm.
 *
 * Placement comes entirely from the realm (`Realm.nodeTransform`), so each theme
 * decides whether stations hang on a vertical column, line a corridor, or orbit a
 * turntable, while the card, bezel, frame, motif and picking behaviour stay shared.
 *
 * Two kinds of station:
 *   full        the section's home realm — photo, label, opens the dossier
 *   cross-link  a section homed elsewhere that also belongs here. Rendered as a
 *               smaller schematic marker; activating it jumps to the home realm.
 */
export class Nodes {
  /**
   * @param {import('../core/Realm.js').Realm} realm
   * @param {{section: object, at: number, crossLink: boolean}[]} stations
   * @param {THREE.TextureLoader} loader
   */
  constructor(realm, stations, loader) {
    this.realm = realm;
    this.stations = stations;
    this.object3D = new THREE.Group();
    this.items = [];
    this.light = realm.meta.scheme === 'light';

    stations.forEach((st, i) => this.items.push(this._build(st, i, loader)));

    this.raycaster = new THREE.Raycaster();
    this.hovered = null;
  }

  // ------------------------------------------------------------------ build
  _build(station, index, loader) {
    const { section, at, crossLink } = station;
    const group = new THREE.Group();

    const tf = this.realm.nodeTransform(section, index, at, crossLink);
    group.position.copy(tf.position);
    group.lookAt(tf.faces);
    const baseScale = (tf.scale ?? 1) * (crossLink ? 0.62 : 1);
    group.scale.setScalar(baseScale);

    const aspect = crossLink ? 1.3 : section.aspect ?? 1.5;
    const w = CARD_H * aspect;
    const h = CARD_H;

    const accent = this.realm.accent;
    const scheme = this.light ? 1 : 0;

    // ---- card
    // A section may carry a looping alpha video instead of a still. Browsers
    // that can't decode WebM fall back to the section's image, which also
    // covers Safari — it plays WebM but ignores the alpha channel.
    let video = null;
    let texture = null;
    const still = () => {
      const tex = loader.load(section.image);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    };

    if (!crossLink && section.video && canPlayAlphaVideo()) {
      video = document.createElement('video');
      Object.assign(video, { loop: true, muted: true, playsInline: true, preload: 'auto' });
      video.src = section.video;
      texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
    } else if (!crossLink && section.image) {
      texture = still();
    }

    const cardMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uMap: { value: texture },
        uHasMap: { value: texture ? 1 : 0 },
        uIsVideo: { value: video ? 1 : 0 },
        uTime: { value: 0 },
        uFocus: { value: 0 },
        uHover: { value: 0 },
        uAccent: { value: accent },
        uAspect: { value: aspect },
        uReveal: { value: 0 },
        uScheme: { value: scheme },
        uCross: { value: crossLink ? 1 : 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uTime, uFocus;
        void main(){
          vUv = uv;
          vec3 p = position;
          // Gentle hologram warp, flattening out as the node takes focus.
          p.z += sin(p.y * 0.9 + uTime * 1.3) * 0.11 * (1.0 - uFocus * 0.75);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform float uHasMap, uIsVideo, uTime, uFocus, uHover, uAspect, uReveal, uScheme, uCross;
        uniform vec3 uAccent;
        varying vec2 vUv;
        ${NOISE_GLSL}

        float roundedBox(vec2 p, vec2 b, float r){
          vec2 q = abs(p) - b + r;
          return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
        }

        void main(){
          vec2 uv = vUv;
          vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
          vec2 hb = vec2(uAspect, 1.0) * 0.5; // half-bounds ('half' is reserved)

          float d = roundedBox(p, hb - 0.012, 0.055);
          if (d > 0.0) discard;

          vec3 col;
          float alpha;

          if (uHasMap > 0.5) {
            vec4 tex = texture2D(uMap, uv);
            vec3 img = tex.rgb;
            float lum = dot(img, vec3(0.2126, 0.7152, 0.0722));
            // Unfocused: a graded ghost. Focused: the real photograph.
            vec3 ghost = mix(uAccent * lum * 0.85, vec3(lum), 0.35);
            col = mix(ghost, img, smoothstep(0.15, 0.95, uFocus));
            // Push saturation back up as it focuses; the global grade cools
            // shadows, which would otherwise leave every photo tinted.
            float cl = dot(col, vec3(0.2126, 0.7152, 0.0722));
            col = mix(vec3(cl), col, 1.0 + uFocus * 0.35);
            col *= 0.6 + uFocus * 0.6;
            alpha = 0.5 + uFocus * 0.48;
            // A cut-out video keeps its own silhouette, so the subject floats
            // in the frame instead of riding on a lit rectangle. The rim below
            // still draws the card edge, so the station stays legible.
            alpha *= mix(1.0, tex.a, uIsVideo);
          } else {
            // Procedural instrument face.
            float grid = max(
              smoothstep(0.965, 1.0, fract(uv.x * 22.0)),
              smoothstep(0.965, 1.0, fract(uv.y * 14.0))
            );
            float rings = smoothstep(0.86, 1.0, sin(length(p) * 15.0 - uTime * 1.4) * 0.5 + 0.5);
            float n = fbm(uv * 6.0 + uTime * 0.05);
            col = uAccent * (grid * 0.26 + rings * 0.3 + n * 0.09);
            col += uAccent * 0.035;
            alpha = (0.22 + uFocus * 0.34) * (0.3 + grid * 0.45 + rings * 0.6 + n * 0.28);
          }

          // Cross-links read as a schematic stand-in, never a photo.
          if (uCross > 0.5) {
            float diag = step(0.5, fract((uv.x * uAspect + uv.y) * 9.0));
            col = uAccent * (0.16 + diag * 0.18);
            alpha = (0.2 + uFocus * 0.3) * (0.45 + diag * 0.4);
          }

          // Refresh sweep travelling up the card.
          float sweepY = fract(uTime * 0.16);
          float sweep = exp(-pow((uv.y - sweepY) * 26.0, 2.0));
          col += uAccent * sweep * 0.3;

          col *= 1.0 - 0.10 * (sin(uv.y * 300.0 - uTime * 3.0) * 0.5 + 0.5);
          col += (hash21(uv * 220.0 + fract(uTime) * 61.0) - 0.5) * 0.045;

          float rim = smoothstep(0.0, -0.022, d) * (1.0 - smoothstep(-0.022, -0.07, d));
          col += uAccent * rim * (0.22 + uHover * 0.5) * (0.5 + uFocus * 0.5);
          alpha = max(alpha, rim * 0.5);

          // In a light realm an imageless card is ink-on-paper, not emission.
          if (uScheme > 0.5 && uHasMap < 0.5) {
            col = mix(vec3(0.10, 0.12, 0.14), uAccent * 0.7, 0.35 + rim * 0.5);
            alpha = min(1.0, alpha * 1.6 + 0.12);
          }

          alpha *= smoothstep(0.0, 0.55, uReveal + uv.y * 0.45);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    // ---- bezel behind the card, so photos have their own contrast
    const bezelMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uFocus: { value: 0 },
        uAspect: { value: aspect },
        uAccent: { value: accent },
        uScheme: { value: scheme },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uFocus, uAspect, uScheme;
        uniform vec3 uAccent;
        varying vec2 vUv;
        float roundedBox(vec2 p, vec2 b, float r){
          vec2 q = abs(p) - b + r;
          return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
        }
        void main(){
          vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
          float d = roundedBox(p, vec2(uAspect, 1.0) * 0.5 - 0.01, 0.06);
          if (d > 0.0) discard;
          float a = (0.34 + uFocus * 0.5) * (1.0 - smoothstep(-0.09, 0.0, d) * 0.5);
          vec3 col = uScheme > 0.5
            ? vec3(0.93, 0.92, 0.89) - uAccent * 0.05
            : vec3(0.004, 0.020, 0.028) + uAccent * 0.012;
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    const bezel = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.07, h * 1.09), bezelMat);
    bezel.position.z = -0.09;
    group.add(bezel);

    const card = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 12, 12), cardMat);
    group.add(card);

    const frame = this._frame(w, h, accent);
    group.add(frame);

    const motif = this._motif(crossLink ? 'link' : section.glyph ?? 'ring', w, h, accent);
    group.add(motif);

    // ---- greebles: small tumbling debris orbiting the card
    const greebles = new THREE.Group();
    const gMat = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.26,
      fog: false,
    });
    const nGreeble = crossLink ? 3 : 7;
    for (let i = 0; i < nGreeble; i++) {
      const s = 0.07 + Math.random() * 0.16;
      const b = new THREE.Mesh(new THREE.BoxGeometry(s, s, s * (1 + Math.random() * 3)), gMat);
      const a = (i / nGreeble) * Math.PI * 2;
      const rr = w * 0.62 + Math.random() * 2.2;
      b.position.set(Math.cos(a) * rr, Math.sin(a) * rr * 0.7, (Math.random() - 0.5) * 1.6);
      b.userData.a = a;
      b.userData.rr = rr;
      b.userData.spin = 0.3 + Math.random();
      greebles.add(b);
    }
    group.add(greebles);

    const hit = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 1.15, h * 1.15),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    group.add(hit);

    this.object3D.add(group);

    // If the video turns out to be undecodable after all, quietly swap in the
    // still rather than leaving an empty frame.
    if (video && section.image) {
      video.addEventListener(
        'error',
        () => {
          cardMat.uniforms.uMap.value = still();
          cardMat.uniforms.uIsVideo.value = 0;
        },
        { once: true }
      );
    }

    return {
      section,
      at,
      crossLink,
      video,
      group,
      card,
      cardMat,
      bezel,
      bezelMat,
      frame,
      motif,
      greebles,
      hit,
      focus: 0,
      hover: 0,
      reveal: 0,
      baseScale,
      basePos: group.position.clone(),
      phase: Math.random() * Math.PI * 2,
    };
  }

  _frame(w, h, accent) {
    const hw = w / 2 + 0.35;
    const hh = h / 2 + 0.35;
    const L = Math.min(w, h) * 0.19;
    const pts = [];
    const corner = (sx, sy) => {
      pts.push(sx * hw, sy * hh, 0, sx * (hw - L), sy * hh, 0);
      pts.push(sx * hw, sy * hh, 0, sx * hw, sy * (hh - L), 0);
    };
    corner(1, 1);
    corner(-1, 1);
    corner(1, -1);
    corner(-1, -1);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.55, fog: false })
    );
  }

  _motif(kind, w, h, accent) {
    const g = new THREE.Group();
    const mat = (o = 0.3) =>
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: o,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });

    const R = Math.max(w, h) * 0.78;

    if (kind === 'sonar') {
      for (let i = 0; i < 4; i++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(R * (0.45 + i * 0.22), 0.022, 6, 96),
          mat(0.34 - i * 0.06)
        );
        ring.userData.pulse = i * 0.5;
        g.add(ring);
      }
    } else if (kind === 'grid') {
      const gm = new THREE.LineBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.16,
        fog: false,
      });
      const pts = [];
      const ext = R * 1.15;
      const n = 9;
      for (let i = 0; i <= n; i++) {
        const k = (i / n - 0.5) * 2 * ext;
        pts.push(-ext, k, -0.6, ext, k, -0.6);
        pts.push(k, -ext, -0.6, k, ext, -0.6);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.add(new THREE.LineSegments(geo, gm));
    } else if (kind === 'orbit' || kind === 'run') {
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(R * (0.7 + i * 0.16), 0.03, 6, 96), mat());
        ring.rotation.x = 0.9 + i * 0.35;
        ring.rotation.y = i * 0.7;
        ring.userData.spin = 0.12 + i * 0.07;
        g.add(ring);
      }
    } else if (kind === 'link') {
      // Cross-link: a broken ring, signalling "continues elsewhere".
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(R * 0.8, 0.028, 6, 48, Math.PI * 1.35),
        mat(0.4)
      );
      ring.userData.spin = 0.35;
      g.add(ring);
    } else {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.035, 8, 128), mat());
      ring.userData.spin = 0.1;
      g.add(ring);
      const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.62, 0.018, 6, 96), mat(0.2));
      inner.userData.spin = -0.18;
      g.add(inner);
    }

    g.position.z = -0.9;
    return g;
  }

  // --------------------------------------------------------------- picking
  pick(pointer, camera) {
    this.raycaster.setFromCamera(pointer, camera);
    const hits = this.raycaster.intersectObjects(
      this.items.filter((i) => i.group.visible).map((i) => i.hit),
      false
    );
    if (!hits.length) return null;
    return this.items.find((i) => i.hit === hits[0].object) ?? null;
  }

  /** The station closest to the current position. */
  get active() {
    let best = null;
    let bestD = Infinity;
    for (const it of this.items) {
      const d = Math.abs(it.at - this.realm.t);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  /** Realm left the stage — stop decoding until we're back. */
  onExit() {
    for (const it of this.items) it.video?.pause();
  }

  // ----------------------------------------------------------------- frame
  update(dt, elapsed) {
    const t = this.realm.t;
    const drift = this.realm.reducedMotion ? 0 : 1;
    const k = 1 - Math.exp(-dt * 7);

    for (const it of this.items) {
      const d = Math.abs(it.at - t);

      const focusTarget = 1 - THREE.MathUtils.smoothstep(d, 0.008, 0.042);
      it.focus += (focusTarget - it.focus) * k;

      const hoverTarget = this.hovered === it ? 1 : 0;
      it.hover += (hoverTarget - it.hover) * k;

      const inRange = d < 0.24;
      it.group.visible = inRange;
      // Only decode while the station is on screen.
      if (it.video) {
        if (inRange && it.video.paused) it.video.play().catch(() => {});
        else if (!inRange && !it.video.paused) it.video.pause();
      }
      if (!inRange) continue;

      it.reveal += ((1 - THREE.MathUtils.smoothstep(d, 0.08, 0.18)) - it.reveal) * k * 0.6;

      const u = it.cardMat.uniforms;
      u.uTime.value = elapsed;
      u.uFocus.value = it.focus;
      u.uHover.value = it.hover;
      u.uReveal.value = it.reveal;
      it.bezelMat.uniforms.uFocus.value = it.focus;

      const ph = elapsed * 0.4 + it.phase;
      it.group.position.copy(it.basePos);
      it.group.position.y += Math.sin(ph) * 0.42 * drift;
      it.group.position.x += Math.cos(ph * 0.7) * 0.28 * drift;

      it.group.scale.setScalar(it.baseScale * (1 + it.focus * 0.06 + it.hover * 0.05));
      it.frame.material.opacity = 0.28 + it.focus * 0.42 + it.hover * 0.3;

      for (const child of it.motif.children) {
        if (child.userData.spin) child.rotation.z += child.userData.spin * dt * drift;
        if (child.userData.pulse !== undefined) {
          const p = (elapsed * 0.5 + child.userData.pulse) % 2;
          child.material.opacity = 0.05 + Math.max(0, 1 - p) * 0.32 * (0.4 + it.focus);
          child.scale.setScalar(0.85 + p * 0.18);
        }
      }

      for (const b of it.greebles.children) {
        const a = b.userData.a + elapsed * 0.13 * b.userData.spin * drift;
        b.position.x = Math.cos(a) * b.userData.rr;
        b.position.y = Math.sin(a) * b.userData.rr * 0.7;
        b.rotation.x += dt * b.userData.spin * drift;
        b.rotation.y += dt * 0.7 * b.userData.spin * drift;
      }
      it.greebles.children[0].material.opacity = 0.12 + it.focus * 0.22;
    }
  }
}
