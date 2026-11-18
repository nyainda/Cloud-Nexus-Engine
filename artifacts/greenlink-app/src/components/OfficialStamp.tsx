import { useId } from "react";
import {
  computeStampSerial,
  getStampPalette,
  getStampStatusLabel,
  tryGetPdfShopLogoAssets,
} from "@/lib/pdf-stamp";

export interface OfficialStampProps {
  shopId?: string;
  shopName: string;
  status: string;
  dateLabel: string;
  documentRef?: string;
  subtitle?: string;
  metaLine?: string;
  amountLabel?: string;
  size?: number;
  tiltDeg?: number;
  watermark?: boolean;
  className?: string;
}

function rgbStr(rgb: [number, number, number], alpha = 1): string {
  return alpha >= 1
    ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
    : `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/**
 * Vector SVG replica of `drawPdfStamp` for live browser previews and print views.
 * Keeps quotation/invoice on-screen previews visually consistent with downloaded PDFs.
 */
export function OfficialStamp({
  shopId,
  shopName,
  status,
  dateLabel,
  documentRef,
  subtitle = "OFFICIAL DIGITAL STAMP",
  metaLine,
  amountLabel,
  size = 152,
  tiltDeg = -4,
  watermark = false,
  className = "",
}: OfficialStampProps) {
  const uid = useId().replace(/:/g, "");
  const topArcId = `stamp-top-arc-${uid}`;
  const bottomArcId = `stamp-bot-arc-${uid}`;

  const assets = tryGetPdfShopLogoAssets(shopId, shopName);
  const sealName = (assets?.sealName ?? shopName).toUpperCase();
  const statusLabel = getStampStatusLabel(status);
  const palette = getStampPalette(status);
  const serial = computeStampSerial([
    sealName,
    documentRef,
    dateLabel,
    statusLabel,
    amountLabel,
  ]);

  const ink = rgbStr(palette.ink, 1);
  const accent = rgbStr(palette.accent, 0.9);
  const wash = rgbStr(palette.wash, 0.96);

  const cx = 110;
  const cy = 110;
  const rOuter = 104;
  const rPrimary = 99;
  const rGuard = 94.5;
  const rText = 84.5;
  const rInner = 75;
  const rBeads = 71;

  const teeth = Array.from({ length: 48 }, (_, i) => {
    const theta = (i / 48) * Math.PI * 2;
    return {
      x1: cx + (rPrimary + 1.5) * Math.cos(theta),
      y1: cy + (rPrimary + 1.5) * Math.sin(theta),
      x2: cx + rOuter * Math.cos(theta),
      y2: cy + rOuter * Math.sin(theta),
    };
  });

  const beads = Array.from({ length: 32 }, (_, i) => {
    const theta = (i / 32) * Math.PI * 2;
    return {
      cx: cx + rBeads * Math.cos(theta),
      cy: cy + rBeads * Math.sin(theta),
    };
  });

  const formattedRef = documentRef
    ? documentRef.toUpperCase().startsWith("REF") || documentRef.startsWith("#")
      ? documentRef.toUpperCase()
      : `REF: ${documentRef.toUpperCase()}`
    : "";

  const topFontSize = sealName.length > 36 ? 9.1 : sealName.length > 28 ? 10.2 : 11.2;
  const statusFontSize =
    statusLabel.length > 13 ? 11.5 : statusLabel.length > 10 ? 13 : 14.5;

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        transform: tiltDeg ? `rotate(${tiltDeg}deg)` : undefined,
        opacity: watermark ? 0.085 : 1,
        userSelect: "none",
      }}
      aria-label={`Official stamp: ${statusLabel}`}
    >
      <svg
        viewBox="0 0 220 220"
        width={size}
        height={size}
        role="img"
        style={{ overflow: "visible", display: "block" }}
      >
        <defs>
          {/* Top arc clockwise (left -> top -> right), optical track center */}
          <path
            id={topArcId}
            d={`M ${cx - rText},${cy} A ${rText},${rText} 0 1,1 ${cx + rText},${cy}`}
          />
          {/* Bottom arc counter-clockwise (left -> bottom -> right) so text reads upright */}
          <path
            id={bottomArcId}
            d={`M ${cx - rText},${cy} A ${rText},${rText} 0 0,0 ${cx + rText},${cy}`}
          />
        </defs>

        {/* Backdrop wash */}
        <circle cx={cx} cy={cy} r={rPrimary} fill={wash} />

        {/* Serrated perimeter ticks */}
        {teeth.map((t, i) => (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={accent}
            strokeWidth={watermark ? 0.8 : 1.15}
          />
        ))}

        {/* Concentric rings */}
        <circle cx={cx} cy={cy} r={rPrimary} fill="none" stroke={ink} strokeWidth="4" />
        <circle cx={cx} cy={cy} r={rGuard} fill="none" stroke={accent} strokeWidth="1.1" />
        <circle cx={cx} cy={cy} r={rInner} fill="none" stroke={ink} strokeWidth="2.1" />

        {/* Inner bead ring */}
        {beads.map((b, i) => (
          <circle key={i} cx={b.cx} cy={b.cy} r="1.1" fill={accent} />
        ))}

        {/* Top curved shop legal name */}
        <text
          fill={ink}
          fontSize={topFontSize}
          fontWeight="800"
          letterSpacing="1.1"
          dominantBaseline="central"
          fontFamily="Helvetica, Arial, sans-serif"
        >
          <textPath href={`#${topArcId}`} startOffset="50%" textAnchor="middle">
            {sealName}
          </textPath>
        </text>

        {/* Bottom curved subtitle */}
        <text
          fill={ink}
          fontSize="9.6"
          fontWeight="800"
          letterSpacing="1.25"
          dominantBaseline="central"
          fontFamily="Helvetica, Arial, sans-serif"
        >
          <textPath href={`#${bottomArcId}`} startOffset="50%" textAnchor="middle">
            {subtitle.toUpperCase()}
          </textPath>
        </text>

        {/* 3 & 9 o'clock 4-point star emblems */}
        {[cx - rText, cx + rText].map((sx, idx) => (
          <g key={idx} transform={`translate(${sx}, ${cy})`}>
            <line x1="-5" y1="0" x2="5" y2="0" stroke={ink} strokeWidth="1.4" />
            <line x1="0" y1="-5" x2="0" y2="5" stroke={ink} strokeWidth="1.4" />
            <line x1="-3.4" y1="-3.4" x2="3.4" y2="3.4" stroke={ink} strokeWidth="1.1" />
            <line x1="-3.4" y1="3.4" x2="3.4" y2="-3.4" stroke={ink} strokeWidth="1.1" />
            <circle cx="0" cy="0" r="1.5" fill={ink} />
          </g>
        ))}

        {/* Shop crest / monogram in upper inner medallion */}
        {assets?.seal ? (
          <image
            href={assets.seal}
            x={cx - 46}
            y={52}
            width="92"
            height="36"
            preserveAspectRatio="xMidYMid meet"
            opacity={0.95}
          />
        ) : (
          <text
            x={cx}
            y={74}
            textAnchor="middle"
            fill={ink}
            fontSize="16"
            fontWeight="900"
            fontFamily="Helvetica, Arial, sans-serif"
          >
            {sealName
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0])
              .join("")}
          </text>
        )}

        {/* Double-framed Status Ribbon */}
        <g>
          <rect
            x={16}
            y={91}
            width={188}
            height={36}
            rx={8}
            fill={wash}
          />
          <rect
            x={19}
            y={94}
            width={182}
            height={30}
            rx={6}
            fill={watermark ? rgbStr(palette.ink, 0.22) : ink}
            stroke={ink}
            strokeWidth="2"
          />
          <rect
            x={22}
            y={97}
            width={176}
            height={24}
            rx={4}
            fill="none"
            stroke={watermark ? accent : "rgba(255,255,255,0.45)"}
            strokeWidth="0.9"
          />
          {/* Left & right diamond pins */}
          {[33, 187].map((dx, i) => (
            <polygon
              key={i}
              points={`${dx},105 ${dx + 3.5},109 ${dx},113 ${dx - 3.5},109`}
              fill={watermark ? ink : "#ffffff"}
            />
          ))}
          <text
            x={cx}
            y={109.5}
            textAnchor="middle"
            dominantBaseline="central"
            fill={watermark ? ink : "#ffffff"}
            fontSize={statusFontSize}
            fontWeight="900"
            letterSpacing="0.9"
            fontFamily="Helvetica, Arial, sans-serif"
          >
            {statusLabel}
          </text>
        </g>

        {/* Lower metadata block */}
        <text
          x={cx}
          y={140}
          textAnchor="middle"
          fill={ink}
          fontSize="11.5"
          fontWeight="800"
          letterSpacing="0.7"
          fontFamily="Helvetica, Arial, sans-serif"
        >
          {dateLabel.toUpperCase()}
        </text>
        <line
          x1={cx - 42}
          y1={145}
          x2={cx + 42}
          y2={145}
          stroke={accent}
          strokeWidth="0.9"
        />

        {formattedRef && (
          <text
            x={cx}
            y={156}
            textAnchor="middle"
            fill={ink}
            fontSize="9.4"
            fontWeight="700"
            letterSpacing="0.5"
            fontFamily="Helvetica, Arial, sans-serif"
          >
            {formattedRef}
          </text>
        )}

        {metaLine && (
          <text
            x={cx}
            y={formattedRef ? 167 : 156}
            textAnchor="middle"
            fill={accent}
            fontSize="8.3"
            fontWeight="600"
            letterSpacing="0.35"
            fontFamily="Helvetica, Arial, sans-serif"
          >
            {metaLine.toUpperCase()}
          </text>
        )}

        <text
          x={cx}
          y={metaLine ? (formattedRef ? 178 : 168) : formattedRef ? 168 : 158}
          textAnchor="middle"
          fill={ink}
          opacity={0.78}
          fontSize="7.4"
          fontWeight="700"
          letterSpacing="0.8"
          fontFamily="'Courier New', monospace"
        >
          SEAL {serial}
        </text>
      </svg>
    </div>
  );
}
