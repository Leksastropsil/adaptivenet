import uvicorn
import requests
import json
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
from mangum import Mangum

# --- KONFIGURASI DOMAIN ---
LK21_BASE_URL = "https://tv7.lk21official.cc"
PLAYER_IFRAME_HOST = "playeriframe.sbs"
CLOUD_HOST = "cloud.hownetwork.xyz"

class LK21Engine:
    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        }

    # --- FITUR BARU: EXTRACT FILTERS ---
    def get_filters_metadata(self):
        """Mengambil opsi filter (Genre, Negara, Tahun) dari Homepage"""
        print(f"[*] Fetching Filters from: {LK21_BASE_URL}")
        try:
            resp = requests.get(LK21_BASE_URL, headers=self.headers, timeout=10)
            soup = BeautifulSoup(resp.text, 'html.parser')
            
            filters = {
                "genres": [],
                "countries": [],
                "years": [],
                "orders": []
            }

            # 1. Parse Genre
            genre_select = soup.select_one('select[name="genre1"]')
            if genre_select:
                for opt in genre_select.find_all('option'):
                    val = opt.get('value')
                    if val:
                        # Format value agar siap pakai di endpoint /movies
                        # Contoh: "action" -> "genre/action"
                        filters["genres"].append({
                            "title": opt.get_text(strip=True),
                            "parameter": f"genre/{val}" 
                        })

            # 2. Parse Negara
            country_select = soup.select_one('select[name="country"]')
            if country_select:
                for opt in country_select.find_all('option'):
                    val = opt.get('value')
                    if val:
                        filters["countries"].append({
                            "title": opt.get_text(strip=True),
                            "parameter": f"country/{val}"
                        })

            # 3. Parse Tahun
            year_select = soup.select_one('select[name="tahun"]')
            if year_select:
                for opt in year_select.find_all('option'):
                    val = opt.get('value')
                    if val and val != "0": # Skip default value
                        filters["years"].append({
                            "title": opt.get_text(strip=True),
                            "parameter": f"year/{val}"
                        })
            
            # 4. Parse Order By (Urutan)
            order_select = soup.select_one('select.orderby')
            if order_select:
                for opt in order_select.find_all('option'):
                    val = opt.get('value')
                    if val:
                        # Hapus slash depan belakang (misal: /populer/ -> populer)
                        clean_val = val.strip('/')
                        filters["orders"].append({
                            "title": opt.get_text(strip=True),
                            "parameter": clean_val
                        })

            return filters

        except Exception as e:
            print(f"[!] Error extracting filters: {e}")
            return {}

    def scrape_catalog(self, page: int = 1, category: str = "top-movie-today"):
        """Mengambil daftar film (Support Filter)"""
        # category bisa berupa: 'populer', 'genre/action', 'year/2024', 'country/usa'
        
        if page > 1:
            url = f"{LK21_BASE_URL}/{category}/page/{page}"
        else:
            url = f"{LK21_BASE_URL}/{category}"

        print(f"[*] Scraping Catalog: {url}")
        
        try:
            resp = requests.get(url, headers=self.headers, timeout=10)
            if resp.status_code != 200:
                return []
                
            soup = BeautifulSoup(resp.text, 'html.parser')
            results = []

            articles = soup.select('.gallery-grid article')
            
            for item in articles:
                try:
                    title_tag = item.select_one('.poster-title')
                    link_tag = item.select_one('a')
                    
                    if not title_tag or not link_tag:
                        continue
                        
                    title = title_tag.get_text(strip=True)
                    href = link_tag['href']
                    slug = href.strip('/').split('/')[-1]

                    img_tag = item.select_one('img')
                    poster = img_tag['src'] if img_tag else None

                    rating_tag = item.select_one('[itemprop="ratingValue"]')
                    rating = rating_tag.get_text(strip=True) if rating_tag else "N/A"

                    quality_tag = item.select_one('.label')
                    quality = quality_tag.get_text(strip=True) if quality_tag else "Unknown"
                    
                    duration_tag = item.select_one('.duration')
                    duration = duration_tag.get_text(strip=True) if duration_tag else "-"

                    results.append({
                        "title": title,
                        "slug": slug,
                        "poster": poster,
                        "rating": rating,
                        "quality": quality,
                        "duration": duration,
                        "url": f"{LK21_BASE_URL}/{slug}"
                    })
                except Exception:
                    continue
            
            return results

        except Exception as e:
            print(f"[!] Error Catalog: {e}")
            return []

    def search_movies(self, query: str):
        url = f"{LK21_BASE_URL}/search"
        params = {'s': query}
        try:
            resp = requests.get(url, params=params, headers=self.headers, timeout=10)
            soup = BeautifulSoup(resp.text, 'html.parser')
            results = []
            
            items = soup.select('.search-item article') 
            if not items:
                items = soup.select('article.post')

            for item in items:
                title_tag = item.select_one('h2 a') or item.select_one('.entry-title a')
                if title_tag:
                    slug = title_tag['href'].strip('/').split('/')[-1]
                    img_tag = item.select_one('img')
                    results.append({
                        "title": title_tag.get_text(strip=True),
                        "slug": slug,
                        "poster": img_tag['src'] if img_tag else None,
                        "url": title_tag['href']
                    })
            return results
        except Exception as e:
            return []

    def extract_stream_url(self, slug: str):
        page_url = f"{LK21_BASE_URL}/{slug}"
        print(f"[*] Processing Video: {page_url}")

        try:
            resp = requests.get(page_url, headers=self.headers, timeout=10)
            if resp.status_code != 200:
                raise Exception("Halaman 404")
            soup = BeautifulSoup(resp.text, 'html.parser')

            target_iframe_url = None
            player_links = soup.select('#player-list li a')
            for link in player_links:
                href = link.get('data-url', link.get('href'))
                if PLAYER_IFRAME_HOST in href and "p2p" in href:
                    target_iframe_url = href
                    break
            
            if not target_iframe_url:
                iframe = soup.find('iframe', id='main-player')
                if iframe:
                    src = iframe.get('src')
                    if PLAYER_IFRAME_HOST in src:
                        target_iframe_url = src

            if not target_iframe_url:
                raise Exception("Server P2P not found.")

            hash_id = target_iframe_url.split('/')[-1]
            api_url = f"https://{CLOUD_HOST}/api2.php?id={hash_id}"
            
            api_headers = {
                'User-Agent': self.headers['User-Agent'],
                'Referer': f"https://{CLOUD_HOST}/video.php?id={hash_id}",
                'Origin': f"https://{CLOUD_HOST}",
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
            }

            payload = {'r': f"https://{PLAYER_IFRAME_HOST}/", 'd': CLOUD_HOST}
            api_resp = requests.post(api_url, headers=api_headers, data=payload, timeout=10)
            data = json.loads(api_resp.text)
            
            streams = []
            sources = []
            if isinstance(data, list): sources = data
            elif isinstance(data, dict) and 'sources' in data: sources = data['sources']
            else: sources = [data]

            for item in sources:
                if 'file' in item:
                    streams.append({
                        "label": item.get('label', 'Auto'),
                        "type": "hls",
                        "url": item['file']
                    })
            
            if not streams: raise Exception("Stream Empty")

            return {
                "title": soup.title.string.split("|")[0].strip(),
                "slug": slug,
                "streams": streams
            }

        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

