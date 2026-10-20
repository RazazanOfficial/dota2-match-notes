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
// Preserve the real wedge angles. Small icons can use alternating radial tracks
// instead of being cropped into a circular badge or hidden below a share threshold.
export function ringIconLayouts(counts: number[], total: number, inner: number, outer: number) {
    let angle = 0;
    const result = counts.map(count => {
        const from = angle; angle += count / Math.max(1,total) * Math.PI * 2;
        return { from, to: angle, angle: (from+angle)/2, x: 160, y: 160, size: Math.min(30,(outer-inner-2)/Math.SQRT2/1.07,Math.max(16,segmentIconLayout(from,angle,inner,outer).size)) };
    });
    const occupied: Array<{x: number; y: number; size: number}> = [];
    // Large sectors have room to keep their icon centered; reserve that space first.
    for (const item of [...result].sort((a,b)=>(b.to-b.from)-(a.to-a.from))) {
        let found = false;
        for (const size of [...new Set([item.size,16,14,12,10,8].filter(value=>value<=item.size))]) {
            const clearance = size * 1.07 / Math.SQRT2 + 1;
            const radii = [(inner+outer)/2, inner+clearance, outer-clearance];
            for (const radius of radii) {
                const x = 160 + Math.sin(item.angle)*radius, y = 160 - Math.cos(item.angle)*radius;
                if (occupied.some(old=>Math.abs(x-old.x)<(size+old.size)/2+1 && Math.abs(y-old.y)<(size+old.size)/2+1)) continue;
                Object.assign(item,{x,y,size}); found=true; break;
            }
            if (found) break;
        }
        if (!found) Object.assign(item,{x:160+Math.sin(item.angle)*(inner+outer)/2,y:160-Math.cos(item.angle)*(inner+outer)/2,size:8});
        occupied.push(item);
    }
    return result;
}
const percentFormats = new Map<string, Intl.NumberFormat>();
export function distributionPercent(value: number, t: Messages, decimals = 0) {
    const options = decimals === 0 && value > 0 && value < 1 ? { maximumSignificantDigits: 2 } : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
    const key=`${isPersian(t)}-${decimals}-${decimals===0 && value>0 && value<1}`;
    let format=percentFormats.get(key); if(!format){format=new Intl.NumberFormat(isPersian(t)?"fa-IR":"en-US",options);percentFormats.set(key,format);}
    return `${format.format(value)}${isPersian(t)?"٪":"%"}`;
}
