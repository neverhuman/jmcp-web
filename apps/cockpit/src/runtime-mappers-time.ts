export function formatAge(value: string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return value;
  }
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  return `${Math.round(seconds / 60)}m ago`;
}

export function formatAgeOrLiteral(value: string) {
  const formatted = formatAge(value);
  return formatted === value ? value : formatted;
}

export function formatUntil(value: string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return "unknown";
  }
  const seconds = Math.round((time - Date.now()) / 1000);
  if (seconds <= 0) {
    return "expired";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.round(seconds / 60)}m`;
}

export function formatUntilOrLiteral(value: string) {
  const formatted = formatUntil(value);
  return formatted === "unknown" ? value : formatted;
}

export function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
