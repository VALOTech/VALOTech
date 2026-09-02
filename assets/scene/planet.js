/* VALO Tech — the planet.
 *
 * A cratered lunar sphere that becomes a living Earth as the page is read.
 * This module owns the WebGL context and nothing else: the star field behind
 * it is a 2D canvas and the markers in front of it are DOM. It is imported
 * dynamically, so a machine without WebGL never downloads the graphics
 * library at all.
 *
 * Ported from the v5.gateway React Three Fiber scene. The scene graph, the
 * materials and the lighting are the designer's values; the frame loop is
 * rebuilt against three.js directly because this site carries no framework. */

import * as THREE from './three.module.min.js';

/* ----------------------------------------------------------- Constants */

const PLANET_RADIUS = 1.32;
const SELF_ROTATION = THREE.MathUtils.degToRad(1.5); /* a four-minute turn */

/* Seven impact basins, each a bowl with a raised rim. */
const CRATERS = [
  { dir: new THREE.Vector3(-0.42, 0.46, 0.78).normalize(), radius: 0.34, depth: 0.064 },
  { dir: new THREE.Vector3(0.36, 0.18, 0.92).normalize(), radius: 0.23, depth: 0.047 },
  { dir: new THREE.Vector3(-0.1, -0.34, 0.94).normalize(), radius: 0.17, depth: 0.035 },
  { dir: new THREE.Vector3(0.72, 0.48, 0.5).normalize(), radius: 0.26, depth: 0.052 },
  { dir: new THREE.Vector3(-0.74, -0.18, 0.65).normalize(), radius: 0.19, depth: 0.039 },
  { dir: new THREE.Vector3(0.22, -0.76, 0.61).normalize(), radius: 0.28, depth: 0.054 },
  { dir: new THREE.Vector3(-0.56, 0.77, 0.28).normalize(), radius: 0.15, depth: 0.031 }
];

/* -------------------------------------------------------- Displacement */

function hash3(x, y, z) {
  let n = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 1274126177;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

function smoothNoise(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const lerp = (a, b, t) => a + (b - a) * t;
  const x00 = lerp(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), sx);
  const x10 = lerp(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), sx);
  const x01 = lerp(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), sx);
  const x11 = lerp(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), sx);
  return lerp(lerp(x00, x10, sy), lerp(x01, x11, sy), sz);
}

function surfacePoint(dir, target) {
  const broad = smoothNoise(dir.x * 2.2 + 5, dir.y * 2.2 + 9, dir.z * 2.2 + 13);
  const detail = smoothNoise(dir.x * 7.5 + 17, dir.y * 7.5 + 3, dir.z * 7.5 + 23);
  const grain = smoothNoise(dir.x * 23 + 29, dir.y * 23 + 37, dir.z * 23 + 11);

  let craters = 0;
  for (const crater of CRATERS) {
    const d = dir.distanceTo(crater.dir) / crater.radius;
    if (d > 1.18) continue;
    const bowl = -crater.depth * Math.pow(Math.max(0, 1 - d * d), 1.35);
    const rim = crater.depth * 0.34 * Math.exp(-Math.pow((d - 0.94) / 0.085, 2));
    craters += bowl + rim;
  }

  const displacement =
    (broad - 0.5) * 0.018 +
    (detail - 0.5) * 0.009 +
    (grain - 0.5) * 0.003 +
    craters;

  target.copy(dir).multiplyScalar(PLANET_RADIUS + displacement);
  /* A slight ellipticity, so the silhouette is not a drawn circle. */
  target.x *= 1.008;
  target.y *= 0.996;
  return target;
}

function buildPlanetGeometry() {
  const geometry = new THREE.SphereGeometry(PLANET_RADIUS, 160, 120);
  const position = geometry.attributes.position;
  const point = new THREE.Vector3();
  const dir = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    dir.copy(point).normalize();
    surfacePoint(dir, point);
    position.setXYZ(i, point.x, point.y, point.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/* ---------------------------------------------------------------- Mount */

export function mount(container, motion) {
  const state =
    motion ||
    { scroll: 0, growth: 0, pointerX: 0, reducedMotion: false, visualScale: 1 };

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.34;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 0, 5.25);

  /* One key at high intensity against an almost absent ambient is what gives
     the regolith its crushed blacks and a single silver terminator. */
  scene.add(new THREE.AmbientLight(0xffffff, 0.065));

  const key = new THREE.DirectionalLight(0xeef3f6, 6.8);
  key.position.set(-4.5, 5.8, 5.2);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xaebbc2, 0.72);
  fill.position.set(4.2, -2.4, 2.2);
  scene.add(fill);

  const rim = new THREE.PointLight(0xf8fbfa, 1.8, 11, 2);
  rim.position.set(-3.4, 2.7, 4.6);
  scene.add(rim);

  const group = new THREE.Group();
  scene.add(group);

  const geometry = buildPlanetGeometry();
  const material = new THREE.MeshStandardMaterial({
    color: 0xaeb4b8,
    roughness: 0.96,
    metalness: 0,
    bumpScale: 0.11,
    displacementScale: 0.016,
    displacementBias: -0.008
  });
  /* The grading that makes the regolith read as dead rock. It runs on the
     linear diffuse value, where every sample sits far below the 0.28 pivot,
     so the curve crushes the blacks rather than merely adding contrast —
     that crush is the whole character of the surface. */
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      diffuseColor.rgb = clamp(
        (diffuseColor.rgb - vec3(0.28)) * 1.15 + vec3(0.28),
        0.0,
        1.0
      );
      float lunarLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      float lunarCavity = 1.0 - smoothstep(0.10, 0.19, lunarLuma);
      diffuseColor.rgb *= 1.0 - lunarCavity * 0.12;
      float lunarPeak = smoothstep(0.49, 0.60, lunarLuma);
      diffuseColor.rgb = min(
        diffuseColor.rgb * (1.0 + lunarPeak * 0.16),
        vec3(1.0)
      );`
    );
  };
  material.customProgramCacheKey = () => 'valo-lunar-v1';

  const lunar = new THREE.Mesh(geometry, material);
  group.add(lunar);

  /* The one map does three jobs — colour, bump and a second displacement on
     top of the crater field already baked into the vertices. */
  const loader = new THREE.TextureLoader();
  loader.load('assets/textures/lunar-regolith.webp', (map) => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1.5, 1);
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    material.map = map;
    material.bumpMap = map;
    material.displacementMap = map;
    material.needsUpdate = true;
    container.classList.add('is-ready');
  });

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  let selfRotation = 0;
  let elapsed = 0;
  let last = performance.now();
  let raf = 0;
  let stopped = false;

  function frame(now) {
    if (stopped) return;
    const delta = Math.min((now - last) / 1000, 0.1);
    last = now;
    elapsed += delta;

    const still = state.reducedMotion;
    if (!still) selfRotation = (selfRotation + delta * SELF_ROTATION) % (Math.PI * 2);

    /* Scroll turns the planet as well as advancing the story, so the face the
       reader sees at the close is not the one they arrived on. */
    const targetY = state.scroll * 0.46 + (still ? 0 : state.pointerX * 0.18) + selfRotation;
    group.rotation.y += (targetY - group.rotation.y) * 0.035;
    group.rotation.x = still ? -0.06 : -0.06 + Math.sin(elapsed * 0.28) * 0.018;
    group.rotation.z = still ? 0 : Math.sin(elapsed * 0.19) * 0.012;
    group.scale.setScalar(state.visualScale);

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      stopped = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      geometry.dispose();
      if (material.map) material.map.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
  };
}
