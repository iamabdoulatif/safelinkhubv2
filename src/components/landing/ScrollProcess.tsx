"use client";

/*
 * Section "Comment ça marche" — scène isométrique Three.js pilotée par le
 * scroll (GSAP ScrollTrigger, pin + scrub). Un chemin lumineux moutarde se
 * dessine progressivement à travers la scène et la caméra le suit, tandis
 * que la liste des 4 étapes à gauche se synchronise sur la progression.
 *
 * Contraintes Bitume : aucun dégradé, aucun blur, aucune ombre diffuse.
 * Tous les matériaux sont des aplats MeshBasicMaterial non éclairés — le
 * "glow" du chemin est simulé par un second tube plein en transparence
 * plate (pas de flou), jamais par un post-effet de bloom.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { processSteps } from "./content";
import ScrollProcessStatic from "./ScrollProcessStatic";

gsap.registerPlugin(ScrollTrigger);

// Duplication des tokens de src/app/globals.css : les matériaux Three.js ne
// peuvent pas lire les variables CSS custom properties directement.
const COLOR = {
  clay: 0xf0ede6,
  ink: 0x1c1917,
  inkSoft: 0x57534e,
  lineSoft: 0xd8d2c6,
  brand: 0xeab308,
};

const STEP_COUNT = processSteps.length;
const TUBE_RADIUS = 0.055;
const FRUSTUM_SIZE = 9;
const ISO_OFFSET = new THREE.Vector3(6.4, 6.8, 6.4);

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function mapRange(v: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  const t = clamp((v - inMin) / (inMax - inMin), 0, 1);
  return outMin + t * (outMax - outMin);
}

/** Boîte isométrique à trois aplats (dessus clair, face gauche sombre,
 * face droite intermédiaire) — reprend la palette de IsoRouterScene. */
function createIsoBox(
  width: number,
  height: number,
  depth: number,
  materials: { top: THREE.MeshBasicMaterial; left: THREE.MeshBasicMaterial; right: THREE.MeshBasicMaterial },
) {
  const geo = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geo, [
    materials.right, // +x
    materials.left, // -x (caché)
    materials.top, // +y
    materials.left, // -y (caché)
    materials.left, // +z
    materials.right, // -z (caché)
  ]);
  return mesh;
}

function detectWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

// Lecture hydration-safe de "l'aptitude à animer" via useSyncExternalStore :
// le serveur (et le premier rendu client, avant hydratation) reçoit toujours
// le fallback statique, puis on bascule en scène 3D interactive une fois
// l'environnement confirmé (WebGL dispo + pas de prefers-reduced-motion),
// et on réagit si l'utilisateur change ce réglage système en cours de session.
function subscribeCanAnimate(callback: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
function getCanAnimateSnapshot() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches && detectWebGL();
}
function getCanAnimateServerSnapshot() {
  return false;
}

