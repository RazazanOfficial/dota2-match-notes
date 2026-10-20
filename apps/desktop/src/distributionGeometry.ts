import { isPersian, type Messages } from "./i18n";
export function distributionPositionLabel(position: number, t: Messages) {
    return [t.unknownPosition,t.positionCarry,t.positionMid,t.positionOfflane,t.positionSoftSupport,t.positionHardSupport][position] || t.unknownPosition;
}
export function ringArc(from: number, to: number, inner: number, outer: number) {
    const point = (angle: number, radius: number) => `${160 + Math.sin(angle) * radius},${160 - Math.cos(angle) * radius}`;
    const gap = Math.min(.006, (to - from) / 10), a = from + gap, b = to - gap, middle = (a + b) / 2;
    return `M ${point(a, outer)} A ${outer} ${outer} 0 0 1 ${point(middle, outer)} A ${outer} ${outer} 0 0 1 ${point(b, outer)} L ${point(b, inner)} A ${inner} ${inner} 0 0 0 ${point(middle, inner)} A ${inner} ${inner} 0 0 0 ${point(a, inner)} Z`;
}
export function segmentIconLayout(from: number, to: number, inner: number, outer: number) {
    const span = to - from, middle = (from + to) / 2, radius = (inner + outer) / 2;
    const paddingAngle = Math.min(.006, span / 10);
    const angularDiameter = 2 * radius * Math.sin(Math.min(Math.PI, Math.max(0, span - paddingAngle * 2)) / 2);
    const size = Math.min(34, (outer - inner) - 6, angularDiameter * .84);
    return { x: 160 + Math.sin(middle) * radius, y: 160 - Math.cos(middle) * radius, size };
}
export function distributionPercent(value: number, t: Messages, decimals = 0) {
    const options = decimals === 0 && value > 0 && value < 1 ? { maximumSignificantDigits: 2 } : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
    return `${new Intl.NumberFormat(isPersian(t) ? "fa-IR" : "en-US", options).format(value)}${isPersian(t) ? "٪" : "%"}`;
}
