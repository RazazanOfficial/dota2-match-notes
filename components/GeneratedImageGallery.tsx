"use client";

import { useEffect, useRef, useState } from "react";
import type { MatchImage } from "@/lib/types";

interface GeneratedImageGalleryProps {
  images: MatchImage[];
  matchId: string;
}

export default function GeneratedImageGallery({ images, matchId }: GeneratedImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const activeImage = activeIndex === null ? null : images[activeIndex];
  const isOpen = activeIndex !== null;

  function close() {
    setActiveIndex(null);
    window.requestAnimationFrame(() => opener.current?.focus());
  }

  function move(direction: -1 | 1) {
    setActiveIndex((current) => {
      if (current === null) return null;
      return (current + direction + images.length) % images.length;
    });
  }

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        setActiveIndex((current) =>
          current === null ? null : (current + direction + images.length) % images.length,
        );
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [images.length, isOpen]);

  useEffect(() => {
    if (activeIndex !== null && activeIndex >= images.length) setActiveIndex(null);
  }, [activeIndex, images.length]);

  return (
    <>
      <div className="generated-images-grid">
        {images.map((image, index) => (
          <button
            type="button"
            onClick={(event) => {
              opener.current = event.currentTarget;
              setActiveIndex(index);
            }}
            key={image.id}
          >
            <img
              src={image.publicUrl}
              width={image.width || 1280}
              height={image.height || 720}
              alt={image.altText || `گزارش مچ ${matchId}`}
            />
            <span>مشاهده اندازه کامل</span>
          </button>
        ))}
      </div>
      {activeImage && activeIndex !== null && (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`تصویر ${activeIndex + 1} از ${images.length}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="image-lightbox-panel">
            <header>
              <span lang="en" dir="ltr">{activeIndex + 1} / {images.length}</span>
              <button
                ref={closeButton}
                className="image-lightbox-close"
                type="button"
                onClick={close}
                aria-label="بستن تصویر"
              >
                ×
              </button>
            </header>
            <img
              src={activeImage.publicUrl}
              width={activeImage.width || 1280}
              height={activeImage.height || 720}
              alt={activeImage.altText || `گزارش مچ ${matchId}`}
            />
            {images.length > 1 && (
              <>
                <button className="image-lightbox-nav is-previous" type="button" onClick={() => move(-1)} aria-label="تصویر قبلی">‹</button>
                <button className="image-lightbox-nav is-next" type="button" onClick={() => move(1)} aria-label="تصویر بعدی">›</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
