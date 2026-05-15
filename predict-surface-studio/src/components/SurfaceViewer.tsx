import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { SviSnapshot } from '../lib/predictApi';
import { iv } from '../lib/sviMath';

const STRIKE_BUCKETS = 40;
const EXPIRY_BUCKETS = 24;

export default function SurfaceViewer({ snapshot }: { snapshot: SviSnapshot }) {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(8, 6, STRIKE_BUCKETS - 1, EXPIRY_BUCKETS - 1);
    const pos = geo.attributes.position;
    const colors: number[] = [];
    for (let j = 0; j < EXPIRY_BUCKETS; j++) {
      const tFrac = j / (EXPIRY_BUCKETS - 1);
      const T = 1 / 24 + tFrac * (24 / 24);
      for (let i = 0; i < STRIKE_BUCKETS; i++) {
        const k = -1 + (2 * i) / (STRIKE_BUCKETS - 1);
        const sigma = iv(snapshot.svi, k, T);
        const idx = j * STRIKE_BUCKETS + i;
        pos.setZ(idx, sigma * 4);
        const c = Math.min(1, sigma * 1.5);
        colors.push(0.2 + c * 0.8, 0.5 - c * 0.3, 1 - c * 0.6);
      }
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [snapshot]);

  return (
    <Canvas camera={{ position: [6, 5, 6], fov: 45 }} style={{ background: '#07090d' }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />
      <Grid args={[20, 20]} cellColor="#1b2030" sectionColor="#2a3550" fadeDistance={30} infiniteGrid />
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} flatShading />
      </mesh>
      <OrbitControls />
    </Canvas>
  );
}
