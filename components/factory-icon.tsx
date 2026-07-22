"use client";

import { ICON_BY_ID } from "@/data/factory-db";
import { imgPath } from "@/lib/utils";

// icons.webp는 64px 셀 스프라이트 시트. data의 position이 셀 좌표를 가리킨다.
const SPRITE = "/factory/icons.webp";
const CELL = 64;

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
  const icon = ICON_BY_ID.get(id);
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
