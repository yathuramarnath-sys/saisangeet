/**
 * dynoapis.actions.js
 *
 * Outbound order-action queue for Dyno-sourced orders. Dyno's API is a poll
 * model — it has no inbound "tell us the POS accepted this" callback, so
 * accept/reject/food-ready actions taken in the POS are queued here and
 * handed off the next time Dyno calls GET /:resId/orders/status. Dyno then
 * performs the action on Swiggy/Zomato and confirms completion via
 * POST /orders/:orderId/status (logged in dynoapis.routes.js).
 *
 * Field names in the queued action objects are our best read of Dyno's
 * reference implementation (no live docs available yet) — confirm exact
 * field names once Dyno credentials are live and this has been exercised
 * against a real poll.
 */

// Map<"tenantId:outletId", QueuedAction[]>
const queues = new Map();

function key(tenantId, outletId) {
  return `${tenantId}:${outletId}`;
}

/** Queue an accept/reject/food-ready action for Dyno to pick up on its next poll. */
function queueDynoOrderAction(tenantId, outletId, action) {
  const k = key(tenantId, outletId);
  if (!queues.has(k)) queues.set(k, []);
  queues.get(k).push(action);
}

/** Drain (return + clear) all queued actions for an outlet — called when Dyno polls. */
function drainDynoOrderActions(tenantId, outletId) {
  const k = key(tenantId, outletId);
  const actions = queues.get(k) || [];
  queues.set(k, []);
  return actions;
}

module.exports = { queueDynoOrderAction, drainDynoOrderActions };
