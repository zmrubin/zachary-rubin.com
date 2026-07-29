import * as THREE from 'three';
import { NOISE_GLSL, PALETTE, journeyY, pitchAt, thetaAt } from '../core/theme.js';
import { Rail } from '../core/Rail.js';

const CARD_H = 5.4;

/**
 * Nodes — one holographic beacon per section. Placement is derived entirely from
 * the section's `at` / `radius` / `dy`, so adding a section to content/sections.js
 * is all it takes to get a new node in the right place, aimed at the camera.
 */
export class Nodes {
  constructor(rail, sections, loader) {
    this.rail = rail;
    this.sections = sections;
    this.object3D = new THREE.Group();
    this.items = [];

    for (const s of sections) this.items.push(this._build(s, loader));

    this.raycaster = new THREE.Raycaster();
    this.hovered = null;
  }

  // ------------------------------------------------------------------ build
  _build(section, loader) {
    const group = new THREE.Group();
    const theta = thetaAt(section.at);
    const radius = section.radius ?? 19;
    const camY = journeyY(section.at);

    // Sit on the camera's actual sight line, not just at its altitude: the
    // scripted pitch (looking up through the surface, down at the planet from
    // orbit) would otherwise shove nodes clean out of frame.
    const y = camY + Math.tan(pitchAt(section.at)) * radius + (section.dy ?? 0);

    group.position.set(Math.cos(theta) * radius, y, Math.sin(theta) * radius);

    // Aim the card at where the camera will be when this node is centred.
    const camAt = Rail.cameraPositionAt(section.at);
    group.lookAt(camAt.x, camY, camAt.z);

    const aspect = section.aspect ?? 1.5;
    const w = CARD_H * aspect;
    const h = CARD_H;

    // ---- the card itself
    const texture = section.image ? loader.load(section.image) : null;
    if (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
    }

    const cardMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uMap: { value: texture },
        uHasMap: { value: texture ? 1 : 0 },
        uTime: { value: 0 },
        uFocus: { value: 0 },
        uHover: { value: 0 },
        uAccent: { value: new THREE.Color(PALETTE.accent) },
        uAspect: { value: aspect },
        uReveal: { value: 0 },
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
        uniform float uHasMap, uTime, uFocus, uHover, uAspect, uReveal;
        uniform vec3 uAccent;
        varying vec2 vUv;
        ${NOISE_GLSL}

        // Signed distance to a rounded rectangle, in aspect-corrected space.
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
            vec3 img = texture2D(uMap, uv).rgb;
            float lum = dot(img, vec3(0.2126, 0.7152, 0.0722));
            // Unfocused: a cyan-graded ghost. Focused: the real photograph.
            vec3 ghost = mix(uAccent * lum * 0.85, vec3(lum), 0.35);
            col = mix(ghost, img, smoothstep(0.15, 0.95, uFocus));
            // Push saturation back up as it focuses; the global grade cools
            // shadows, which would otherwise leave every photo cyan.
            float cl = dot(col, vec3(0.2126, 0.7152, 0.0722));
            col = mix(vec3(cl), col, 1.0 + uFocus * 0.35);
            col *= 0.6 + uFocus * 0.6;
            alpha = 0.5 + uFocus * 0.48;
          } else {
            // No-image card: procedural instrument face.
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

          // Horizontal refresh sweep travelling up the card.
          float sweepY = fract(uTime * 0.16);
          float sweep = exp(-pow((uv.y - sweepY) * 26.0, 2.0));
          col += uAccent * sweep * 0.3;

          // Scanlines + a touch of signal noise.
          col *= 1.0 - 0.10 * (sin(uv.y * 300.0 - uTime * 3.0) * 0.5 + 0.5);
          col += (hash21(uv * 220.0 + fract(uTime) * 61.0) - 0.5) * 0.045;

          // Inner edge glow.
          float rim = smoothstep(0.0, -0.022, d) * (1.0 - smoothstep(-0.022, -0.07, d));
          col += uAccent * rim * (0.22 + uHover * 0.5) * (0.5 + uFocus * 0.5);
          alpha = max(alpha, rim * 0.5);

          // Build-in wipe when the node first comes into range.
          alpha *= smoothstep(0.0, 0.55, uReveal + uv.y * 0.45);

          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    // ---- bezel: a dark plate directly behind the card.
    // Without it the photograph competes with bright water and reads as a cyan
    // ghost even at full focus; the plate gives every image its own contrast.
    const bezelMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uFocus: { value: 0 },
        uAspect: { value: aspect },
        uAccent: { value: new THREE.Color(PALETTE.accent) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uFocus, uAspect;
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
          vec3 col = vec3(0.004, 0.020, 0.028) + uAccent * 0.012;
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    const bezel = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.07, h * 1.09), bezelMat);
    bezel.position.z = -0.09;
    group.add(bezel);

