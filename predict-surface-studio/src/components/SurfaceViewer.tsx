import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Text } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { SviSnapshot } from '../lib/predictApi';
import { iv } from '../lib/sviMath';

const STRIKE_BUCKETS = 60;
const EXPIRY_BUCKETS = 36;
const SURFACE_W = 10;
const SURFACE_H = 7;
const Z_SCALE = 30;

// Heat-map: low IV → cool blue, mid → cyan/green, high → yellow → red
function heatColor(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const stops: [number, number, number, number][] = [
    [0.0, 0.18, 0.30, 0.85],
    [0.25, 0.10, 0.70, 0.95],
    [0.5, 0.20, 0.95, 0.55],
    [0.75, 1.00, 0.85, 0.20],
    [1.0, 1.00, 0.30, 0.30],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1];
      const b = stops[i];
      const f = (t - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
    }
  }
  return [stops[stops.length - 1][1], stops[stops.length - 1][2], stops[stops.length - 1][3]];
}

export default function SurfaceViewer({ snapshot }: { snapshot: SviSnapshot }) {
  const { geometry, ivMin, ivMax } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(SURFACE_W, SURFACE_H, STRIKE_BUCKETS - 1, EXPIRY_BUCKETS - 1);
    const pos = geo.attributes.position;

    // First pass: compute IV per vertex + min/max
    const ivs: number[] = new Array(STRIKE_BUCKETS * EXPIRY_BUCKETS);
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < EXPIRY_BUCKETS; j++) {
      const tFrac = j / (EXPIRY_BUCKETS - 1);
      const T = 1 / 24 + tFrac * (180 / 365);
      for (let i = 0; i < STRIKE_BUCKETS; i++) {
        const k = -0.6 + (1.2 * i) / (STRIKE_BUCKETS - 1);
        const sigma = iv(snapshot.svi, k, T);
        const idx = j * STRIKE_BUCKETS + i;
        ivs[idx] = sigma;
        if (Number.isFinite(sigma)) { if (sigma < lo) lo = sigma; if (sigma > hi) hi = sigma; }
      }
    }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-9) hi = lo + 1e-3;

    // Second pass: write Z + color
    const colors: number[] = [];
    for (let idx = 0; idx < ivs.length; idx++) {
      const sigma = ivs[idx];
      pos.setZ(idx, sigma * Z_SCALE);
      const t = (sigma - lo) / (hi - lo);
      const [r, g, b] = heatColor(t);
      colors.push(r, g, b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return { geometry: geo, ivMin: lo, ivMax: hi };
  }, [snapshot]);

  return (
    <Canvas camera={{ position: [9, 8, 9], fov: 42 }} style={{ background: '#07090d' }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 12, 6]} intensity={1.2} />
      <directionalLight position={[-6, 4, -6]} intensity={0.4} color="#5b9dff" />

      {/* floor grid for spatial reference */}
      <Grid args={[30, 30]} cellColor="#1b2030" sectionColor="#2a3550" fadeDistance={40} infiniteGrid position={[0, -0.01, 0]} />

      {/* solid surface */}
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} flatShading metalness={0.1} roughness={0.6} />
      </mesh>

      {/* wireframe overlay for added definition */}
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.51, 0]}>
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.07} />
      </mesh>

      {/* axis labels */}
      <Text position={[SURFACE_W / 2 + 0.6, 0.5, 0]} fontSize={0.35} color="#8a93a6" anchorX="left">
        strike →
      </Text>
      <Text position={[0, 0.5, SURFACE_H / 2 + 0.6]} fontSize={0.35} color="#8a93a6" anchorX="center">
        ← expiry
      </Text>
      <Text position={[-SURFACE_W / 2 - 0.4, 2.5, 0]} fontSize={0.35} color="#8a93a6" anchorX="right" rotation={[0, 0, Math.PI / 2]}>
        IV ↑
      </Text>

      {/* IV range readout */}
      <Text position={[-SURFACE_W / 2, ivMax * Z_SCALE + 1, 0]} fontSize={0.3} color="#5fd49a" anchorX="left">
        max IV {(ivMax * 100).toFixed(1)}%
      </Text>
      <Text position={[-SURFACE_W / 2, 0.7, 0]} fontSize={0.3} color="#5b9dff" anchorX="left">
        min IV {(ivMin * 100).toFixed(1)}%
      </Text>

      <OrbitControls enableDamping autoRotate autoRotateSpeed={0.4} />
    </Canvas>
  );
}
