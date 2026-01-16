import json
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from bs4 import BeautifulSoup
import httpx
from mangum import Mangum

# --- KONFIGURASI DOMAIN ---
LK21_BASE_URL = "https://tv7.lk21official.cc"
PLAYER_IFRAME_HOST = "playeriframe.sbs"
CLOUD_HOST = "cloud.hownetwork.xyz"

# --- ENGINE ---
class LK21Engine:
    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        }

    # --- FILTERS ---
    async def get_filters_metadata(self):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(LK21_BASE_URL, headers=self.headers)
            soup = BeautifulSoup(resp.text, 'html.parser')

            filters = {"genres": [], "countries": [], "years": [], "orders": []}

            # Genres
            genre_select = soup.select_one('select[name="genre1"]')
            if genre_select:
                for opt in genre_select.find_all('option'):
                    val = opt.get('value')
                    if val:
                        filters["genres"].append({
                            "title": opt.get_text(strip=True),
                            "parameter": f"genre/{val}"
                        })

            # Countries
            country_select = soup.select_one('select[name="country"]')
            if country_select:
                for opt in country_select.find_all('option'):
                    val = opt.get('value')
                    if val:
                        filters["countries"].append({
                            "title": opt.get_text(strip=True),
                            "parameter": f"country/{val}"
                        })

            # Years
            year_select = soup.select_one('select[name="tahun"]')
            if year_select:
                for opt in year_select.find_all('option'):
                    val = opt.get('value')
                    if val and val != "0":
                        filters["years"].append({
                            "title": opt.get_text(strip=True),
                            "parameter": f"year/{val}"
                        })

            # Orders
            order_select = soup.select_one('select.orderby')
            if order_select:
                for opt in order_select.find_all('option'):
                    val = opt.get('value')
                    if val:
                        filters["orders"].append({
                            "title": opt.get_text(strip=True),
                            "parameter": val.strip('/')
                        })

            return filters
        except Exception as e:
            print(f"[!] get_filters_metadata error: {e}")
            return {"genres": [], "countries": [], "years": [], "orders": []}

    # --- CATALOG ---
    async def scrape_catalog(self, page: int = 1, category: str = "top-movie-today"):
        url = f"{LK21_BASE_URL}/{category}/page/{page}" if page > 1 else f"{LK21_BASE_URL}/{category}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers=self.headers)
            if resp.status_code != 200:
                return []
            soup = BeautifulSoup(resp.text, 'html.parser')
            results = []

            for item in soup.select('.gallery-grid article'):
                try:
                    title_tag = item.select_one('.poster-title')
                    link_tag = item.select_one('a')
                    if not title_tag or not link_tag:
                        continue
                    slug = link_tag['href'].strip('/').split('/')[-1]
                    img_tag = item.select_one('img')
                    poster = img_tag['src'] if img_tag else None
                    rating_tag = item.select_one('[itemprop="ratingValue"]')
                    rating = rating_tag.get_text(strip=True) if rating_tag else "N/A"
                    quality_tag = item.select_one('.label')
                    quality = quality_tag.get_text(strip=True) if quality_tag else "Unknown"
                    results.append({
                        "title": title_tag.get_text(strip=True),
                        "slug": slug,
                        "poster": poster,
                        "rating": rating,
                        "quality": quality,
                        "url": f"{LK21_BASE_URL}/{slug}"
                    })
                except Exception:
                    continue
            return results
        except Exception as e:
            print(f"[!] scrape_catalog error: {e}")
            return []

    # --- SEARCH ---
    async def search_movies(self, query: str):
        url = f"{LK21_BASE_URL}/search"
        params = {'s': query}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, params=params, headers=self.headers)
            soup = BeautifulSoup(resp.text, 'html.parser')
            results = []
            items = soup.select('.search-item article') or soup.select('article.post')
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
            print(f"[!] search_movies error: {e}")
            return []

    # --- STREAM ---
    async def extract_stream_url(self, slug: str):
        page_url = f"{LK21_BASE_URL}/{slug}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(page_url, headers=self.headers)
            if resp.status_code != 200:
                raise Exception("Page not found")

            soup = BeautifulSoup(resp.text, 'html.parser')
            target_iframe_url = None

            # Player links
            for link in soup.select('#player-list li a'):
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
                raise Exception("Server P2P not found")

            hash_id = target_iframe_url.split('/')[-1]
            api_url = f"https://{CLOUD_HOST}/api2.php?id={hash_id}"
            payload = {'r': f"https://{PLAYER_IFRAME_HOST}/", 'd': CLOUD_HOST}
            api_headers = {
                'User-Agent': self.headers['User-Agent'],
                'Referer': f"https://{CLOUD_HOST}/video.php?id={hash_id}",
                'Origin': f"https://{CLOUD_HOST}",
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
            }

            async with httpx.AsyncClient(timeout=10.0) as client:
                api_resp = await client.post(api_url, headers=api_headers, data=payload)
            data = json.loads(api_resp.text)

            sources = []
            if isinstance(data, list):
                sources = data
            elif isinstance(data, dict) and "sources" in data:
                sources = data['sources']
            else:
                sources = [data]

            streams = [{"label": item.get("label", "Auto"), "type": "hls", "url": item["file"]} 
                        for item in sources if "file" in item]

            if not streams:
                raise Exception("Stream empty")

            return {"title": soup.title.string.split("|")[0].strip(), "slug": slug, "streams": streams}
        except Exception as e:
            print(f"[!] extract_stream_url error: {e}")
            raise HTTPException(status_code=500, detail=str(e))


# --- FASTAPI SETUP ---
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
@app.get("/filters", response_model=FilterResponse)
async def get_filters():
    return await engine.get_filters_metadata()

@app.get("/movies", response_model=List[MovieResult])
async def get_movies(category: str = "top-movie-today", page: int = 1):
    return await engine.scrape_catalog(page, category)

@app.get("/search", response_model=List[MovieResult])
async def search(q: str):
    return await engine.search_movies(q)

@app.get("/watch/{slug}", response_model=WatchResponse)
async def watch(slug: str):
    return await engine.extract_stream_url(slug)

# --- VERCEL HANDLER ---
handler = Mangum(app)
