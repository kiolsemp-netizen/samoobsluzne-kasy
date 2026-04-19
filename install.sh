#!/bin/bash
# =============================================================================
# StánekOS - instalační skript pro Ubuntu Linux
# =============================================================================
# Použití:
#   chmod +x install.sh
#   ./install.sh

set -e

echo "=== StánekOS - instalace ==="
echo

# Kontrola závislostí
command -v node >/dev/null 2>&1 || { echo "❌ Node.js není nainstalován"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm není nainstalován"; exit 1; }
command -v psql >/dev/null 2>&1 || { echo "❌ PostgreSQL client není nainstalován"; exit 1; }

echo "✓ Node.js $(node -v)"
echo "✓ npm $(npm -v)"
echo "✓ PostgreSQL klient OK"
echo

# Backend
echo "→ Instalace backend závislostí..."
(cd backend && npm install --silent)
echo "✓ Backend OK"

# Kiosk
echo "→ Instalace kiosk závislostí..."
(cd kiosk-frontend && npm install --silent)
echo "✓ Kiosk OK"

# Admin
echo "→ Instalace admin závislostí..."
(cd admin-frontend && npm install --silent)
echo "✓ Admin OK"

# Agent
echo "→ Instalace agent závislostí..."
(cd agent && npm install --silent)
echo "✓ Agent OK"

echo
echo "=== Instalace dokončena ==="
echo
echo "DALŠÍ KROKY:"
echo "1. Zkopíruj backend/.env.example → backend/.env a doplň hodnoty"
echo "2. Vytvoř databázi:    createdb stanek_os"
echo "3. Nahraj schéma:      psql stanek_os < database/schema.sql"
echo "4. Vytvoř admin:       cd backend && node scripts/createAdmin.js admin@firma.cz TvojeHeslo"
echo "5. Generuj klíče:      node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
echo "6. Spusť backend:      cd backend && npm run dev"
echo "7. Spusť kiosk:        cd kiosk-frontend && npm run dev (s VITE_KIOSK_KEY)"
echo "8. Spusť admin:        cd admin-frontend && npm run dev"
echo
