# StánekOS v1.0

**Samoobslužný kiosový POS systém** pro 3 stánky s koženými doplňky.

Obsahuje 4 části:
- **Backend** – Node.js/Express + PostgreSQL, Stripe Terminal platby, ESC/POS tisk, ARES lookup
- **Kiosk PWA** – React aplikace pro dotykový monitor, optimalizovaná pro starší zákazníky
- **Admin panel** – React dashboard pro správu produktů, skladu, objednávek, reportů
- **AI agent** – Telegram bot s autonomním monitoringem skladu a reporty

---

## Rychlý start

### 1. Prerekvizity

- Node.js 20+
- PostgreSQL 14+
- Python 3.10+ (pro scraper)
- (volitelně) PM2: `npm i -g pm2`

### 2. Instalace

```bash
# Klonování
cd stanek-os

# Backend
cd backend
npm install
cp .env.example .env
# Uprav .env - DATABASE_URL, STRIPE_*, KIOSK_API_KEY_*, JWT_*, PRINTER_*

# Vytvoř databázi
createdb stanek_os
psql stanek_os < ../database/schema.sql

# První admin
node scripts/createAdmin.js admin@firma.cz TajneHesloMin10Znaku

# Kiosk
cd ../kiosk-frontend
npm install

# Admin
cd ../admin-frontend
npm install

# Agent
cd ../agent
npm install
```

### 3. Generování bezpečnostních klíčů

```bash
# JWT tajemství (2× různé)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# Kiosk klíče (3×)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Hodnoty vlož do `backend/.env`.

### 4. Spuštění - vývoj

```bash
# Terminál 1 - backend
cd backend && npm run dev

# Terminál 2 - kiosk
cd kiosk-frontend && npm run dev
# → http://localhost:3000?stall=1
# → nastav VITE_KIOSK_KEY v .env.local nebo localStorage

# Terminál 3 - admin
cd admin-frontend && npm run dev
# → http://localhost:3002
```

### 5. Spuštění - produkce (PM2)

```bash
# Build frontendů
cd kiosk-frontend && npm run build
cd ../admin-frontend && npm run build

# Nasadit přes Nginx nebo Caddy
# Kiosk slouží z /kiosk-frontend/dist
# Admin slouží z /admin-frontend/dist

# Backend + agent přes PM2
cd ..
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 6. Kiosk mód (Chromium)

Na každém stánku PC:

```bash
chromium --kiosk --app=http://localhost/?stall=1 \
  --no-first-run --disable-translate --disable-infobars \
  --touch-events=enabled --user-data-dir=/tmp/kiosk-profile \
  --disable-features=TranslateUI
```

Přidat do autostartu přes `systemd --user` nebo autostart desktop manageru.

---

## Architektura

```
┌─────────────────┐  Stripe Terminal SDK   ┌──────────────────┐
│  KIOSK (PWA)    │ ←─────────────────────→│  Stripe Reader   │
│  Stall 1/2/3    │                         │  S700 / WisePOS  │
│  +Tisk ESC/POS  │                         └──────────────────┘
└──────┬──────────┘                                │
       │ X-Kiosk-Key header                         │ webhook
       ↓                                            ↓
┌─────────────────────────────────────────────────────────────┐
│  BACKEND (Node.js + Express)                                │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐    │
│  │ Kiosk routes │  │ Admin routes │  │ Stripe webhooks │    │
│  └──────────────┘  └──────────────┘  └─────────────────┘    │
│  Services: stripe, receipt, invoice (PDFKit), inventory,     │
│            ares (gov.cz), notifications (Telegram)           │
└──────┬──────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────┐      ┌──────────────────┐
│  PostgreSQL     │      │  ADMIN PANEL     │
│  - products     │ ←─── │  (React SPA)     │
│  - inventory    │      │  JWT auth        │
│  - orders       │      └──────────────────┘
│  - admin_users  │      
└─────────────────┘      ┌──────────────────┐
       ↑                 │  AGENT (PM2)     │
       └────────────────→│  Telegram bot    │
                         │  - /prehled      │
                         │  - ranní reporty │
                         └──────────────────┘
```

---

## Bezpečnostní principy

- **Všechny SQL dotazy parametrizované** - žádná string concatenace
- **Kiosk API**: autentizace přes `X-Kiosk-Key` header, timing-safe porovnání
- **Admin API**: JWT (access 15 min v memory + refresh 30 dní v httpOnly cookie, SHA-256 hash v DB)
- **Hesla**: bcrypt salt rounds 12
- **Rate limiting**: 500/15min kiosk, 300/15min admin, 10/15min login (proti brute-force)
- **CORS**: whitelist přes `CORS_ALLOWED_ORIGINS`
- **Stripe webhooks**: ověření přes `stripe.webhooks.constructEvent` (signature)
- **Transakce**: změny zásob atomické s `SELECT FOR UPDATE` (žádné double-booking)
- **Helmet.js**: standardní HTTP security headers

