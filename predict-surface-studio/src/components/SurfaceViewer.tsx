import { Canvas, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Text, Line } from '@react-three/drei';
import { useMemo, useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { SviSnapshot } from '../lib/predictApi';
import { iv } from '../lib/sviMath';

function heatColor(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const stops: [number, number, number, number][] = [
    [0.0,  0.118, 0.431, 0.953],
    [0.25, 0.36,  0.66,  1.0],
    [0.5,  0.024, 0.71,  0.83],
    [0.75, 0.984, 0.749, 0.141],
    [1.0,  0.937, 0.267, 0.267],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i];
      const f = (t - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
    }
  }
  return [stops[stops.length - 1][1], stops[stops.length - 1][2], stops[stops.length - 1][3]];
}

interface Props { snapshot: SviSnapshot }
interface HoverInfo { strike: number; days: number; ivPct: number; x: number; y: number }
interface VP { w: number; h: number; isMobile: boolean }

function useViewport(): VP {
  const [vp, setVp] = useState<VP>({ w: typeof window !== 'undefined' ? window.innerWidth : 1280, h: typeof window !== 'undefined' ? window.innerHeight : 800, isMobile: false });
  useEffect(() => {
    const upd = () => setVp({ w: window.innerWidth, h: window.innerHeight, isMobile: window.innerWidth < 700 });
    upd();
    window.addEventListener('resize', upd);
    return () => window.removeEventListener('resize', upd);
  }, []);
  return vp;
}

