# 🎬 LK21 API

**Edge-Native Scraping dengan Distributed Residential Execution**

> ⚠️ **Disclaimer**: Proyek ini dibuat **HANYA** untuk tujuan edukasi & riset teknis. Segala bentuk penyalahgunaan adalah tanggung jawab pengguna.

**Unofficial LK21 / Dunia21 API** yang dibangun langsung di edge.
Menggunakan arsitektur **Distributed Edge-to-Residential Proxy Network** untuk bertahan dari sistem anti-bot modern.

![Badge](https://img.shields.io/badge/Status-Active-success)
![Badge](https://img.shields.io/badge/Stack-Hono%20%7C%20Bun%20%7C%20Puppeteer-orange)

---

## 🧠 Tentang Proyek

Proyek ini menyediakan **API terprogram** untuk mengambil metadata dan sumber streaming dari LK21, dengan fokus utama pada **ketahanan terhadap Cloudflare Protection, Anti-Bot, dan IP Blocking**.

Alih-alih menggunakan proxy atau VPN datacenter yang mudah terdeteksi, sistem ini menerapkan **arsitektur hybrid edge + residential**:

1.  **Edge** digunakan sebagai _control plane_ global
2.  **Residential device** digunakan sebagai _data plane_ (eksekusi scraping)
3.  **Secure tunnel** menghubungkan keduanya tanpa mengekspos IP publik

Pendekatan ini membuat traffic API tampil sebagai aktivitas pengguna manusia biasa, baik dari sisi jaringan maupun browser.

---

## 🏗️ Arsitektur Sistem

**Autonomous · KV-Backed · Self-Healing**

API ini menggunakan **Split Architecture** dengan mekanisme _self-healing_ otomatis.

### 1. Server — Cloudflare Worker + KV (Control Plane)

- Berperan sebagai **Public API Gateway**
- Menangani request publik dengan latensi global rendah
- Mengambil URL tunnel aktif dari **KV Store**
- **Tidak melakukan scraping langsung** (aman dari pemblokiran)
- Dilindungi `ADMIN_SECRET` untuk registrasi tunnel
- **KV Store** digunakan sebagai _single source of truth_ untuk node residential yang aktif.

### 2. Magic Client — Laptop / VPS Residential (Data Plane)

- Berjalan di perangkat fisik dengan koneksi internet rumah
- Membuka **Cloudflare Tunnel** secara otomatis
- Mengirim URL tunnel ke Worker saat startup
- Melakukan scraping menggunakan **browser asli**
- Jika tunnel mati, client restart dan mendaftarkan ulang dirinya sendiri
- Client ini bersifat _stateless & replaceable_.

### 3. Headless Browser — Puppeteer (Execution Engine)

- Menggunakan Chrome asli
- Menghasilkan **TLS signature** dan HTTP header valid
- **Fingerprint browser identik** dengan pengguna manusia
- Menangani WAF dan challenge Cloudflare secara lokal

---

## 🔁 Visualisasi Arsitektur

```mermaid
graph TD
    User[🌍 Public User]

    subgraph Cloudflare Edge
        Worker[⚡ Cloudflare Worker (API Gateway)]
        KV[(🗄️ KV Store)]
    end

    subgraph Residential Network
        Client[💻 Client Magic (Laptop / Home Server)]
        Browser[🦁 Headless Browser]
    end

    Target[🎬 LK21 Server]

    %% Registration Flow
    Client -.->|"1. Auto-Register Tunnel URL\n(On Startup)"| Worker
    Worker -.->|"2. Save Tunnel URL"| KV

    %% Request Flow
    User ==>|"3. GET /movies"| Worker
    Worker ==>|"4. Get Active Tunnel"| KV
    Worker ==>|"5. Forward Request\n(Via Secure Tunnel)"| Client
    Client ==>|"6. Controls"| Browser
    Browser ==>|"7. Scrapes Content"| Target

    %% Return Path
    Target -.-> Browser
    Browser -.-> Client
    Client -.-> Worker
    Worker -.->|"8. JSON Response"| User
```

---

## 🌐 Distributed Edge-to-Residential Proxy Network

Sistem ini menerapkan **Hybrid Proxy Architecture** untuk melewati proteksi anti-bot modern.

### Konsep Utama

Alih-alih menggunakan IP datacenter (AWS, GCP, DO) yang langsung ditandai oleh WAF, sistem ini memisahkan identitas jaringan menjadi tiga lapisan:

1.  **Edge Layer — Control Plane**
    - **Teknologi**: Cloudflare Workers
    - **Peran**: Routing, session management, caching, dan orkestrasi
    - **Keunggulan**: Latensi rendah secara global, scalable, dan aman

2.  **Transit Layer — Secure Tunneling**
    - **Teknologi**: Cloudflare Tunnel (Zero Trust)
    - **Peran**: Jembatan terenkripsi antara edge dan node residential
    - **Keunggulan**:
      - Tidak perlu membuka port
      - Tidak mengekspos IP publik
      - Aman dan mudah dipulihkan

3.  **Residential Layer — Data Plane**
    - **Teknologi**: `client-magic.ts` (Bun + Puppeteer)
    - **Peran**: Eksekutor scraping sebenarnya
    - **Keunggulan**:
      - Menggunakan IP ISP rumah (IndiHome, Biznet, dll)
      - **Sangat jarang diblokir**
      - Browser fingerprint natural & valid

### 🎯 Mengapa Pendekatan Ini Efektif?

Sebagian besar proxy dan VPN publik memiliki label ASN "Datacenter" yang langsung diblokir.
Dengan memindahkan beban scraping ke **Residential Node**, sistem ini:

- Mendesentralisasi identitas jaringan
- Menghindari fingerprint datacenter
- Meniru perilaku manusia secara nyata
- Lebih tahan terhadap perubahan aturan WAF

Secara praktis, ini adalah **distribusi identitas + distribusi risiko**.

---

## 🚀 Getting Started

### Prasyarat

- [Bun](https://bun.sh) (v1.0+)
- [Cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) (terpasang di mesin klien)

### 1️⃣ Deploy Worker (Server Side)

Langkah ini hanya perlu dilakukan sekali.

```bash
# Install dependencies
bun install

# Login ke Cloudflare
bunx wrangler login

# Set secret admin
bunx wrangler secret put ADMIN_SECRET

# Deploy worker
bun run deploy
```

Simpan URL Worker, contoh:
`https://lk21-api.yourname.workers.dev`

### 2️⃣ Jalankan Magic Client (Residential Side)

Client ini melakukan scraping sebenarnya.

1.  **Konfigurasi Environment**

    ```bash
    cp .env.example .env
    ```

    Isi `.env`:

    ```properties
    WORKER_URL=https://lk21-api.yourname.workers.dev
    ADMIN_SECRET=my-super-secret-password
    ```

2.  **Jalankan Client**
    ```bash
    bun run client-magic.ts
    ```

Client akan otomatis:

- Membuka Cloudflare Tunnel
- Mendaftarkan URL tunnel ke Worker
- Menampilkan status API aktif
- **Tanpa copy-paste manual. Tanpa setup tambahan.**

---

## 📚 API Endpoints

**Base URL**: `https://lk21-api.yourname.workers.dev`

**Session**:
API menggunakan cookie `TUNNEL_SESSION`.
Cukup buka endpoint `/connect` sekali di browser atau app.

### 1. Get New Movies

```http
GET /movies?page=1
```

| Parameter  | Tipe     | Default           | Deskripsi        |
| :--------- | :------- | :---------------- | :--------------- |
| `page`     | `number` | `1`               | Nomor halaman    |
| `category` | `string` | `top-movie-today` | Lihat `/filters` |

### 2. Search Movies

```http
GET /search?q=avengers
```

### 3. Get Stream URL

```http
GET /watch/:slug
```

Contoh:
`/watch/avengers-endgame-2019`

### 4. Get Filters

```http
GET /filters
```

---

## 💡 Advanced Usage

### Pagination & Infinite Scroll

API mengikuti pagination asli LK21 (`?page=N`), sehingga cocok untuk **Infinite Scroll**.

#### React / Next.js

(menggunakan `swr` atau `tanstack-query`)

```tsx
import useSWRInfinite from "swr/infinite";

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function InfiniteMovieGrid() {
  const { data, size, setSize, isLoading } = useSWRInfinite(
    (index) => `https://lk21-api.yourname.workers.dev/movies?page=${index + 1}`,
    fetcher,
  );

  const movies = data ? data.flat() : [];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {movies.map((movie) => (
          <MovieCard key={movie.slug} movie={movie} />
        ))}
      </div>
      <button
        onClick={() => setSize(size + 1)}
        disabled={isLoading}
        className="w-full py-4 bg-gray-800 text-white"
      >
        {isLoading ? "Loading..." : "Load More"}
      </button>
    </div>
  );
}
```

#### Flutter / Dart

(menggunakan `infinite_scroll_pagination`)

```dart
class MovieListView extends StatefulWidget {
  @override
  _MovieListViewState createState() => _MovieListViewState();
}

