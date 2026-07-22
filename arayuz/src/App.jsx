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
      <planeGeometry args={[150, 150]} />
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
const PipeWater = ({ riskLevel, length = 25 }) => {
  const surfaceRef = useRef();
  const bodyRef = useRef();
  // Suyu hizasından kesmek için bir clipping plane (kırpma düzlemi)
  const clipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), -2.5), []);

  // Renk hedefleri için statik referanslar (her karede yeniden obje oluşturmamak için)
  const targetColorObj = useMemo(() => new THREE.Color(), []);
  const targetEmissiveObj = useMemo(() => new THREE.Color(), []);

  useFrame((state, delta) => {
    // riskLevel (0 - 100+) -> doluluk oranı (0 ile 1 arası)
    const fillRatio = Math.min(1, Math.max(0.05, riskLevel / 100));

    // Borunun merkezine göre su yüzeyinin hedef yüksekliğini hesapla (-1.15 en dip, +1.15 en üst)
    const targetH = -1.15 + (fillRatio * 2.30);
    const currentH = clipPlane.constant + 2.5;

    // 1. YÜKSEKLİK İNTERPOLASYONU (Lerp): Su seviyesini pürüzsüzce hedefe taşı
    const lerpSpeed = 1.5; // Yaklaşık 2-3 saniyelik pürüzsüz geçiş hızı
    const newH = THREE.MathUtils.lerp(currentH, targetH, delta * lerpSpeed);

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

    // 2. RENK GEÇİŞİ (Color Lerp): Riske göre rengi pürüzsüzce değiştir
    const isHighRisk = riskLevel > 100;
    targetColorObj.set(isHighRisk ? '#ef4444' : '#0ea5e9');
    targetEmissiveObj.set(isHighRisk ? '#dc2626' : '#0284c7');
    const targetIntensity = isHighRisk ? 0.6 : 0.1;

    if (bodyRef.current) {
      bodyRef.current.color.lerp(targetColorObj, delta * lerpSpeed);
      bodyRef.current.emissive.lerp(targetEmissiveObj, delta * lerpSpeed);
      bodyRef.current.emissiveIntensity = THREE.MathUtils.lerp(bodyRef.current.emissiveIntensity, targetIntensity, delta * lerpSpeed);
    }
    if (surfaceRef.current) {
      surfaceRef.current.material.color.lerp(targetColorObj, delta * lerpSpeed);
      surfaceRef.current.material.emissive.lerp(targetEmissiveObj, delta * lerpSpeed);
      surfaceRef.current.material.emissiveIntensity = THREE.MathUtils.lerp(surfaceRef.current.material.emissiveIntensity, targetIntensity, delta * lerpSpeed);
    }
  });

  return (
    <group position={[0, -2.5, 0]}>
      {/* Su Hacmi (Kırpma düzlemi ile üstten kesilmiş silindir) */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[1.15, 1.15, length - 0.2, 64]} />
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
        <planeGeometry args={[length - 0.2, 1, 32, 1]} />
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

// --- YENİ MAHALLE VE AĞ BİLEŞENLERİ ---

const PipeSegment = ({ riskLevel, length }) => {
  return (
    <>
      <mesh position={[0, -2.5, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[1.2, 1.2, length, 32]} />
        <meshPhysicalMaterial color="#e2e8f0" transmission={0.95} transparent opacity={1} roughness={0.05} ior={1.5} thickness={0.5} depthWrite={false} />
      </mesh>
      <PipeWater riskLevel={riskLevel} length={length} />
    </>
  );
};

const CityBlock = ({ position, isHQ }) => {
  if (isHQ) {
    return (
      <group position={position}>
        <mesh position={[0, 4, 0]} castShadow receiveShadow>
          <boxGeometry args={[12, 8, 12]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} emissive="#0284c7" emissiveIntensity={0.2} />
        </mesh>
        <mesh position={[0, 8.5, 0]} castShadow>
          <boxGeometry args={[8, 1, 8]} />
          <meshStandardMaterial color="#0ea5e9" metalness={0.9} roughness={0.1} emissive="#0ea5e9" emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0, 9.5, 0]}>
          <sphereGeometry args={[1.5, 16, 16]} />
          <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={1} />
        </mesh>
      </group>
    );
  }

  const buildings = useMemo(() => {
    const arr = [];
    for(let i=0; i<4; i++) {
      const h = 2 + Math.random() * 6;
      const w = 3 + Math.random() * 2;
      const d = 3 + Math.random() * 2;
      const px = (Math.random() - 0.5) * 6;
      const pz = (Math.random() - 0.5) * 6;
      arr.push(
        <mesh key={i} position={[px, h/2, pz]} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#0f172a" metalness={0.6} roughness={0.4} />
        </mesh>
      );
    }
    return arr;
  }, []);

  return <group position={position}>{buildings}</group>;
};

