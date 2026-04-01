# FinTrack - Aplikasi Manajemen Keuangan (PWA)

FinTrack adalah aplikasi berbasis web yang dirancang untuk membantu pengguna mengelola keuangan pribadi dengan mudah, aman, dan efisien. Aplikasi ini mendukung fitur PWA (Progressive Web App) sehingga dapat diinstal di perangkat Android, iOS, maupun Desktop.

## ✨ Fitur Utama
- **Dashboard Ringkasan**: Pantau total pemasukan, pengeluaran, dan saldo bersih secara real-time.
- **Manajemen Transaksi**: Tambah, edit, dan hapus transaksi dengan kategori yang dapat disesuaikan.
- **Grafik Interaktif**: Visualisasi data pengeluaran per kategori dan tren saldo menggunakan Chart.js.
- **Manajemen Anggaran (Budgeting)**: Atur anggaran bulanan per kategori dan dapatkan notifikasi saat pengeluaran mendekati atau melebihi batas.
- **Transaksi Berulang**: Otomatisasi transaksi mingguan, bulanan, atau tahunan.
- **Ekspor & Impor Data**: 
  - Ekspor laporan ke format **Excel (.xlsx)** dan **PDF**.
  - Impor data dari file Excel untuk kemudahan migrasi data.
- **PWA Ready**: Dapat diinstal dan diakses secara offline menggunakan Service Worker.
- **Mode Gelap/Terang**: Antarmuka yang responsif dan nyaman di mata.

## 📁 Struktur Proyek
Berikut adalah struktur folder dan file dalam proyek FinTrack:

```text
Financial Tracking App/
├── .well-known/           # Folder untuk verifikasi domain (Android App Links)
│   └── assetlinks.json    # Konfigurasi integrasi aplikasi Android
├── icons/                 # Folder ikon aplikasi (PNG)
├── app.js                 # Logika utama aplikasi (Data & UI Controller)
├── index.html             # Struktur halaman utama
├── manifest.json          # Konfigurasi PWA (Ikon, Warna, Nama)
├── offline.html           # Halaman fallback saat tidak ada koneksi internet
├── style.css              # Kustomisasi gaya (Utility-first dengan Tailwind)
├── sw.js                  # Service Worker untuk caching & akses offline
└── vercel.json            # Konfigurasi deployment untuk Vercel
```

## 🚀 Teknologi yang Digunakan
- **HTML5 & CSS3**
- **Tailwind CSS**: Framework CSS untuk desain responsif.
- **Vanilla JavaScript (ES6+)**: Logika aplikasi tanpa framework berat.
- **Chart.js**: Untuk visualisasi data dalam bentuk grafik.
- **SheetJS (XLSX)**: Untuk pengolahan data Excel.
- **jsPDF & AutoTable**: Untuk pembuatan dokumen PDF.
- **LocalStorage**: Penyimpanan data lokal di browser pengguna (Privasi Terjamin).

## 🛠️ Cara Penggunaan Lokal
1. Clone repositori ini:
   ```bash
   git clone https://github.com/username/fintrack.git
   ```
2. Buka folder proyek:
   ```bash
   cd "Financial Tracking App"
   ```
3. Jalankan `index.html` di browser Anda (disarankan menggunakan Live Server).

## 📱 Instalasi PWA
Untuk menginstal aplikasi di perangkat Anda:
1. Buka aplikasi di browser (Chrome/Edge/Safari).
2. Klik tombol **"Install App"** di navbar atau pilih **"Add to Home Screen"** pada menu browser.
3. Aplikasi kini dapat diakses langsung dari layar utama perangkat Anda.

## 📝 Lisensi
Proyek ini dibuat untuk tujuan pembelajaran dan penggunaan pribadi. Silakan gunakan dan modifikasi sesuai kebutuhan.
