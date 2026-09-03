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
/* The reference turns at 1.5 deg/s — a four-minute revolution, which measures
   as motion and reads as a photograph. At 3.2 the planet is unmistakably alive
   and still too slow to pull the eye off the argument. */
const SELF_ROTATION = THREE.MathUtils.degToRad(3.2);

/* Earth's obliquity. The spin happens about the planet's own axis and the
   axis leans, which is why the poles sit off-vertical and the terminator
   crosses them at an angle instead of running straight down the disc. */
const AXIAL_TILT = THREE.MathUtils.degToRad(23.44);

/* Earth at true proportion against a 6371 km mean radius: the 15 km cloud
   base and the 100 km Karman line. The 0.335% polar flattening is below a
   visible silhouette change at this size, so the mesh stays spherical and
   the geometry budget goes to map detail instead. */
const EARTH_RADIUS = 1.322;
const CLOUD_SCALE = 1 + 15 / 6371;
const ATMOSPHERE_SCALE = 1 + 100 / 6371;
const EARTH_LONGITUDE = THREE.MathUtils.degToRad(-55);

/* One directional frontier sweeps across the sphere, dithered so that each
   pixel belongs to exactly one surface. Without that, displaced crater rims
   punch through the smooth Earth along the seam. */
const TRANSITION_GLSL = /* glsl */ `
  float valoFrontier(float progress, vec3 direction) {
    vec3 sweepDirection = normalize(vec3(-0.44, 0.28, 0.85));
    float field = dot(normalize(direction), sweepDirection);
    field += sin(direction.y * 9.0 + direction.x * 5.0) * 0.10;
    field += sin(direction.z * 13.0 - direction.y * 4.0) * 0.06;
    float frontier = mix(1.34, -1.34, progress);
    return smoothstep(frontier - 0.10, frontier + 0.10, field);
  }

  float valoFrontierDither() {
    return fract(
      sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453
    );
  }
`;

