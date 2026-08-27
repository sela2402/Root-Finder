// ---------- Elements ----------
const functionInput = document.getElementById('functionInput');
const findRootButton = document.getElementById('findRootButton');
const resultEl = document.getElementById('result');
const root1Output = document.getElementById('root1Output');
const root2Output = document.getElementById('root2Output');
const canvas = document.getElementById('graphCanvas');
const ctx = canvas.getContext('2d');

// Make the graph noticeably bigger than the HTML default (400x400)
canvas.width = 640;
canvas.height = 460;

// Live coordinate readout shown under the graph as the mouse moves over it
const coordDisplay = document.createElement('p');
coordDisplay.id = 'coordDisplay';
coordDisplay.textContent = 'Move over the graph to see coordinates';
canvas.parentElement.appendChild(coordDisplay);

let currentView = null; // remembers the current data<->pixel mapping for hover lookups

// ---------- Parse "f(x) = ..." into a callable JS function ----------
function parseFunction(raw) {
    let expr = raw.trim();

    // Allow "f(x) = ..." or plain "..."; keep only the left side of "="
    // unless the right side is just "0".
    if (expr.includes('=')) {
        const [left, right] = expr.split('=').map(s => s.trim());
        expr = (right && right !== '0') ? `(${left}) - (${right})` : left;
    }

    // Basic sanitization: only allow safe characters
    const safePattern = /^[0-9x+\-*/^().\s a-zA-Z]*$/;
    if (!safePattern.test(expr)) {
        throw new Error('Expression contains unsupported characters.');
    }

    // Map common math notation to JS
    let jsExpr = expr
        .replace(/\^/g, '**')
        .replace(/\bsin\b/g, 'Math.sin')
        .replace(/\bcos\b/g, 'Math.cos')
        .replace(/\btan\b/g, 'Math.tan')
        .replace(/\bsqrt\b/g, 'Math.sqrt')
        .replace(/\bln\b/g, 'Math.log')
        .replace(/\blog\b/g, 'Math.log10')
        .replace(/\babs\b/g, 'Math.abs')
        .replace(/\bexp\b/g, 'Math.exp')
        .replace(/\bpi\b/g, 'Math.PI')
        .replace(/\be\b/g, 'Math.E');

    // Insert implicit multiplication: 2x -> 2*x, 2( -> 2*(, )x -> )*x, )( -> )*(
    jsExpr = jsExpr
        .replace(/(\d)(x)/g, '$1*$2')
        .replace(/(\d)(\()/g, '$1*$2')
        .replace(/(\))(\()/g, '$1*$2')
        .replace(/(\))(x)/g, '$1*$2')
        .replace(/(x)(\()/g, '$1*$2');

    let fn;
    try {
        // eslint-disable-next-line no-new-func
        fn = new Function('x', `"use strict"; return (${jsExpr});`);
        fn(1); // trial evaluation to catch syntax errors early
    } catch (err) {
        throw new Error('Could not parse the function. Check the syntax.');
    }
    return fn;
}

// ---------- Root finding: scan for sign changes, then bisect ----------
function findRoots(fn, xMin = -50, xMax = 50, steps = 2000, maxRoots = 2) {
    const roots = [];
    const dx = (xMax - xMin) / steps;

    let x0 = xMin, y0 = safeEval(fn, x0);
    let x1 = xMin + dx, y1 = safeEval(fn, x1);

    for (let i = 2; i <= steps && roots.length < maxRoots; i++) {
        const x2 = xMin + i * dx;
        const y2 = safeEval(fn, x2);

        if (y0 !== null && y1 !== null && y2 !== null) {
            if (Math.abs(y1) < 1e-9) {
                addUniqueRoot(roots, x1, maxRoots);
            } else if (y0 * y1 < 0) {
                // Sign change between x0 and x1: a simple crossing root.
                const root = bisect(fn, x0, x1);
                if (root !== null) addUniqueRoot(roots, root, maxRoots);
            } else if (
                y0 * y2 > 0 &&
                Math.abs(y1) < Math.abs(y0) &&
                Math.abs(y1) < Math.abs(y2)
            ) {
                // No sign change, but the curve dips toward zero and back —
                // a possible tangential (double) root touching the x-axis.
                const touch = ternaryMinAbs(fn, x0, x2);
                const yTouch = safeEval(fn, touch);
                if (yTouch !== null && Math.abs(yTouch) < 1e-4) {
                    addUniqueRoot(roots, touch, maxRoots, true);
                }
            }
        }
        x0 = x1; y0 = y1;
        x1 = x2; y1 = y2;
    }
    return roots;
}

// Adds a root to the list. When `duplicate` is true (a tangential/double
// root), the value is added twice — so Root1 and Root2 both show it —
// as long as there's room within maxRoots.
function addUniqueRoot(roots, value, maxRoots, duplicate = false) {
    const rounded = Math.round(value * 1e6) / 1e6;
    if (roots.some(r => Math.abs(r - rounded) < 1e-4)) return;
    roots.push(rounded);
    if (duplicate && roots.length < maxRoots) {
        roots.push(rounded);
    }
}

// Ternary search minimizing |f(x)| over [a, b]; used to home in on a point
// where the curve just touches zero without crossing it.
function ternaryMinAbs(fn, a, b, iterations = 100) {
    for (let i = 0; i < iterations; i++) {
        const m1 = a + (b - a) / 3;
        const m2 = b - (b - a) / 3;
        const f1 = Math.abs(safeEval(fn, m1) ?? Infinity);
        const f2 = Math.abs(safeEval(fn, m2) ?? Infinity);
        if (f1 < f2) b = m2; else a = m1;
    }
    return (a + b) / 2;
}

function bisect(fn, a, b, tol = 1e-9, maxIter = 100) {
    let fa = safeEval(fn, a);
    let fb = safeEval(fn, b);
    if (fa === null || fb === null || fa * fb > 0) return null;

    for (let i = 0; i < maxIter; i++) {
        const mid = (a + b) / 2;
        const fm = safeEval(fn, mid);
        if (fm === null) return null;
        if (Math.abs(fm) < tol || (b - a) / 2 < tol) return mid;
        if (fa * fm < 0) {
            b = mid;
            fb = fm;
        } else {
            a = mid;
            fa = fm;
        }
    }
    return (a + b) / 2;
}

function safeEval(fn, x) {
    try {
        const y = fn(x);
        return Number.isFinite(y) ? y : null;
    } catch {
        return null;
    }
}

// ---------- Graph drawing ----------
// Picks a "nice" grid spacing (1, 2, 5, 10, ...) for roughly `targetTicks` lines.
function niceStep(range, targetTicks) {
    const rough = range / targetTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    let step;
    if (norm < 1.5) step = 1;
    else if (norm < 3) step = 2;
    else if (norm < 7) step = 5;
    else step = 10;
    return step * mag;
}

function formatTick(value) {
    const rounded = Math.round(value * 1000) / 1000;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function drawGraph(fn, roots) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const xMin = -10, xMax = 10;
    const style = getComputedStyle(document.body);

    // Determine a sensible y range by sampling
    let yMin = Infinity, yMax = -Infinity;
    for (let px = 0; px <= w; px++) {
        const x = xMin + (px / w) * (xMax - xMin);
        const y = safeEval(fn, x);
        if (y !== null && Math.abs(y) < 1e4) {
            yMin = Math.min(yMin, y);
            yMax = Math.max(yMax, y);
        }
    }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
        yMin = -10; yMax = 10;
    }
    const pad = (yMax - yMin) * 0.15 || 1;
    yMin -= pad; yMax += pad;

    const toPx = (x, y) => [
        ((x - xMin) / (xMax - xMin)) * w,
        h - ((y - yMin) / (yMax - yMin)) * h
    ];
    currentView = { xMin, xMax, yMin, yMax, w, h };

    // ---- Grid lines + coordinate labels ----
    const xStep = niceStep(xMax - xMin, 10);
    const yStep = niceStep(yMax - yMin, 8);
    const [zx] = toPx(0, 0);
    const [, zy] = toPx(0, 0);

    ctx.strokeStyle = '#1f2440';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#6b7099';
    ctx.font = '11px Segoe UI, sans-serif';

    for (let gx = Math.ceil(xMin / xStep) * xStep; gx <= xMax; gx += xStep) {
        const [px] = toPx(gx, 0);
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
        ctx.stroke();
        if (Math.abs(gx) > xStep / 1e6) {
            const labelY = zy > h - 14 ? h - 14 : (zy < 14 ? 14 : zy + 12);
            ctx.fillText(formatTick(gx), px + 3, labelY);
        }
    }

    for (let gy = Math.ceil(yMin / yStep) * yStep; gy <= yMax; gy += yStep) {
        const [, py] = toPx(0, gy);
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(w, py);
        ctx.stroke();
        if (Math.abs(gy) > yStep / 1e6) {
            const labelX = zx > w - 30 ? w - 30 : (zx < 4 ? 4 : zx + 4);
            ctx.fillText(formatTick(gy), labelX, py - 3);
        }
    }
    ctx.fillText('0', zx + 4, zy + 12);

    // Axes
    ctx.strokeStyle = '#2c3153';
    ctx.lineWidth = 1;
    // Axes
    ctx.strokeStyle = '#2c3153';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(zx, 0);
    ctx.lineTo(zx, h);
    ctx.moveTo(0, zy);
    ctx.lineTo(w, zy);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(zx, 0); ctx.lineTo(zx, h);
    ctx.moveTo(0, zy); ctx.lineTo(w, zy);
    ctx.stroke();

    // Function curve
    ctx.strokeStyle = '#4fd1c5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let px = 0; px <= w; px++) {
        const x = xMin + (px / w) * (xMax - xMin);
        const y = safeEval(fn, x);
        if (y === null || Math.abs(y) > 1e4) {
            started = false;
            continue;
        }
        const [cx, cy] = toPx(x, y);
        if (!started) {
            ctx.moveTo(cx, cy);
            started = true;
        } else {
            ctx.lineTo(cx, cy);
        }
    }
    ctx.stroke();

    // Root markers
    ctx.fillStyle = '#ff8a8a';
    roots.forEach(r => {
        const [rx, ry] = toPx(r, 0);
        ctx.beginPath();
        ctx.arc(rx, ry, 5, 0, Math.PI * 2);
        ctx.fill();
    });
}