const generateDefaultNetwork = () => {
  const data = [];
  const spacing = 16;
  const gridSize = 2;
  let idCounter = 0;
  for (let z = -gridSize; z <= gridSize; z++) {
    for (let x = -gridSize; x <= gridSize; x++) {
      if (x < gridSize) {
        data.push({
          id: `pipe-x-${idCounter++}`,
          startX: x * spacing,
          startZ: z * spacing,
          endX: (x + 1) * spacing,
          endZ: z * spacing,
          baseRiskOffset: Math.sin(x*4 + z*3) * 15
        });
      }
      if (z < gridSize) {
        data.push({
          id: `pipe-z-${idCounter++}`,
          startX: x * spacing,
          startZ: z * spacing,
          endX: x * spacing,
          endZ: (z + 1) * spacing,
          baseRiskOffset: Math.cos(x*2 + z*5) * 15
        });
      }
    }
  }
  return data;
};

const PipeNetwork = ({ riskLevel, isAutoBalanceEnabled, networkData, showBuildings }) => {
  const pipes = [];
  const blocks = [];
  const spacing = 16;
  const gridSize = 2; // Sadece binalar için tutuyoruz

  const applyBalance = (base) => {
    if (!isAutoBalanceEnabled) return base;
    if (riskLevel > 130) return base; // Kapasite tamamen aşıldı, sistem çöküyor
    // Kurtarılabilir durum: Yüksek riskleri alçalt, düşükleri yükselt
    const diff = base - 70;
    return 70 + (diff * 0.3); 
  };

  // 1. Binaları Çiz (Arka plan görseli için)
  if (showBuildings) {
    for (let z = -gridSize; z < gridSize; z++) {
      for (let x = -gridSize; x < gridSize; x++) {
         const isHQ = (x === 0 && z === 0);
         blocks.push(<CityBlock key={`block-${x}-${z}`} position={[x * spacing + spacing/2, 0, z * spacing + spacing/2]} isHQ={isHQ} />);
      }
    }
  }

  // 2. Kavşakları Çiz (Benzersiz koordinatlardan)
  const junctionMap = new Map();
  networkData.forEach(pipe => {
    junctionMap.set(`${pipe.startX},${pipe.startZ}`, {x: pipe.startX, z: pipe.startZ});
    junctionMap.set(`${pipe.endX},${pipe.endZ}`, {x: pipe.endX, z: pipe.endZ});
  });

  Array.from(junctionMap.values()).forEach((junc, i) => {
    const juncBase = riskLevel + (Math.sin(junc.x * junc.z) * 15);
    const juncRisk = applyBalance(juncBase);
    pipes.push(
      <mesh key={`junc-${i}`} position={[junc.x, -2.5, junc.z]} castShadow receiveShadow>
        <cylinderGeometry args={[1.4, 1.4, 2.6, 32]} />
        <meshStandardMaterial color={juncRisk > 100 ? '#ef4444' : '#1e293b'} metalness={0.8} roughness={0.4} />
      </mesh>
    );
  });

  // 3. Boruları Dinamik Olarak Çiz (Data-Driven)
  networkData.forEach(pipe => {
    const dx = pipe.endX - pipe.startX;
    const dz = pipe.endZ - pipe.startZ;
    const length = Math.hypot(dx, dz);
    // Three.js'te varsayılan silindir Y eksenindedir. 
    // PipeSegment içinde [0, 0, Math.PI/2] ile X eksenine yatırdık.
    // Şimdi bu X eksenindeki objeyi Y ekseni etrafında döndürerek hedefe yönlendiriyoruz.
    const rotY = Math.atan2(-dz, dx);
    const midX = (pipe.startX + pipe.endX) / 2;
    const midZ = (pipe.startZ + pipe.endZ) / 2;

    const localRisk = applyBalance(riskLevel + (pipe.baseRiskOffset || 0));

    pipes.push(
      <group key={pipe.id} position={[midX, 0, midZ]} rotation={[0, rotY, 0]}>
        <PipeSegment riskLevel={localRisk} length={length} />
      </group>
    );
  });

  return (
    <>
      <group>{blocks}</group>
      <group>{pipes}</group>
    </>
  );
};

