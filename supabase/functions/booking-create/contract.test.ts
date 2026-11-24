import {
  extractDomainCode,
  isValidComposition,
  httpStatusForDomainCode,
  publicBookingMessage,
} from "./contract.ts";

Deno.test("SLOT_TAKEN is a conflict", () => {
  if (httpStatusForDomainCode("SLOT_TAKEN") !== 409) {
    throw new Error("SLOT_TAKEN must map to HTTP 409");
  }
});

Deno.test("SLOT_UNAVAILABLE is recoverable conflict", () => {
  if (httpStatusForDomainCode("SLOT_UNAVAILABLE") !== 409) {
    throw new Error("SLOT_UNAVAILABLE must map to HTTP 409");
  }
});

Deno.test("validation stays client error", () => {
  if (httpStatusForDomainCode("INVALID_PHONE") !== 400) {
    throw new Error("validation must map to HTTP 400");
  }
});

Deno.test("unknown failures are hidden behind stable server contract", () => {
  const code = extractDomainCode(new Error("database internal detail"));
  if (code !== "BOOKING_CREATE_FAILED" || httpStatusForDomainCode(code) !== 500) {
    throw new Error("unknown failures must map to stable HTTP 500");
  }
});

Deno.test("conflict message is customer-recoverable", () => {
  if (!publicBookingMessage("SLOT_TAKEN").includes("ocupado")) {
    throw new Error("conflict message must explain slot invalidation");
  }
});

Deno.test("rate limit is throttled", () => {
  if (httpStatusForDomainCode("RATE_LIMITED") !== 429) {
    throw new Error("RATE_LIMITED must map to HTTP 429");
  }
});

Deno.test("duplicate in-flight idempotency request is a conflict", () => {
  if (httpStatusForDomainCode("IDEMPOTENCY_IN_PROGRESS") !== 409) {
    throw new Error("IDEMPOTENCY_IN_PROGRESS must map to HTTP 409");
  }
  if (!publicBookingMessage("IDEMPOTENCY_IN_PROGRESS").includes("processada")) {
    throw new Error("in-flight idempotency message should be actionable");
  }
});


Deno.test("shop order conflicts are recoverable and never reported as success", () => {
  for (const code of ["IDEMPOTENCY_KEY_REUSED", "SHOP_NOT_ENABLED", "SHOP_ITEM_UNAVAILABLE", "SHOP_STOCK_UNAVAILABLE"]) {
    if (httpStatusForDomainCode(code) !== 409) throw new Error(code + " must map to HTTP 409");
  }
});

Deno.test("shop order validation errors are client errors", () => {
  for (const code of ["INVALID_SHOP_ORDER_ITEMS", "INVALID_SHOP_ORDER_QUANTITY", "INVALID_SHOP_ORDER_OPTIONS", "INVALID_SHOP_FULFILMENT_MODE"]) {
    if (httpStatusForDomainCode(code) !== 400) throw new Error(code + " must map to HTTP 400");
  }
});

Deno.test("composition requires valid unique add-ons and a bounded quote", () => {
 const a="11111111-1111-4111-8111-111111111111", b="22222222-2222-4222-8222-222222222222";
 const base={p_service_id:a,p_addon_ids:[b],p_expected_price:38000,p_expected_duration:60};
 if (!isValidComposition(base) || !isValidComposition({p_service_id:a})) throw new Error("valid request rejected");
 for (const input of [{...base,p_addon_ids:[a]},{...base,p_addon_ids:[b,b]},{...base,p_addon_ids:["bad"]},{...base,p_addon_ids:null},{...base,p_expected_price:undefined},{...base,p_expected_duration:481},{...base,p_expected_price:-1},{...base,p_expected_duration:4}]) {
  if (isValidComposition(input)) throw new Error("invalid composition accepted");
 }
 if (httpStatusForDomainCode("BOOKING_QUOTE_CHANGED")!==409 || httpStatusForDomainCode("INVALID_BOOKING_OFFER")!==400) throw new Error("invalid error mapping");
});