    const card = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 12, 12), cardMat);
    group.add(card);

    // ---- corner brackets
    const frame = this._frame(w, h);
    group.add(frame);

    // ---- motif behind the card
    const motif = this._motif(section.glyph ?? 'ring', w, h);
    group.add(motif);

    // ---- greebles: small tumbling blocks that orbit the card
    const greebles = new THREE.Group();
    const gMat = new THREE.MeshBasicMaterial({
      color: PALETTE.accent,
      transparent: true,
      opacity: 0.26,
      fog: false,
    });
    for (let i = 0; i < 7; i++) {
      const s = 0.07 + Math.random() * 0.16;
      const b = new THREE.Mesh(new THREE.BoxGeometry(s, s, s * (1 + Math.random() * 3)), gMat);
      const a = (i / 7) * Math.PI * 2;
      const rr = w * 0.62 + Math.random() * 2.2;
      b.position.set(Math.cos(a) * rr, Math.sin(a) * rr * 0.7, (Math.random() - 0.5) * 1.6);
      b.userData.a = a;
      b.userData.rr = rr;
      b.userData.spin = 0.3 + Math.random();
      greebles.add(b);
    }
    group.add(greebles);

    // ---- invisible, generous hit target
    const hit = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 1.15, h * 1.15),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    group.add(hit);

    this.object3D.add(group);

    return {
      section,
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
      baseQuat: group.quaternion.clone(),
      basePos: group.position.clone(),
      phase: Math.random() * Math.PI * 2,
    };
  }

  /** Four corner brackets, drawn as line segments. */
  _frame(w, h) {
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
    const mat = new THREE.LineBasicMaterial({
      color: PALETTE.accent,
      transparent: true,
      opacity: 0.55,
      fog: false,
    });
    return new THREE.LineSegments(geo, mat);
  }

  /** The decorative motif drawn behind each card. */
  _motif(kind, w, h) {
    const g = new THREE.Group();
    const mat = () =>
      new THREE.MeshBasicMaterial({
        color: PALETTE.accent,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });

    const R = Math.max(w, h) * 0.78;

    if (kind === 'sonar') {
      for (let i = 0; i < 4; i++) {
        const r = R * (0.45 + i * 0.22);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.022, 6, 96), mat());
        ring.material.opacity = 0.34 - i * 0.06;
        ring.userData.pulse = i * 0.5;
        g.add(ring);
      }
    } else if (kind === 'grid') {
      const gm = new THREE.LineBasicMaterial({
        color: PALETTE.accent,
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
    } else if (kind === 'orbit') {
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(R * (0.7 + i * 0.16), 0.03, 6, 96), mat());
        ring.rotation.x = 0.9 + i * 0.35;
        ring.rotation.y = i * 0.7;
        ring.userData.spin = 0.12 + i * 0.07;
        g.add(ring);
      }
    } else {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.035, 8, 128), mat());
      ring.userData.spin = 0.1;
      g.add(ring);
      const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.62, 0.018, 6, 96), mat());
      inner.material.opacity = 0.2;
      inner.userData.spin = -0.18;
      g.add(inner);
    }

    g.position.z = -0.9;
    g.userData.kind = kind;
    return g;
  }

  // --------------------------------------------------------------- picking
  /** Raycast against hit planes; returns the item under the pointer, if any. */
  pick(pointer, camera) {
    this.raycaster.setFromCamera(pointer, camera);
    const hits = this.raycaster.intersectObjects(
      this.items.filter((i) => i.group.visible).map((i) => i.hit),
      false
    );
    if (!hits.length) return null;
    const hit = hits[0].object;
    return this.items.find((i) => i.hit === hit) ?? null;
  }

  /** The item currently closest to centre of the journey. */
  get active() {
    let best = null;
    let bestD = Infinity;
    for (const it of this.items) {
      const d = Math.abs(it.section.at - this.rail.t);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  // ----------------------------------------------------------------- frame
  update(dt, elapsed) {
    const t = this.rail.t;
    const drift = this.rail.world.reducedMotion ? 0 : 1;
    const k = 1 - Math.exp(-dt * 7);

    for (const it of this.items) {
      const d = Math.abs(it.section.at - t);

      // Focus: 1 when centred, falling off over ~0.06 of the journey.
      const focusTarget = 1 - THREE.MathUtils.smoothstep(d, 0.008, 0.042);
      it.focus += (focusTarget - it.focus) * k;

      const hoverTarget = this.hovered === it ? 1 : 0;
      it.hover += (hoverTarget - it.hover) * k;

      // Cull anything well outside the travelling window.
      const inRange = d < 0.16;
      it.group.visible = inRange;
      if (!inRange) continue;

      it.reveal += ((1 - THREE.MathUtils.smoothstep(d, 0.06, 0.14)) - it.reveal) * k * 0.6;

      const u = it.cardMat.uniforms;
      u.uTime.value = elapsed;
      u.uFocus.value = it.focus;
      u.uHover.value = it.hover;
      u.uReveal.value = it.reveal;
      it.bezelMat.uniforms.uFocus.value = it.focus;

      // Idle float + a slight lean toward the viewer on hover.
      const ph = elapsed * 0.4 + it.phase;
      it.group.position.copy(it.basePos);
      it.group.position.y += Math.sin(ph) * 0.42 * drift;
      it.group.position.x += Math.cos(ph * 0.7) * 0.28 * drift;

      const scale = 1 + it.focus * 0.06 + it.hover * 0.05;
      it.group.scale.setScalar(scale);

      it.frame.material.opacity = 0.28 + it.focus * 0.42 + it.hover * 0.3;

      // Motif animation.
      for (const child of it.motif.children) {
        if (child.userData.spin) child.rotation.z += child.userData.spin * dt * drift;
        if (child.userData.pulse !== undefined) {
          const p = (elapsed * 0.5 + child.userData.pulse) % 2;
          child.material.opacity = 0.05 + Math.max(0, 1 - p) * 0.32 * (0.4 + it.focus);
          child.scale.setScalar(0.85 + p * 0.18);
        }
      }

      // Greebles orbit and tumble.
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
