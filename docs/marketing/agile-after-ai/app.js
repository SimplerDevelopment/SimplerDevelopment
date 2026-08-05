/* ============================================================
   If Agile Were Invented After AI — scene layer
   SimplerDevelopment, 2026

   PURE ENHANCEMENT. The article, figures, ladder and effort bars all work
   without this file (see the inline base layer in index.html). If any of it
   fails, nothing is lost but the 3D.

     · HTML renders first. This script is deferred.
     · Heavy deps load only when a scene approaches view.
     · Lenis owns scroll, GSAP reads it, three.js renders. One clock.
     · The camera is blended across scenes, never cut.
     · The loop stops when nothing is on screen or the tab is hidden.
     · prefers-reduced-motion opts out entirely; nothing is fetched.
   ============================================================ */

const WIRE = 0x00b3a6; // SD teal — machine execution
const WARN = 0xf6ad55; // amber — human decision, always
const DIM  = 0x1e2d3d;

const CDN = 'https://esm.sh';
const V = { three: '0.185.1', gsap: '3.13.0', lenis: '1.1.18' };
const dep = (spec) => import(/* webpackIgnore: true */ `${CDN}/${spec}`);

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t) => t * t * (3 - 2 * t);

/* Points shader: round sprites, distance attenuation, depth fade.
   Cheap enough to run everywhere, and it keeps the blueprint look
   consistent instead of relying on default square PointsMaterial dots. */
const POINT_VERT = `
  attribute float aScale;
  varying float vDepth;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = clamp(1.0 - (-mv.z - 8.0) / 46.0, 0.0, 1.0);
    gl_PointSize = aScale * (260.0 / max(-mv.z, 0.001));
    gl_Position = projectionMatrix * mv;
  }`;

