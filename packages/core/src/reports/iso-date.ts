const DAY_MILLISECONDS = 86_400_000;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function leapYear(year: number): boolean { return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0); }
function yearDays(year: number): number { return 365 * year + Math.floor((year + 3) / 4) - Math.floor((year + 99) / 100) + Math.floor((year + 399) / 400); }
function monthDays(year: number, month: number): number { return MONTH_DAYS[month - 1]! + (month === 2 && leapYear(year) ? 1 : 0); }
const EPOCH_DAYS = yearDays(1970);

export function isoDateMilliseconds(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return Number.NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > monthDays(year, month)) return Number.NaN;
  let days = yearDays(year) - EPOCH_DAYS + day - 1;
  for (let current = 1; current < month; current += 1) days += monthDays(year, current);
  return days * DAY_MILLISECONDS;
}

export function millisecondsIsoDate(value: number): string {
  const days = Math.floor(value / DAY_MILLISECONDS) + EPOCH_DAYS;
  let year = Math.floor(days / 365.2425);
  while (yearDays(year + 1) <= days) year += 1;
  while (yearDays(year) > days) year -= 1;
  let remaining = days - yearDays(year);
  let month = 1;
  while (remaining >= monthDays(year, month)) { remaining -= monthDays(year, month); month += 1; }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${(remaining + 1).toString().padStart(2, "0")}`;
}
