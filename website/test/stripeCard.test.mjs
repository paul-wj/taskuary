// The Stripe card: a data card for reports, dashboards and agents, never the rail (the owner, 2026-11-01: "just for
// reports/connectors for now"). Its reads are listed on the card, offered on the Reports tab under Corporate systems, and
// spend the card's key - one name for each of them in every place that lists them.
import test from "node:test";
import assert from "node:assert/strict";
import { CATALOGUE } from "../src/connectorCatalog.js";

test("Stripe is available as a connector", () => {
  const stripe = CATALOGUE.find((card) => card.type === "stripe");
  assert.ok(stripe);
  assert.equal(stripe.planned, false);
});
