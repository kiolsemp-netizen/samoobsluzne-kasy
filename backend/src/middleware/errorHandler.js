/**
 * Centrální error handler
 * ----------------------------------------------------------------------------
 * Chytá všechny chyby z routes a vrací konzistentní JSON odpověď.
 * V produkci nevrací stack trace (bezpečnost).
 *
 * Kódování chyb:
 *   - 400 Bad Request   - neplatný vstup, validace
 *   - 401 Unauthorized  - chybí/neplatný token nebo API klíč
 *   - 403 Forbidden     - nemá oprávnění
 *   - 404 Not Found     - zdroj neexistuje
 *   - 409 Conflict      - duplicita, konflikt stavu
 *   - 422 Unprocessable - validní JSON, ale nesprávná data
 *   - 429 Too Many Req  - rate limit
 *   - 500 Server Error  - všechno ostatní
 */

'use strict';

/**
 * Vlastní chyba s HTTP statusem - volá se v routes přes `throw new ApiError(400, 'zpráva')`.
 */
class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;  // odlišuje od programátorských chyb
  }
}

/**
 * Express error middleware (4 parametry - Express rozpozná).
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isProd = process.env.NODE_ENV === 'production';

  // Provozní chyba (z ApiError)
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
  }

  // PostgreSQL chyby → přemapuj
  if (err.code) {
    // unique constraint violation
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Záznam již existuje', details: err.detail });
    }
    // foreign key violation
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Odkazovaný záznam neexistuje', details: err.detail });
    }
    // check constraint
    if (err.code === '23514') {
      return res.status(400).json({ error: 'Data porušují omezení databáze', details: err.detail });
    }
    // not null violation
    if (err.code === '23502') {
      return res.status(400).json({ error: 'Chybí povinné pole', details: err.column });
    }
  }

  // JWT chyby
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Neplatný nebo vypršený token' });
  }

  // Multer (upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Soubor je příliš velký (max 5 MB)' });
  }

  // Neznámá chyba - zaloguj kompletně, vrat obecné
  console.error('[UNHANDLED ERROR]', {
    url: req.url,
    method: req.method,
    stack: err.stack,
    message: err.message,
  });

  return res.status(500).json({
    error: 'Interní chyba serveru',
    ...(isProd ? {} : { stack: err.stack, message: err.message }),
  });
}

/**
 * Wrapper pro async route handlers - automaticky chytí Promise rejection.
 *
 * Použití:
 *   router.get('/neco', asyncHandler(async (req, res) => { ... }));
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  ApiError,
  errorHandler,
  asyncHandler,
};
