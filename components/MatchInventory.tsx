import type { CSSProperties } from "react";
import { itemById, itemImage } from "@/data/items.generated";
import type { MatchParticipant } from "@/lib/types";

interface MatchInventoryProps {
  participant: MatchParticipant;
}

const SLOT_BOXES = [
  { left: "17.65%", top: "14.75%", width: "21.1%", height: "21.65%" },
  { left: "39.75%", top: "14.75%", width: "21.1%", height: "21.65%" },
  { left: "62.15%", top: "14.75%", width: "21.1%", height: "21.65%" },
  { left: "17.65%", top: "38.05%", width: "21.1%", height: "21.65%" },
  { left: "39.75%", top: "38.05%", width: "21.1%", height: "21.65%" },
  { left: "62.15%", top: "38.05%", width: "21.1%", height: "21.65%" },
  { left: "17.65%", top: "61.65%", width: "21.1%", height: "17.65%" },
  { left: "39.75%", top: "61.65%", width: "21.1%", height: "17.65%" },
  { left: "62.15%", top: "61.65%", width: "21.1%", height: "17.65%" },
] satisfies CSSProperties[];

export default function MatchInventory({ participant }: MatchInventoryProps) {
  const itemIds = [
    ...participant.itemIds.slice(0, 6),
    ...participant.backpackItemIds.slice(0, 3),
  ];

  return (
    <div
      className="match-inventory"
      dir="ltr"
      aria-label={`آیتم‌های ${participant.heroName}`}
    >
      <img
        className="match-inventory-art"
        src={inventoryFrame(participant)}
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
        style={{ left: "88.45%", top: "20.35%", width: "8.7%", height: "16.2%" }}
      />
      <span
        className="match-inventory-level"
        style={{ left: "88.45%", top: "44.65%", width: "8.7%", height: "16.2%" }}
        title={`Level ${participant.level ?? "—"}`}
        aria-label={`لول هیرو ${participant.level ?? "نامشخص"}`}
      >
        {participant.level ?? "—"}
      </span>
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
