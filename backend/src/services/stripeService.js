/**
 * Stripe service - business logika pro platby přes Terminal
 * ----------------------------------------------------------------------------
 * Stripe Terminal flow:
 *   1. Server vytvoří PaymentIntent (částka, měna, payment_method_types: ['card_present'])
 *   2. Kiosk (frontend) použije Terminal SDK a zavolá terminal.collectPaymentMethod
 *   3. Terminal SDK posílá signál reader (fyzická čtečka karet) ke čtení karty
 *   4. Po úspěšné autorizaci Stripe pošle webhook "payment_intent.succeeded"
 *   5. Backend v webhook handleru označí order jako 'paid' a odečte zásobu
 *
 * Refund:
 *   - Částečný i plný podporován přes stripe.refunds.create
 */

'use strict';

const { stripe } = require('../config/stripe');
const db = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Vytvoří PaymentIntent pro existující order.
 * Ukládá payment_intent_id zpět do orders.
 */
async function createPaymentIntent(orderId) {
  const orderResult = await db.query(
    `SELECT id, order_number, total_czk, stall_id, status, stripe_payment_intent_id
     FROM orders WHERE id = $1`,
    [orderId]
  );
  if (orderResult.rows.length === 0) throw new ApiError(404, 'Objednávka nenalezena');
  const order = orderResult.rows[0];

  if (order.status === 'paid') {
    throw new ApiError(400, 'Objednávka je již zaplacena');
  }

  // Pokud už existuje PI a není completed, vrátíme stejný (idempotence)
  if (order.stripe_payment_intent_id) {
    try {
      const existingPi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
      if (existingPi && existingPi.status !== 'canceled') {
        return existingPi;
      }
    } catch (e) {
      console.warn('[Stripe] Nelze získat existující PI, vytvářím nový:', e.message);
    }
  }

  // Částka v haléřích (Stripe používá smallest unit)
  const amountInHeller = Math.round(Number(order.total_czk) * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInHeller,
    currency: 'czk',
    payment_method_types: ['card_present'],
    capture_method: 'automatic',
    metadata: {
      order_id: String(order.id),
      order_number: order.order_number,
      stall_id: String(order.stall_id),
    },
    description: `Objednávka ${order.order_number}`,
  });

  await db.query(
    `UPDATE orders SET stripe_payment_intent_id = $1 WHERE id = $2`,
    [paymentIntent.id, order.id]
  );

  return paymentIntent;
}

/**
 * Vytvoří Connection Token pro Terminal SDK na kiosku.
 * Terminal SDK potřebuje tento token k připojení k Stripe.
 */
async function createConnectionToken() {
  const token = await stripe.terminal.connectionTokens.create();
  return token;
}

/**
 * Zpracuje webhook event (stripe.webhooks.constructEvent ověří signature).
 */
async function handleWebhook(event) {
  switch (event.type) {
    case 'payment_intent.succeeded':
      await handlePaymentSucceeded(event.data.object);
      break;
    case 'payment_intent.payment_failed':
      await handlePaymentFailed(event.data.object);
      break;
    case 'charge.refunded':
      await handleRefund(event.data.object);
      break;
    default:
      console.log(`[Stripe Webhook] Ignoruji event: ${event.type}`);
  }
}

/**
 * Platba úspěšná - označíme order jako 'paid' a odečteme zásobu.
 * Celý proces běží v transakci - atomic.
 */
