export const SLOT_CONFLICT_CODES = new Set(["SLOT_TAKEN", "SLOT_UNAVAILABLE", "IDEMPOTENCY_IN_PROGRESS", "IDEMPOTENCY_KEY_REUSED", "SHOP_NOT_ENABLED", "SHOP_ITEM_UNAVAILABLE", "SHOP_STOCK_UNAVAILABLE", "BOOKING_QUOTE_CHANGED"]);

export const CLIENT_ERROR_CODES = new Set([
  "INVALID_DATE",
  "INVALID_NAME",
  "INVALID_PHONE",
  "INVALID_EMAIL",
  "BARBERSHOP_NOT_FOUND",
  "SERVICE_NOT_FOUND",
  "HAIRCUT_NOT_FOUND",
  "INVALID_BOOKING_OFFER",
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
    case "BOOKING_QUOTE_CHANGED":
      return "O preço ou a duração mudou. Reveja os valores actualizados antes de confirmar.";
    case "INVALID_BOOKING_OFFER":
      return "A selecção já não é compatível. Reveja os serviços e complementos.";
    case "INVALID_DATE":
      return "Escolhe uma data válida.";
    case "RATE_LIMITED":
      return "Atingiste o limite de tentativas. Tenta novamente dentro de alguns minutos.";
    default:
      return "Não foi possível criar a marcação. Tenta de novo.";
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isValidComposition(body: Record<string, unknown>): boolean {
  const addons = body.p_addon_ids === undefined ? [] : body.p_addon_ids;
  if (!Array.isArray(addons) || addons.length > 5 || !addons.every(isUuid) || new Set(addons.map((id) => id.toLowerCase())).size !== addons.length || addons.some((id) => id.toLowerCase() === String(body.p_service_id).toLowerCase())) return false;
  const quote = body.p_expected_price !== undefined || body.p_expected_duration !== undefined;
  if (!quote) return addons.length === 0;
  return Number.isInteger(body.p_expected_price) && Number(body.p_expected_price) >= 0 && Number(body.p_expected_price) <= 2147483647 && Number.isInteger(body.p_expected_duration) && Number(body.p_expected_duration) >= 5 && Number(body.p_expected_duration) <= 480;
}
