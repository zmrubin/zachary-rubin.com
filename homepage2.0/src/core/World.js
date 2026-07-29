import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GradeShader } from '../shaders/GradeShader.js';

/**
 * World — renderer, camera, post chain and the frame loop.
 * Anything with an `update(dt, elapsed)` method can be registered with `add()`.
 */
export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.updatables = [];
    this.clock = new THREE.Clock();

    // Quality tier: keeps big retina displays and low-end GPUs both playable.
    const dpr = window.devicePixelRatio || 1;
    const cores = navigator.hardwareConcurrency || 4;
    this.quality = cores <= 4 || dpr < 1.2 ? 'low' : 'high';
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(dpr, this.quality === 'high' ? 1.75 : 1.25));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x02171f, 0.02);

    this.camera = new THREE.PerspectiveCamera(56, 1, 0.5, 8000);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // Kept deliberately gentle — enough to make emissives glow, not enough to
    // blow the surface band or the particulate into a white haze.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.34, 0.5, 0.9);
    this.composer.addPass(this.bloom);

    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uChroma.value = this.quality === 'high' ? 0.85 : 0.4;
    this.grade.uniforms.uGrain.value = this.reducedMotion ? 0.012 : 0.03;
    this.grade.uniforms.uScanline.value = 0.02;
    this.composer.addPass(this.grade);

    this.composer.addPass(new OutputPass());

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  add(obj) {
    if (obj.object3D) this.scene.add(obj.object3D);
    if (typeof obj.update === 'function') this.updatables.push(obj);
    return obj;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.grade.uniforms.uResolution.value.set(w, h);
  }

  start() {
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 1 / 20);
      const elapsed = this.clock.elapsedTime;
      this.grade.uniforms.uTime.value = elapsed;
      for (const u of this.updatables) u.update(dt, elapsed);
      this.composer.render();
    };
    loop();
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