const ATMOSPHERE_VERTEX = /* glsl */ `
  varying vec3 vAirNormal;
  varying vec3 vAirView;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vAirNormal = normalize(normalMatrix * normal);
    vAirView = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uOpacity;
  uniform vec3 uSun;
  varying vec3 vAirNormal;
  varying vec3 vAirView;

  void main() {
    vec3 normal = normalize(vAirNormal);
    vec3 viewDirection = normalize(vAirView);
    vec3 sunDirection = normalize(uSun);

    float viewFacing = abs(dot(normal, viewDirection));
    float horizon = pow(1.0 - clamp(viewFacing, 0.0, 1.0), 3.4);
    float sunlight = smoothstep(-0.28, 0.46, dot(normal, sunDirection));
    float forwardScatter = pow(max(dot(viewDirection, sunDirection), 0.0), 8.0);

    vec3 rayleighBlue = vec3(0.055, 0.30, 0.78);
    vec3 sunlitCyan = vec3(0.20, 0.68, 1.0);
    vec3 color = mix(rayleighBlue, sunlitCyan, sunlight * 0.72);
    color += vec3(0.12, 0.28, 0.46) * forwardScatter * horizon;

    gl_FragColor = vec4(color, horizon * mix(0.035, 0.30, sunlight) * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

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

export function mount(container, motion, onReady) {
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

  /* Two groups, because a tilted axis is not a tilted planet: the outer one
     leans and never spins, the inner one spins and never leans. Collapsing
     them into one would wobble the pole around the sky once a rotation. */
  const axis = new THREE.Group();
  axis.rotation.z = AXIAL_TILT;
  scene.add(axis);

  const group = new THREE.Group();
  axis.add(group);

  /* Where the sun is. Every surface reads the same vector: the lunar
     terminator, the Earth's day and night, the cloud shading and the lit limb
     of the atmosphere. Move it and the whole scene agrees, which is the point
     — a light that only moves the lamp is a light nobody believes. */
  const uSun = { value: new THREE.Vector3(-0.499, 0.643, 0.581) };

  /* One scrub drives every layer; these are the windows it is read through. */
  const uLife = { value: 0 };
  const uSurface = { value: 0 };
  const uCloud = { value: 0 };
  const uAir = { value: 0 };

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
    shader.uniforms.uLife = uLife;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vLunarDirection;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLunarDirection = normalize(mat3(modelMatrix) * position);`
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uLife;
      varying vec3 vLunarDirection;

      ${TRANSITION_GLSL}`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      if (valoFrontier(smoothstep(0.08, 0.68, uLife), vLunarDirection) >
          valoFrontierDither()) discard;
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
  material.customProgramCacheKey = () => 'valo-lunar-v3';

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
    if (onReady) onReady();
  });

  /* ------------------------------------------------------ The living Earth */

  const earthGroup = new THREE.Group();
  earthGroup.rotation.y = EARTH_LONGITUDE;
  earthGroup.visible = false;
  group.add(earthGroup);

  const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 128, 96);

  const earthMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0,
    ior: 1.333,
    specularIntensity: 0.62,
    specularColor: new THREE.Color(0xd8e8f3)
  });
  earthMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uSurface = uSurface;
    shader.uniforms.uSun = uSun;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vEarthViewNormal;
        varying vec3 vEarthDirection;`
      )
      .replace(
        '#include <defaultnormal_vertex>',
        `#include <defaultnormal_vertex>
        vEarthViewNormal = normalize(transformedNormal);
        vEarthDirection = normalize(mat3(modelMatrix) * position);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uSurface;
        uniform vec3 uSun;
        varying vec3 vEarthViewNormal;
        varying vec3 vEarthDirection;

        ${TRANSITION_GLSL}`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        if (uSurface < 0.001) discard;
        if (valoFrontier(uSurface, vEarthDirection) <= valoFrontierDither())
          discard;

        // Ocean and land are separated from the map itself rather than from a
        // second mask, so the two read with different roughness and specular.
        float earthLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        float blueDominance =
          diffuseColor.b - max(diffuseColor.r, diffuseColor.g * 0.82);
        float oceanMask =
          smoothstep(0.015, 0.12, blueDominance + (1.0 - earthLuma) * 0.055);
        diffuseColor.rgb = mix(vec3(earthLuma), diffuseColor.rgb, 0.84);
        diffuseColor.rgb *= mix(0.89, 0.78, oceanMask);`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.88, 0.27, oceanMask);`
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        material.specularF90 = mix(material.specularF90, 0.88, oceanMask);
        material.specularColor = mix(
          material.specularColor * 0.70,
          vec3(0.055, 0.070, 0.085),
          oceanMask
        );`
      )
      .replace(
        'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
        `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
        float daylight = smoothstep(
          -0.18,
          0.42,
          dot(normalize(vEarthViewNormal), normalize(uSun))
        );
        outgoingLight *= mix(0.055, 1.0, daylight);
        outgoingLight += diffuseColor.rgb * (1.0 - daylight) * 0.012;`
      );
  };
  earthMaterial.customProgramCacheKey = () => 'valo-earth-v2';

  const earth = new THREE.Mesh(earthGeometry, earthMaterial);
  earth.renderOrder = 2;
  earthGroup.add(earth);

  /* The cloud composite drives opacity on a lit shell rather than being baked
     into the surface, so it keeps its own drift and its own night side. */
  const cloudMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4f8fa,
    opacity: 0.56,
    roughness: 0.92,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.035
  });
  cloudMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uCloud = uCloud;
    shader.uniforms.uSun = uSun;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vCloudViewNormal;`
      )
      .replace(
        '#include <defaultnormal_vertex>',
        `#include <defaultnormal_vertex>
        vCloudViewNormal = normalize(transformedNormal);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uCloud;
        uniform vec3 uSun;
        varying vec3 vCloudViewNormal;`
      )
      .replace(
        '#include <alphamap_fragment>',
        `#include <alphamap_fragment>
        float cloudDaylight = smoothstep(
          -0.18,
          0.42,
          dot(normalize(vCloudViewNormal), normalize(uSun))
        );
        diffuseColor.a *= mix(0.08, 1.0, cloudDaylight) * uCloud;`
      );
  };
  cloudMaterial.customProgramCacheKey = () => 'valo-cloud-v2';

  const clouds = new THREE.Mesh(earthGeometry, cloudMaterial);
  clouds.scale.setScalar(CLOUD_SCALE);
  clouds.renderOrder = 3;
  earthGroup.add(clouds);

  const airMaterial = new THREE.ShaderMaterial({
    uniforms: { uOpacity: uAir, uSun: uSun },
    vertexShader: ATMOSPHERE_VERTEX,
    fragmentShader: ATMOSPHERE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    toneMapped: true
  });
  const air = new THREE.Mesh(earthGeometry, airMaterial);
  air.scale.setScalar(ATMOSPHERE_SCALE);
  air.renderOrder = 4;
  earthGroup.add(air);

  loader.load('assets/textures/earth-surface.webp', (map) => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    earthMaterial.map = map;
    earthMaterial.needsUpdate = true;
  });

  loader.load('assets/textures/earth-clouds.webp', (map) => {
    map.colorSpace = THREE.NoColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    cloudMaterial.alphaMap = map;
    cloudMaterial.needsUpdate = true;
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

  /* Hoisted: the frame loop must not allocate. */
  const rimNudge = new THREE.Vector3(0, 0, 1.1);

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
    /* The world turns on its own clock, and turns faster while the reader is
       moving through the page. Neither depends on the other: parked, it still
       rotates; scrolling, it hurries. */
    if (!still) {
      selfRotation =
        (selfRotation + delta * SELF_ROTATION * (state.spin || 1)) % (Math.PI * 2);
    }

    /* The sun. Its direction arrives from the page, which knows where the
       glow is drawn on screen; the lights follow it so the terminator on the
       surface always points at the disc the reader can see. */
    if (state.lightDir) {
      uSun.value.set(state.lightDir.x, state.lightDir.y, state.lightDir.z).normalize();
      key.position.copy(uSun.value).multiplyScalar(9);
      /* The rim sits nearer and a little inside the key, so it grazes the
         limb rather than doubling the terminator. */
      rim.position.copy(uSun.value).multiplyScalar(5.4).add(rimNudge);
    }

    /* One scrub, read through three windows. The frontier is complementary:
       whatever the Earth claims, the lunar surface discards. */
    uLife.value = state.growth;
    uSurface.value = THREE.MathUtils.smoothstep(state.growth, 0.08, 0.68);
    uCloud.value = THREE.MathUtils.smoothstep(state.growth, 0.54, 0.88);
    uAir.value = THREE.MathUtils.smoothstep(state.growth, 0.46, 0.92);
    earthGroup.visible =
      uSurface.value > 0.001 || uCloud.value > 0.001 || uAir.value > 0.001;

    if (still) clouds.rotation.y = 0.035;
    else clouds.rotation.y += delta * 0.006;

    /* The pointer nudges the face a little; the spin above does the turning. */
    const targetY = (still ? 0 : state.pointerX * 0.18) + selfRotation;
    group.rotation.y += (targetY - group.rotation.y) * 0.035;
    axis.rotation.x = still ? -0.06 : -0.06 + Math.sin(elapsed * 0.28) * 0.018;
    axis.rotation.z = still ? AXIAL_TILT : AXIAL_TILT + Math.sin(elapsed * 0.19) * 0.012;
    axis.scale.setScalar(state.visualScale);

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
      earthGeometry.dispose();
      if (material.map) material.map.dispose();
      if (earthMaterial.map) earthMaterial.map.dispose();
      if (cloudMaterial.alphaMap) cloudMaterial.alphaMap.dispose();
      material.dispose();
      earthMaterial.dispose();
      cloudMaterial.dispose();
      airMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
  };
}
