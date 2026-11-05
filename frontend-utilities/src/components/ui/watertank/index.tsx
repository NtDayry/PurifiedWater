import { useEffect, useRef } from 'react';

interface WaterTankProps {
  level: number; // 0–100 %
  minLevel?: number; // alert min %
  maxLevel?: number; // alert max %
  capacity?: number;
  unit?: string;
  width?: number;
  height?: number;
  color?: string;
  sublabel?: string;
  isDark?: boolean;
  loading?: boolean;
}

export const WaterTank = ({
  level,
  minLevel = 350,
  maxLevel = 1800,
  capacity = 2000,
  unit = 'L',
  width = 120,
  height = 180,
  color = '#00d4ff',
  isDark = true,
  loading = false,
}: WaterTankProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const phaseRef = useRef(0);

  useEffect(() => {
    if (loading) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Handle high-DPI screens and react to size changes
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const ctx = canvas.getContext('2d')!;
    // Reset transform then scale so drawing coordinates are in CSS pixels
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    const W = width;
    const H = height;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      const fillH = (level / capacity) * H;
      const y0 = H - fillH;
      phaseRef.current += 0.035;
      const ph = phaseRef.current;

      // Background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      if (isDark) {
        bgGrad.addColorStop(0, 'rgba(10,20,40,0.92)');
        bgGrad.addColorStop(1, 'rgba(5,12,25,0.96)');
      } else {
        bgGrad.addColorStop(0, 'rgba(225,235,248,0.92)');
        bgGrad.addColorStop(1, 'rgba(200,215,235,0.96)');
      }
      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.roundRect(0, 0, W, H, [8, 8, 14, 14]);
      ctx.fill();

      // Grid / depth markers
      for (let i = 1; i < 5; i++) {
        const gy = (i / 5) * H;
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([3, 6]);
        ctx.beginPath();
        ctx.moveTo(8, gy);
        ctx.lineTo(W - 8, gy);
        ctx.stroke();
        ctx.setLineDash([]);
        // tick label (20%, 40%, 60%, 80%)
        const pct = Math.round(100 - i * 20);
        ctx.font = `${Math.max(12, Math.round(W * 0.034))}px 'DM Mono', monospace`;
        ctx.textAlign = 'right';
        ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(71, 71, 71, 0.7)';
        ctx.fillText(`${pct}%`, W - 6, gy - 2);
      }

      // MIN line
      if (minLevel !== undefined && minLevel !== null) {
        const yMin = H - (minLevel / capacity) * H;
        ctx.strokeStyle = '#ff5e00';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(4, yMin);
        ctx.lineTo(W - 4, yMin);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `bold ${Math.max(12, Math.round(W * 0.034))}px "DM Mono", monospace`;
        ctx.textAlign = 'left';
        ctx.fillStyle = `${isDark ? '#fce300' : '#ff7b00'}`;
        ctx.fillText(`MIN (${Math.round(minLevel)} ${unit})`, 5, yMin - 4);
      }

      // MAX line
      if (maxLevel !== undefined && maxLevel !== null) {
        const yMax = H - (maxLevel / capacity) * H;
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(4, yMax);
        ctx.lineTo(W - 4, yMax);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#f43f5e';
        ctx.fillText(`MAX (${Math.round(maxLevel)} ${unit})`, 5, yMax - 4);
      }


      // Water body
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(0, 0, W, H, [8, 8, 14, 14]);
      ctx.clip();

      ctx.beginPath();
      ctx.moveTo(0, y0 + 7 * Math.sin(ph));
      for (let x = 0; x <= W; x += 2) {
        const w1 = 6 * Math.sin((x / W) * 4 * Math.PI + ph);
        const w2 = 4 * Math.sin((x / W) * 6 * Math.PI - ph * 1.3);
        ctx.lineTo(x, y0 + w1 + w2);
      }
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();

      const wg = ctx.createLinearGradient(0, y0, 0, H);
      wg.addColorStop(0, color + 'cc');
      wg.addColorStop(0.4, color + '99');
      wg.addColorStop(1, color + '44');
      ctx.fillStyle = wg;
      ctx.fill();

      // Wave crest line
      ctx.beginPath();
      ctx.moveTo(0, y0 + 7 * Math.sin(ph));
      for (let x = 0; x <= W; x += 2) {
        ctx.lineTo(x, y0 + 6 * Math.sin((x / W) * 4 * Math.PI + ph) + 4 * Math.sin((x / W) * 6 * Math.PI - ph * 1.3));
      }
      ctx.strokeStyle = color + 'ff';
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Foam bubble highlights
      for (let b = 0; b < 3; b++) {
        const bx = ((b * 37 + ph * 10) % (W - 20)) + 10;
        const by = y0 + 4 * Math.sin(ph + b) - 4;
        ctx.beginPath();
        ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fill();
      }

      // Inner reflection
      const rg = ctx.createLinearGradient(0, y0, W * 0.35, y0 + 24);
      rg.addColorStop(0, 'rgba(255,255,255,0.14)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.ellipse(W * 0.22, y0 + 12, W * 0.14, 9, -0.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Border
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(0.75, 0.75, W - 1.5, H - 1.5, [8, 8, 14, 14]);
      ctx.stroke();

      // Level % center text
      ctx.font = `bold ${Math.max(34, Math.round(W * 0.11))}px 'DM Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.92)' : 'rgba(0, 60, 255, 0.79)';
      ctx.shadowColor = isDark ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.9)';
      ctx.shadowBlur = 6;
      ctx.fillText(`${Math.round(level)} ${unit}`, W / 2, H / 2 + 6);
      ctx.shadowBlur = 0;

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [level, color, isDark, minLevel, maxLevel, width, height, capacity, unit, loading]);

  const isWarning = !loading && (level < minLevel || level > maxLevel);

  if (loading) {
    return (
      <div className="dark:border-gray-800 animate-pulse">
        <div className="flex flex-col items-center gap-2">
          <div
            style={{
              width: `${width}px`,
              height: `${height}px`,
              borderRadius: 14,
            }}
            className="bg-gray-100 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 flex flex-col items-center justify-center gap-3 relative overflow-hidden"
          >
            <div className="absolute inset-x-0 bottom-0 bg-blue-500/10 dark:bg-blue-400/10 h-1/3 rounded-b-xl" />
            <div className="h-9 w-32 bg-gray-200 dark:bg-gray-700/70 rounded-md" />
            <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700/70 rounded-md" />
          </div>
          <div className="h-6 w-36 bg-gray-200 dark:bg-gray-700/60 rounded-md mt-1" />
        </div>
      </div>
    );
  }

  return (
    <div className="dark:border-gray-800">
      <div className="flex flex-col items-center gap-2">
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{
              display: 'block',
              borderRadius: 8,
              filter: isWarning ? `drop-shadow(0 0 8px ${level < minLevel ? '#f59e0b' : '#f43f5e'})` : undefined,
            }}
          />
          {isWarning && (
            <div
              className="absolute top-3 right-3 text-xs font-bold px-1.5 py-0.5 rounded"
              style={{
                background: level < minLevel ? '#f59e0b22' : '#f43f5e22',
                color: level < minLevel ? '#f59e0b' : '#f43f5e',
                textAlign: 'center',
                fontSize: 15,
                border: `1px solid ${level < minLevel ? '#f59e0b44' : '#f43f5e44'}`,
              }}
            >
              {level < minLevel ? '⚠ LOW' : '⚠ HIGH'}
            </div>
          )}
        </div> 
          <div className="text-center dark:text-white">
            {capacity && <div style={{ marginTop: 1, color, fontSize: Math.max(20, Math.round(width * 0.07)), fontWeight: 800 }}>{Math.round(level)}/{Math.round(capacity)} Litre</div>}
          </div>
      </div>
    </div>
  );
};