const Scene = ({ riskLevel, isAutoBalanceEnabled, networkData, showBuildings }) => {
  const isHighRisk = isAutoBalanceEnabled ? riskLevel > 130 : riskLevel > 100;

  return (
    <>
      <OrbitControls makeDefault enableDamping dampingFactor={0.05} maxPolarAngle={Math.PI / 2 - 0.05} target={[10, 0, 10]} />

      <ambientLight intensity={0.4} />
      <directionalLight 
        position={[20, 40, 20]} 
        intensity={1.5} 
        castShadow 
        shadow-mapSize={[2048, 2048]} 
        shadow-camera-far={150} 
        shadow-camera-left={-60} 
        shadow-camera-right={60} 
        shadow-camera-top={60} 
        shadow-camera-bottom={-60} 
      />
      <Environment preset="city" />

      {/* Grid Helper for technical look */}
      <Grid infiniteGrid fadeDistance={100} sectionColor="#475569" cellColor="#334155" />

      {/* Street Level / Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial
          color="#0f172a"
          transparent
          opacity={0.85}
          depthWrite={false}
          roughness={0.8}
        />
      </mesh>

      {/* City Blocks & Pipe Network */}
      <PipeNetwork riskLevel={riskLevel} isAutoBalanceEnabled={isAutoBalanceEnabled} networkData={networkData} showBuildings={showBuildings} />

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

  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [isAutoBalanceEnabled, setIsAutoBalanceEnabled] = useState(false);
  const [simRainfall, setSimRainfall] = useState(45);
  const [simCapacity, setSimCapacity] = useState(30);
  const [simPipeAge, setSimPipeAge] = useState(25);

  const [networkData, setNetworkData] = useState(() => generateDefaultNetwork());
  const [showNetworkEditor, setShowNetworkEditor] = useState(false);
  const [showBuildings, setShowBuildings] = useState(true);
  const [newPipe, setNewPipe] = useState({ startX: 0, startZ: 0, endX: 16, endZ: 16 });

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split('\n');
      const newNetwork = [];
      
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols = lines[i].split(',');
        if (cols.length >= 5) {
          newNetwork.push({
            id: cols[0].trim(),
            startX: parseFloat(cols[1]),
            startZ: parseFloat(cols[2]),
            endX: parseFloat(cols[3]),
            endZ: parseFloat(cols[4]),
            baseRiskOffset: (Math.random() - 0.5) * 20
          });
        }
      }
      if (newNetwork.length > 0) {
        setNetworkData(newNetwork);
        alert(`${newNetwork.length} adet boru hattı başarıyla yüklendi!`);
      }
    };
    reader.readAsText(file);
  };

  const handleAddPipe = () => {
    const pipe = {
      id: `manual-${Date.now()}`,
      startX: parseFloat(newPipe.startX),
      startZ: parseFloat(newPipe.startZ),
      endX: parseFloat(newPipe.endX),
      endZ: parseFloat(newPipe.endZ),
      baseRiskOffset: 0
    };
    setNetworkData([...networkData, pipe]);
  };

  const handleDeletePipe = (id) => {
    setNetworkData(networkData.filter(p => p.id !== id));
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        let url = 'http://localhost:3000/api/risk-analizi';
        if (isSimulationMode) {
          url += `?simMode=true&rain=${simRainfall}&cap=${simCapacity}&age=${simPipeAge}`;
        }
        const response = await axios.get(url);

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
  }, [isSimulationMode, simRainfall, simCapacity, simPipeAge]);

  // Backend veriyi "%15.0" şeklinde string olarak dönüyor, sayıyı ayıklamamız lazım
  const riskValue = typeof data.hesaplananRisk === 'string'
    ? parseFloat(data.hesaplananRisk.replace('%', ''))
    : (data.hesaplananRisk || 0);

  const isHighRisk = isAutoBalanceEnabled ? riskValue > 130 : riskValue > 100;

  // Dinamik Aksiyon Metni
  let actionText = data.alinanAksiyon;
  if (isAutoBalanceEnabled && riskValue > 100 && riskValue <= 130) {
    actionText = "🤖 OTONOM YÖNLENDİRME AKTİF! Fazla su komşu hatlara dağıtılarak taşkın engellendi.";
  } else if (isAutoBalanceEnabled && riskValue > 130) {
    actionText = "❌ SİSTEM ÇÖKTÜ! Dengeleme kapasitesi aşıldı, taşkın engellenemiyor!";
  }

  // Patlama ve taşkın tahmini hesaplama
  let patlamaTahmini;
  let patlamaDurumu;

  if (isHighRisk) {
    patlamaTahmini = "KRİTİK DURUM: Boru kapasitesi aşıldı, taşkın/patlama anı!";
    patlamaDurumu = "critical";
  } else if (riskValue > 60) {
    const kalanYuzde = (isAutoBalanceEnabled ? 130 : 100) - riskValue;
    // Riske göre ivmeli bir formül
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
        <Canvas shadows camera={{ position: [30, 25, 40], fov: 45 }} gl={{ localClippingEnabled: true }}>
          <Scene riskLevel={riskValue} isAutoBalanceEnabled={isAutoBalanceEnabled} networkData={networkData} showBuildings={showBuildings} />
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
          {/* Altyapı Veri Yöneticisi Butonu */}
          <div className="data-card" style={{ padding: '0.5rem' }}>
             <button className="action-btn" style={{ width: '100%' }} onClick={() => setShowNetworkEditor(true)}>
               🗺️ Altyapı Veri Yöneticisi (GIS)
             </button>
          </div>

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
            <div className="card-text">{actionText}</div>
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

          {/* Simülasyon Kartı (Manuel Kontrol) */}
          <div className="data-card simulation-card">
            <div className="sim-header">
              <span className="card-label" style={{ marginBottom: 0 }}>Simülasyon Modu (Manuel)</span>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={isSimulationMode} 
                  onChange={(e) => setIsSimulationMode(e.target.checked)}
                />
                <span className="toggle-slider round"></span>
              </label>
            </div>

            <div className="sim-header" style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
              <span className="card-label" style={{ marginBottom: 0 }}>🏢 Binaları Gizle/Göster</span>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={showBuildings} 
                  onChange={(e) => setShowBuildings(e.target.checked)}
                />
                <span className="toggle-slider round"></span>
              </label>
            </div>

            <div className="sim-header" style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
              <span className="card-label" style={{ marginBottom: 0, color: '#38bdf8' }}>🤖 Otonom Yük Dengeleme</span>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={isAutoBalanceEnabled} 
                  onChange={(e) => setIsAutoBalanceEnabled(e.target.checked)}
                />
                <span className="toggle-slider round"></span>
              </label>
            </div>
            
            <div className={`sim-controls-wrapper ${isSimulationMode ? 'open' : ''}`}>
              <div className="sim-controls">
                <div className="slider-group">
                  <div className="slider-label">
                    <span>🌧️ Yağış Miktarı</span>
                    <span>{simRainfall} mm/h</span>
                  </div>
                  <input type="range" className="glass-range" min="0" max="150" value={simRainfall} onChange={(e) => setSimRainfall(Number(e.target.value))} />
                </div>
                
                <div className="slider-group">
                  <div className="slider-label">
                    <span>🚰 Boru Kapasitesi</span>
                    <span>%{simCapacity}</span>
                  </div>
                  <input type="range" className="glass-range" min="10" max="100" value={simCapacity} onChange={(e) => setSimCapacity(Number(e.target.value))} />
                </div>
                
                <div className="slider-group">
                  <div className="slider-label">
                    <span>⏳ Boru Yaşı</span>
                    <span>{simPipeAge} Yıl</span>
                  </div>
                  <input type="range" className="glass-range" min="1" max="50" value={simPipeAge} onChange={(e) => setSimPipeAge(Number(e.target.value))} />
                </div>
              </div>
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

      {/* Network Editor Modal */}
      {showNetworkEditor && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 style={{margin:0}}>🗺️ Altyapı Ağ Düzenleyicisi (GIS)</h2>
              <button className="close-btn" onClick={() => setShowNetworkEditor(false)}>✖</button>
            </div>
            
            <div className="form-group">
              <div className="input-field">
                <label>CSV Dosyası Yükle</label>
                <input type="file" accept=".csv" onChange={handleFileUpload} />
                <small style={{color: '#94a3b8'}}>Format: id, startX, startZ, endX, endZ</small>
              </div>
            </div>

            <hr style={{ borderColor: 'rgba(255,255,255,0.1)' }} />

            <div className="form-group">
              <div className="input-field"><label>Start X</label><input type="number" value={newPipe.startX} onChange={e => setNewPipe({...newPipe, startX: e.target.value})} /></div>
              <div className="input-field"><label>Start Z</label><input type="number" value={newPipe.startZ} onChange={e => setNewPipe({...newPipe, startZ: e.target.value})} /></div>
              <div className="input-field"><label>End X</label><input type="number" value={newPipe.endX} onChange={e => setNewPipe({...newPipe, endX: e.target.value})} /></div>
              <div className="input-field"><label>End Z</label><input type="number" value={newPipe.endZ} onChange={e => setNewPipe({...newPipe, endZ: e.target.value})} /></div>
              <button className="action-btn" onClick={handleAddPipe}>+ Ekle</button>
            </div>

            <div className="pipe-list">
              {networkData.map(pipe => (
                <div key={pipe.id} className="pipe-item">
                  <span>{pipe.id} ({pipe.startX}, {pipe.startZ} &rarr; {pipe.endX}, {pipe.endZ})</span>
                  <button className="action-btn danger-btn" style={{padding:'0.3rem 0.6rem'}} onClick={() => handleDeletePipe(pipe.id)}>Sil</button>
                </div>
              ))}
            </div>

            <button className="action-btn danger-btn" style={{marginTop: '1rem'}} onClick={() => setNetworkData([])}>Tüm Ağı Temizle</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
