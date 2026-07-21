import { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Grid } from '@react-three/drei';
import axios from 'axios';
import * as THREE from 'three';
import './App.css';

// Flood Plane Component for simulation
const FloodLayer = ({ isFlooding }) => {
  const floodRef = useRef();

  useFrame((state, delta) => {
    if (!floodRef.current) return;

    if (isFlooding) {
      // Rise slowly up to a maximum height (e.g., 1.5 units)
      if (floodRef.current.position.y < 1.5) {
        floodRef.current.position.y += delta * 0.8;
      }
      // Fade in opacity
      if (floodRef.current.material.opacity < 0.6) {
        floodRef.current.material.opacity += delta * 0.5;
      }
    } else {
      // Recede slowly
      if (floodRef.current.position.y > 0.05) {
        floodRef.current.position.y -= delta * 0.8;
      }
      // Fade out
      if (floodRef.current.material.opacity > 0) {
        floodRef.current.material.opacity -= delta * 0.5;
      }
    }
  });

  return (
    <mesh ref={floodRef} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[30, 30]} />
      <meshStandardMaterial
        color="#3b82f6"
        transparent
        opacity={0}
        depthWrite={false}
        roughness={0.1}
        metalness={0.1}
      />
    </mesh>
  );
};

// Dinamik Su Seviyesi (Borunun İçi)
const PipeWater = ({ riskLevel }) => {
  const surfaceRef = useRef();
  const bodyRef = useRef();
  // Suyu hizasından kesmek için bir clipping plane (kırpma düzlemi)
  const clipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), -2.5), []);

  useFrame((state, delta) => {
    // riskLevel (0 - 100+) -> doluluk oranı (0 ile 1 arası)
    const fillRatio = Math.min(1, Math.max(0.05, riskLevel / 100));

    // Borunun merkezine göre su yüzeyinin hedef yüksekliğini hesapla (-1.15 en dip, +1.15 en üst)
    const targetH = -1.15 + (fillRatio * 2.30);
    const currentH = clipPlane.constant + 2.5;

    // Yumuşak yükselme/alçalma
    const newH = currentH + (targetH - currentH) * delta * 2;

    // Suyun daha gerçekçi dalgalanmasını/akmasını simüle eden karmaşık sinüs dalgaları
    const time = state.clock.elapsedTime;
    const flowWave = (Math.sin(time * 4) * 0.015) + (Math.cos(time * 2.5) * 0.01) + (Math.sin(time * 7) * 0.005);
    const finalH = newH + flowWave;

    // Kırpma düzlemini güncelle (sadece bu hizanin altındaki hacim çizilir)
    clipPlane.constant = -2.5 + finalH;

    if (surfaceRef.current) {
      // Su yüzeyi düzlemini tam hizaya getir
      surfaceRef.current.position.y = finalH;
      // Dairesel boru içindeki yüzeyin o anki yüksekliğe göre genişliğini (kirişini) hesapla
      const width = 2 * Math.sqrt(Math.max(0.001, 1.15 * 1.15 - newH * newH));
      surfaceRef.current.scale.set(1, width, 1);
    }

    // Riske göre rengi değiştir (Tehlikeli ise kırmızı)
    const isHighRisk = riskLevel > 100;
    const color = isHighRisk ? '#ef4444' : '#0ea5e9';
    const emissive = isHighRisk ? '#dc2626' : '#0284c7';

    if (bodyRef.current) {
      bodyRef.current.color.set(color);
      bodyRef.current.emissive.set(emissive);
      bodyRef.current.emissiveIntensity = isHighRisk ? 0.6 : 0.1;
    }
    if (surfaceRef.current) {
      surfaceRef.current.material.color.set(color);
      surfaceRef.current.material.emissive.set(emissive);
      surfaceRef.current.material.emissiveIntensity = isHighRisk ? 0.6 : 0.1;
    }
  });

  return (
    <group position={[0, -2.5, 0]}>
      {/* Su Hacmi (Kırpma düzlemi ile üstten kesilmiş silindir) */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[1.15, 1.15, 24.8, 64]} />
        <meshPhysicalMaterial
          ref={bodyRef}
          color="#0ea5e9"
          transmission={0.8} // Suya cam/sıvı efekti (refraksiyon)
          transparent
          opacity={1}
          roughness={0.05}
          ior={1.33} // Suyun kırılma indisi
          thickness={1.5}
          clippingPlanes={[clipPlane]}
          side={THREE.FrontSide}
        />
      </mesh>

      {/* Su Yüzeyi (Genişliği derinliğe göre değişen ve dalgalanan düzlem) */}
      <mesh ref={surfaceRef} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[24.8, 1, 32, 1]} />
        <meshPhysicalMaterial
          color="#0ea5e9"
          transmission={0.9} // Su yüzeyinden aşağıyı görebilmek için
          transparent
          opacity={1}
          roughness={0.02}
          ior={1.33}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
};

