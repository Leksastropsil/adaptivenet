# 🎬 LK21 API (Serverless Edition)

![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue?logo=typescript)
![Bun](https://img.shields.io/badge/Bun-1.0%2B-black?logo=bun)
![Vercel](https://img.shields.io/badge/Vercel-Edge-black?logo=vercel)
![Status](https://img.shields.io/badge/Status-Active-success)

**LK21 Unofficial API** high-performance version.
Ditulis ulang dari awal menggunakan **TypeScript** murni (tanpa framework berat seperti Express) untuk kompatibilitas **Bun** dan **Vercel Edge Runtime**.

Fokus utama versi ini adalah: **Low Latency**, **Cold Start Cepat**, dan **Edge Caching**.

## ✨ Fitur Utama

- 🚀 **Edge Native**: Berjalan di Vercel Edge Functions atau Bun.
- ⚡ **Zero Framework**: Menggunakan standard Web API (`Request`/`Response`) untuk overhead minimal.
- 🔓 **Advanced Bypass**: Logika scraping canggih untuk mengekstrak link HLS (`.m3u8`) dari proteksi ganda.
- � **Smart Caching**: Header cache `s-maxage` terintegrasi (8 menit untuk katalog, bypass untuk streaming).
- 🧹 **Clean Code**: Arsitektur modular dengan routing O(1) dan scraping berbasis `cheerio`.

## 🛠️ Instalasi & Menjalankan

Project ini membutuhkan **Bun** (atau Node.js dengan npm sebagai fallback).

### Menggunakan Bun

```bash
# Install dependencies
bun install

# Jalankan server development
bun run src/index.ts
```

### Menggunakan Vercel

```bash
# Deploy ke Vercel (Otomatis mendeteksi konfigurasi)
vercel deploy
```

## 📖 Dokumentasi API

Base URL (Local): `http://localhost:3000`
Host URL (Vercel): `https://lk-21-scrapper.vercel.app/`

### 1. Catalog & Discovery

| Method | Endpoint     | Deskripsi                               | Cache (Edge) |
| :----- | :----------- | :-------------------------------------- | :----------- |
| `GET`  | **/movies**  | Daftar film dengan pagination.          | 8 min        |
| `GET`  | **/search**  | Cari film berdasarkan judul.            | 8 min        |
| `GET`  | **/filters** | Metadata filter (Genre, Negara, Tahun). | 8 min        |

**Query Parameters `/movies`:**

- `page`: (int) Nomor halaman.
- `category`: (str) Slug dari endpoint `/filters`. Contoh: `top-movie-today`, `genre/action`, `year/2024`.

### 2. Streaming (The Heist)

| Method | Endpoint          | Deskripsi                       | Cache        |
| :----- | :---------------- | :------------------------------ | :----------- |
| `GET`  | **/watch/{slug}** | Ekstrak link streaming `.m3u8`. | **NO CACHE** |

**Contoh Response `/watch/avatar-fire-ash-2025`:**

```json
{
  "title": "Avatar: Fire and Ash",
  "slug": "avatar-fire-ash-2025",
  "streams": [
    {
      "label": "Auto",
      "type": "hls",
      "url": "https://cloud.hownetwork.xyz/zzz/HASH/index.m3u8"
    }
  ]
}
```

## 🧩 Strategi Pagination (Infinite Scroll)

API ini **tidak menyediakan** endpoint `GetAll` karena data di-scrape secara real-time dari ribuan halaman.
Gunakan pola **Page-Based Pagination** untuk menampilkan data.

### Logic Infinite Scroll (Frontend)

1.  **Initial Load**: Request `GET /movies?page=1`. Simpan dalam state.
2.  **Scroll Detection**: Saat user mencapai bawah layar, trigger loading.
3.  **Fetch Next**: Request `page + 1`.
4.  **Merge**: Gabungkan data baru ke data lama (`[...old, ...new]`).
5.  **Stop**: Jika return array kosong `[]`, berarti halaman habis.

### Contoh (JavaScript/React)

```javascript
let page = 1;
let allMovies = [];
let hasMore = true;

async function loadNext() {
  if (!hasMore) return;

  const res = await fetch(`/movies?page=${page}`);
  const newItems = await res.json();

  if (newItems.length === 0) {
    hasMore = false; // Data habis
  } else {
    allMovies = [...allMovies, ...newItems];
    page++;
  }
}
```

## 📂 Struktur Project

```
e:\CrackIdlix\
├── ts-api\               # Source code utama
│   ├── api/index.ts      # Vercel Edge Adapter
│   ├── src/
│   │   ├── index.ts      # Bun/Standard Entry Point
│   │   ├── router.ts     # O(1) Router & Cache Logic
│   │   ├── services/     # Scraping Logic (Cheerio)
│   │   └── utils/        # HTTP Helpers
│   └── scripts/          # Verification scripts
├── legacy/               # Kode lama (Rust/Python)
└── vercel.json           # Konfigurasi Vercel Routing
```

⚠️ **Disclaimer**
Project ini dibuat semata-mata untuk tujuan Edukasi dan Riset mengenai web scraping, reverse engineering, dan analisis lalu lintas jaringan. Pembuat tidak berafiliasi dengan LK21 atau penyedia konten manapun.
