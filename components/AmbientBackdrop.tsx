import type { CSSProperties } from "react";

const PARTICLES = Array.from({ length: 22 }, (_, index) => ({
  x: (index * 43 + 9) % 97,
  y: (index * 29 + 13) % 93,
  size: 2 + (index % 3),
  delay: -((index * 1.7) % 17),
  duration: 17 + (index % 7) * 3,
  tone: index % 4 === 0 ? "gold" : "red",
}));

type ParticleStyle = CSSProperties & Record<`--particle-${string}`, string>;

export default function AmbientBackdrop() {
  return (
    <div className="ambient-backdrop" aria-hidden="true">
      <span className="ambient-cursor-aura" />
      <span className="ambient-orb ambient-orb-one" />
      <span className="ambient-orb ambient-orb-two" />
      <span className="ambient-particles">
        {PARTICLES.map((particle, index) => {
          const style: ParticleStyle = {
            "--particle-x": `${particle.x}%`,
            "--particle-y": `${particle.y}%`,
            "--particle-size": `${particle.size}px`,
            "--particle-delay": `${particle.delay}s`,
            "--particle-duration": `${particle.duration}s`,
          };
          return <i className={`ambient-particle is-${particle.tone}`} style={style} key={index} />;
        })}
      </span>
    </div>
  );
}
