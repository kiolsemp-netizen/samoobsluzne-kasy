/**
 * Payments routes - Stripe Terminal integrace
 * ----------------------------------------------------------------------------
 * POST /api/payments/connection-token  (kiosk)  - Terminal SDK connection token
 * POST /api/payments/create-intent     (kiosk)  - vytvoření PaymentIntent pro order
 * POST /api/payments/webhook           (stripe) - webhook handler (bez auth, ověřuje signature)
 * POST /api/payments/refund/:orderId   (admin)  - refund objednávky
 *
 * POZOR: webhook MUSÍ být registrovaný PŘED express.json() middleware,
 * aby Stripe mohl ověřit signature z raw body.
 */

'use strict';

const express = require('express');
const kioskAuth = require('../middleware/kioskAuth');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const stripeService = require('../services/stripeService');
const { stripe, webhookSecret } = require('../config/stripe');

const router = express.Router();

/**
 * POST /api/payments/connection-token - kiosk
 * Stripe Terminal SDK potřebuje connection token.
 */
router.post('/connection-token', kioskAuth, asyncHandler(async (req, res) => {
  const token = await stripeService.createConnectionToken();
  res.json({ secret: token.secret });
}));

/**
 * POST /api/payments/create-intent - kiosk
 * Body: { orderId }
 */
router.post('/create-intent', kioskAuth, asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) throw new ApiError(400, 'orderId je povinné');

  // Ověř že order patří danému stánku
  const db = require('../config/database');
  const orderCheck = await db.query(
    `SELECT stall_id FROM orders WHERE id = $1`,
    [parseInt(orderId, 10)]
  );
  if (orderCheck.rows.length === 0) throw new ApiError(404, 'Objednávka nenalezena');
  if (orderCheck.rows[0].stall_id !== req.stallId) throw new ApiError(403, 'Přístup odepřen');

  const paymentIntent = await stripeService.createPaymentIntent(parseInt(orderId, 10));
  res.json({
    id: paymentIntent.id,
    client_secret: paymentIntent.client_secret,
    status: paymentIntent.status,
  });
}));

/**
 * POST /api/payments/webhook - Stripe webhook
 *
 * DŮLEŽITÉ: tento endpoint musí mít raw body (nikoliv JSON parsed).
 * Registrujeme v server.js PŘED express.json() middleware.
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.get('stripe-signature');
  if (!sig || !webhookSecret) {
    console.error('[Webhook] Chybí signature nebo webhook secret');
    return res.status(400).send('Missing signature');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Okamžitě potvrď Stripe že jsme event přijali (Stripe timeout 30s)
  // Pak asynchronně zpracuj
  res.json({ received: true });

  // Zpracování (nečekáme - už jsme odpověděli)
  try {
    await stripeService.handleWebhook(event);
  } catch (err) {
    console.error('[Webhook] Processing error:', err);
    // Stripe to retryne díky tomu že neodpovídá 2xx... ale už jsme odpověděli.
    // V produkci by bylo lepší queue (BullMQ). Pro MVP stačí log.
  }
});

/**
 * POST /api/payments/refund/:orderId - admin refund
 * Body: { amount?: number, reason?: string }
 */
router.post('/refund/:orderId', requireAuth, asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);
  if (isNaN(orderId)) throw new ApiError(400, 'Neplatné ID');

  const { amount, reason } = req.body;
  const refund = await stripeService.refundOrder(orderId, amount || null, reason || 'requested_by_customer');

  res.json({
    refundId: refund.id,
    amount: refund.amount / 100,
    status: refund.status,
  });
}));

module.exports = router;
