import {
  extractDomainCode,
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
