# StánekOS — Samoobslužná pokladna

Samoobslužná pokladna pro prodejní stánky s koženými doplňky.

## Rychlý start

### 1. Instalace závislostí

```bash
# Backend
cd backend
npm install

# Kiosk frontend
cd ../kiosk-frontend
npm install

# Admin frontend (volitelné)
cd ../admin-frontend
npm install
```

### 2. Nastavení databáze

```bash
# Vytvoř databázi
sudo -u postgres createdb stanek_os

# Importuj schéma
sudo -u postgres psql stanek_os < database/stanek_os_schema.sql

# Vytvoř admin uživatele
cd backend
node scripts/createAdmin.js admin@firma.cz TvojeHeslo123
```

### 3. Konfigurace

```bash
cd backend
cp .env.example .env
# Uprav .env - DATABASE_URL, STRIPE_*, atd.
```

### 4. Spuštění

```bash
# Backend (port 3003)
cd backend
PORT=3003 node src/server.js

# Kiosk (port 3000) - v jiném terminálu
cd kiosk-frontend
npm run dev
```

Otevři: http://localhost:3000/?stall=1

## Produkce

```bash
# Build frontendů
cd kiosk-frontend && npm run build
cd ../admin-frontend && npm run build

# PM2
cd ..
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Struktura

```
stanek-os/
├── backend/           # Node.js + Express API
├── kiosk-frontend/    # React PWA pro dotykový displej
├── admin-frontend/    # React admin panel
├── agent/             # Telegram bot pro monitoring
├── database/          # SQL schéma
└── scripts/           # Importovací skripty
```

## API Klíče

Vygeneruj nové klíče:

```bash
# JWT
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# Kiosk API
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Stripe Terminal

Pro platby kartou je potřeba Stripe Terminal:
1. Vytvoř Stripe account
2. Objednej čtečku (WisePOS E nebo S700)
3. Nastav webhook URL
4. Přidej keys do `.env`

## License

Interní projekt — všechna práva vyhrazena.
