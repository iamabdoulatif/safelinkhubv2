"use client";

import Image from "next/image";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import * as THREE from "three";

type ParticleField = {
  compression: number;
  depth: number;
  geometry: THREE.BufferGeometry;
  phase: Float32Array;
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  positions: Float32Array;
  radius: number;
  speed: Float32Array;
};

function createRadialTexture(stops: Array<[number, string]>) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Texture();

  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function OrbitMetric({
  label,
  value,
  sub,
  countTo,
  className,
}: {
  label: string;
  value?: string;
  sub: string;
  countTo?: number;
  className: string;
}) {
  return (
    <div className={`hero-orbit-orbiter ${className}`}>
      <div className="hero-orbit-metric">
        <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">{label}</dt>
        {value ? (
          <dd
            className={`mt-1 font-mono text-xl font-bold tabular-nums text-ink${countTo ? " countup" : ""}`}
            {...(countTo ? { "data-countup": String(countTo) } : {})}
          >
            {value}
          </dd>
        ) : null}
        <p className="mt-1 text-xs leading-5 text-ink-soft">{sub}</p>
      </div>
    </div>
  );
}

export function MikrotikOrbitScene({
  mobileMoneyLabel,
  mobileMoneySub,
  mobileMoneyValue,
  routerAlt,
  routerLabel,
  routerCountTo,
  routerSub,
  routerValue,
  sessionLabel,
  sessionCountTo,
  sessionSub,
  sessionValue,
  trialLabel,
  trialSub,
  trialValue,
}: {
  mobileMoneyLabel: string;
  mobileMoneySub: string;
  mobileMoneyValue: string;
  routerAlt: string;
  routerLabel: string;
  routerCountTo?: number;
  routerSub: string;
  routerValue?: string;
  sessionLabel: string;
  sessionCountTo?: number;
  sessionSub: string;
  sessionValue?: string;
  trialLabel: string;
  trialSub: string;
  trialValue: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef(new THREE.Vector2());
  const [reducedMotion, setReducedMotion] = useState(false);
  const [orbitAllowed, setOrbitAllowed] = useState(false);
  const [webglReady, setWebglReady] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  /* L'orbite 3D est une parure de DESKTOP — le hero mobile est prévu pour la
     PHOTO dans le flux, avec les quatre faits en dessous (voir Hero.tsx).
     Le rendu WebGL démarrait pourtant sur téléphone : il remplissait toute la
     boîte de la scène, masquait la photo (`--webgl-ready` la met à opacity 0)
     et les cartes de faits se posaient par-dessus un routeur géant et rogné.
     On ne démarre donc rien sous 1024 px — ce qui épargne aussi une boucle
     d'animation permanente sur batterie. */
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setOrbitAllowed(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = sceneRef.current;
    if (!canvas || !host || !orbitAllowed) return;

    setWebglReady(false);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 30);
    camera.position.set(0, 0, 10);

    const glowTexture = createRadialTexture([
      [0, "rgba(191, 242, 255, 0.76)"],
      [0.2, "rgba(53, 211, 241, 0.32)"],
      [0.55, "rgba(15, 137, 202, 0.1)"],
      [1, "rgba(15, 137, 202, 0)"],
    ]);
    const dotTexture = createRadialTexture([
      [0, "rgba(255, 255, 255, 1)"],
      [0.2, "rgba(146, 239, 255, 1)"],
      [0.6, "rgba(25, 190, 229, 0.32)"],
      [1, "rgba(25, 190, 229, 0)"],
    ]);

    const haloMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Sprite(haloMaterial);
    halo.scale.set(7.6, 5.5, 1);
    halo.position.set(0, -0.05, -1.2);
    halo.renderOrder = 0;
    scene.add(halo);

    const backRingGeometry = new THREE.TorusGeometry(3.05, 0.018, 8, 160);
    const backRingMaterial = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const backRing = new THREE.Mesh(backRingGeometry, backRingMaterial);
    backRing.scale.set(1, 0.52, 1);
    backRing.rotation.set(0.08, 0.06, -0.22);
    backRing.position.z = -0.46;
    backRing.renderOrder = 1;
    scene.add(backRing);

    const frontRingGeometry = new THREE.TorusGeometry(2.55, 0.024, 8, 128, Math.PI * 0.86);
    const frontRingMaterial = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const frontRing = new THREE.Mesh(frontRingGeometry, frontRingMaterial);
    frontRing.scale.set(1, 0.56, 1);
    frontRing.rotation.set(-0.1, -0.08, 0.42);
    frontRing.position.set(0, 0.02, 0.48);
    frontRing.renderOrder = 5;
    scene.add(frontRing);

    const routerGroup = new THREE.Group();
    routerGroup.renderOrder = 3;
    scene.add(routerGroup);

    let sceneActive = true;
    const routerTexture = new THREE.TextureLoader().load(
      "/mikrotik/chato.webp",
      () => {
        if (!sceneActive) return;
        routerTexture.colorSpace = THREE.SRGBColorSpace;
        routerMaterial.needsUpdate = true;
        setWebglReady(true);
        renderFrame(performance.now());
      },
      undefined,
      () => setWebglReady(false),
    );
    const routerGeometry = new THREE.PlaneGeometry(5.45, 5.45);
    const routerMaterial = new THREE.MeshBasicMaterial({
      map: routerTexture,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
    });
    const router = new THREE.Mesh(routerGeometry, routerMaterial);
    router.renderOrder = 3;
    routerGroup.add(router);

    const makeParticleField = (
      count: number,
      radius: number,
      compression: number,
      depth: number,
      opacity: number,
      size: number,
      renderOrder: number,
    ): ParticleField => {
      const positions = new Float32Array(count * 3);
      const phase = new Float32Array(count);
      const speed = new Float32Array(count);
      for (let index = 0; index < count; index += 1) {
        phase[index] = (index / count) * Math.PI * 2 + Math.random() * 0.16;
        speed[index] = 0.55 + Math.random() * 0.4;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        map: dotTexture,
        color: 0xa5f3fc,
        transparent: true,
        opacity,
        size,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(geometry, material);
      points.renderOrder = renderOrder;
      scene.add(points);
      return { compression, depth, geometry, phase, points, positions, radius, speed };
    };

    const particles = [
      makeParticleField(42, 3.05, 0.52, -0.3, 0.84, 0.1, 2),
      makeParticleField(32, 2.55, 0.56, 0.62, 0.95, 0.115, 6),
      makeParticleField(26, 3.05, 0.52, -0.29, 0.18, 0.05, 2),
      makeParticleField(20, 2.55, 0.56, 0.61, 0.2, 0.055, 6),
    ];

    const updateParticles = (field: ParticleField, elapsed: number, trailing = false) => {
      for (let index = 0; index < field.phase.length; index += 1) {
        const angle = field.phase[index] + elapsed * field.speed[index] - (trailing ? 0.22 : 0);
        const offset = index * 3;
        field.positions[offset] = Math.cos(angle) * field.radius;
        field.positions[offset + 1] = Math.sin(angle) * field.radius * field.compression;
        field.positions[offset + 2] = field.depth + Math.sin(angle * 2) * 0.12;
      }
      field.geometry.attributes.position.needsUpdate = true;
    };

    let frame = 0;
    let visible = true;

    const renderFrame = (time: number) => {
      const elapsed = reducedMotion ? 0 : time / 1000;
      const targetX = reducedMotion ? 0 : pointerRef.current.x;
      const targetY = reducedMotion ? 0 : pointerRef.current.y;

      routerGroup.rotation.y = THREE.MathUtils.lerp(
        routerGroup.rotation.y,
        targetX * 0.17 + Math.sin(elapsed * 0.45) * 0.035,
        0.075,
      );
      routerGroup.rotation.x = THREE.MathUtils.lerp(
        routerGroup.rotation.x,
        -targetY * 0.12 + Math.cos(elapsed * 0.36) * 0.022,
        0.075,
      );
      routerGroup.position.y = reducedMotion ? 0 : Math.sin(elapsed * 0.7) * 0.055;
      backRing.rotation.z = -0.22 + elapsed * 0.1;
      frontRing.rotation.z = 0.42 - elapsed * 0.14;
      halo.material.opacity = reducedMotion ? 0.34 : 0.35 + Math.sin(elapsed * 1.1) * 0.07;

      updateParticles(particles[0], elapsed);
      updateParticles(particles[1], elapsed);
      updateParticles(particles[2], elapsed, true);
      updateParticles(particles[3], elapsed, true);
      renderer.render(scene, camera);
    };

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    const animate = (time: number) => {
      frame = requestAnimationFrame(animate);
      renderFrame(time);
    };
    const start = () => {
      if (!reducedMotion && visible && !frame) frame = requestAnimationFrame(animate);
    };

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderFrame(performance.now());
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    }, { threshold: 0.05 });
    visibilityObserver.observe(host);

    resize();
    start();

    return () => {
      // Repasser à false ici, et pas seulement à l'entrée : en passant du
      // desktop au mobile (rotation d'iPad, fenêtre réduite), la classe
      // `--webgl-ready` resterait posée et la photo du routeur invisible.
      setWebglReady(false);
      sceneActive = false;
      stop();
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      routerTexture.dispose();
      glowTexture.dispose();
      dotTexture.dispose();
      routerGeometry.dispose();
      backRingGeometry.dispose();
      frontRingGeometry.dispose();
      particles.forEach((field) => {
        field.geometry.dispose();
        field.points.material.dispose();
      });
      routerMaterial.dispose();
      backRingMaterial.dispose();
      frontRingMaterial.dispose();
      haloMaterial.dispose();
      renderer.dispose();
    };
  }, [reducedMotion, orbitAllowed]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (reducedMotion) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerRef.current.set(
      ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
      ((event.clientY - bounds.top) / bounds.height - 0.5) * 2,
    );
  };

  const resetPointer = () => pointerRef.current.set(0, 0);

  return (
    <div
      ref={sceneRef}
      className={`hero-orbit-scene${reducedMotion ? " hero-orbit-scene--reduced-motion" : ""}${webglReady ? " hero-orbit-scene--webgl-ready" : ""}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
    >
      <canvas ref={canvasRef} aria-hidden="true" className="hero-orbit-three-canvas" />
      <div aria-hidden="true" className="hero-orbit-track" />
      <div className="hero-orbit-router">
        <div aria-hidden="true" className="hero-orbit-router-shadow" />
        <Image
          src="/mikrotik/chato.webp"
          alt={routerAlt}
          width={1200}
          height={1200}
          preload
          sizes="(min-width: 1024px) 40vw, (min-width: 640px) 30rem, 92vw"
          className="hero-orbit-image"
        />
      </div>

      <dl className="hero-orbit-metrics">
        <OrbitMetric
          label={routerLabel}
          value={routerValue}
          countTo={routerCountTo}
          sub={routerSub}
          className="hero-orbit-metric-routers"
        />
        <OrbitMetric
          label={sessionLabel}
          value={sessionValue}
          countTo={sessionCountTo}
          sub={sessionSub}
          className="hero-orbit-metric-sessions"
        />
        <OrbitMetric
          label={trialLabel}
          value={trialValue}
          sub={trialSub}
          className="hero-orbit-metric-trial"
        />
        <OrbitMetric
          label={mobileMoneyLabel}
          value={mobileMoneyValue}
          sub={mobileMoneySub}
          className="hero-orbit-metric-money"
        />
      </dl>
    </div>
  );
}
