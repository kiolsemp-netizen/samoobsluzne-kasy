/**
 * Admin autentizace - JWT (access + refresh token)
 * ----------------------------------------------------------------------------
 * Access token  : krátká platnost (15 min), v Authorization: Bearer header
 * Refresh token : dlouhá platnost (30 dní), v httpOnly cookie + DB hash
 *
 * Refresh tokeny ukládáme jako SHA-256 hash - při odcizení DB nelze token použít.
 * Při logoutu nebo compromised se token revokuje (revoked=true).
 */

'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const { ApiError } = require('./errorHandler');

const ACCESS_EXPIRES = '15m';
const REFRESH_EXPIRES_DAYS = 30;
const REFRESH_EXPIRES_MS = REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000;

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error('JWT_SECRET není nastaven nebo je příliš krátký (min 32 znaků)');
  }
  return s;
}

function getRefreshSecret() {
  const s = process.env.JWT_REFRESH_SECRET;
  if (!s || s.length < 32) {
    throw new Error('JWT_REFRESH_SECRET není nastaven nebo je příliš krátký');
  }
  return s;
}

/**
 * Vytvoří access token (krátká platnost).
 */
function signAccessToken(user) {
  return jwt.sign(
    {
      uid: user.id,
      email: user.email,
      role: user.role,
      stallId: user.stall_id,
    },
    getSecret(),
    { expiresIn: ACCESS_EXPIRES }
  );
}

/**
 * Vytvoří refresh token + uloží SHA-256 hash do DB.
 * Vrací { token, expiresAt }.
 */
async function createRefreshToken(userId) {
  const token = jwt.sign(
    { uid: userId, type: 'refresh' },
    getRefreshSecret(),
    { expiresIn: `${REFRESH_EXPIRES_DAYS}d` }
  );

  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_MS);

  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hash, expiresAt]
  );

  return { token, expiresAt };
}

/**
 * Ověří refresh token - zkontroluje JWT + DB hash + revoked flag.
 * Vrací userId nebo hodí ApiError.
 */
async function verifyRefreshToken(token) {
  if (!token) throw new ApiError(401, 'Chybí refresh token');

  let payload;
  try {
    payload = jwt.verify(token, getRefreshSecret());
  } catch (e) {
    throw new ApiError(401, 'Neplatný nebo vypršený refresh token');
  }

  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const result = await db.query(
    `SELECT id, revoked, expires_at
     FROM refresh_tokens
     WHERE token_hash = $1`,
    [hash]
  );

  if (result.rows.length === 0) {
    throw new ApiError(401, 'Refresh token neexistuje');
  }
  const row = result.rows[0];
  if (row.revoked) throw new ApiError(401, 'Refresh token byl zneplatněn');
  if (new Date(row.expires_at) < new Date()) {
    throw new ApiError(401, 'Refresh token vypršel');
  }

  return payload.uid;
}

/**
 * Revokuje refresh token (logout).
 */
async function revokeRefreshToken(token) {
  if (!token) return;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  await db.query(
    `UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1`,
    [hash]
  );
}

/**
 * Revokuje všechny refresh tokeny uživatele (force logout everywhere).
 */
async function revokeAllUserTokens(userId) {
  await db.query(
    `UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false`,
    [userId]
  );
}

/**
 * Middleware - ověří access token a nastaví req.user.
 */
function requireAuth(req, res, next) {
  const authHeader = req.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    return next(new ApiError(401, 'Chybí autentizace'));
  }

  try {
    const payload = jwt.verify(token, getSecret());
    req.user = {
      id: payload.uid,
      email: payload.email,
      role: payload.role,
      stallId: payload.stallId,
    };
    next();
  } catch (e) {
    return next(new ApiError(401, 'Neplatný nebo vypršený token'));
  }
}

/**
 * Middleware - vyžaduje konkrétní roli.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Není přihlášen'));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'Nemáte oprávnění'));
    }
    next();
  };
}

module.exports = {
  signAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  requireAuth,
  requireRole,
  REFRESH_EXPIRES_MS,
};
