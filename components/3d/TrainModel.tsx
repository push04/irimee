'use client';
/**
 * components/3d/TrainModel.tsx
 *
 * React Three Fiber parametric Vande Bharat 3D model.
 * Geometry built from confirmed ICF/RDSO specifications.
 * Component health colour-mapped from physics results.
 *
 * Dimensions (confirmed):
 *   Car body: 24m × 3.24m × 4.14m
 *   Wheel diameter: 952mm (nominal)
 *   Bogie wheelbase: 2500mm
 *   Back-to-back (BG): 1600mm
 */

import { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Grid, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { SimulationParams, PhysicsResults } from '@/lib/types';
import { VB_NOMINAL } from '@/lib/config';

// ── Colour helpers ─────────────────────────────────────────────────────────────
// 0.0 = nominal/good (IR blue), 0.5 = warn (amber), 1.0 = critical (IR red)
function healthColor(scalar: number): string {
  if (scalar < 0.4) return '#2563EB';   // blue — ok
  if (scalar < 0.7) return '#D97706';   // amber — warn
  return '#DC2626';                      // red — critical
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

// ── VB Cross-section profile (Y, Z) ──────────────────────────────────────────
// Approximation of the Vande Bharat trapezoidal-with-roof-curve cross-section
// Confirmed width 3240mm, height 4140mm (ICF specification)
function vbProfile(n = 24): THREE.Vector2[] {
  const W = 3.240 / 2;   // half-width
  const H = 4.140;
  const skirt = 0.15;    // skirt taper inset at base
  const roof_r = 0.35;   // roof crown radius

  const pts: THREE.Vector2[] = [];
  // Right side bottom → right side top → roof arc → left side top → left bottom
  // Base right
  pts.push(new THREE.Vector2(W - skirt, 0));
  pts.push(new THREE.Vector2(W, 0.25));
  pts.push(new THREE.Vector2(W, H - roof_r));
  // Roof arc (right to left)
  const arcSegs = Math.floor(n / 3);
  for (let i = 0; i <= arcSegs; i++) {
    const t = (i / arcSegs) * Math.PI;
    pts.push(new THREE.Vector2(Math.cos(t) * W * 0.96, H - roof_r + Math.sin(t) * roof_r * 0.85));
  }
  // Left side
  pts.push(new THREE.Vector2(-W, H - roof_r));
  pts.push(new THREE.Vector2(-W, 0.25));
  pts.push(new THREE.Vector2(-W + skirt, 0));
  return pts;
}

// ── Car Body ─────────────────────────────────────────────────────────────────
function CarBody({ xOffset, carLength = 24, healthScalar = 0.1, opacity = 1 }: {
  xOffset: number; carLength?: number; healthScalar?: number; opacity?: number;
}) {
  const profile = useMemo(() => vbProfile(28), []);
  const shape   = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(profile[0].x, profile[0].y);
    profile.slice(1).forEach(p => s.lineTo(p.x, p.y));
    s.closePath();
    return s;
  }, [profile]);

  const geometry = useMemo(() => new THREE.ExtrudeGeometry(shape, {
    depth: carLength,
    bevelEnabled: false,
    steps: 1,
  }), [shape, carLength]);

  const color = healthColor(healthScalar);
  return (
    <mesh
      geometry={geometry}
      position={[xOffset, 0, 0]}
      rotation={[0, 0, 0]}
      castShadow receiveShadow
    >
      <meshStandardMaterial
        color={color}
        metalness={0.55}
        roughness={0.35}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
}

// ── Ogive Nose ─────────────────────────────────────────────────────────────
function OgiveNose({ xOffset, noseLength, forward = true, color = '#2563EB' }: {
  xOffset: number; noseLength: number; forward?: boolean; color?: string;
}) {
  const geometry = useMemo(() => {
    const profile = vbProfile(20);
    const shape   = new THREE.Shape();
    shape.moveTo(profile[0].x, profile[0].y);
    profile.slice(1).forEach(p => shape.lineTo(p.x, p.y));
    shape.closePath();

    // Loft from full profile → point using BufferGeometry
    const N = 16;   // sections
    const positions: number[] = [];
    const indices:   number[] = [];
    const nProf = profile.length;

    for (let s = 0; s < N; s++) {
      const t = s / (N - 1);
      // Ellipsoidal scale factor: body → tip
      const scale = Math.sqrt(Math.max(0, 1 - t * t));
      const x = forward ? xOffset + t * noseLength : xOffset - t * noseLength;
      for (let i = 0; i < nProf; i++) {
        positions.push(x, profile[i].x * scale, profile[i].y * scale);
      }
    }

    for (let s = 0; s < N - 1; s++) {
      for (let i = 0; i < nProf; i++) {
        const j  = (i + 1) % nProf;
        const a  = s * nProf + i;
        const b  = s * nProf + j;
        const c  = (s + 1) * nProf + j;
        const d  = (s + 1) * nProf + i;
        indices.push(a, b, d, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [xOffset, noseLength, forward]);

  return (
    <mesh geometry={geometry} castShadow>
      <meshStandardMaterial color={color} metalness={0.55} roughness={0.35} />
    </mesh>
  );
}

// ── Wheel ─────────────────────────────────────────────────────────────────────
function Wheel({ position, radius, wearScalar = 0.1 }: {
  position: [number, number, number]; radius: number; wearScalar?: number;
}) {
  return (
    <group position={position}>
      {/* Tread */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[radius, radius, 0.14, 32]} />
        <meshStandardMaterial color={healthColor(wearScalar)} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Flange */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.07, 0]} castShadow>
        <cylinderGeometry args={[radius * 1.08, radius * 1.08, 0.04, 32]} />
        <meshStandardMaterial color="#1A1D2E" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}

// ── Bogie ─────────────────────────────────────────────────────────────────────
function Bogie({ xCentre, backToBackM, wheelR, healthScalar = 0.2 }: {
  xCentre: number; backToBackM: number; wheelR: number; healthScalar?: number;
}) {
  const wb = 2.5;    // wheelbase
  const frameH = 0.28, frameT = 0.14;
  const z = wheelR;  // frame bottom at wheel centreline height

  return (
    <group>
      {/* Side members */}
      {[-1, 1].map(sign => (
        <mesh key={sign} position={[xCentre, sign * (backToBackM / 2 + 0.12), z + frameH / 2]} castShadow>
          <boxGeometry args={[wb + 0.2, frameT, frameH]} />
          <meshStandardMaterial color={healthColor(healthScalar)} metalness={0.5} roughness={0.6} />
        </mesh>
      ))}
      {/* Cross members */}
      {[-1, 1].map((sign, idx) => (
        <mesh key={idx} position={[xCentre + sign * wb / 2, 0, z + frameH / 2]} castShadow>
          <boxGeometry args={[frameT, backToBackM + 0.3, frameH]} />
          <meshStandardMaterial color={healthColor(healthScalar)} metalness={0.5} roughness={0.6} />
        </mesh>
      ))}
      {/* Wheelsets */}
      {[-1, 1].map(sign => (
        <group key={sign} position={[xCentre + sign * wb / 2, 0, 0]}>
          {/* Axle */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.07, backToBackM + 0.4, 16]} />
            <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Wheels */}
          <Wheel position={[0, -backToBackM / 2, 0]} radius={wheelR} />
          <Wheel position={[0,  backToBackM / 2, 0]} radius={wheelR} />
          {/* Brake discs */}
          {[-1, 1].map((ds, di) => (
            <mesh key={di} position={[0, ds * (backToBackM / 2 + 0.22), 0]} rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.15, 0.30, 32]} />
              <meshStandardMaterial color="#B91C1C" metalness={0.6} roughness={0.4} side={THREE.DoubleSide} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// ── Pantograph ─────────────────────────────────────────────────────────────────
function Pantograph({ xPos, contactZ = 5.5 }: { xPos: number; contactZ?: number }) {
  const roofZ = 4.14;
  const midZ  = (roofZ + contactZ) / 2;

  return (
    <group position={[xPos, 0, 0]}>
      {/* Lower arm */}
      <mesh position={[-0.2, 0, (roofZ + midZ) / 2]}
            rotation={[0, 0, Math.atan2(midZ - roofZ, 0.4)]}>
        <cylinderGeometry args={[0.025, 0.025, Math.hypot(0.4, midZ - roofZ), 8]} />
        <meshStandardMaterial color="#6B7280" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Upper arm */}
      <mesh position={[0, 0, (midZ + contactZ) / 2]}>
        <cylinderGeometry args={[0.02, 0.02, contactZ - midZ, 8]} />
        <meshStandardMaterial color="#6B7280" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Contact strip */}
      <mesh position={[0, 0, contactZ]}>
        <boxGeometry args={[0.04, 1.95, 0.025]} />
        <meshStandardMaterial color="#D4A853" metalness={0.4} roughness={0.5} />
      </mesh>
    </group>
  );
}

// ── Rails ─────────────────────────────────────────────────────────────────────
function Rails({ gaugeM, totalLengthM }: { gaugeM: number; totalLengthM: number }) {
  return (
    <>
      {[-1, 1].map(sign => (
        <mesh key={sign} position={[totalLengthM / 2, sign * gaugeM / 2, -0.04]}>
          <boxGeometry args={[totalLengthM, 0.07, 0.08]} />
          <meshStandardMaterial color="#94A3B8" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
    </>
  );
}

// ── MAHSR Incompatibility Annotation ─────────────────────────────────────────
function GaugeAnnotation({ show, overhangs_mm }: { show: boolean; overhangs_mm: number }) {
  if (!show || overhangs_mm <= 0) return null;
  return (
    <Html position={[50, 0, 8]} center>
      <div style={{
        background: 'rgba(220,38,38,0.92)', color: '#fff',
        fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 700,
        padding: '6px 18px', borderRadius: 6, whiteSpace: 'nowrap',
        border: '1px solid #DC2626', letterSpacing: '0.06em',
      }}>
        ⚠ INCOMPATIBLE GAUGE — Overhang: {overhangs_mm.toFixed(0)}mm
      </div>
    </Html>
  );
}

// ── Full Formation ─────────────────────────────────────────────────────────────
function TrainFormation({ params, physics }: {
  params: SimulationParams; physics: PhysicsResults | null;
}) {
  const nCars    = params.n_cars;
  const gaugeM   = params.gauge_mm / 1000;
  const noseM    = params.nose_length_m;
  const btbM     = gaugeM - 0.076;   // nominal flange-to-gauge
  const wheelR   = VB_NOMINAL.wheel_diameter_mm / 2 / 1000;
  const carL     = 24.0;
  const gapM     = 0.28;
  const pitch    = carL + gapM;
  const totalL   = nCars * pitch;

  // Health scalars from physics (0–1)
  const huntingScalar = physics?.dynamics
    ? Math.max(0, Math.min(1, 1 - physics.dynamics.safety_margin_kmh / 150))
    : 0.15;
  const brakeScalar = physics?.braking
    ? Math.max(0, Math.min(1, physics.braking.peak_disc_temp_C / 600))
    : 0.2;

  // Gauge incompatibility check
  const BG_BT_B = VB_NOMINAL.back_to_back_mm / 1000;
  const rail_inner = gaugeM - 0.033 * 2;  // rail head minus flange gap
  const overhang_mm = Math.max(0, (BG_BT_B - rail_inner) * 500);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {/* Rails */}
      <Rails gaugeM={gaugeM} totalLengthM={totalL + 10} />

      {/* Ground plane */}
      <mesh position={[totalL / 2, 0, -0.15]} receiveShadow>
        <boxGeometry args={[totalL + 20, 12, 0.1]} />
        <meshStandardMaterial color="#F1F5F9" roughness={1} metalness={0} />
      </mesh>

      {/* Cars */}
      {Array.from({ length: nCars }).map((_, i) => {
        const x = i * pitch;
        const isFirst = i === 0;
        const isLast  = i === nCars - 1;
        return (
          <group key={i}>
            <CarBody xOffset={x} carLength={carL} healthScalar={huntingScalar * 0.5} />
            {isFirst && (
              <OgiveNose xOffset={x} noseLength={noseM} forward={false} color={healthColor(huntingScalar * 0.3)} />
            )}
            {isLast && (
              <OgiveNose xOffset={x + carL} noseLength={noseM} forward color={healthColor(huntingScalar * 0.3)} />
            )}

            {/* Bogies — front and rear of each car */}
            {[x + 4, x + carL - 4].map((bx, bi) => (
              <Bogie key={bi} xCentre={bx} backToBackM={btbM} wheelR={wheelR}
                     healthScalar={huntingScalar} />
            ))}

            {/* Pantograph on first and last car */}
            {(isFirst || isLast) && (
              <Pantograph xPos={x + carL * 0.7} contactZ={5.5} />
            )}
          </group>
        );
      })}

      <GaugeAnnotation show={gaugeM < 1.6} overhangs_mm={overhang_mm} />
    </group>
  );
}

// ── Scene ─────────────────────────────────────────────────────────────────────
function Scene({ params, physics }: { params: SimulationParams; physics: PhysicsResults | null }) {
  const nCars = params.n_cars;
  const totalL = nCars * 24.28;

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[totalL * 0.4, -30, 40]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-20, 20, 20]} intensity={0.4} />

      <TrainFormation params={params} physics={physics} />

      <OrbitControls
        enablePan enableZoom enableRotate
        minDistance={5}
        maxDistance={totalL * 1.5}
        target={[totalL / 2, 0, 2]}
        makeDefault
      />
    </>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
interface TrainModelProps {
  params: SimulationParams;
  physics: PhysicsResults | null;
  className?: string;
}

export default function TrainModel({ params, physics, className = '' }: TrainModelProps) {
  return (
    <div className={`w-full h-full bg-[#F7F9FD] ${className}`}>
      <Canvas
        shadows
        camera={{
          position: [params.n_cars * 12, -28, 18],
          fov: 45,
          near: 0.5,
          far: 2000,
        }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#F7F9FD' }}
      >
        <Suspense fallback={null}>
          <Scene params={params} physics={physics} />
        </Suspense>
      </Canvas>
    </div>
  );
}
