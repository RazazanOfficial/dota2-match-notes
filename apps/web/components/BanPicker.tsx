import { heroImage } from "@/data/heroes";
import type { MatchBan, MatchPick } from "@/lib/types";

interface BanPickerProps {
  value: MatchBan[];
  picks: MatchPick[];
  legacyBans?: string;
}

export default function BanPicker({
  value,
  picks,
  legacyBans,
}: BanPickerProps) {
  return (
    <div className="field field-full ban-field">
      {picks.length > 0 && (
        <section className="draft-picks-section">
          <span>هیروهای انتخاب‌شده</span>
          <div className="draft-picks" aria-label="هیروهای انتخاب‌شده توسط دیگر بازیکنان">
            {picks.map((hero) => (
              <span className={`draft-pick${hero.inRolePool ? " is-pool-priority" : ""}`} key={hero.id} title={hero.name}>
                <img src={heroImage(hero)} alt="" />
                <b lang="en" dir="ltr">{hero.name}</b>
              </span>
            ))}
          </div>
        </section>
      )}
      <div className="automatic-ban-heading"><span>بن‌های مچ</span><b>{value.some((hero) => hero.source === "manual") || legacyBans ? "ثبت قدیمی" : "OpenDota · ممکن است ناقص باشد"}</b></div>
      {(value.length > 0 || legacyBans) && (
        <div className="hero-chips">
          {value.map((hero) => (
            <span className={`hero-chip ban-portrait${hero.inRolePool ? " is-pool-priority" : ""}`} key={hero.id}>
              <span className="ban-portrait-image"><img src={heroImage(hero)} alt="" /></span>
              <span lang="en" dir="ltr">
                {hero.name}
              </span>
            </span>
          ))}
          {legacyBans && <span className="legacy-ban">بن‌های قبلی: {legacyBans}</span>}
        </div>
      )}
    </div>
  );
}