const Scene = ({ riskLevel }) => {
  const isHighRisk = riskLevel > 100;

  return (
    <>
      <OrbitControls makeDefault enableDamping dampingFactor={0.05} maxPolarAngle={Math.PI / 2 - 0.05} />

      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1.5} castShadow shadow-mapSize={[1024, 1024]} />
      <Environment preset="city" />

      {/* Grid Helper for technical look */}
      <Grid infiniteGrid fadeDistance={40} sectionColor="#475569" cellColor="#334155" />

      {/* Street Level / Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial
          color="#1e293b"
          transparent
          opacity={0.8}
          depthWrite={false}
          roughness={0.8}
        />
      </mesh>

      {/* Underground Pipe System (Outer Shell - Gerçekçi Cam Boru) */}
      <mesh position={[0, -2.5, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[1.2, 1.2, 25, 64]} />
        <meshPhysicalMaterial
          color="#e2e8f0"
          transmission={0.95} // Yüksek geçirgenlik (Cam)
          transparent
          opacity={1}
          roughness={0.05}
          ior={1.5} // Cam kırılma indisi
          thickness={0.5}
          depthWrite={false}
        />
      </mesh>

      {/* Borunun İçindeki Dinamik Su Seviyesi */}
      <PipeWater riskLevel={riskLevel} />

      {/* Pipe connections / joints */}
      <mesh position={[-8, -2.5, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[1.3, 1.3, 2, 32]} />
        <meshStandardMaterial color={isHighRisk ? '#b91c1c' : '#64748b'} metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[8, -2.5, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[1.3, 1.3, 2, 32]} />
        <meshStandardMaterial color={isHighRisk ? '#b91c1c' : '#64748b'} metalness={0.9} roughness={0.3} />
      </mesh>

      {/* Flood Simulation Layer */}
      <FloodLayer isFlooding={isHighRisk} />
    </>
  );
};

function App() {
  const [data, setData] = useState({
    hesaplananRisk: 0,
    alinanAksiyon: "Sistem başlatılıyor, veri bekleniyor...",
    zamanDamgasi: null
  });

  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get('http://localhost:3000/api/risk-analizi');

        setData({
          ...response.data,
          zamanDamgasi: new Date().toISOString()
        });
        setError(null);
      } catch (err) {
        console.error("Veri çekilirken hata oluştu:", err);
        setError("Sunucuya bağlanılamadı. Lütfen arka uç sunucusunun çalıştığından emin olun.");
      }
    };

    fetchData(); // İlk veri çekimi
    const intervalId = setInterval(fetchData, 5000); // 5 saniyede bir polling

    return () => clearInterval(intervalId);
  }, []);

  // Backend veriyi "%15.0" şeklinde string olarak dönüyor, sayıyı ayıklamamız lazım
  const riskValue = typeof data.hesaplananRisk === 'string'
    ? parseFloat(data.hesaplananRisk.replace('%', ''))
    : (data.hesaplananRisk || 0);

  const isHighRisk = riskValue > 100;

  // Patlama ve taşkın tahmini hesaplama
  let patlamaTahmini;
  let patlamaDurumu;

  if (riskValue >= 100) {
    patlamaTahmini = "KRİTİK DURUM: Boru kapasitesi aşıldı, taşkın/patlama anı!";
    patlamaDurumu = "critical";
  } else if (riskValue > 60) {
    const kalanYuzde = 100 - riskValue;
    // Riske göre ivmeli bir formül (Örnek: 95 risk için ~0.6 saat, 65 risk için ~4.4 saat)
    const saat = (kalanYuzde / 8).toFixed(1);
    patlamaTahmini = `Uyarı: Mevcut akış hızıyla devam ederse ortalama ${saat} saat içerisinde patlama/taşkın bekleniyor.`;
    patlamaDurumu = "warning";
  } else {
    patlamaTahmini = "Akış normal, sistem stabil.";
    patlamaDurumu = "safe";
  }

  return (
    <div className="app-container">
      {/* 3D Canvas Area (75%) */}
      <div className="canvas-container">
        <Canvas shadows camera={{ position: [8, 6, 12], fov: 45 }} gl={{ localClippingEnabled: true }}>
          <Scene riskLevel={riskValue} />
        </Canvas>

        {/* Decorative Overlay Elements */}
        <div className="canvas-overlay-top">
          <div className="status-badge">
            <span className={`status-dot ${error ? 'error' : 'active'}`}></span>
            {error ? 'Bağlantı Koptu' : 'Canlı Bağlantı'}
          </div>
        </div>
      </div>

      {/* Control Panel Area (25%) */}
      <div className="panel-container">
        <div className="panel-header">
          <h2>Akıllı Şehir İkizi</h2>
          <p>Yeraltı Altyapı İzleme Sistemi</p>
        </div>

        <div className="data-cards">
          <div className={`data-card risk-card ${isHighRisk ? 'critical' : 'normal'}`}>
            <span className="card-label">Anlık Risk Seviyesi</span>
            <div className="card-value">
              {data.hesaplananRisk}
              {isHighRisk && <span className="warning-icon" title="Kritik Seviye!">⚠️</span>}
            </div>
            <div className="status-bar">
              <div
                className="status-fill"
                style={{
                  width: `${Math.min(100, (riskValue / 150) * 100)}%`,
                  backgroundColor: isHighRisk ? '#ef4444' : '#10b981'
                }}
              ></div>
            </div>
          </div>

          <div className="data-card">
            <span className="card-label">Sistem Aksiyonu</span>
            <div className="card-text">{data.alinanAksiyon}</div>
          </div>

          {/* Patlama/Taşkın Tahmini Kartı */}
          <div className={`data-card risk-card ${patlamaDurumu === 'critical' ? 'critical' : ''}`}>
            <span className="card-label">Patlama / Taşkın Erken Uyarısı</span>
            <div className="card-text" style={{
              fontWeight: patlamaDurumu !== 'safe' ? '600' : '400',
              color: patlamaDurumu === 'critical' ? '#ef4444' : patlamaDurumu === 'warning' ? '#fbbf24' : '#10b981'
            }}>
              {patlamaTahmini}
            </div>
          </div>

          {data.zamanDamgasi && (
            <div className="data-card info-card">
              <span className="card-label">Son Veri Güncellemesi</span>
              <div className="card-text text-sm time-text">
                {new Date(data.zamanDamgasi).toLocaleTimeString('tr-TR')}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="error-message">
            <div className="error-icon">❌</div>
            <div className="error-text">{error}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
