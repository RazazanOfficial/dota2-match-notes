"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { LoaderCircle } from "lucide-react";
import { itemById, itemImage } from "@/data/items.generated";
import type { MatchParticipant } from "@/lib/types";

interface MatchInventoryProps {
  participant: MatchParticipant;
}

const SLOT_BOXES = [
  { left: "20%", top: "16.05%", width: "18.12%", height: "21.47%" },
  { left: "40.4%", top: "16.05%", width: "18.74%", height: "21%" },
  { left: "61.2%", top: "16.05%", width: "18.3%", height: "21%" },
  { left: "20.05%", top: "40.17%", width: "18.15%", height: "20.67%" },
  { left: "40.4%", top: "40.17%", width: "18.5%", height: "20.67%" },
  { left: "61.1%", top: "40.17%", width: "18.5%", height: "20%" },
  { left: "20.2%", top: "63.66%", width: "18%", height: "20%" },
  { left: "40.5%", top: "63.66%", width: "18.45%", height: "20%" },
  { left: "61.7%", top: "63.66%", width: "18.4%", height: "19.8%" },
] satisfies CSSProperties[];

export default function MatchInventory({ participant }: MatchInventoryProps) {
  const [ready, setReady] = useState(false);
  const itemIds = [
    ...participant.itemIds.slice(0, 6),
    ...participant.backpackItemIds.slice(0, 3),
  ];
  const frame = inventoryFrame(participant);
  const assetUrls = useMemo(
    () =>
      [
        frame,
        ...itemIds.map((itemId) => (itemId ? itemImage(itemId) : null)),
        participant.neutralItemId ? itemImage(participant.neutralItemId) : null,
      ].filter((url): url is string => Boolean(url)),
    [frame, itemIds.join(","), participant.neutralItemId],
  );

  useEffect(() => {
    let cancelled = false;
    setReady(false);

    void Promise.all([...new Set(assetUrls)].map(preloadImage)).then(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [assetUrls]);

  return (
    <div
      className={`match-inventory${ready ? " is-ready" : " is-loading"}`}
      dir="ltr"
      aria-label={`آیتم‌های ${participant.heroName}`}
      aria-busy={!ready}
    >
      <div className="match-inventory-content" aria-hidden={!ready}>
        <img
          className="match-inventory-art"
          src={frame}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        {SLOT_BOXES.map((box, index) => (
          <InventoryItem
            key={index}
            itemId={itemIds[index] ?? null}
            className={`match-inventory-slot${index >= 6 ? " is-backpack" : ""}`}
            style={box}
          />
        ))}
        <InventoryItem
          itemId={participant.neutralItemId}
          className="match-inventory-neutral"
          style={{
            left: "85.5%",
            top: "24%",
            width: "9.4%",
            height: "16.5%",
          }}
        />
        <span
          className="match-inventory-level"
          style={{
            left: "85.0%",
            top: "50.9%",
            width: "9.4%",
            height: "16.5%",
          }}
          title={`Level ${participant.level ?? "—"}`}
          aria-label={`لول هیرو ${participant.level ?? "نامشخص"}`}
        >
          {participant.level ?? "—"}
        </span>
      </div>
      {!ready && (
        <span className="match-inventory-loading" role="status">
          <LoaderCircle aria-hidden="true" />
          <span>در حال آماده‌سازی</span>
        </span>
      )}
    </div>
  );
}

function InventoryItem({
  itemId,
  className,
  style,
}: {
  itemId: number | null;
  className: string;
  style: CSSProperties;
}) {
  const item = itemId ? itemById(itemId) : null;
  const src = itemId ? itemImage(itemId) : null;
  return (
    <span
      className={`${className}${item ? " has-item" : ""}`}
      style={style}
      title={item?.name}
      aria-label={item?.name || "جایگاه خالی"}
    >
      {src && <img src={src} alt={item?.name || ""} draggable={false} />}
    </span>
  );
}

function inventoryFrame(participant: MatchParticipant) {
  if (participant.hasAghanimsScepter && participant.hasAghanimsShard) {
    return "/match-details/inventory-scepter-shard.png";
  }
  if (participant.hasAghanimsScepter) {
    return "/match-details/inventory-scepter.png";
  }
  if (participant.hasAghanimsShard) {
    return "/match-details/inventory-shard.png";
  }
  return "/match-details/inventory-none.png";
}

function preloadImage(src: string) {
  return new Promise<void>((resolve) => {
    const image = new Image();
    const finish = () => resolve();
    image.onload = finish;
    image.onerror = finish;
    image.src = src;
    if (image.complete) finish();
  });
}
