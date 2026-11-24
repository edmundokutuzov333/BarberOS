// Launch policy: enabling payments requires a reviewed backend migration and UI release.
export const PAYMENTS_AVAILABLE: boolean = false;
export function requirePaymentsAvailable(): void {
  if (!PAYMENTS_AVAILABLE) throw new Error("PAYMENTS_UNAVAILABLE");
}
