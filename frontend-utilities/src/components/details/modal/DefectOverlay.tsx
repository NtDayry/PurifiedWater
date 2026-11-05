import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScanDetail } from '@_types/details';
import { imagePath } from '@/components/utils/formatImagePath';

type DefectItem = ScanDetail['defects'][number];
type OcrItem = ScanDetail['ocr_results'][string] & { fieldKey: string };

interface Props {
  src: string;
  defects: DefectItem[];
  ocrResults?: ScanDetail['ocr_results'];
  activeIndex: number | null;
  activeOcrKey?: string | null;
  onActiveOcrKeyChange: (key: string | null) => void;
  onActiveIndexChange: (index: number | null) => void;
}

interface BoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function normalizeBox(box: Array<number | null | undefined>, naturalWidth: number, naturalHeight: number): BoxRect | null {
  const values = box.slice(0, 4).map((value) => (typeof value === 'number' && Number.isFinite(value) ? value : null));
  if (values.some((value) => value === null)) return null;

  const [a, b, c, d] = values as number[];
  const max = Math.max(a, b, c, d);
  const min = Math.min(a, b, c, d);

  // normalized xywh
  if (min >= 0 && max <= 2) {
    return {
      x: a * naturalWidth,
      y: b * naturalHeight,
      w: c * naturalWidth,
      h: d * naturalHeight,
    };
  }

  // pixel xyxy
  if (c > a && d > b) {
    return {
      x: a,
      y: b,
      w: c - a,
      h: d - b,
    };
  }

  // pixel xywh fallback
  return {
    x: a,
    y: b,
    w: c,
    h: d,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function severityStyle(index: number) {
  const palette = ['#f43f5e', '#f59e0b', '#60a5fa', '#a855f7', '#14b8a6'];
  const color = palette[index % palette.length];
  return {
    color,
    border: `${color}99`,
    fill: `${color}1f`,
  };
}

function ocrFieldStyle(fieldKey: string) {
  const map: Record<string, { color: string; border: string; fill: string; soft: string; glow: string }> = {
    lot: {
      color: '#03cef1',
      border: '#00ddff',
      fill: 'rgba(6, 182, 212, 0.12)',
      soft: 'rgba(6, 182, 212, 0.06)',
      glow: 'rgba(6, 182, 212, 0.32)',
    },
    mfg: {
      color: '#8b5cf6',
      border: '#8158fc',
      fill: 'rgba(139, 92, 246, 0.12)',
      soft: 'rgba(139, 92, 246, 0.06)',
      glow: 'rgba(139, 92, 246, 0.32)',
    },
    exp: {
      color: '#fa9e00',
      border: '#ff960c',
      fill: 'rgba(245, 158, 11, 0.12)',
      soft: 'rgba(245, 158, 11, 0.06)',
      glow: 'rgba(245, 158, 11, 0.32)',
    },
  };

  return map[fieldKey] ?? {
    color: '#60a5fa',
    border: '#93c5fd',
    fill: 'rgba(96, 165, 250, 0.12)',
    soft: 'rgba(96, 165, 250, 0.06)',
    glow: 'rgba(96, 165, 250, 0.32)',
  };
}

export default function DefectOverlay({
  src,
  defects,
  ocrResults,
  activeIndex,
  activeOcrKey,
  onActiveOcrKeyChange,
  onActiveIndexChange,
}: Props) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [frameSize, setFrameSize] = useState({ width: 480, height: 480 });

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const update = () => {
      setFrameSize({
        width: wrapper.clientWidth,
        height: wrapper.clientHeight,
      });
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(wrapper);

    return () => observer.disconnect();
  }, [src]);

  const scaledDefects = useMemo(() => {
    if (!naturalSize.width || !naturalSize.height || !frameSize.width || !frameSize.height) {
      return [] as Array<DefectItem & { rect: BoxRect }>;
    }

    const scale = Math.min(frameSize.width / naturalSize.width, frameSize.height / naturalSize.height);
    const imageWidth = naturalSize.width * scale;
    const imageHeight = naturalSize.height * scale;
    const offsetX = (frameSize.width - imageWidth) / 2;
    const offsetY = (frameSize.height - imageHeight) / 2;

    return defects
      .map((defect) => {
        const rect = normalizeBox(defect.box, naturalSize.width, naturalSize.height);
        if (!rect) return null;

        return {
          ...defect,
          rect: {
            x: rect.x * scale + offsetX,
            y: rect.y * scale + offsetY,
            w: rect.w * scale,
            h: rect.h * scale,
          },
        };
      })
      .filter((item): item is DefectItem & { rect: BoxRect } => item !== null);
  }, [defects, naturalSize.height, naturalSize.width, frameSize.height, frameSize.width]);

  const scaledOcr = useMemo(() => {
    if (!ocrResults || !naturalSize.width || !naturalSize.height || !frameSize.width || !frameSize.height) {
      return [] as Array<OcrItem & { rect: BoxRect }>;
    }

    const scale = Math.min(frameSize.width / naturalSize.width, frameSize.height / naturalSize.height);
    const imageWidth = naturalSize.width * scale;
    const imageHeight = naturalSize.height * scale;
    const offsetX = (frameSize.width - imageWidth) / 2;
    const offsetY = (frameSize.height - imageHeight) / 2;

    return Object.entries(ocrResults)
      .map(([fieldKey, value]) => {
        const rect = normalizeBox(value.box ?? [], naturalSize.width, naturalSize.height);
        if (!rect) return null;

        return {
          fieldKey,
          ...value,
          rect: {
            x: rect.x * scale + offsetX,
            y: rect.y * scale + offsetY,
            w: rect.w * scale,
            h: rect.h * scale,
          },
        };
      })
      .filter((item): item is OcrItem & { rect: BoxRect } => item !== null);
  }, [frameSize.height, frameSize.width, naturalSize.height, naturalSize.width, ocrResults]);

