export const SLOT_CONFLICT_CODES = new Set(["SLOT_TAKEN", "SLOT_UNAVAILABLE"]);

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
]);

export function extractDomainCode(error: unknown): string {
  const message = typeof error === "string"
    ? error
    : error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";

  for (const code of [...SLOT_CONFLICT_CODES, ...CLIENT_ERROR_CODES]) {
    if (message.includes(code)) return code;
  }

  return "BOOKING_CREATE_FAILED";
}

export function httpStatusForDomainCode(code: string): number {
  if (SLOT_CONFLICT_CODES.has(code)) return 409;
  if (CLIENT_ERROR_CODES.has(code)) return 400;
  return 500;
}

export function publicBookingMessage(code: string): string {
  switch (code) {
    case "SLOT_TAKEN":
    case "SLOT_UNAVAILABLE":
      return "Este horário acabou de ser ocupado. Escolha outro horário.";
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
    default:
      return "Não foi possível criar a marcação. Tenta de novo.";
  }
}
