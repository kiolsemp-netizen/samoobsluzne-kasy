/**
 * StánekOS - hlavní Express server
 * ============================================================================
 * Inicializuje Express s bezpečnostními middleware a registruje všechny routes.
 *
 * Pořadí je důležité:
 *   1. Stripe webhook (raw body, musí být PŘED express.json)
 *   2. Security middleware (helmet, cors)
 *   3. Body parsers (json, cookie)
 *   4. Rate limiters
 *   5. Routes
 *   6. Error handler (vždy poslední)
 */

'use strict';

// Načti .env PŘED jakýmkoli require() z našich modulů
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { errorHandler } = require('./middleware/errorHandler');
const db = require('./config/database');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// ============================================================================
// TRUST PROXY - pokud je backend za Nginxem/Traefikem
// ============================================================================
app.set('trust proxy', 1);

// ============================================================================
// STRIPE WEBHOOK - MUSÍ BÝT PRVNÍ (raw body)
// ============================================================================
// Express.raw() zachová body jako Buffer, který Stripe potřebuje pro signature.
const paymentsRouter = require('./routes/payments');
// Webhook endpoint registrujeme zvlášť s raw body, ostatní platební endpointy jsou v routeru
// Pozor: /api/payments/webhook je interně ošetřen express.raw v routeru.

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================
app.use(helmet({
  contentSecurityPolicy: false,  // na kiosku / adminu řešíme jinak
  crossOriginEmbedderPolicy: false,
}));

// CORS - povol jen známé originy
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests s žádným Origin (mobile apps, Postman, kiosk v kiosk módu)
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, true);  // dev mode
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} není povolen`));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Kiosk-Key'],
}));

app.use(cookieParser());

// ============================================================================
// HEALTH CHECK (bez rate limitu, pro monitoring)
// ============================================================================
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', time: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: 'error', message: e.message });
  }
});

// ============================================================================
// RATE LIMITERS
// ============================================================================
const kioskLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,               // Kiosk má UX polling - vyšší limit
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Příliš mnoho požadavků' },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,                // Proti brute-force
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Příliš mnoho pokusů o přihlášení - zkuste za 15 minut' },
});

// ============================================================================
// STRIPE WEBHOOK (raw body) - MUSÍ BÝT PŘED express.json
// ============================================================================
app.use('/api/payments/webhook', paymentsRouter);

// ============================================================================
// BODY PARSERS
// ============================================================================
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ============================================================================
// LOGGING (jednoduchý)
// ============================================================================
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const dur = Date.now() - start;
    if (process.env.NODE_ENV !== 'production' || res.statusCode >= 400) {
      console.log(`${req.method} ${req.url} → ${res.statusCode} (${dur}ms)`);
    }
  });
  next();
});

// ============================================================================
// ROUTES
// ============================================================================

// Kiosk API (rate limited)
app.use('/api/kiosk', kioskLimiter, require('./routes/kiosk'));

// Platby (non-webhook endpointy, rate limited)
app.use('/api/payments', kioskLimiter, paymentsRouter);

// Login rate limit (specifický)
app.use('/api/auth/login', loginLimiter);

// Admin API
app.use('/api', adminLimiter, require('./routes/products'));
app.use('/api/inventory', adminLimiter, require('./routes/inventory'));
app.use('/api/orders', adminLimiter, require('./routes/orders'));
app.use('/api/reports', adminLimiter, require('./routes/reports'));
app.use('/api', adminLimiter, require('./routes/settings'));

// ============================================================================
// STATIC FILES (uploads - product images)
// ============================================================================
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
  maxAge: '7d',
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));

// ============================================================================
// 404 handler
// ============================================================================
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint nenalezen', path: req.path });
});

// ============================================================================
// ERROR HANDLER (vždy poslední)
// ============================================================================
app.use(errorHandler);

// ============================================================================
// START
// ============================================================================
const server = app.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║  StánekOS Backend běží na portu ${PORT}           ║`);
  console.log(`║  Prostředí: ${(process.env.NODE_ENV || 'development').padEnd(34)}║`);
  console.log(`╚════════════════════════════════════════════════╝\n`);
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================
async function shutdown(signal) {
  console.log(`\n[${signal}] Ukončování serveru...`);
  server.close(async () => {
    try {
      await db.closePool();
    } catch (e) {
      console.error('Chyba při uzavírání DB:', e);
    }
    console.log('Server ukončen');
    process.exit(0);
  });

  // Force exit po 10s
  setTimeout(() => {
    console.error('Graceful shutdown timeout, force exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  // Neukončuj server - log a pokračuj (PM2 to zachytí)
});

module.exports = app;