const POINT_FRAG = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vDepth;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = dot(d, d);
    if (r > 0.25) discard;
    float edge = smoothstep(0.25, 0.02, r);
    gl_FragColor = vec4(uColor, edge * uOpacity * (0.25 + 0.75 * vDepth));
  }`;

class Stage {
  constructor(host, THREE) {
    this.host = host;
    this.T = THREE;
    this.running = false;
    this.scenes = {};
    this.weights = {};   // scene name -> 0..1 how centred it is
    this.progress = {};  // scene name -> 0..1 scroll through it
    this.frame = this.frame.bind(this); // gsap.ticker.add(fn, once) — 2nd arg is NOT `this`
  }

  points(count, color, scale = 1) {
    const T = this.T;
    const pos = new Float32Array(count * 3);
    const sc = new Float32Array(count);
    for (let i = 0; i < count; i++) sc[i] = scale * (0.6 + Math.random() * 0.8);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('aScale', new T.BufferAttribute(sc, 1));
    const mat = new T.ShaderMaterial({
      uniforms: { uColor: { value: new T.Color(color) }, uOpacity: { value: 1 } },
      vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    });
    return new T.Points(geo, mat);
  }

  build() {
    const T = this.T;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(48, 1, 0.1, 220);

    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.host.appendChild(this.renderer.domElement);

    // Persistent context field: always faintly there, so acts never cut to black.
    this.field = this.points(700, WIRE, 0.5);
    const fp = this.field.geometry.attributes.position.array;
    this.fieldSeed = [];
    for (let i = 0; i < 700; i++) {
      const s = { x: (Math.random() - .5) * 90, y: (Math.random() - .5) * 60, z: (Math.random() - .5) * 60, p: Math.random() * 6.28 };
      this.fieldSeed.push(s);
      fp[i * 3] = s.x; fp[i * 3 + 1] = s.y; fp[i * 3 + 2] = s.z;
    }
    this.field.geometry.attributes.position.needsUpdate = true;
    this.field.material.uniforms.uOpacity.value = 0.18;
    this.scene.add(this.field);

    for (const [name, def] of Object.entries(this.defs())) {
      const g = def.build.call(this);
      g.visible = false;
      this.scene.add(g);
      this.scenes[name] = { group: g, def, mats: [] };
      g.traverse((o) => { if (o.material) this.scenes[name].mats.push(o.material); });
      this.scenes[name].mats.forEach((m) => { m.userData.base = m.opacity ?? (m.uniforms?.uOpacity?.value ?? 1); });
      this.weights[name] = 0;
      this.progress[name] = 0;
    }

    this.resize();
    addEventListener('resize', () => this.resize(), { passive: true });
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
  }

  /* ---------------- scene definitions ----------------
     Each returns { build, update(p), cam(p) -> [x,y,z, lookY] } */
  defs() {
    const T = this.T;
    return {
      /* 1. The question forming out of noise. */
      question: {
        dim: 0.55,
        build() {
          const g = new T.Group();
          const geo = new T.IcosahedronGeometry(7, 1);
          this.qWire = new T.LineSegments(
            new T.WireframeGeometry(geo),
            new T.LineBasicMaterial({ color: WIRE, transparent: true, opacity: 0.28 })
          );
          g.add(this.qWire);
          this.qPts = this.points(900, WIRE, 0.9);
          this.qTarget = geo.attributes.position.array;
          const p = this.qPts.geometry.attributes.position.array;
          this.qSeed = [];
          for (let i = 0; i < 900; i++) {
            const s = { x: (Math.random() - .5) * 60, y: (Math.random() - .5) * 45, z: (Math.random() - .5) * 45 };
            this.qSeed.push(s);
            p[i * 3] = s.x; p[i * 3 + 1] = s.y; p[i * 3 + 2] = s.z;
          }
          g.add(this.qPts);
          return g;
        },
        update(p) {
          const t = ease(clamp01(p * 1.35));
          const arr = this.qPts.geometry.attributes.position.array;
          const tgt = this.qTarget, n = tgt.length / 3;
          for (let i = 0; i < this.qSeed.length; i++) {
            const s = this.qSeed[i], j = (i % n) * 3;
            arr[i * 3]     = lerp(s.x, tgt[j], t);
            arr[i * 3 + 1] = lerp(s.y, tgt[j + 1], t);
            arr[i * 3 + 2] = lerp(s.z, tgt[j + 2], t);
          }
          this.qPts.geometry.attributes.position.needsUpdate = true;
          this.qWire.material.opacity = 0.05 + t * 0.3;
          this.scenes.question.group.rotation.y = p * 0.6;
        },
        cam: (p) => [0, 0, 30 - p * 6, 0],
      },

      /* 2. Two streams from one origin. The contradiction. */
      diverge: {
        build() {
          const g = new T.Group();
          const mk = (dir, color) => {
            const pts = this.points(1500, color, 1);
            const seed = [];
            for (let i = 0; i < 1500; i++) seed.push({ t: Math.random(), y: (Math.random() - .5) * 2, z: (Math.random() - .5) * 2 });
            pts.userData = { seed, dir };
            g.add(pts);
            return pts;
          };
          this.fast = mk(1, WIRE);   // −55.8%
          this.slow = mk(-1, WARN);  // +19%
          return g;
        },
        update(p) {
          [this.fast, this.slow].forEach((pts) => {
            const { seed, dir } = pts.userData;
            const a = pts.geometry.attributes.position.array;
            for (let i = 0; i < seed.length; i++) {
              const s = seed[i];
              a[i * 3]     = (s.t - .5) * 36 * (.35 + p * .65);
              a[i * 3 + 1] = s.y * 1.6 + dir * (p * 9) * s.t + dir * p * 1.5;
              a[i * 3 + 2] = s.z * 2.2;
            }
            pts.geometry.attributes.position.needsUpdate = true;
          });
        },
        cam: (p) => [0, 0, 26 - p * 4, 0],
      },

      /* 3. Scattered work assembling into a structured contract. */
      contract: {
        dim: 0.5,
        build() {
          const g = new T.Group();
          this.cells = [];
          const mat = () => new T.LineBasicMaterial({ color: WIRE, transparent: true, opacity: 0.4 });
          for (let i = 0; i < 40; i++) {
            const c = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1.5, 1.5, 1.5)), mat());
            const col = i % 8, row = Math.floor(i / 8);
            c.userData = {
              from: { x: (Math.random() - .5) * 55, y: (Math.random() - .5) * 40, z: (Math.random() - .5) * 40,
                      rx: Math.random() * 3, ry: Math.random() * 3 },
              to:   { x: (col - 3.5) * 2.6, y: (row - 2) * 2.6, z: 0, rx: 0, ry: 0 },
            };
            g.add(c); this.cells.push(c);
          }
          return g;
        },
        update(p) {
          this.cells.forEach((c, i) => {
            const t = ease(clamp01(p * 1.6 - (i / this.cells.length) * 0.5));
            const f = c.userData.from, o = c.userData.to;
            c.position.set(lerp(f.x, o.x, t), lerp(f.y, o.y, t), lerp(f.z, o.z, t));
            c.rotation.set(lerp(f.rx, o.rx, t), lerp(f.ry, o.ry, t), 0);
            c.material.opacity = 0.12 + t * 0.45;
          });
        },
        cam: (p) => [0, 0, 34 - p * 8, 0],
      },

      /* 4. The autonomy ladder. Camera climbs it. */
      ladder: {
        build() {
          const g = new T.Group();
          this.rungs = [];
          for (let i = 0; i < 6; i++) {
            const stop = i === 5;
            const r = new T.LineSegments(
              new T.EdgesGeometry(new T.BoxGeometry(11 - i * .55, .5, 4.6)),
              new T.LineBasicMaterial({ color: stop ? WARN : WIRE, transparent: true, opacity: stop ? .9 : .55 })
            );
            // top rung sits back: there is deliberately no step up to it
            r.position.set(0, i * 2.5 - 6, stop ? -2.2 : 0);
            r.userData.base = r.position.y;
            g.add(r); this.rungs.push(r);
          }
          return g;
        },
        update(p) {
          this.rungs.forEach((r, i) => {
            const lit = clamp01(p * 6 - i), stop = i === 5;
            r.material.opacity = (stop ? .35 : .18) + lit * (stop ? .6 : .62);
            r.rotation.y = (1 - lit) * .32;
            r.position.y = r.userData.base + (1 - lit) * 1.1;
          });
        },
        cam: (p) => [0, -7 + p * 15, 20, -7 + p * 15 - 1.5],
      },

      /* 5. A forecast is a distribution, not a date. P50 and P85. */
      forecast: {
        dim: 0.6,
        build() {
          const g = new T.Group();
          const N = 90, pts = [];
          for (let i = 0; i < N; i++) {
            const x = (i / (N - 1)) * 24 - 12;
            const y = Math.exp(-Math.pow((x + 3) / 4.2, 2)) * 7; // right-skewed-ish lead time
            pts.push(new T.Vector3(x, y - 3, 0));
          }
          this.curve = new T.Line(
            new T.BufferGeometry().setFromPoints(pts),
            new T.LineBasicMaterial({ color: WIRE, transparent: true, opacity: .75 })
          );
          g.add(this.curve);
          // vertical markers: P50 (teal) and P85 (amber) — the gap is the reserve
          const mk = (x, color) => {
            const m = new T.Line(
              new T.BufferGeometry().setFromPoints([new T.Vector3(x, -3.4, 0), new T.Vector3(x, 5, 0)]),
              new T.LineBasicMaterial({ color, transparent: true, opacity: .8 })
            );
            g.add(m); return m;
          };
          this.p50 = mk(-3, WIRE);
          this.p85 = mk(4.6, WARN);
          this.fill = this.points(700, WARN, .7);
          const a = this.fill.geometry.attributes.position.array;
          this.fillSeed = [];
          for (let i = 0; i < 700; i++) {
            const s = { x: -3 + Math.random() * 7.6, h: Math.random() };
            this.fillSeed.push(s);
            a[i * 3] = s.x; a[i * 3 + 1] = -3; a[i * 3 + 2] = 0;
          }
          g.add(this.fill);
          return g;
        },
        update(p) {
          const t = ease(clamp01(p * 1.5));
          this.p85.scale.y = t;
          this.p50.material.opacity = .3 + t * .5;
          const a = this.fill.geometry.attributes.position.array;
          for (let i = 0; i < this.fillSeed.length; i++) {
            const s = this.fillSeed[i];
            const top = Math.exp(-Math.pow((s.x + 3) / 4.2, 2)) * 7 - 3;
            a[i * 3 + 1] = lerp(-3, -3 + (top + 3) * s.h, t);
          }
          this.fill.geometry.attributes.position.needsUpdate = true;
          this.fill.material.uniforms.uOpacity.value = t * .9;
        },
        cam: (p) => [0, 0, 30 - p * 4, 0],
      },

      /* 6. The effort disc breaking apart. Typing is the small slice. */
      effort: {
        build() {
          const g = new T.Group();
          this.shards = [];
          const slices = [{ pct: 24 }, { pct: 23 }, { pct: 19 }, { pct: 14 }, { pct: 10, hero: true }, { pct: 10 }];
          let a0 = 0;
          slices.forEach((s) => {
            const sweep = (s.pct / 100) * Math.PI * 2;
            const m = new T.Mesh(
              new T.RingGeometry(3.4, 7.4, 48, 1, a0, sweep - .014),
              new T.MeshBasicMaterial({ color: s.hero ? WARN : WIRE, transparent: true,
                                        opacity: s.hero ? .5 : .16, wireframe: !s.hero })
            );
            const mid = a0 + sweep / 2;
            m.userData = { dir: [Math.cos(mid), Math.sin(mid)], hero: !!s.hero };
            g.add(m); this.shards.push(m);
            a0 += sweep;
          });
          g.add(new T.Mesh(new T.RingGeometry(7.9, 7.94, 96),
                new T.MeshBasicMaterial({ color: DIM, transparent: true, opacity: .7 })));
          return g;
        },
        update(p) {
          this.scenes.effort.group.rotation.z = -p * .55;
          const burst = Math.max(0, p - .45) / .55; // hold, then scatter
          this.shards.forEach((m, i) => {
            const { dir, hero } = m.userData;
            const push = hero ? burst * .6 : burst * (2.6 + (i % 3) * 1.4);
            m.position.set(dir[0] * push, dir[1] * push, 0);
            m.material.opacity = hero ? .5 + burst * .42 : Math.max(.03, .16 * (1 - burst * .8));
          });
        },
        cam: (p) => [0, 0, 24 - p * 2, 0],
      },

      /* 7. Every improvement paired against its counter-metric. */
      counter: {
        dim: 0.55,
        build() {
          const g = new T.Group();
          this.pairs = [];
          for (let i = 0; i < 5; i++) {
            const y = (i - 2) * 3.2;
            const up = new T.Line(
              new T.BufferGeometry().setFromPoints([new T.Vector3(0, y, 0), new T.Vector3(9, y, 0)]),
              new T.LineBasicMaterial({ color: WIRE, transparent: true, opacity: .6 }));
            const dn = new T.Line(
              new T.BufferGeometry().setFromPoints([new T.Vector3(0, y, 0), new T.Vector3(-9, y, 0)]),
              new T.LineBasicMaterial({ color: WARN, transparent: true, opacity: .6 }));
            g.add(up); g.add(dn);
            this.pairs.push([up, dn]);
          }
          return g;
        },
        update(p) {
          this.pairs.forEach(([up, dn], i) => {
            const t = ease(clamp01(p * 1.8 - i * .12));
            up.scale.x = t; dn.scale.x = t;
            up.material.opacity = t * .7; dn.material.opacity = t * .7;
          });
        },
        cam: (p) => [0, 0, 32 - p * 5, 0],
      },

      /* 8. Four things that stay human. */
      pillars: {
        dim: 0.6,
        build() {
          const g = new T.Group();
          this.pillars = [];
          for (let i = 0; i < 4; i++) {
            const c = new T.LineSegments(
              new T.EdgesGeometry(new T.BoxGeometry(2.2, 14, 2.2)),
              new T.LineBasicMaterial({ color: WARN, transparent: true, opacity: .5 }));
            c.position.set((i - 1.5) * 5.4, 0, 0);
            g.add(c); this.pillars.push(c);
          }
          return g;
        },
        update(p) {
          this.pillars.forEach((c, i) => {
            const t = ease(clamp01(p * 2 - i * .18));
            c.scale.y = 0.04 + t * 0.96;
            c.material.opacity = .12 + t * .5;
          });
        },
        cam: (p) => [0, 0, 34 - p * 6, 0],
      },
    };
  }

  /* Blend camera + opacity across every scene by how centred it is.
     No hard cuts: two scenes can be partially present at once. */
  frame() {
    let total = 0, cx = 0, cy = 0, cz = 0, ly = 0, any = false;

    for (const [name, s] of Object.entries(this.scenes)) {
      const w = this.weights[name];
      s.group.visible = w > 0.001;
      if (!s.group.visible) continue;
      any = true;
      const p = this.progress[name];
      s.def.update.call(this, p);
      const dim = s.def.dim ?? 1;   // text-heavy acts keep geometry quieter
      s.mats.forEach((m) => {
        const base = m.userData.base;
        if (m.uniforms?.uOpacity) m.uniforms.uOpacity.value = base * w * dim;
        else m.opacity = base * w * dim;
      });
      const [x, y, z, l] = s.def.cam(p);
      cx += x * w; cy += y * w; cz += z * w; ly += l * w; total += w;
    }

    if (!any) return;
    if (total > 0) {
      this.camera.position.set(cx / total, cy / total, cz / total);
      this.camera.lookAt(0, ly / total, 0);
    }

    // persistent field drifts slowly, tied to the same blended camera
    const t = performance.now() * 0.00006;
    const fp = this.field.geometry.attributes.position.array;
    for (let i = 0; i < this.fieldSeed.length; i++) {
      const s = this.fieldSeed[i];
      fp[i * 3 + 1] = s.y + Math.sin(t + s.p) * 1.4;
    }
    this.field.geometry.attributes.position.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }

  start(gsap) { if (!this.running) { this.running = true; gsap.ticker.add(this.frame); } }
  stop(gsap)  { if (this.running) { this.running = false; gsap.ticker.remove(this.frame); } }
}

/* ------------------------------------------------------------ */

async function boot() {
  if (window.__sdReduced) return;              // static reading path, nothing fetched
  const host = document.getElementById('stage');
  const sections = [...document.querySelectorAll('[data-scene]')];
  if (!host || !sections.length) return;

  let started = false;
  const io = new IntersectionObserver(async (entries) => {
    if (started || !entries.some((e) => e.isIntersecting)) return;
    started = true;
    io.disconnect();

    let THREE, gsap, ScrollTrigger, Lenis;
    try {
      [THREE, { default: gsap }, { ScrollTrigger }, { default: Lenis }] = await Promise.all([
        dep(`three@${V.three}`), dep(`gsap@${V.gsap}`),
        dep(`gsap@${V.gsap}/ScrollTrigger`), dep(`lenis@${V.lenis}`),
      ]);
    } catch (err) {
      console.warn('[stage] scene libraries unavailable, article continues without 3D.', err);
      host.remove();
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    const lenis = new Lenis({ duration: 1.05, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);

    let stage;
    try {
      stage = new Stage(host, THREE);
      stage.build();
    } catch (err) {
      console.warn('[stage] WebGL unavailable, continuing without it.', err);
      host.remove();
      return;
    }
    host.classList.add('lit');
    stage.start(gsap);

    const live = new Set();
    sections.forEach((sec) => {
      const name = sec.dataset.scene;
      if (!stage.scenes[name]) return;
      // progress through the section
      ScrollTrigger.create({
        trigger: sec, start: 'top 80%', end: 'bottom 20%',
        onUpdate: (self) => { stage.progress[name] = self.progress; },
      });
      // weight: how close this section is to the middle of the viewport
      ScrollTrigger.create({
        trigger: sec, start: 'top bottom', end: 'bottom top',
        onUpdate: (self) => {
          const d = Math.abs(self.progress - 0.5) * 2;     // 0 centred, 1 at edges
          stage.weights[name] = clamp01(1 - Math.pow(d, 1.6));
        },
        onToggle: (self) => {
          self.isActive ? live.add(name) : (live.delete(name), stage.weights[name] = 0);
          live.size ? stage.start(gsap) : stage.stop(gsap);
        },
      });
    });
    ScrollTrigger.refresh();

    document.addEventListener('visibilitychange', () => {
      document.hidden ? stage.stop(gsap) : (live.size && stage.start(gsap));
    });
  }, { rootMargin: '40% 0px 40% 0px' });

  sections.forEach((s) => io.observe(s));
}

boot();
