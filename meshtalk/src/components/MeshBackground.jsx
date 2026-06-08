import { useEffect, useRef } from 'react';

function randomBetween(a, b) { return a + Math.random() * (b - a); }

export default function MeshBackground({
    style,
    dotCount = 55,
    speed = 0.3,
    maxDist = 160,
    lineAlpha = 0.08,
    dotAlpha = 0.35,
    dotRadius = 2,
}) {
    const canvasRef = useRef(null);
    const cfg = useRef({ dotCount, speed, maxDist, lineAlpha, dotAlpha, dotRadius });
    cfg.current = { dotCount, speed, maxDist, lineAlpha, dotAlpha, dotRadius };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let raf, w, h;

        const dots = Array.from({ length: cfg.current.dotCount }, () => ({
            x: 0, y: 0, vx: 0, vy: 0,
        }));

        function resize() {
            w = canvas.width = canvas.offsetWidth;
            h = canvas.height = canvas.offsetHeight;
            const s = cfg.current.speed;
            dots.forEach(d => {
                d.x = randomBetween(0, w);
                d.y = randomBetween(0, h);
                d.vx = randomBetween(-s, s);
                d.vy = randomBetween(-s, s);
            });
        }

        function draw() {
            const { maxDist: md, lineAlpha: la, dotAlpha: da, dotRadius: dr, speed: sp } = cfg.current;
            ctx.clearRect(0, 0, w, h);

            dots.forEach(d => {
                d.x += d.vx;
                d.y += d.vy;
                if (d.x < 0 || d.x > w) d.vx *= -1;
                if (d.y < 0 || d.y > h) d.vy *= -1;
            });

            for (let i = 0; i < dots.length; i++) {
                for (let j = i + 1; j < dots.length; j++) {
                    const dx = dots[i].x - dots[j].x;
                    const dy = dots[i].y - dots[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < md) {
                        ctx.strokeStyle = `rgba(125,154,114,${(1 - dist / md) * la})`;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(dots[i].x, dots[i].y);
                        ctx.lineTo(dots[j].x, dots[j].y);
                        ctx.stroke();
                    }
                }
            }

            dots.forEach(d => {
                ctx.beginPath();
                ctx.arc(d.x, d.y, dr, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(125,154,114,${da})`;
                ctx.fill();
            });

            raf = requestAnimationFrame(draw);
        }

        const ro = new ResizeObserver(resize);
        ro.observe(canvas);
        resize();
        draw();

        return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }}
        />
    );
}
