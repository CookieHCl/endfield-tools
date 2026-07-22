/**
 * 부동소수 오차를 정리한다. 정수에 아주 가까우면 정수로 스냅(예: 9.9999999 → 10),
 * 그 외에는 6자리에서 반올림해 노이즈만 털어낸다(의도한 0.333333, 0.25 등은 유지).
 */
export function cleanNumber(x: number): number {
  if (!Number.isFinite(x)) return x;
  const rounded = Math.round(x);
  if (Math.abs(x - rounded) < 1e-6) return rounded;
  return Math.round(x * 1e6) / 1e6;
}

/** 입력 필드/표에 보여줄 문자열 (오차 정리 후) */
export function formatNumber(x: number): string {
  return String(cleanNumber(x));
}

/** 목록 항목용 고유 id */
export function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
