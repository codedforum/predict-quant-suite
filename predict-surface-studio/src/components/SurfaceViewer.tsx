import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Text } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { SviSnapshot } from '../lib/predictApi';
import { iv } from '../lib/sviMath';

const STRIKE_BUCKETS = 60;
const EXPIRY_BUCKETS = 36;
const SURFACE_W = 9;
const SURFACE_H = 6;
const Z_SCALE = 28;

function heatColor(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const stops: [number, number, number, number][] = [
    [0.0, 0.20, 0.34, 1.00],   // deep blue
    [0.25, 0.30, 0.78, 1.00],  // sky
    [0.5, 0.40, 0.95, 0.55],   // green
    [0.75, 1.00, 0.78, 0.20],  // amber
    [1.0, 1.00, 0.30, 0.30],   // red
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
    <Canvas camera={{ position: [9, 7, 9], fov: 42 }} style={{ background: 'transparent' }}>
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 12, 6]} intensity={1.1} />
      <directionalLight position={[-8, 4, -6]} intensity={0.4} color="#5b9dff" />

      <Grid args={[30, 30]} cellColor="#ffffff0a" sectionColor="#ffffff1a" fadeDistance={45} infiniteGrid position={[0, -0.01, 0]} />

      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.4, 0]}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} flatShading metalness={0.05} roughness={0.65} />
      </mesh>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.41, 0]}>
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.06} />
      </mesh>

      <Text position={[SURFACE_W / 2 + 0.6, 0.4, 0]} fontSize={0.28} color="#888" anchorX="left">strike →</Text>
      <Text position={[0, 0.4, SURFACE_H / 2 + 0.6]} fontSize={0.28} color="#888" anchorX="center">← expiry</Text>
      <Text position={[-SURFACE_W / 2 - 0.4, 2, 0]} fontSize={0.28} color="#888" anchorX="right" rotation={[0, 0, Math.PI / 2]}>IV ↑</Text>

      <Text position={[-SURFACE_W / 2, ivMax * Z_SCALE + 0.7, 0]} fontSize={0.26} color="#5fd49a" anchorX="left">{(ivMax * 100).toFixed(1)}% max</Text>
      <Text position={[-SURFACE_W / 2, 0.6, 0]} fontSize={0.26} color="#5b9dff" anchorX="left">{(ivMin * 100).toFixed(1)}% min</Text>

      <OrbitControls enableDamping autoRotate autoRotateSpeed={0.35} />
    </Canvas>
  );
}