class _MovieListViewState extends State<MovieListView> {
  final PagingController<int, Movie> _pagingController =
      PagingController(firstPageKey: 1);

  @override
  void initState() {
    _pagingController.addPageRequestListener((pageKey) {
      _fetchPage(pageKey);
    });
    super.initState();
  }

  Future<void> _fetchPage(int pageKey) async {
    try {
      final newItems = await ApiService.getMovies(page: pageKey);
      final isLastPage = newItems.isEmpty;
      if (isLastPage) {
        _pagingController.appendLastPage(newItems);
      } else {
        final nextPageKey = pageKey + 1;
        _pagingController.appendPage(newItems, nextPageKey);
      }
    } catch (error) {
      _pagingController.error = error;
    }
  }

  @override
  Widget build(BuildContext context) => PagedListView<int, Movie>(
        pagingController: _pagingController,
        builderDelegate: PagedChildBuilderDelegate<Movie>(
          itemBuilder: (context, item, index) => MovieListItem(movie: item),
        ),
      );
}
```

---

## 🛠️ Development

### Local Verification

```bash
npx tsx scripts/verify.ts
```

### Struktur Proyek

- `api/index.ts` — Cloudflare Worker (API Gateway)
- `client-magic.ts` — Residential Proxy Node
- `src/` — Shared utilities & types

---

## ⚠️ Disclaimer

Proyek ini dibuat untuk **tujuan edukasi dan riset teknis**.
Mengakses atau mendistribusikan konten berhak cipta tanpa izin dapat melanggar hukum di wilayah tertentu.
Penulis tidak bertanggung jawab atas penyalahgunaan sistem ini.