export default function ScrollProcess() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeStep, setActiveStep] = useState(0);
  const interactive = useSyncExternalStore(
    subscribeCanAnimate,
    getCanAnimateSnapshot,
    getCanAnimateServerSnapshot,
  );

  useEffect(() => {
    if (!interactive) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    const pinTarget = pinRef.current;
    if (!container || !canvas || !wrapper || !pinTarget) return;

    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";

    // ── Scène ────────────────────────────────────────────────────────
    const scene = new THREE.Scene();

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.copy(ISO_OFFSET);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);

    const matTop = new THREE.MeshBasicMaterial({ color: COLOR.clay });
    const matLeft = new THREE.MeshBasicMaterial({ color: COLOR.ink });
    const matRight = new THREE.MeshBasicMaterial({ color: COLOR.inkSoft });

    // Sol : grille de points plats (écho du halo en pointillés de la vidéo
    // de référence, sans le moindre flou).
    {
      const dotGeo = new THREE.CircleGeometry(0.045, 8);
      const dotMat = new THREE.MeshBasicMaterial({
        color: COLOR.lineSoft,
        transparent: true,
        opacity: 0.6,
      });
      const cols = 26;
      const rows = 18;
      const spacing = 0.85;
      const dots = new THREE.InstancedMesh(dotGeo, dotMat, cols * rows);
      dots.rotation.x = -Math.PI / 2;
      const dummy = new THREE.Object3D();
      let i = 0;
      for (let cx = 0; cx < cols; cx++) {
        for (let rz = 0; rz < rows; rz++) {
          dummy.position.set((cx - cols / 2) * spacing, 0, (rz - rows / 2) * spacing);
          dummy.rotation.x = -Math.PI / 2;
          dummy.updateMatrix();
          dots.setMatrixAt(i++, dummy.matrix);
        }
      }
      dots.instanceMatrix.needsUpdate = true;
      scene.add(dots);
    }

    // Bâtiments décoratifs autour du chemin — variété de tailles fixes,
    // composition volontairement dessinée (pas de hasard).
    const buildingSpecs: { pos: [number, number, number]; size: [number, number, number] }[] = [
      { pos: [-6.6, 0, -3.6], size: [0.9, 1.1, 0.9] },
      { pos: [-5.4, 0, -4.4], size: [0.6, 0.7, 0.6] },
      { pos: [-3.4, 0, -2.0], size: [0.8, 1.6, 0.8] },
      { pos: [-1.2, 0, -1.8], size: [1.1, 0.6, 0.7] },
      { pos: [0.4, 0, 0.2], size: [0.6, 0.9, 0.6] },
      { pos: [2.4, 0, 0.1], size: [0.9, 0.5, 1.3] },
      { pos: [3.6, 0, 2.0], size: [0.55, 0.55, 0.55] },
      { pos: [5.6, 0, 3.0], size: [0.7, 0.8, 0.7] },
      { pos: [6.6, 0, 5.4], size: [1.0, 0.6, 1.0] },
    ];
    for (const b of buildingSpecs) {
      const box = createIsoBox(b.size[0], b.size[1], b.size[2], {
        top: matTop,
        left: matLeft,
        right: matRight,
      });
      box.position.set(b.pos[0], b.size[1] / 2, b.pos[2]);
      scene.add(box);
    }

    // ── Chemin lumineux ─────────────────────────────────────────────
    const waypoints = [
      new THREE.Vector3(-7.2, 0.28, -3.2),
      new THREE.Vector3(-3.6, 0.28, -1.4),
      new THREE.Vector3(0.6, 0.28, 0.6),
      new THREE.Vector3(4.2, 0.28, 2.6),
      new THREE.Vector3(7.4, 0.28, 4.8),
    ];
    const fullCurve = new THREE.CatmullRomCurve3(waypoints, false, "centripetal");

    const tubeMat = new THREE.MeshBasicMaterial({ color: COLOR.brand });
    const haloMat = new THREE.MeshBasicMaterial({
      color: COLOR.brand,
      transparent: true,
      opacity: 0.22,
    });
    const tubeMesh = new THREE.Mesh(new THREE.BufferGeometry(), tubeMat);
    const haloMesh = new THREE.Mesh(new THREE.BufferGeometry(), haloMat);
    scene.add(haloMesh, tubeMesh);

    function rebuildPath(t: number) {
      const segCount = Math.max(2, Math.floor(t * 140));
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segCount; i++) {
        pts.push(fullCurve.getPointAt((i / segCount) * t));
      }
      if (pts.length < 2) {
        tubeMesh.visible = false;
        haloMesh.visible = false;
        return;
      }
      tubeMesh.visible = true;
      haloMesh.visible = true;
      const partial = new THREE.CatmullRomCurve3(pts, false, "centripetal");
      tubeMesh.geometry.dispose();
      tubeMesh.geometry = new THREE.TubeGeometry(partial, Math.max(6, segCount), TUBE_RADIUS, 6, false);
      haloMesh.geometry.dispose();
      haloMesh.geometry = new THREE.TubeGeometry(
        partial,
        Math.max(6, segCount),
        TUBE_RADIUS * 2.2,
        6,
        false,
      );
    }

    // Marqueurs d'étape (losanges plats) à la fin de chaque segment.
    const markerGroup = new THREE.Group();
    const markerMats: THREE.MeshBasicMaterial[] = [];
    for (let i = 1; i <= STEP_COUNT; i++) {
      const wp = waypoints[i];
      const geo = new THREE.PlaneGeometry(0.34, 0.34);
      const mat = new THREE.MeshBasicMaterial({ color: COLOR.lineSoft, side: THREE.DoubleSide });
      markerMats.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = Math.PI / 4;
      mesh.position.set(wp.x, 0.03, wp.z);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: COLOR.ink }),
      );
      edges.rotation.copy(mesh.rotation);
      edges.position.copy(mesh.position);
      markerGroup.add(mesh, edges);
    }
    scene.add(markerGroup);

    // Hub final (étape "Suivi en temps réel") : trois blocs qui passent de
    // fantôme (contour seul, faible opacité) à pleinement solides.
    const hubGroup = new THREE.Group();
    const hubWp = waypoints[STEP_COUNT];
    hubGroup.position.set(hubWp.x, 0, hubWp.z);
    const hubSolidMats: THREE.MeshBasicMaterial[] = [];
    const hubSpecs: { pos: [number, number, number]; size: [number, number, number] }[] = [
      { pos: [0, 0, 0], size: [0.9, 1.3, 0.9] },
      { pos: [-0.85, 0, 0.5], size: [0.55, 0.75, 0.55] },
      { pos: [0.8, 0, -0.55], size: [0.55, 0.55, 0.55] },
    ];
    for (const h of hubSpecs) {
      const top = new THREE.MeshBasicMaterial({ color: COLOR.clay, transparent: true, opacity: 0 });
      const left = new THREE.MeshBasicMaterial({ color: COLOR.ink, transparent: true, opacity: 0 });
      const right = new THREE.MeshBasicMaterial({ color: COLOR.inkSoft, transparent: true, opacity: 0 });
      hubSolidMats.push(top, left, right);
      const box = createIsoBox(h.size[0], h.size[1], h.size[2], { top, left, right });
      box.position.set(h.pos[0], h.size[1] / 2, h.pos[2]);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(box.geometry),
        new THREE.LineBasicMaterial({ color: COLOR.ink, transparent: true, opacity: 0.55 }),
      );
      edges.position.copy(box.position);
      hubGroup.add(box, edges);
    }
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.0, 32),
      new THREE.MeshBasicMaterial({ color: COLOR.brand, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    hubGroup.add(ring);
    scene.add(hubGroup);

    // ── Boucle de rendu ──────────────────────────────────────────────
    let currentProgress = 0;
    let targetProgress = 0;
    let lastBuiltProgress = -1;
    let frameId = 0;
    const lookTarget = new THREE.Vector3();
    const desiredCamPos = new THREE.Vector3();
    const clockStart = performance.now();

    function resize() {
      const w = container!.clientWidth;
      const h = container!.clientHeight || window.innerHeight;
      const aspect = w / Math.max(1, h);
      camera.left = (-FRUSTUM_SIZE * aspect) / 2;
      camera.right = (FRUSTUM_SIZE * aspect) / 2;
      camera.top = FRUSTUM_SIZE / 2;
      camera.bottom = -FRUSTUM_SIZE / 2;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h, false);
    }

    function tick() {
      frameId = requestAnimationFrame(tick);
      currentProgress += (targetProgress - currentProgress) * 0.08;

      if (Math.abs(currentProgress - lastBuiltProgress) > 0.0015) {
        rebuildPath(Math.max(0.001, currentProgress));
        lastBuiltProgress = currentProgress;
      }

      const head = fullCurve.getPointAt(Math.max(0.0001, Math.min(1, currentProgress)));
      lookTarget.lerp(head, 0.14);
      desiredCamPos.copy(lookTarget).add(ISO_OFFSET);
      camera.position.lerp(desiredCamPos, 0.14);
      camera.lookAt(lookTarget);

      for (let i = 0; i < markerMats.length; i++) {
        const boundary = (i + 1) / STEP_COUNT;
        const reached = currentProgress >= boundary - 0.01;
        markerMats[i].color.set(reached ? COLOR.brand : COLOR.lineSoft);
      }

      const hubT = mapRange(currentProgress, 0.78, 1, 0, 1);
      for (const m of hubSolidMats) m.opacity = mapRange(hubT, 0, 1, 0.12, 1);
      if (hubT > 0.55) {
        const ringMat = ring.material as THREE.MeshBasicMaterial;
        const elapsed = (performance.now() - clockStart) / 1000;
        const loop = (elapsed % 1.6) / 1.6;
        ring.scale.setScalar(1 + loop * 1.6);
        ringMat.opacity = (1 - loop) * 0.35;
      }

      renderer.render(scene, camera);
    }

    resize();
    tick();

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const trigger = ScrollTrigger.create({
      trigger: wrapper,
      start: "top top",
      end: "bottom bottom",
      pin: pinTarget,
      scrub: 1,
      onUpdate(self) {
        targetProgress = self.progress;
        const idx = clamp(Math.floor(self.progress * STEP_COUNT), 0, STEP_COUNT - 1);
        setActiveStep((prev) => (prev === idx ? prev : idx));
      },
    });

    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();
      trigger.kill();
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
      renderer.dispose();
      scene.traverse((obj) => {
        const withGeo = obj as THREE.Mesh | THREE.LineSegments | THREE.InstancedMesh;
        withGeo.geometry?.dispose();
        const mat = (obj as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
    };
  }, [interactive]);

  if (!interactive) {
    return <ScrollProcessStatic />;
  }

  return (
    <section aria-label="Comment ça marche" className="relative border-b-2 border-line bg-paper">
      <div ref={wrapperRef} className="relative" style={{ height: "400vh" }}>
        <div ref={pinRef} className="relative h-screen w-full overflow-hidden">
          <div ref={containerRef} className="absolute inset-0 h-full w-full">
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10 flex max-h-[52vh] flex-col justify-end gap-4 overflow-y-auto border-t-2 border-line bg-paper px-4 py-6 sm:px-6 lg:inset-x-auto lg:inset-y-0 lg:left-0 lg:h-full lg:max-h-none lg:w-[420px] lg:justify-center lg:overflow-visible lg:border-t-0 lg:border-r-2 lg:py-0">
            <p className="font-mono text-xs font-medium uppercase tracking-widest text-ink-soft">
              Comment ça marche
            </p>
            <ol className="flex flex-col gap-3 lg:gap-5">
              {processSteps.map((step, i) => {
                const active = i === activeStep;
                return (
                  <li key={step.title} className="flex gap-4">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center border-2 border-line font-display text-xs font-extrabold transition-colors ${
                        active ? "bg-brand text-[#1C1917]" : "bg-paper text-ink-soft"
                      }`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div
                      className={`border-l-2 pl-4 transition-colors ${
                        active ? "border-brand" : "border-line-soft"
                      }`}
                    >
                      <h3
                        className={`font-display font-bold transition-all ${
                          active ? "text-lg text-ink sm:text-xl lg:text-2xl" : "text-sm text-ink-soft"
                        }`}
                      >
                        {step.title}
                      </h3>
                      {active && (
                        <p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft animate-fade-in">
                          {step.description}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
