/**
 * Settings routes + auth endpointy
 * ----------------------------------------------------------------------------
 * POST /api/auth/login      - přihlášení (access token + refresh cookie)
 * POST /api/auth/refresh    - obnovení access tokenu
 * POST /api/auth/logout     - revokace refresh tokenu
 * GET  /api/auth/me         - info o přihlášeném
 *
 * GET  /api/settings        - všechna nastavení
 * PUT  /api/settings/:key   - úprava (superadmin)
 * GET  /api/stalls          - seznam stánků
 * GET  /api/ares/:ico       - ARES lookup (kiosk auth nebo admin)
 * POST /api/printer/test/:stallId - test tisk (admin)
 */

'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const settings = require('../config/settings');
const {
  signAccessToken, createRefreshToken, verifyRefreshToken,
  revokeRefreshToken, requireAuth, requireRole, REFRESH_EXPIRES_MS,
} = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const aresService = require('../services/aresService');
const kioskAuth = require('../middleware/kioskAuth');

const router = express.Router();

// ========================================================================
// AUTH
// ========================================================================

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, 'Email a heslo jsou povinné');

  const result = await db.query(
    `SELECT * FROM admin_users WHERE email = $1 AND is_active = true`,
    [String(email).toLowerCase().trim()]
  );

  // Timing-safe: porovnej s dummy hashem když uživatel neexistuje
  const dummyHash = '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid.';
  const user = result.rows[0];
  const hash = user ? user.password_hash : dummyHash;
  const valid = await bcrypt.compare(password, hash);

  if (!user || !valid) {
    throw new ApiError(401, 'Neplatné přihlašovací údaje');
  }

  const accessToken = signAccessToken(user);
  const refresh = await createRefreshToken(user.id);

  // Aktualizuj last_login
  await db.query(
    `UPDATE admin_users SET last_login = NOW() WHERE id = $1`,
    [user.id]
  );

  // Refresh token v httpOnly cookie
  res.cookie('refreshToken', refresh.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_EXPIRES_MS,
    path: '/api/auth',
  });

  res.json({
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      stallId: user.stall_id,
    },
  });
}));

/**
 * POST /api/auth/refresh
 */
router.post('/auth/refresh', asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  const userId = await verifyRefreshToken(token);

  const result = await db.query(
    `SELECT * FROM admin_users WHERE id = $1 AND is_active = true`,
    [userId]
  );
  if (result.rows.length === 0) throw new ApiError(401, 'Uživatel neexistuje');

  const user = result.rows[0];
  const accessToken = signAccessToken(user);
  res.json({ accessToken });
}));

/**
 * POST /api/auth/logout
 */
router.post('/auth/logout', asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (token) await revokeRefreshToken(token);
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ success: true });
}));

/**
 * GET /api/auth/me
 */
router.get('/auth/me', requireAuth, asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT id, email, role, stall_id, last_login FROM admin_users WHERE id = $1`,
    [req.user.id]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Uživatel nenalezen');
  res.json({ user: result.rows[0] });
}));

// ========================================================================
// SETTINGS
// ========================================================================

router.get('/settings', requireAuth, asyncHandler(async (req, res) => {
  const all = await settings.getAll();
  // Nevracej citlivé klíče
  const safe = { ...all };
  delete safe.telegram_bot_token;
  res.json({ settings: safe });
}));

router.put('/settings/:key', requireAuth, requireRole('superadmin'), asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  if (!key || value === undefined) throw new ApiError(400, 'key a value jsou povinné');
  if (key.length > 100) throw new ApiError(400, 'key je příliš dlouhý');

  await settings.set(key, value);
  res.json({ success: true, key, value });
}));

// ========================================================================
// STALLS
// ========================================================================

router.get('/stalls', requireAuth, asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT id, name, location, is_active FROM stalls ORDER BY id`
  );
  res.json({ stalls: result.rows });
}));

router.get('/categories', asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT id, name, slug, display_order FROM categories ORDER BY display_order, name`
  );
  res.json({ categories: result.rows });
}));

// ========================================================================
// ARES - dostupné pro kiosk (přes X-Kiosk-Key) i admin (JWT)
// ========================================================================

router.get('/ares/:ico', asyncHandler(async (req, res, next) => {
  // Autorizace: buď kiosk key, nebo JWT
  const hasKiosk = !!req.get('X-Kiosk-Key');
  const hasAuth = !!req.get('Authorization');

  if (!hasKiosk && !hasAuth) {
    throw new ApiError(401, 'Vyžadována autentizace');
  }

  if (hasKiosk) {
    // Použij kiosk middleware v-lajně
    return kioskAuth(req, res, async () => {
      const data = await aresService.lookupByIco(req.params.ico);
      if (!data) return res.status(404).json({ error: 'Subjekt nenalezen' });
      res.json(data);
    });
  }

  return requireAuth(req, res, async () => {
    const data = await aresService.lookupByIco(req.params.ico);
    if (!data) return res.status(404).json({ error: 'Subjekt nenalezen' });
    res.json(data);
  });
}));

// ========================================================================
// PRINTER TEST
// ========================================================================

router.post('/printer/test/:stallId', requireAuth, asyncHandler(async (req, res) => {
  const stallId = parseInt(req.params.stallId, 10);
  if (isNaN(stallId)) throw new ApiError(400, 'Neplatné stallId');

  const receiptService = require('../services/receiptService');
  const result = await receiptService.testPrinter(stallId);
  res.json(result);
}));

// ========================================================================
// ADMIN USERS (superadmin only)
// ========================================================================

router.get('/admin-users', requireAuth, requireRole('superadmin'), asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT id, email, role, stall_id, is_active, created_at, last_login
     FROM admin_users ORDER BY id`
  );
  res.json({ users: result.rows });
}));

router.post('/admin-users', requireAuth, requireRole('superadmin'), asyncHandler(async (req, res) => {
  const { email, password, role, stall_id } = req.body;
  if (!email || !password) throw new ApiError(400, 'email a password jsou povinné');
  if (password.length < 10) throw new ApiError(400, 'Heslo musí mít min. 10 znaků');

  const validRoles = ['superadmin', 'stall_manager'];
  if (role && !validRoles.includes(role)) throw new ApiError(400, 'Neplatná role');

  const hash = await bcrypt.hash(password, 12);
  const result = await db.query(
    `INSERT INTO admin_users (email, password_hash, role, stall_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, role, stall_id, is_active, created_at`,
    [email.toLowerCase().trim(), hash, role || 'stall_manager', stall_id || null]
  );

  res.status(201).json({ user: result.rows[0] });
}));

module.exports = router;