export default function SurfaceViewer({ snapshot }: Props) {
  const vp = useViewport();
  const [autoRotate, setAutoRotate] = useState(!vp.isMobile);
  const [wireframe, setWireframe] = useState(false);
  const [resolution, setResolution] = useState<'low' | 'med' | 'high'>('med');
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const cameraRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);

  // Auto-pick safe defaults per viewport
  useEffect(() => {
    if (vp.isMobile) { setResolution('low'); setAutoRotate(false); }
    else { setResolution('med'); }
  }, [vp.isMobile]);

  const STRIKE_BUCKETS = resolution === 'high' ? 80 : resolution === 'med' ? 50 : 32;
  const EXPIRY_BUCKETS = resolution === 'high' ? 48 : resolution === 'med' ? 28 : 18;

  // Surface size adapts to viewport (smaller on mobile so labels don't overflow)
  const SURFACE_W = vp.isMobile ? 7 : 9;
  const SURFACE_H = vp.isMobile ? 5 : 6;
  const Z_SCALE = vp.isMobile ? 24 : 28;
  const FOV = vp.isMobile ? 50 : 42;
  const LABEL_S = vp.isMobile ? 0.42 : 0.32;
  const STRIKE_STEP_PCT = 16;
  const EXPIRY_DAYS = 180;
  const F = snapshot.forward || 79000;

  const defaultCam: [number, number, number] = vp.isMobile ? [10, 9, 10] : [9, 8, 9];

  const { geometry, ivMin, ivMax } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(SURFACE_W, SURFACE_H, STRIKE_BUCKETS - 1, EXPIRY_BUCKETS - 1);
    const pos = geo.attributes.position;
    const ivs: number[] = new Array(STRIKE_BUCKETS * EXPIRY_BUCKETS);
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < EXPIRY_BUCKETS; j++) {
      const tFrac = j / (EXPIRY_BUCKETS - 1);
      const T = 1 / 24 + tFrac * (EXPIRY_DAYS / 365);
      for (let i = 0; i < STRIKE_BUCKETS; i++) {
        const strikePct = -STRIKE_STEP_PCT + (2 * STRIKE_STEP_PCT) * (i / (STRIKE_BUCKETS - 1));
        const k = Math.log(1 + strikePct / 100);
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
  }, [snapshot, STRIKE_BUCKETS, EXPIRY_BUCKETS, SURFACE_W, SURFACE_H, Z_SCALE]);

  const strikeLabels = useMemo(() => {
    const ticks = vp.isMobile ? [-12, 0, 12] : [-12, -6, 0, 6, 12];
    return ticks.map((p) => ({
      x: -SURFACE_W / 2 + ((p + STRIKE_STEP_PCT) / (2 * STRIKE_STEP_PCT)) * SURFACE_W,
      label: `$${(F * (1 + p / 100) / 1000).toFixed(0)}k`,
      isAtm: p === 0,
    }));
  }, [F, SURFACE_W, vp.isMobile]);

  const dayLabels = useMemo(() => {
    const ticks = vp.isMobile ? [1, 30, 180] : [1, 7, 30, 90, 180];
    return ticks.map((d) => ({
      z: -SURFACE_H / 2 + (Math.log(d + 1) / Math.log(EXPIRY_DAYS + 1)) * SURFACE_H,
      label: `${d}d`,
    }));
  }, [SURFACE_H, vp.isMobile]);

  function setCamera(view: 'persp' | 'top' | 'side' | 'front' | 'reset') {
    if (!cameraRef.current || !controlsRef.current) return;
    const c = cameraRef.current;
    const scale = vp.isMobile ? 1.15 : 1;
    if (view === 'persp' || view === 'reset') c.position.set(9 * scale, 8 * scale, 9 * scale);
    if (view === 'top')   c.position.set(0, 14 * scale, 0.001);
    if (view === 'side')  c.position.set(13 * scale, 4 * scale, 0);
    if (view === 'front') c.position.set(0, 4 * scale, 13 * scale);
    controlsRef.current.target.set(0, 1, 0);
    controlsRef.current.update();
  }

  // Keyboard: R reset view, A toggle auto-rotate, W toggle wireframe (when not in input)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'r' || e.key === 'R') setCamera('reset');
      if (e.key === 'a' || e.key === 'A') setAutoRotate((v) => !v);
      if (e.key === 'w' || e.key === 'W') setWireframe((v) => !v);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  function onPointerMove(e: ThreeEvent<PointerEvent>) {
    if (e.uv) {
      const u = e.uv.x, v = e.uv.y;
      const strikePct = -STRIKE_STEP_PCT + (2 * STRIKE_STEP_PCT) * u;
      const strike = F * (1 + strikePct / 100);
      const tFrac = v;
      const days = (1 / 24 + tFrac * (EXPIRY_DAYS / 365)) * 365;
      const k = Math.log(1 + strikePct / 100);
      const T = days / 365;
      const sigma = iv(snapshot.svi, k, T);
      setHover({ strike, days, ivPct: sigma * 100, x: e.clientX, y: e.clientY });
    }
  }
  function onPointerLeave() { setHover(null); }

  return (
    <div className="surface-viewer-wrap">
      <div className="surface-controls">
        <div className="sc-group">
          <button className="sc-btn" onClick={() => setCamera('persp')} title="Perspective">⊞</button>
          <button className="sc-btn" onClick={() => setCamera('top')} title="Top-down">⊡</button>
          <button className="sc-btn" onClick={() => setCamera('side')} title="Side">⊟</button>
          <button className="sc-btn" onClick={() => setCamera('front')} title="Front">⊠</button>
          <button className="sc-btn" onClick={() => setCamera('reset')} title="Reset (R)">↺</button>
        </div>
        <div className="sc-group">
          <button className={'sc-btn ' + (autoRotate ? 'on' : '')} onClick={() => setAutoRotate(!autoRotate)} title="Auto-rotate (A)">↻</button>
          <button className={'sc-btn ' + (wireframe ? 'on' : '')} onClick={() => setWireframe(!wireframe)} title="Wireframe (W)">⌗</button>
          <button className={'sc-btn ' + (resolution === 'low' ? 'on' : '')} onClick={() => setResolution('low')} title="Low resolution">L</button>
          <button className={'sc-btn ' + (resolution === 'med' ? 'on' : '')} onClick={() => setResolution('med')} title="Medium resolution">M</button>
          <button className={'sc-btn ' + (resolution === 'high' ? 'on' : '')} onClick={() => setResolution('high')} title="High resolution">H</button>
        </div>
      </div>

      <Canvas
        dpr={[1, vp.isMobile ? 1.5 : 2]}
        camera={{ position: defaultCam, fov: FOV }}
        style={{ background: 'transparent', touchAction: 'none' }}
        onPointerLeave={onPointerLeave}
        resize={{ debounce: 100 }}
      >
        <CameraSetup cameraRef={cameraRef} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[6, 12, 6]} intensity={1.05} />
        <directionalLight position={[-8, 4, -6]} intensity={0.45} color="#5ca9ff" />
        <pointLight position={[0, 8, 0]} intensity={0.4} color="#ffffff" />

        <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.4, 0]} onPointerMove={onPointerMove}>
          <meshStandardMaterial vertexColors side={THREE.DoubleSide} flatShading={!wireframe} metalness={0.08} roughness={0.55} wireframe={wireframe} />
        </mesh>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[SURFACE_W * 1.6, SURFACE_H * 1.6]} />
          <meshBasicMaterial color="#0a1428" transparent opacity={0.35} />
        </mesh>

        <Line
          points={[[0, 0.4, -SURFACE_H / 2], [0, ivMax * Z_SCALE + 1.5, -SURFACE_H / 2], [0, ivMax * Z_SCALE + 1.5, SURFACE_H / 2], [0, 0.4, SURFACE_H / 2]]}
          color="#5ca9ff" lineWidth={1.5} dashed dashScale={6}
        />
        <Text position={[0, ivMax * Z_SCALE + 2.2, 0]} fontSize={LABEL_S * 1.1} color="#5ca9ff" anchorX="center">ATM ${F.toFixed(0)}</Text>

        {strikeLabels.map((t, i) => (
          <Text key={i} position={[t.x, 0.42, SURFACE_H / 2 + 0.5]} fontSize={LABEL_S} color={t.isAtm ? '#5ca9ff' : '#a0a9b1'} anchorX="center" anchorY="top">{t.label}</Text>
        ))}

        {dayLabels.map((t, i) => (
          <Text key={i} position={[-SURFACE_W / 2 - 0.6, 0.42, t.z]} fontSize={LABEL_S * 0.95} color="#a0a9b1" anchorX="right" anchorY="middle">{t.label}</Text>
        ))}

        <Text position={[-SURFACE_W / 2 - 1.5, ivMin * Z_SCALE + 0.7, 0]} fontSize={LABEL_S} color="#5ca9ff" anchorX="right">{(ivMin * 100).toFixed(0)}%</Text>
        <Text position={[-SURFACE_W / 2 - 1.5, ivMax * Z_SCALE + 0.7, 0]} fontSize={LABEL_S} color="#ef4444" anchorX="right">{(ivMax * 100).toFixed(0)}%</Text>

        <OrbitControls
          ref={controlsRef}
          enableDamping
          dampingFactor={0.08}
          autoRotate={autoRotate}
          autoRotateSpeed={vp.isMobile ? 0.25 : 0.45}
          minDistance={5}
          maxDistance={32}
          enablePan={false}
          rotateSpeed={vp.isMobile ? 0.55 : 0.7}
          zoomSpeed={vp.isMobile ? 0.55 : 0.8}
          touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        />
      </Canvas>

      <div className="iv-legend">
        <span style={{ color: '#5ca9ff' }}>{(ivMin * 100).toFixed(0)}%</span>
        <div className="iv-scale-bar" />
        <span style={{ color: '#ef4444' }}>{(ivMax * 100).toFixed(0)}%</span>
        <span className="iv-legend-label">IV scale</span>
      </div>

      {hover && (
        <div className="surface-tooltip" style={{ left: hover.x + 14, top: hover.y - 14 }}>
          <div><span>strike</span> <strong>${hover.strike.toFixed(0)}</strong></div>
          <div><span>expiry</span> <strong>{hover.days < 1 ? `${(hover.days * 24).toFixed(1)}h` : `${hover.days.toFixed(1)}d`}</strong></div>
          <div><span>IV</span> <strong style={{ color: '#5ca9ff' }}>{hover.ivPct.toFixed(1)}%</strong></div>
        </div>
      )}

      <div className="kbd-hint">
        <kbd>R</kbd> reset · <kbd>A</kbd> rotate · <kbd>W</kbd> wire · drag · pinch
      </div>
    </div>
  );
}

function CameraSetup({ cameraRef }: { cameraRef: any }) {
  const { camera } = useThree();
  useEffect(() => { cameraRef.current = camera; }, [camera, cameraRef]);
  return null;
}