async function handlePaymentSucceeded(paymentIntent) {
  const orderId = parseInt(paymentIntent.metadata?.order_id, 10);
  if (!orderId) {
    console.error('[Stripe Webhook] PaymentIntent bez order_id metadata:', paymentIntent.id);
    return;
  }

  const inventoryService = require('./inventoryService');
  const notificationService = require('./notificationService');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Lock order - prevence race condition
    const orderResult = await client.query(
      `SELECT o.*, s.name AS stall_name FROM orders o
       JOIN stalls s ON s.id = o.stall_id
       WHERE o.id = $1 FOR UPDATE`,
      [orderId]
    );
    if (orderResult.rows.length === 0) {
      throw new Error(`Order ${orderId} neexistuje`);
    }
    const order = orderResult.rows[0];

    // Idempotence - pokud je už paid, nic nedělej
    if (order.status === 'paid') {
      await client.query('COMMIT');
      return;
    }

    // Payment method (card info)
    const charge = paymentIntent.charges?.data?.[0] || paymentIntent.latest_charge;
    let chargeId = null;
    let cardLast4 = null;
    if (typeof charge === 'string') {
      chargeId = charge;
    } else if (charge && charge.id) {
      chargeId = charge.id;
      cardLast4 = charge.payment_method_details?.card_present?.last4
        || charge.payment_method_details?.card?.last4;
    }

    // Update order
    await client.query(
      `UPDATE orders SET
         status = 'paid',
         payment_status = 'paid',
         payment_method = $1,
         stripe_charge_id = $2,
         paid_at = NOW()
       WHERE id = $3`,
      [cardLast4 ? `card_****${cardLast4}` : 'card_present', chargeId, orderId]
    );

    // Odečti zásobu za každou položku
    const items = await client.query(
      `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    for (const item of items.rows) {
      await inventoryService.deductSale(client, {
        productId: item.product_id,
        stallId: order.stall_id,
        quantity: item.quantity,
        orderId,
      });
    }

    await client.query('COMMIT');

    // Notifikace (nepřerušíme flow pokud selže)
    notificationService
      .notifySale({ orderId, total: order.total_czk, stallName: order.stall_name })
      .catch(e => console.error('[Notif] Sale notify error:', e.message));

    console.log(`[Stripe] Order ${orderId} zaplaceno.`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`[Stripe] Chyba při zpracování úspěšné platby ${paymentIntent.id}:`, e);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Platba selhala - označíme order jako 'failed'.
 */
async function handlePaymentFailed(paymentIntent) {
  const orderId = parseInt(paymentIntent.metadata?.order_id, 10);
  if (!orderId) return;

  await db.query(
    `UPDATE orders SET status = 'failed', payment_status = 'failed' WHERE id = $1 AND status = 'pending'`,
    [orderId]
  );
  console.log(`[Stripe] Order ${orderId} - platba selhala.`);
}

/**
 * Refund eventy - označíme order jako refunded.
 */
async function handleRefund(charge) {
  if (!charge.refunded) return;

  const result = await db.query(
    `UPDATE orders SET status = 'refunded' WHERE stripe_charge_id = $1 RETURNING id`,
    [charge.id]
  );
  if (result.rows.length > 0) {
    console.log(`[Stripe] Order ${result.rows[0].id} refundován.`);
  }
}

/**
 * Vytvoří refund pro order (admin akce).
 */
async function refundOrder(orderId, amountCzk = null, reason = 'requested_by_customer') {
  const orderResult = await db.query(
    `SELECT stripe_charge_id, total_czk, status FROM orders WHERE id = $1`,
    [orderId]
  );
  if (orderResult.rows.length === 0) throw new ApiError(404, 'Objednávka nenalezena');

  const order = orderResult.rows[0];
  if (!order.stripe_charge_id) throw new ApiError(400, 'Objednávka nemá Stripe charge ID');
  if (order.status !== 'paid') throw new ApiError(400, 'Objednávka není ve stavu paid');

  const refundParams = {
    charge: order.stripe_charge_id,
    reason,
  };
  if (amountCzk !== null) {
    refundParams.amount = Math.round(Number(amountCzk) * 100);
  }

  const refund = await stripe.refunds.create(refundParams);
  return refund;
}

module.exports = {
  createPaymentIntent,
  createConnectionToken,
  handleWebhook,
  refundOrder,
};