  const hasActiveHighlight = activeIndex !== null || activeOcrKey !== null;

  return (
    <div
      ref={wrapperRef}
      className="relative aspect-square h-[300px] w-full overflow-hidden rounded-xl border border-gray-400/[0.3] bg-gray-300/[0.3] dark:border-gray-800/[0.3] dark:bg-black/[0.5]"
    >
      <img
        ref={imageRef}
        src={imagePath(src)}
        alt="scan preview"
        className="block h-full w-full select-none object-contain"
        onLoad={(event) => {
          setNaturalSize({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          });
        }}
      />

      {frameSize.width > 0 && frameSize.height > 0 && (scaledDefects.length > 0 || scaledOcr.length > 0) ? (
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${frameSize.width} ${frameSize.height}`} preserveAspectRatio="none">
          {hasActiveHighlight ? <rect x={0} y={0} width={frameSize.width} height={frameSize.height} fill="rgba(2, 6, 23, 0.42)" /> : null}

          {scaledOcr.map((ocr) => {
            const style = ocrFieldStyle(ocr.fieldKey);
            const isActive = activeOcrKey === ocr.fieldKey;
            const label = `${ocr.fieldKey.toUpperCase()}: ${ocr.text} (${ocr.confidence}%)`;
            const pillWidth = clamp(label.length * 5.8 + 22, 124, 260);
            const pillX = clamp(ocr.rect.x, 6, frameSize.width - pillWidth - 6);
            const pillY = ocr.rect.y >= 18 ? ocr.rect.y - 23 : ocr.rect.y + ocr.rect.h + 4;

            return (
              <g
                key={`ocr-${ocr.fieldKey}`}
                className="cursor-pointer"
                pointerEvents="all"
                onMouseEnter={() => onActiveOcrKeyChange(ocr.fieldKey)}
                onMouseLeave={() => onActiveOcrKeyChange(null)}
              >
                <rect
                  x={ocr.rect.x}
                  y={ocr.rect.y}
                  width={ocr.rect.w}
                  height={ocr.rect.h}
                  fill={isActive ? style.fill : style.soft}
                  stroke={isActive ? style.border : `${style.border}88`}
                  strokeWidth={isActive ? 2.5 : 1.2}
                  strokeDasharray={isActive ? 'none' : '4 3'}
                />

                {isActive ? (
                  <g>
                    <rect x={pillX} y={pillY} width={pillWidth} height={20} rx={4} fill="rgba(17, 24, 39, 0.84)" stroke={style.border} strokeWidth={0.8} />
                    <text x={pillX + 6} y={pillY + 14} fontFamily="monospace" fontSize={11} fontWeight={700} fill={style.color}>
                      {label}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}

          {scaledDefects.map((defect, index) => {
            const active = activeIndex === index;
            const style = severityStyle(index);
            const label = `${defect.class_name?.replace("_", " ").toUpperCase()} (${defect.confidence.toFixed(1)}%)`;
            const pillWidth = clamp(label.length * 6.2 + 22, 92, 160);
            const pillX = clamp(defect.rect.x, 6, frameSize.width - pillWidth - 6);
            const pillY = defect.rect.y >= 18 ? defect.rect.y - 23 : defect.rect.y + defect.rect.h + 4;

            return (
              <g
                key={`${defect.class_name}-${index}`}
                className="cursor-crosshair"
                pointerEvents="all"
                onMouseEnter={() => onActiveIndexChange(index)}
                onMouseLeave={() => onActiveIndexChange(null)}
              >
                <rect
                  x={defect.rect.x}
                  y={defect.rect.y}
                  width={defect.rect.w}
                  height={defect.rect.h}
                  fill={active ? `${style.color}33` : style.fill}
                  stroke={style.border}
                  strokeWidth={active ? 2.5 : 1.4}
                  strokeDasharray={active ? 'none' : '6 4'}
                />

                {[
                  [
                    [defect.rect.x, defect.rect.y + 12],
                    [defect.rect.x, defect.rect.y],
                    [defect.rect.x + 12, defect.rect.y],
                  ],
                  [
                    [defect.rect.x + defect.rect.w - 12, defect.rect.y],
                    [defect.rect.x + defect.rect.w, defect.rect.y],
                    [defect.rect.x + defect.rect.w, defect.rect.y + 12],
                  ],
                  [
                    [defect.rect.x, defect.rect.y + defect.rect.h - 12],
                    [defect.rect.x, defect.rect.y + defect.rect.h],
                    [defect.rect.x + 12, defect.rect.y + defect.rect.h],
                  ],
                  [
                    [defect.rect.x + defect.rect.w - 12, defect.rect.y + defect.rect.h],
                    [defect.rect.x + defect.rect.w, defect.rect.y + defect.rect.h],
                    [defect.rect.x + defect.rect.w, defect.rect.y + defect.rect.h - 12],
                  ],
                ].map((points, cornerIndex) => (
                  <polyline
                    key={cornerIndex}
                    points={points.map((point) => point.join(',')).join(' ')}
                    fill="none"
                    stroke={style.color}
                    strokeWidth={active ? 3.2 : 2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}

                {active ? (
                  <g>
                    <rect
                      x={pillX}
                      y={pillY}
                      width={pillWidth}
                      height={20}
                      rx={4}
                      fill="rgba(66, 66, 66, 0.8)"
                      stroke={style.border}
                      strokeWidth={0.8}
                    />
                    <text x={pillX + 6} y={pillY + 14} fontFamily="monospace" fontSize={11} fontWeight={700} fill={style.color}>
                      {label}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}
