const crypto = require('crypto');
const fs = require('fs');
const jwt = crypto.randomBytes(48).toString('hex');
const jwtRefresh = crypto.randomBytes(48).toString('hex');
const k1 = crypto.randomBytes(32).toString('hex');
const k2 = crypto.randomBytes(32).toString('hex');
const k3 = crypto.randomBytes(32).toString('hex');

const env = `DATABASE_URL=postgresql://kiolsemp:kiolsemp123@localhost:5432/stanek_os
DATABASE_SSL=false
STRIPE_SECRET_KEY=sk_test_demo
STRIPE_WEBHOOK_SECRET=whsec_demo
STRIPE_TERMINAL_LOCATION_ID=tml_demo
KIOSK_API_KEY_1=${k1}
KIOSK_API_KEY_2=${k2}
KIOSK_API_KEY_3=${k3}
JWT_SECRET=${jwt}
JWT_REFRESH_SECRET=${jwtRefresh}
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
PRINTER_STALL_1=tcp://127.0.0.1:9100
PRINTER_STALL_2=tcp://127.0.0.1:9100
PRINTER_STALL_3=tcp://127.0.0.1:9100
ARES_BASE_URL=https://ares.gov.cz/ekonomicke-subjekty-v-be/rest
COMPANY_NAME=Demo Firma s.r.o.
COMPANY_ICO=00000000
COMPANY_DIC=CZ00000000
COMPANY_ADDRESS=Demo 1, 100 00 Praha
COMPANY_PHONE=+420 000 000 000
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3002,http://localhost:5173,http://localhost:5174
PORT=3001
NODE_ENV=development`;

fs.writeFileSync('.env', env);
console.log('.env created');
console.log('KIOSK_KEY_1=' + k1);
