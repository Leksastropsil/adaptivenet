use crate::models::{FilterOption, FilterResponse, MovieResult, StreamItem, WatchResponse};
use anyhow::{Context, Result};
use reqwest::Client;
use scraper::{Html, Selector};
use serde_json::Value; // For parsing dynamic JSON response
use std::collections::HashMap;

const LK21_BASE_URL: &str = "https://tv7.lk21official.cc";
const PLAYER_IFRAME_HOST: &str = "playeriframe.sbs";
const CLOUD_HOST: &str = "cloud.hownetwork.xyz";

#[derive(Clone)]
pub struct LK21Engine {
    client: Client,
}

impl LK21Engine {
    pub fn new() -> Self {
        let client = Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36")
            .build()
            .unwrap_or_else(|_| Client::new());
        Self { client }
    }

    pub async fn get_filters_metadata(&self) -> Result<FilterResponse> {
        let resp = self.client.get(LK21_BASE_URL).send().await?.text().await?;
        let document = Html::parse_document(&resp);

        let mut filters = FilterResponse {
            genres: vec![],
            countries: vec![],
            years: vec![],
            orders: vec![],
        };

        // Helper to extract options
        let extract_options = |selector_str: &str, format_fn: fn(&str) -> String| -> Vec<FilterOption> {
            let selector = Selector::parse(selector_str).unwrap();
            let mut options = vec![];
            if let Some(select) = document.select(&selector).next() {
                let option_selector = Selector::parse("option").unwrap();
                for element in select.select(&option_selector) {
                    if let Some(val) = element.value().attr("value") {
                        if !val.is_empty() && val != "0" {
                           let title = element.text().collect::<Vec<_>>().join("").trim().to_string();
                           match title.as_str() { 
                               "" => continue,
                               _ => {
                                   options.push(FilterOption {
                                       title,
                                       parameter: format_fn(val),
                                   });
                               }
                           }
                        }
                    }
                }
            }
            options
        };

        filters.genres = extract_options("select[name=\"genre1\"]", |v| format!("genre/{}", v));
        filters.countries = extract_options("select[name=\"country\"]", |v| format!("country/{}", v));
        filters.years = extract_options("select[name=\"tahun\"]", |v| format!("year/{}", v));
        filters.orders = extract_options("select.orderby", |v| v.trim_matches('/').to_string());

        Ok(filters)
    }

    pub async fn scrape_catalog(&self, page: i32, category: &str) -> Result<Vec<MovieResult>> {
        let url = if page > 1 {
            format!("{}/{}/page/{}", LK21_BASE_URL, category, page)
        } else {
            format!("{}/{}", LK21_BASE_URL, category)
        };

        let resp = self.client.get(&url).send().await?.text().await?;
        let document = Html::parse_document(&resp);
        let article_selector = Selector::parse(".gallery-grid article").unwrap();
        
        let mut results = vec![];

        for element in document.select(&article_selector) {
             // title & link
             let title_sel = Selector::parse(".poster-title").unwrap();
             let link_sel = Selector::parse("a").unwrap();
             
             let title = match element.select(&title_sel).next() {
                 Some(el) => el.text().collect::<Vec<_>>().join("").trim().to_string(),
                 None => continue,
             };
             
             let (href, slug) = match element.select(&link_sel).next() {
                 Some(el) => {
                     let h = el.value().attr("href").unwrap_or("").to_string();
                     let s = h.trim_matches('/').split('/').last().unwrap_or("").to_string();
                     (h, s)
                 },
                 None => continue,
             };
             
             // poster
             let img_sel = Selector::parse("img").unwrap();
             let poster = element.select(&img_sel).next().and_then(|el| el.value().attr("src").map(|s| s.to_string()));

             // rating
             let rating_sel = Selector::parse("[itemprop=\"ratingValue\"]").unwrap();
             let rating = element.select(&rating_sel).next().map(|el| el.text().collect::<Vec<_>>().join("").trim().to_string());

             // quality
             let quality_sel = Selector::parse(".label").unwrap();
             let quality = element.select(&quality_sel).next().map(|el| el.text().collect::<Vec<_>>().join("").trim().to_string());
             
             results.push(MovieResult {
                 title,
                 slug,
                 poster,
                 rating,
                 quality,
                 url: Some(format!("{}/{}", LK21_BASE_URL, slug)), // Reconstruct full url just in case
             });
        }

        Ok(results)
    }
    