---

## UX pro starší zákazníky

Kiosk byl navržen pro uživatele 60+:

- **Velké fonty**: základ 24px, ceny 48-64px, nadpisy 96-192px
- **Velké tlačítka**: minimum 100px výška; hlavní CTA 180px
- **Vysoký kontrast**: tmavé pozadí `#0f0f1e`, zlatý akcent `#d4a574`
- **Max 3 volby na obrazovku** - žádná přetížená menu
- **Žádné skrollbary** (kromě dlouhých seznamů)
- **Velká fajfka při úspěchu** místo textu
- **Animace karty** při platbě (vizuální instrukce)
- **Pulzující tlačítko** na úvodu (přitáhne pozornost)
- **Idle reset** po 90 s nečinnosti

---

## Import produktů

```bash
# 1. Python scraper
cd scripts
pip install requests beautifulsoup4 lxml
python3 mercucio_scraper.py --category penezenky --limit 50

# 2. Import do DB
node import_products.js ../mercucio_products/products.json --stall 1 --default-stock 3
```

Nebo ručně připravené JSON:

```json
[
  {
    "name": "Kožená peněženka černá",
    "sku": "PEN-001",
    "price_czk": 1890,
    "category_slug": "penezenky",
    "color": "černá",
    "description": "...",
    "images": ["https://..."],
    "source_url": "https://mercucio.cz/..."
  }
]
```

---

## Telegram příkazy

Agent v `/agent/inventoryAgent.js` reaguje na:

- `/prehled` - stav skladu per stánek
- `/trzby [dnes|tyden|mesic]` - tržby
- `/nizky_sklad` - produkty pod limitem
- `/help` - nápověda

Autorizace: pouze chat s ID `TELEGRAM_CHAT_ID`.

---

## Faktury a dokumenty

- **Účtenka** (zjednodušený daňový doklad): ESC/POS tisk 80mm
- **Faktura** (B2B): PDF generované PDFKit, ukládáno do `backend/invoices/`
  - Automaticky načte firemní údaje z ARES přes IČO
  - Číselná řada: `YYYYNNNNNN` (unikátní, atomicky generovaná)

**Důležité pro diakritiku v PDF**: nainstaluj DejaVu font:

```bash
mkdir -p backend/fonts
cd backend/fonts
wget https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.tar.bz2
tar xjf dejavu-fonts-ttf-2.37.tar.bz2
cp dejavu-fonts-ttf-2.37/ttf/DejaVuSans.ttf .
cp dejavu-fonts-ttf-2.37/ttf/DejaVuSans-Bold.ttf .
```

---

## Troubleshooting

**Kiosk hlásí "Platební terminál není k dispozici"**
- Ověř že Stripe Reader je spárovaný v Stripe Dashboard
- Zkontroluj `STRIPE_TERMINAL_LOCATION_ID` v `.env`
- V dev módu nastav `VITE_STRIPE_SIMULATED=true`

**Tiskárna tiskne otazníky místo diakritiky**
- V `receiptService.js` je nastaveno `PC852_LATIN2`
- Ověř firmware verzi Epson TM-T20III podporuje PC852

**`JWT_SECRET není nastaven nebo je příliš krátký`**
- Backend vyžaduje min 32 znaků pro JWT_SECRET a JWT_REFRESH_SECRET
- Oba musí být odlišné

**Objednávky se zasekávají ve stavu 'pending'**
- Webhook z Stripe nedorazil - zkontroluj Stripe Dashboard → Webhooks
- URL musí být veřejná (ngrok v dev, doména v produkci)

---

## Přechod na Mac Studio

Celý systém je **nezávislý na LLM**. Pouze `agent/inventoryAgent.js` by mohl být rozšířen o AI volání - v tom případě stačí změnit endpoint z Anthropic API na lokální Qwen3:72b (Ollama). Žádné změny v kiosku ani backendu nejsou potřeba.

---

## Licence a poznámky

- Interní projekt pro konkrétního majitele stánků
- Produkční provoz vyžaduje platnou Stripe Terminal smlouvu a registrovaný Epson TM-T20III
- PDF faktury splňují minimum zákonných požadavků (§ 29 zákona č. 235/2004 Sb.), ale konzultuj s účetní před nasazením

---

## Podpora

Pro otázky kolem kódu projdi README jednotlivých adresářů a komentáře v kódu (každý soubor má hlavičku s vysvětlením).
