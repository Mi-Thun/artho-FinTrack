// Calendar dates for forms.
//
// Transaction, deposit, and ledger dates are stored as UTC midnight of the calendar day
// the user picked (a `<input type="date">` value parsed with `new Date("YYYY-MM-DD")`),
// so *reading* one back is a plain UTC slice. What must not be UTC is "today": between
// midnight and 06:00 in Dhaka the UTC day is still yesterday, and every "Add" form
// defaulted to the wrong date. "Today" is therefore always taken in the app's time zone.

/** The time zone "today" is measured in. Override with NEXT_PUBLIC_APP_TIME_ZONE. */
const APP_TIME_ZONE = process.env.NEXT_PUBLIC_APP_TIME_ZONE || "Asia/Dhaka";

/** Today's calendar date in the app time zone, as a `YYYY-MM-DD` date-input value. */
export function todayInputValue(now: Date = new Date(), timeZone: string = APP_TIME_ZONE): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The current month in the app time zone, as a `YYYY-MM` month-input value. */
export function thisMonthInputValue(now: Date = new Date(), timeZone: string = APP_TIME_ZONE): string {
  return todayInputValue(now, timeZone).slice(0, 7);
}

/** A stored (UTC-midnight) date as a `YYYY-MM-DD` date-input value. */
export function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** A stored (UTC-midnight) date as a `YYYY-MM` month-input value. */
export function toMonthInput(d: Date): string {
  return d.toISOString().slice(0, 7);
}
