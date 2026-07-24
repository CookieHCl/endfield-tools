"use client";

import { ICON_BY_ID, iconId } from "@/data/factory-db";
import { imgPath } from "@/lib/utils";

// icons.webp는 64px 셀 스프라이트 시트. data의 position이 셀 좌표를 가리킨다.
const SPRITE = "/factory/icons.webp";
const CELL = 64;
// 어떤 id로도 못 찾을 때 그릴 자리표시자 (시트 좌상단 셀). 빈칸으로 조용히
// 넘어가면 아이콘 누락을 눈치채기 어려우므로 눈에 보이게 둔다.
const MISSING_ICON = "missing-icon";

export function FactoryIcon({
  id,
  size = 32,
  className = "",
  title,
  ring = false,
}: {
  id: string;
  size?: number;
  className?: string;
  title?: string;
  // 공정(사용자 정의) 레시피 아이콘 구분용 파란 테두리
  ring?: boolean;
}) {
  // id는 아이템 id일 수도, 이미 아이콘 id(recipe.icon)일 수도 있다.
  // 아이템/레시피의 icon 필드를 먼저 따라가고, 없으면 id를 아이콘 id로 본다.
  const icon =
    ICON_BY_ID.get(iconId(id)) ??
    ICON_BY_ID.get(id) ??
    ICON_BY_ID.get(MISSING_ICON);
  // 시트 크기를 몰라도 되도록 64px 셀을 그린 뒤 transform으로 축소한다.
  const scale = size / CELL;
  return (
    <span
      className={
        "inline-block shrink-0 " +
        (ring ? "rounded-md ring-2 ring-blue-500 " : "") +
        className
      }
      style={{ width: size, height: size, overflow: "hidden" }}
      title={title}
      aria-hidden={title ? undefined : true}
    >
      {icon && (
        <span
          style={{
            display: "block",
            width: CELL,
            height: CELL,
            backgroundImage: `url(${imgPath(SPRITE)})`,
            backgroundPosition: icon.position,
            backgroundRepeat: "no-repeat",
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      )}
    </span>
  );
}
