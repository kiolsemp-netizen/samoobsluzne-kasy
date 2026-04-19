#!/usr/bin/env python3
"""
mercucio_scraper.py - Scraper produktů z mercucio.cz
============================================================================
Stahuje produkty z kategorií peněženky, kabelky, opasky, kožené doplňky.

Výstup:
    mercucio_products/products.json   - všechna data (přímo kompatibilní s import_products.js)
    mercucio_products/images/         - stažené obrázky

Použití:
    pip install requests beautifulsoup4 lxml
    python3 mercucio_scraper.py [--category penezenky] [--limit 50]

Etiketa:
    - 1.5s delay mezi requesty
    - respektuje robots.txt (ručně ověřeno)
    - User-Agent: jasně identifikovatelný
"""

import os
import re
import sys
import json
import time
import argparse
from pathlib import Path
from urllib.parse import urljoin, urlparse

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Chybí závislosti: pip install requests beautifulsoup4 lxml")
    sys.exit(1)


BASE_URL = "https://www.mercucio.cz"
CATEGORIES = {
    "penezenky": "/penezenky/",
    "kabelky": "/kozene-kabelky/",
    "opasky": "/opasky/",
    "kozene-doplnky": "/kozene-doplnky/",
}
DELAY_SECONDS = 1.5
TIMEOUT = 15
OUTPUT_DIR = Path("mercucio_products")
HEADERS = {
    "User-Agent": "StanekOSBot/1.0 (prodejna kozenych doplnku; kontakt@example.cz)",
    "Accept-Language": "cs-CZ,cs;q=0.9",
}


def clean_price(text: str) -> float:
    """'1 890 Kč' -> 1890.0"""
    if not text:
        return 0.0
    m = re.search(r"([\d\s]+[,.]?\d*)", text.replace("\xa0", " "))
    if not m:
        return 0.0
    num = m.group(1).replace(" ", "").replace(",", ".")
    try:
        return float(num)
    except ValueError:
        return 0.0


def fetch(url: str) -> BeautifulSoup | None:
    """Stáhne URL a vrátí BeautifulSoup. Respektuje delay."""
    try:
        time.sleep(DELAY_SECONDS)
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, "lxml")
    except Exception as e:
        print(f"  ⚠ Chyba {url}: {e}")
        return None


def download_image(url: str, dest: Path) -> bool:
    if dest.exists():
        return True
    try:
        time.sleep(0.3)
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        resp.raise_for_status()
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(resp.content)
        return True
    except Exception as e:
        print(f"    img fail: {e}")
        return False


def parse_product_page(url: str, category_slug: str) -> dict | None:
    """Stáhne detail produktu."""
    soup = fetch(url)
    if not soup:
        return None

    # Název
    title_el = soup.select_one("h1") or soup.select_one("[itemprop=name]")
    if not title_el:
        print(f"  ⚠ Nenalezen title: {url}")
        return None
    name = title_el.get_text(strip=True)

    # Cena (různé selektory - try multiple)
    price = 0.0
    for sel in [".price", "[itemprop=price]", ".product-price", ".price-value", "span.price"]:
        el = soup.select_one(sel)
        if el:
            p = clean_price(el.get_text())
            if p > 0:
                price = p
                break

    # Popis
    description = ""
    desc_el = soup.select_one(".product-description") or soup.select_one("[itemprop=description]")
    if desc_el:
        description = desc_el.get_text(separator="\n", strip=True)[:1000]

    # Obrázky (max 5)
    images = []
    for img in soup.select(".product-gallery img, .gallery img, [itemprop=image]"):
        src = img.get("src") or img.get("data-src") or img.get("data-original")
        if src:
            full = urljoin(url, src)
            if full not in images:
                images.append(full)
        if len(images) >= 5:
            break

    # SKU nebo z URL
    sku = None
    sku_el = soup.select_one("[itemprop=sku]") or soup.select_one(".product-sku")
    if sku_el:
        sku = sku_el.get_text(strip=True)
    if not sku:
        # Fallback: poslední část slugu URL
        slug_part = urlparse(url).path.rstrip("/").split("/")[-1]
        sku = re.sub(r"[^a-z0-9\-]", "", slug_part.lower())[:50] or None

    # Barva (z attributes tabulky nebo názvu)
    color = None
    for row in soup.select(".product-attributes tr, .params tr"):
        cells = row.find_all(["td", "th"])
        if len(cells) >= 2:
            label = cells[0].get_text(strip=True).lower()
            if "barva" in label:
                color = cells[1].get_text(strip=True)
                break

    return {
        "sku": sku,
        "name": name,
        "description": description,
        "price_czk": price,
        "category_slug": category_slug,
        "color": color,
        "images": images,
        "source_url": url,
    }


def find_product_links(category_url: str) -> list[str]:
    """Projde stránkování kategorie a vrátí všechny product URL."""
    links = set()
    url = category_url
    page = 1

    while url:
        print(f"[{category_url}] stránka {page}...")
        soup = fetch(url)
        if not soup:
            break

        # Najdi produktové odkazy (různé selektory)
        for a in soup.select(".product-item a, .product a, [itemprop=url]"):
            href = a.get("href")
            if href and not href.startswith("#"):
                full = urljoin(BASE_URL, href)
                # Filtruj - jen URL ze stejného hostu, ne kategorie nebo paginace
                if BASE_URL in full and "/strana-" not in full:
                    links.add(full.split("?")[0])

        # Najdi další stránku
        next_el = soup.select_one('a[rel="next"]') or soup.select_one('.pagination a.next')
        url = urljoin(BASE_URL, next_el["href"]) if next_el and next_el.get("href") else None
        page += 1

    return sorted(links)


def scrape_category(slug: str, category_path: str, limit: int = 0) -> list[dict]:
    print(f"\n=== Kategorie: {slug} ===")
    url = urljoin(BASE_URL, category_path)
    links = find_product_links(url)
    print(f"Nalezeno {len(links)} produktových URL.")

    if limit > 0:
        links = links[:limit]

    products = []
    for i, plink in enumerate(links, 1):
        print(f"[{i}/{len(links)}] {plink}")
        p = parse_product_page(plink, slug)
        if p and p["price_czk"] > 0:
            products.append(p)

            # Stáhni obrázky
            for idx, img_url in enumerate(p["images"]):
                ext = os.path.splitext(urlparse(img_url).path)[1] or ".jpg"
                dest = OUTPUT_DIR / "images" / slug / f"{p['sku'] or i}_{idx}{ext}"
                download_image(img_url, dest)

    return products


def main():
    parser = argparse.ArgumentParser(description="Mercucio.cz scraper")
    parser.add_argument("--category", help="Scrape jen tuto kategorii (slug)")
    parser.add_argument("--limit", type=int, default=0, help="Max produktů per kategorie (0 = vše)")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    all_products = []
    target_cats = {args.category: CATEGORIES[args.category]} if args.category else CATEGORIES

    for slug, path in target_cats.items():
        try:
            products = scrape_category(slug, path, args.limit)
            all_products.extend(products)
        except Exception as e:
            print(f"[{slug}] selhalo: {e}")

    output_file = OUTPUT_DIR / "products.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(all_products, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Hotovo: {len(all_products)} produktů → {output_file}")


if __name__ == "__main__":
    main()
