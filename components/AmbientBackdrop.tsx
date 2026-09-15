"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseVx: number;
  baseVy: number;
  radius: number;
  color: "aqua" | "gold" | "coral";
};

const MAX_PARTICLES = 84;
const CONNECTION_DISTANCE = 145;
const POINTER_DISTANCE = 185;
const FRAME_INTERVAL = 1_000 / 30;

export default function AmbientBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;
    const drawingCanvas = canvas;
    const drawingContext = context;

    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let animationFrame = 0;
    let previousFrame = 0;
    let particles: Particle[] = [];
    const pointer = { x: -10_000, y: -10_000, active: false };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function createParticle(index: number): Particle {
      const angle = ((index * 137.5) % 360) * (Math.PI / 180);
      const speed = reducedMotion ? 0 : 0.34 + (index % 5) * 0.07;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      return {
        x: ((index * 47 + 17) % 97) / 100 * width,
        y: ((index * 31 + 11) % 93) / 100 * height,
        vx,
        vy,
        baseVx: vx,
        baseVy: vy,
        radius: 1.7 + (index % 3) * 0.58,
        color: index % 5 === 0 ? "gold" : index % 5 === 1 ? "coral" : "aqua",
      };
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      drawingCanvas.width = Math.round(width * pixelRatio);
      drawingCanvas.height = Math.round(height * pixelRatio);
      drawingCanvas.style.width = `${width}px`;
      drawingCanvas.style.height = `${height}px`;
      drawingContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const desiredCount = Math.min(
        MAX_PARTICLES,
        Math.max(44, Math.round((width * height) / 24_000)),
      );
      particles = Array.from({ length: desiredCount }, (_, index) =>
        particles[index] || createParticle(index),
      );
      for (const particle of particles) {
        particle.x = Math.min(width, Math.max(0, particle.x));
        particle.y = Math.min(height, Math.max(0, particle.y));
      }
    }

    function draw() {
      drawingContext.clearRect(0, 0, width, height);
      for (let left = 0; left < particles.length; left += 1) {
        const particle = particles[left];
        if (!reducedMotion) {
          if (pointer.active) {
            const dx = particle.x - pointer.x;
            const dy = particle.y - pointer.y;
            const distance = Math.hypot(dx, dy) || 1;
            if (distance < POINTER_DISTANCE) {
              const force = (1 - distance / POINTER_DISTANCE) * 0.05;
              particle.vx += dx / distance * force;
              particle.vy += dy / distance * force;
            }
          }
          particle.vx += (particle.baseVx - particle.vx) * 0.012;
          particle.vy += (particle.baseVy - particle.vy) * 0.012;
          const speed = Math.hypot(particle.vx, particle.vy);
          if (speed > 1.05) {
            particle.vx = particle.vx / speed * 1.05;
            particle.vy = particle.vy / speed * 1.05;
          }
          particle.x += particle.vx;
          particle.y += particle.vy;
          if (particle.x < -8) particle.x = width + 8;
          if (particle.x > width + 8) particle.x = -8;
          if (particle.y < -8) particle.y = height + 8;
          if (particle.y > height + 8) particle.y = -8;
        }

        for (let right = left + 1; right < particles.length; right += 1) {
          const peer = particles[right];
          const distance = Math.hypot(particle.x - peer.x, particle.y - peer.y);
          if (distance >= CONNECTION_DISTANCE) continue;
          const opacity = (1 - distance / CONNECTION_DISTANCE) * 0.3;
          drawingContext.beginPath();
          drawingContext.moveTo(particle.x, particle.y);
          drawingContext.lineTo(peer.x, peer.y);
          drawingContext.strokeStyle = `rgba(105, 184, 182, ${opacity})`;
          drawingContext.lineWidth = 0.9;
          drawingContext.stroke();
        }

        drawingContext.beginPath();
        drawingContext.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        drawingContext.fillStyle = particle.color === "gold"
          ? "rgba(240, 205, 126, .92)"
          : particle.color === "coral"
            ? "rgba(218, 119, 104, .78)"
            : "rgba(104, 211, 194, .92)";
        drawingContext.fill();
      }
    }

    function animate(timestamp: number) {
      animationFrame = window.requestAnimationFrame(animate);
      if (timestamp - previousFrame < FRAME_INTERVAL) return;
      previousFrame = timestamp;
      draw();
    }

    const movePointer = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    };
    const clearPointer = () => { pointer.active = false; };

    resize();
    draw();
    if (!reducedMotion) animationFrame = window.requestAnimationFrame(animate);
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", movePointer, { passive: true });
    document.documentElement.addEventListener("mouseleave", clearPointer);
    window.addEventListener("blur", clearPointer);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", movePointer);
      document.documentElement.removeEventListener("mouseleave", clearPointer);
      window.removeEventListener("blur", clearPointer);
    };
  }, []);

  return (
    <div className="ambient-backdrop" aria-hidden="true">
      <canvas className="ambient-particle-canvas" ref={canvasRef} />
      <span className="ambient-cursor-aura" />
      <span className="ambient-orb ambient-orb-one" />
      <span className="ambient-orb ambient-orb-two" />
    </div>
  );
}
