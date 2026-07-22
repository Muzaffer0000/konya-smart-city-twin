const express = require('express');
const cors = require('cors');
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// KENDİ API ANAHTARINI BURAYA YAZ
const API_KEY = '08f8452cb833c0712443eb3cea69346a';
const SEHIR = 'Konya';

// 1. CANLI HAVA DURUMU GETİRİCİ (Beynin dış dünyadaki gözü)
const getCanliYagis = async () => {
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${SEHIR}&appid=${API_KEY}&units=metric&lang=tr`;
  const response = await fetch(url);
  const data = await response.json();

  // Eğer yağmur yağıyorsa 1 saatlik miktarı al, yağmıyorsa 0 döndür
  return data.rain ? data.rain['1h'] : 0;
};

// 2. ESKİ SİSTEM SİMÜLASYONU (SOAP)
const getAltyapiVerisi = () => {
  return {
    sokak: "İhsaniye Mah. / KOSKİ Kampüsü",
    drenajKapasitesi_mm: 30, // Saatte en fazla 30kg su çekebilir
    boruYasi_yil: 25,
    zeminTipi: "Asfalt"
  };
};

// 3. CANLI HAVA DURUMU UÇ NOKTASI (Sadece izlemek için)
app.get('/api/hava-durumu', async (req, res) => {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${SEHIR}&appid=${API_KEY}&units=metric&lang=tr`;
    const response = await fetch(url);
    const data = await response.json();

    res.json({
      lokasyon: data.name,
      genelDurum: data.weather[0].description,
      sicaklik: data.main.temp + " °C",
      yagis_mm: data.rain ? data.rain['1h'] : 0
    });
  } catch (error) {
    res.status(500).json({ hata: "Hava durumu çekilemedi." });
  }
});

// 4. CANLI RİSK MOTORU VE SİMÜLASYON MODU
app.get('/api/risk-analizi', async (req, res) => {
  try {
    // Frontend'den gelen URL parametrelerini (Query Params) yakala
    const isSimMode = req.query.simMode === 'true';
    const simRain = parseFloat(req.query.rain);
    const simCap = parseFloat(req.query.cap);
    const simAge = parseInt(req.query.age);

    let anlikYagis;
    let altyapi;

    if (isSimMode) {
      // A) SİMÜLASYON: Kullanıcının arayüzden gönderdiği değerleri kullan
      anlikYagis = isNaN(simRain) ? 0 : simRain;
      altyapi = {
        sokak: "İhsaniye Mah. / KOSKİ Kampüsü (Simülasyon)",
        drenajKapasitesi_mm: isNaN(simCap) ? 30 : simCap,
        boruYasi_yil: isNaN(simAge) ? 25 : simAge,
        zeminTipi: "Asfalt"
      };
    } else {
      // B) OTONOM: Gerçek dış dünyadan ve sabit veritabanından al
      anlikYagis = await getCanliYagis();
      altyapi = getAltyapiVerisi();
    }

    // C) RİSK ALGORİTMASI (Matematik hiç değişmiyor)
    let riskYuzdesi = (anlikYagis / altyapi.drenajKapasitesi_mm) * 100;

    // Eski boru cezası (Kombinasyon)
    if (altyapi.boruYasi_yil > 20) {
      riskYuzdesi += 15;
    }

    // D) OTONOM KARAR MEKANİZMASI
    let otonomKarar = "Sorun Yok, Akış Normal";
    if (riskYuzdesi > 100) {
      otonomKarar = "KIRMIZI ALARM! Kapasite Aşıldı. Suyu başka bölgeye kaydır!";
    } else if (riskYuzdesi > 75) {
      otonomKarar = "Sarı Uyarı: Ekipleri bölgeye sevk et, kapasite sınırda.";
    }

    res.json({
      analizBolgesi: altyapi.sokak,
      gercekZamanliYagis: anlikYagis + " mm",
      altyapiKapasitesi: altyapi.drenajKapasitesi_mm + " mm",
      hesaplananRisk: "%" + riskYuzdesi.toFixed(1),
      alinanAksiyon: otonomKarar
    });

  } catch (error) {
    console.error("Risk motoru hatası:", error);
    res.status(500).json({ hata: "Risk motoru çalışırken bir arıza oluştu." });
  }
});

app.listen(port, () => {
  console.log(`Canlı Verili Sistem Aktif! http://localhost:${port}`);
});