# --- API SETUP ---
app = FastAPI(title="LK21 API Full + Filters")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
engine = LK21Engine()

# --- MODELS ---
class FilterOption(BaseModel):
    title: str
    parameter: str

class FilterResponse(BaseModel):
    genres: List[FilterOption]
    countries: List[FilterOption]
    years: List[FilterOption]
    orders: List[FilterOption]

class MovieResult(BaseModel):
    title: str
    slug: str
    poster: Optional[str] = None
    rating: Optional[str] = None
    quality: Optional[str] = None
    url: str

class StreamItem(BaseModel):
    label: str
    type: str
    url: str

class WatchResponse(BaseModel):
    title: str
    slug: str
    streams: List[StreamItem]

# --- ENDPOINTS ---

@app.get("/filters", response_model=FilterResponse, tags=["General"])
def get_filters():
    """
    Dapatkan semua opsi filter (Genre, Tahun, Negara) yang tersedia di website.
    Gunakan nilai 'parameter' dari respon ini untuk endpoint /movies.
    """
    return engine.get_filters_metadata()

@app.get("/movies", response_model=List[MovieResult], tags=["Catalog"])
def get_movies(category: str = "top-movie-today", page: int = 1):
    """
    Ambil daftar film.
    Parameter 'category' bisa diisi dengan nilai dari endpoint /filters.
    Contoh: 'genre/action', 'year/2024', 'populer'.
    """
    return engine.scrape_catalog(page, category)

@app.get("/search", response_model=List[MovieResult], tags=["Search"])
def search(q: str):
    return engine.search_movies(q)

@app.get("/watch/{slug}", response_model=WatchResponse, tags=["Stream"])
def watch(slug: str):
    return engine.extract_stream_url(slug)

handler = Mangum(app)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)