// ---------- Display formatting: integer, else simplest fraction ----------
function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { [a, b] = [b, a % b]; }
    return a || 1;
}

// Continued-fraction expansion to find the simplest fraction close to x.
function toFraction(x, tol = 1e-6) {
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    let h1 = 1, h0 = 0, k1 = 0, k0 = 1;
    let b = x;
    do {
        const a = Math.floor(b);
        [h1, h0] = [a * h1 + h0, h1];
        [k1, k0] = [a * k1 + k0, k1];
        if (Math.abs(b - a) < tol) break;
        b = 1 / (b - a);
    } while (Math.abs(x - h1 / k1) > tol * x && k1 < 1e6);

    const g = gcd(h1, k1);
    return { num: sign * (h1 / g), den: k1 / g };
}

function formatRoot(value) {
    const rounded = Math.round(value);
    if (Math.abs(value - rounded) < 1e-6) {
        return String(rounded);
    }
    const { num, den } = toFraction(value);
    if (den === 1) return String(num);
    return `${num}/${den}`;
}

// ---------- Main handler ----------
function handleFindRoot() {
    resultEl.textContent = '';
    root1Output.textContent = '';
    root2Output.textContent = '';

    const raw = functionInput.value;
    if (!raw.trim()) {
        resultEl.textContent = 'Please enter a function.';
        return;
    }

    let fn;
    try {
        fn = parseFunction(raw);
    } catch (err) {
        resultEl.textContent = err.message;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    const roots = findRoots(fn);

    const isDoubleRoot = roots.length === 2 && Math.abs(roots[0] - roots[1]) < 1e-4;

    if (roots.length === 0) {
        resultEl.textContent = 'No real roots found in the search range (-50 to 50).';
    } else if (isDoubleRoot) {
        resultEl.textContent = 'Found a repeated (double) root.';
    } else {
        resultEl.textContent = `Found ${roots.length} root${roots.length > 1 ? 's' : ''}.`;
    }

    root1Output.textContent = roots[0] !== undefined ? formatRoot(roots[0]) : '—';
    root2Output.textContent = roots[1] !== undefined ? formatRoot(roots[1]) : '—';

    drawGraph(fn, roots);
}

findRootButton.addEventListener('click', handleFindRoot);
functionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleFindRoot();
});

canvas.addEventListener('mousemove', (e) => {
    if (!currentView) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    const { xMin, xMax, yMin, yMax, w, h } = currentView;
    const x = xMin + (px / w) * (xMax - xMin);
    const y = yMin + ((h - py) / h) * (yMax - yMin);
    coordDisplay.textContent = `x: ${x.toFixed(3)}, y: ${y.toFixed(3)}`;
});

canvas.addEventListener('mouseleave', () => {
    coordDisplay.textContent = 'Move over the graph to see coordinates';
});