    pub async fn search_movies(&self, query: &str) -> Result<Vec<MovieResult>> {
         let url = format!("{}/search", LK21_BASE_URL);
         let params = [("s", query)];
         
         let resp = self.client.get(&url).query(&params).send().await?.text().await?;
         let document = Html::parse_document(&resp);
         
         let mut results = vec![];
         // Try .search-item article first, fallback to article.post
         let s1 = Selector::parse(".search-item article").unwrap();
         let s2 = Selector::parse("article.post").unwrap();
         
         let selector = if document.select(&s1).count() > 0 { s1 } else { s2 };

         for element in document.select(&selector) {
             let h2_a = Selector::parse("h2 a").unwrap();
             let entry_title_a = Selector::parse(".entry-title a").unwrap();
             
             let title_el = element.select(&h2_a).next().or_else(|| element.select(&entry_title_a).next());
             
             if let Some(el) = title_el {
                 let title = el.text().collect::<Vec<_>>().join("").trim().to_string();
                 let href = el.value().attr("href").unwrap_or("").to_string();
                 let slug = href.trim_matches('/').split('/').last().unwrap_or("").to_string();
                 
                 let img_sel = Selector::parse("img").unwrap();
                 let poster = element.select(&img_sel).next().and_then(|e| e.value().attr("src").map(|s| s.to_string()));
                 
                 results.push(MovieResult {
                     title,
                     slug,
                     poster,
                     rating: None,
                     quality: None,
                     url: Some(href),
                 });
             }
         }
         
         Ok(results)
    }

    pub async fn extract_stream_url(&self, slug: &str) -> Result<WatchResponse> {
        let page_url = format!("{}/{}", LK21_BASE_URL, slug);
        let resp = self.client.get(&page_url).send().await?;
        if resp.status() != 200 {
            anyhow::bail!("Page not found");
        }
        let text = resp.text().await?;
        let document = Html::parse_document(&text);

        // Title
        let title_sel = Selector::parse("title").unwrap();
        let title_full = document.select(&title_sel).next().map(|t| t.text().collect::<Vec<_>>().join("")).unwrap_or_default();
        let title = title_full.split('|').next().unwrap_or("").trim().to_string();

        let mut target_iframe_url = None;

        // Check player list
        let player_list_sel = Selector::parse("#player-list li a").unwrap();
        for element in document.select(&player_list_sel) {
            let href = element.value().attr("data-url").or_else(|| element.value().attr("href")).unwrap_or("");
            if href.contains(PLAYER_IFRAME_HOST) && href.contains("p2p") {
                target_iframe_url = Some(href.to_string());
                break;
            }
        }

        // Fallback main player
        if target_iframe_url.is_none() {
            let iframe_sel = Selector::parse("iframe#main-player").unwrap();
             if let Some(iframe) = document.select(&iframe_sel).next() {
                 if let Some(src) = iframe.value().attr("src") {
                     if src.contains(PLAYER_IFRAME_HOST) {
                         target_iframe_url = Some(src.to_string());
                     }
                 }
             }
        }

        let target_url = target_iframe_url.context("Server P2P not found")?;
        let hash_id = target_url.split('/').last().unwrap_or("").to_string();

        // Call API backend
        let api_url = format!("https://{}/api2.php?id={}", CLOUD_HOST, hash_id);
        let mut form_data = HashMap::new();
        form_data.insert("r", format!("https://{}/", PLAYER_IFRAME_HOST));
        form_data.insert("d", CLOUD_HOST.to_string());

        let api_resp = self.client.post(&api_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36")
            .header("Referer", format!("https://{}/video.php?id={}", CLOUD_HOST, hash_id))
            .header("Origin", format!("https://{}", CLOUD_HOST))
            .header("X-Requested-With", "XMLHttpRequest")
            .form(&form_data)
            .send()
            .await?;

        let json_text = api_resp.text().await?;
        let json_data: Value = serde_json::from_str(&json_text).unwrap_or(Value::Null);

        let mut streams = vec![];
        
        let parse_source = |item: &Value| -> Option<StreamItem> {
             if let Some(file) = item.get("file").and_then(|v| v.as_str()) {
                 let label = item.get("label").and_then(|v| v.as_str()).unwrap_or("Auto").to_string();
                 Some(StreamItem {
                     label,
                     stream_type: "hls".to_string(),
                     url: file.to_string(),
                 })
             } else {
                 None
             }
        };

        if let Some(arr) = json_data.as_array() {
            for item in arr {
                if let Some(s) = parse_source(item) { streams.push(s); }
            }
        } else if let Some(obj) = json_data.as_object() {
            if let Some(sources) = obj.get("sources").and_then(|v| v.as_array()) {
                for item in sources {
                   if let Some(s) = parse_source(item) { streams.push(s); }
                }
            } else if let Some(s) = parse_source(&json_data) {
                streams.push(s);
            }
        }

        if streams.is_empty() {
            anyhow::bail!("Stream empty");
        }

        Ok(WatchResponse {
            title,
            slug: slug.to_string(),
            streams,
        })
    }
}
