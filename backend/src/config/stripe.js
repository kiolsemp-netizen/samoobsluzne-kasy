/**
 * Stripe konfigurace
 * ----------------------------------------------------------------------------
 * Inicializuje Stripe SDK pro Payment Intents a Terminal (fyzické čtečky karet).
 * API verze je zamrazená - Stripe nemění chování dokud explicitně neupgraduješ.
 */

'use strict';

const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('[STRIPE] STRIPE_SECRET_KEY není nastaven - platby budou nedostupné');
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2024-04-10',
  timeout: 20_000,          // 20s timeout pro síťové volání
  maxNetworkRetries: 2,     // automatický retry při síťové chybě
  telemetry: false,
});

module.exports = {
  stripe,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  terminalLocationId: process.env.STRIPE_TERMINAL_LOCATION_ID,
};
