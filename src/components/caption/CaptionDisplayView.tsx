"use client";

import React, { useEffect, useState, useMemo } from "react";
import { CaptionConfig, CaptionItem, DEFAULT_CAPTION_CONFIG } from "@/lib/caption/types";

interface CaptionDisplayViewProps {
  config: CaptionConfig;
  currentCaption: CaptionItem | null;
  history?: CaptionItem[];
  pinnedAnnouncement?: string | null;
  previewMode?: boolean; // When true, shows sample text if idle
}

export default function CaptionDisplayView({
  config = DEFAULT_CAPTION_CONFIG,
  currentCaption,
  history = [],
  pinnedAnnouncement,
  previewMode = false,
}: CaptionDisplayViewProps) {
  const [isVisible, setIsVisible] = useState(true);

  // Auto-hide timer for captions
  useEffect(() => {
    if (!currentCaption) {
      setIsVisible(true);
      return;
    }
    setIsVisible(true);

    if (config.autoClearSec > 0 && !pinnedAnnouncement) {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, config.autoClearSec * 1000);
      return () => clearTimeout(timer);
    }
  }, [currentCaption, config.autoClearSec, pinnedAnnouncement]);

  // Determine stroke class
  const strokeClass = useMemo(() => {
    switch (config.textStroke) {
      case "sm":
        return "text-stroke-1";
      case "md":
        return "text-stroke-2";
      case "lg":
        return "text-stroke-3";
      case "xl":
        return "text-stroke-4";
      default:
        return config.textShadow ? "drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]" : "";
    }
  }, [config.textStroke, config.textShadow]);

  // Background style calculation
  const bgStyleCss = useMemo((): React.CSSProperties => {
    switch (config.bgStyle) {
      case "chroma-green":
        return { backgroundColor: "#00FF00" };
      case "chroma-blue":
        return { backgroundColor: "#0000FF" };
      case "chroma-magenta":
        return { backgroundColor: "#FF00FF" };
      case "black-box":
        return {
          backgroundColor: `rgba(0, 0, 0, ${config.bgOpacity / 100})`,
        };
      case "frosted-glass":
        return {
          backgroundColor: `rgba(18, 18, 22, ${config.bgOpacity / 100})`,
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(198, 163, 90, 0.3)",
        };
      case "transparent":
      default:
        return { backgroundColor: "transparent" };
    }
  }, [config.bgStyle, config.bgOpacity]);

  // Vertical placement positioning
  const positionClass = useMemo(() => {
    switch (config.position) {
      case "top":
        return "justify-start pt-6";
      case "center":
        return "justify-center";
      case "bottom":
      default:
        return "justify-end pb-8";
    }
  }, [config.position]);

  // Horizontal text alignment
  const alignClass = useMemo(() => {
    switch (config.alignment) {
      case "left":
        return "text-left items-start";
      case "right":
        return "text-right items-end";
      case "center":
      default:
        return "text-center items-center";
    }
  }, [config.alignment]);

  // Fallback demo text for preview mode if idle
  const displayItem = useMemo((): {
    sourceText: string;
    translatedText: string;
    isAnnouncement: boolean;
    isFinal: boolean;
    sourceLang: string;
  } | null => {
    if (pinnedAnnouncement) {
      return {
        sourceText: "",
        translatedText: pinnedAnnouncement,
        isAnnouncement: true,
        isFinal: true,
        sourceLang: "vi",
      };
    }
    if (currentCaption) {
      return {
        sourceText: currentCaption.sourceText,
        translatedText: currentCaption.translatedText,
        isFinal: currentCaption.isFinal,
        sourceLang: currentCaption.sourceLang,
        isAnnouncement: false,
      };
    }
    if (previewMode) {
      const isKo = config.sourceLanguage === "ko-KR";
      return {
        sourceText: isKo
          ? "오늘 행사에 참석해 주신 귀빈 여러분을 환영합니다."
          : "Welcome everyone to the Vietnam Global Tech Summit 2026.",
        translatedText: isKo
          ? "Chào mừng quý vị khách quý đã đến tham dự sự kiện hôm nay."
          : "Chào mừng tất cả mọi người đến với Hội nghị Công nghệ Toàn cầu Việt Nam 2026.",
        isAnnouncement: false,
        isFinal: true,
        sourceLang: isKo ? "ko" : "en",
      };
    }
    return null;
  }, [currentCaption, pinnedAnnouncement, previewMode, config.sourceLanguage]);

  return (
    <div
      className={`relative w-full h-full flex flex-col ${positionClass} ${alignClass} px-6 transition-colors duration-200 select-none overflow-hidden ${
        config.bgStyle === "transparent" ? "vmix-transparent" : ""
      }`}
      style={bgStyleCss}
    >
      {/* Rolling Ledger Mode (Multi-line stage transcript) */}
      {config.displayMode === "rolling-ledger" ? (
        <div
          className="flex flex-col gap-4 max-w-full overflow-y-auto px-4 py-6 scrollbar-none"
          style={{
            maxWidth: `${config.maxWidthPercent}%`,
            fontFamily: config.fontFamily,
          }}
        >
          {history.slice(-config.maxLines).map((item, idx) => (
            <div
              key={item.id || idx}
              className={`flex flex-col gap-1 transition-opacity duration-300 ${
                idx === history.length - 1 ? "opacity-100" : "opacity-60"
              }`}
            >
              {item.sourceText && (
                <div
                  className="text-xs md:text-sm tracking-wide font-normal uppercase"
                  style={{ color: config.originalColor }}
                >
                  {item.sourceText}
                </div>
              )}
              <div
                className={`font-bold leading-snug ${strokeClass}`}
                style={{
                  fontSize: `${Math.round(config.fontSize * 0.85)}px`,
                  color: config.vietnameseColor,
                  fontWeight: config.fontWeight,
                  fontFamily: config.fontFamily || "'Roboto', sans-serif",
                }}
              >
                {item.translatedText}
              </div>
            </div>
          ))}

          {/* Active Interim line */}
          {displayItem && !displayItem.isFinal && (
            <div className="flex flex-col gap-1 border-l-2 border-brand-gold pl-3">
              {displayItem.sourceText && (
                <div
                  className="text-xs md:text-sm tracking-wide font-light italic"
                  style={{ color: config.originalColor }}
                >
                  {displayItem.sourceText}
                </div>
              )}
              <div
                className={`font-bold leading-snug ${strokeClass} opacity-90`}
                style={{
                  fontSize: `${Math.round(config.fontSize * 0.85)}px`,
                  color: config.vietnameseColor,
                  fontWeight: config.fontWeight,
                }}
              >
                {displayItem.translatedText || displayItem.sourceText}
                <span className="inline-block w-2 h-5 ml-1 bg-brand-gold animate-pulse align-middle" />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Standard Subtitle & Lower-Third Mode */
        <div
          className={`transition-all duration-300 flex flex-col ${alignClass} ${
            isVisible && displayItem ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
          }`}
          style={{
            maxWidth: `${config.maxWidthPercent}%`,
            fontFamily: config.fontFamily,
          }}
        >
          {displayItem && (
            <div
              className="inline-flex flex-col transition-all duration-200"
              style={{
                backgroundColor:
                  config.bgStyle === "transparent"
                    ? `rgba(0, 0, 0, ${config.bgOpacity / 100})`
                    : "transparent",
                paddingLeft: `${config.boxPaddingX}px`,
                paddingRight: `${config.boxPaddingX}px`,
                paddingTop: `${config.boxPaddingY}px`,
                paddingBottom: `${config.boxPaddingY}px`,
                borderRadius: `${config.borderRadius}px`,
                backdropFilter: config.bgStyle === "transparent" && config.bgOpacity > 0 ? "blur(8px)" : "none",
                WebkitBackdropFilter: config.bgStyle === "transparent" && config.bgOpacity > 0 ? "blur(8px)" : "none",
              }}
            >
              {/* Optional Speaker / Mode Badge */}
              {config.showSpeakerBadge && (
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-brand-gold/20 text-brand-gold border border-brand-gold/40">
                    {displayItem.isAnnouncement
                      ? "📢 THÔNG BÁO"
                      : `${config.speakerLabel || "Diễn giả"} [${
                          displayItem.sourceLang === "ko" ? "🇰🇷 HÀN QUỐC" : "🇺🇸 TIẾNG ANH"
                        }]`}
                  </span>
                  {!displayItem.isFinal && !displayItem.isAnnouncement && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                      Live
                    </span>
                  )}
                </div>
              )}

              {/* Line 1: Original Language (Korean / English) */}
              {config.displayMode === "bilingual" && displayItem.sourceText && (
                <div
                  className="font-medium tracking-wide mb-1 leading-snug drop-shadow-md"
                  style={{
                    fontSize: `${Math.max(16, Math.round(config.fontSize * 0.55))}px`,
                    color: config.originalColor,
                    letterSpacing: config.letterSpacing,
                  }}
                >
                  {displayItem.sourceText}
                </div>
              )}

              {/* Line 2: Vietnamese Translation */}
              <div
                className={`leading-tight ${strokeClass}`}
                style={{
                  fontSize: `${config.fontSize}px`,
                  color: config.vietnameseColor,
                  fontWeight: config.fontWeight,
                  fontFamily: config.fontFamily || "'Roboto', sans-serif",
                  letterSpacing: config.letterSpacing,
                }}
              >
                {displayItem.translatedText || displayItem.sourceText}
                {!displayItem.isFinal && !displayItem.isAnnouncement && (
                  <span className="inline-block w-2.5 h-6 ml-1.5 bg-brand-gold animate-pulse align-middle" />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
