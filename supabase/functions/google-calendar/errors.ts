export type CalendarErrorCode =
  | "GOOGLE_CALENDAR_NOT_CONFIGURED"
  | "GOOGLE_CALENDAR_INVALID_REQUEST"
  | "GOOGLE_CALENDAR_APPOINTMENT_NOT_FOUND"
  | "GOOGLE_CALENDAR_APPOINTMENT_NOT_ACTIVE"
  | "GOOGLE_CALENDAR_RATE_LIMITED"
  | "GOOGLE_CALENDAR_PROVIDER_FAILED"
  | "GOOGLE_CALENDAR_STATE_INVALID";

export class CalendarError extends Error {
  constructor(readonly code: CalendarErrorCode, readonly status = 500) {
    super(code);
  }
}
