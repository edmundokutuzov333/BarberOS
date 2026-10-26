export const SLOT_CONFLICT_CODES = new Set(["SLOT_TAKEN", "SLOT_UNAVAILABLE", "IDEMPOTENCY_IN_PROGRESS", "IDEMPOTENCY_KEY_REUSED", "SHOP_NOT_ENABLED", "SHOP_ITEM_UNAVAILABLE", "SHOP_STOCK_UNAVAILABLE"]);

export const CLIENT_ERROR_CODES = new Set([
  "INVALID_DATE",
  "INVALID_NAME",
  "INVALID_PHONE",
  "INVALID_EMAIL",
  "BARBERSHOP_NOT_FOUND",
  "SERVICE_NOT_FOUND",
  "HAIRCUT_NOT_FOUND",
  "BARBER_NOT_FOUND",
  "INVALID_DEPOSIT_CONFIGURATION",
  "RATE_LIMITED",
  "SHOP_ORDER_TOO_MANY_ITEMS",
  "INVALID_SHOP_ORDER_ITEMS",
  "INVALID_SHOP_ORDER_QUANTITY",
  "INVALID_SHOP_ORDER_OPTIONS",
  "INVALID_SHOP_FULFILMENT_MODE",
  "DUPLICATE_SHOP_ORDER_VARIANT",
  "SHOP_PRICE_INVALID",
  "SHOP_TOTAL_OVERFLOW",
]);

const SERVER_ERROR_CODES = new Set(["IDEMPOTENCY_STORE_UNAVAILABLE", "RATE_LIMIT_UNAVAILABLE"]);

export function extractDomainCode(error: unknown): string {
  const message = typeof error === "string"
    ? error
    : error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";

  for (const code of [...SLOT_CONFLICT_CODES, ...CLIENT_ERROR_CODES, ...SERVER_ERROR_CODES]) {
    if (message.includes(code)) return code;
  }

  return "BOOKING_CREATE_FAILED";
}

export function httpStatusForDomainCode(code: string): number {
  if (code === "RATE_LIMITED") return 429;
  if (SLOT_CONFLICT_CODES.has(code)) return 409;
  if (CLIENT_ERROR_CODES.has(code)) return 400;
  return 500;
}

export function publicBookingMessage(code: string): string {
  switch (code) {
    case "SLOT_TAKEN":
    case "SLOT_UNAVAILABLE":
      return "Este horário acabou de ser ocupado. Escolha outro horário.";
    case "IDEMPOTENCY_IN_PROGRESS":
      return "Esta tentativa ainda está a ser processada. Aguarda um momento antes de tentares de novo.";
    case "IDEMPOTENCY_KEY_REUSED":
      return "Os dados desta tentativa foram alterados. Confirma novamente para criar uma nova tentativa segura.";
    case "SHOP_NOT_ENABLED":
      return "A loja desta barbearia não está disponível para pedidos neste momento.";
    case "SHOP_ITEM_UNAVAILABLE":
    case "SHOP_STOCK_UNAVAILABLE":
      return "Um dos artigos deixou de estar disponível. Reveja os artigos seleccionados e tente novamente.";
    case "IDEMPOTENCY_STORE_UNAVAILABLE":
    case "RATE_LIMIT_UNAVAILABLE":
      return "Não foi possível confirmar a marcação agora. Tenta novamente dentro de instantes.";
    case "INVALID_NAME":
      return "Escreve um nome com pelo menos 2 letras.";
    case "INVALID_PHONE":
      return "Número inválido. Usa o formato 84 000 0000.";
    case "INVALID_EMAIL":
      return "Indica um email válido.";
    case "BARBERSHOP_NOT_FOUND":
      return "A barbearia não está disponível.";
    case "SERVICE_NOT_FOUND":
      return "Esse serviço já não está disponível.";
    case "HAIRCUT_NOT_FOUND":
      return "Esse corte já não está disponível.";
    case "BARBER_NOT_FOUND":
      return "Esse barbeiro já não está disponível.";
    case "INVALID_DEPOSIT_CONFIGURATION":
      return "O sinal configurado para este serviço é inválido.";
    case "INVALID_DATE":
      return "Escolhe uma data válida.";
    case "RATE_LIMITED":
      return "Atingiste o limite de tentativas. Tenta novamente dentro de alguns minutos.";
    default:
      return "Não foi possível criar a marcação. Tenta de novo.";
  }
}
