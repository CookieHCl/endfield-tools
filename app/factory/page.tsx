"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ITEMS, RECIPES, itemName, type FactoryRecipe } from "@/data/factory-db";
import { FactoryIcon } from "@/components/factory-icon";
import { ImportExportButtons } from "@/components/import-export-buttons";
import { cleanNumber, formatNumber, uid } from "@/lib/factory";
import {
  loadProcesses,
  processToRecipe,
  isProcessRecipeId,
  type Process,
} from "@/lib/process";
import {
  NumInput,
  ItemPicker,
  RecipeFormula,
  RecipeIOFields,
  RecipePicker,
  Section,
  addBtn,
  delBtn,
} from "@/components/factory-ui";

/// 타입 -----------------------------------------------------------------

type FactoryNum = 1 | 2 | 3 | 4;
const FACTORIES: FactoryNum[] = [1, 2, 3, 4];

// 입력이 귀속되는 대상: "all"이면 공장 전체(총합에만), 숫자면 해당 공장 열에만.
type InputTarget = FactoryNum | "all";

// 공짜로 들어오는 자원. infinite면 rate는 무시하고 무한 공급으로 취급.
interface InputRow {
  id: string;
  itemId: string;
  rate: number;
  infinite: boolean;
  target: InputTarget;
}

// 공장에 배치한 레시피 한 줄. count는 실행 배수(소수 가능), 나머지 필드는 전부 파생.
interface RecipeLine {
  id: string;
  recipeId: string;
  count: number;
  factory: FactoryNum;
}

// 개당 관리권으로 교환되는 자원.
interface VoucherRow {
  id: string;
  itemId: string;
  perUnit: number;
}

interface FactoryState {
  inputs: InputRow[];
  lines: RecipeLine[];
  vouchers: VoucherRow[];
  targetPerMin: number;
}

// 결산 셀: 무한 공급 여부 + 유한 순량(공장 열은 로컬 수지, 전체 열은 공유풀 순수지).
// idle = 그 공장에만 남아 다른 공장은 못 쓰는 유휴량 (공장 열 전용).
interface Cell {
  inf: boolean;
  delta: number;
  idle?: number;
}

type RecipeMap = Map<string, FactoryRecipe>;

/// 헬퍼 -----------------------------------------------------------------

const STORAGE_KEY = "factoryCalculator";

// 결산 행 그룹: 관리권 → 공장 입력 → 나머지 순으로 모으고 배경색을 달리한다.
// (관리권이면서 입력인 자원은 관리권이 먼저라 관리권으로 취급된다.)
const ROW_GROUP = { voucher: 0, input: 1, rest: 2 } as const;

// 표에서 총합 정렬 버킷: 음수(0) < 양수(1) < ∞음수(2) < ∞양수(3) < 0(4) < ∞0(5)
function bucket(cell: Cell): number {
  const d = cleanNumber(cell.delta);
  if (!cell.inf) return d < 0 ? 0 : d > 0 ? 1 : 4;
  return d < 0 ? 2 : d > 0 ? 3 : 5;
}

function cellText(cell: Cell): string {
  const d = cleanNumber(cell.delta);
  if (!cell.inf) return formatNumber(d);
  if (d === 0) return "∞ + 0";
  return d > 0 ? `∞ + ${formatNumber(d)}` : `∞ - ${formatNumber(-d)}`;
}

function cellClass(cell: Cell): string {
  if (cell.inf) return "text-zinc-400";
  const d = cleanNumber(cell.delta);
  if (d < 0) return "text-red-600";
  if (d > 0) return "text-blue-600";
  return "text-zinc-400";
}

// 자원이 만들어내는 관리권 양 표시 ("관리권 +300" / "관리권 -200" / "관리권 0")
function voucherAmountText(inf: boolean, amount: number): string {
  if (inf) return "관리권 ∞";
  const d = cleanNumber(amount);
  if (d > 0) return `관리권 +${formatNumber(d)}`;
  if (d < 0) return `관리권 -${formatNumber(-d)}`;
  return "관리권 0";
}

// 양수 파랑 / 음수 빨강 / 0 회색 (무한은 양수 취급)
function voucherAmountClass(inf: boolean, amount: number): string {
  if (inf) return "text-blue-600";
  const d = cleanNumber(amount);
  if (d > 0) return "text-blue-600";
  if (d < 0) return "text-red-600";
  return "text-zinc-400";
}

/// 자원별 수지 계산 -----------------------------------------------------
// 전체 합(공유풀) + 공장별 결산 셀을 자원 id별로 반환한다.
// 결산 표(summary)와 "최대화" 계산에서 공유한다.
function computeBalances(
  lines: RecipeLine[],
  inputs: InputRow[],
  recipeById: RecipeMap,
): Map<string, { total: Cell; factories: Cell[] }> {
  const add = (map: Map<string, number>, key: string, v: number) =>
    map.set(key, (map.get(key) ?? 0) + v);
  const maps4 = (): Map<string, number>[] => [
    new Map(),
    new Map(),
    new Map(),
    new Map(),
  ];

  // 공장별 레시피 생산량/소비량 (분당). 생산물은 공유풀로 흐른다.
  const prodByF = maps4();
  const consByF = maps4();
  for (const line of lines) {
    const recipe = recipeById.get(line.recipeId);
    if (!recipe) continue;
    const per = (60 / recipe.time) * line.count;
    for (const [item, qty] of Object.entries(recipe.out ?? {}))
      add(prodByF[line.factory - 1], item, qty * per);
    for (const [item, qty] of Object.entries(recipe.in ?? {}))
      add(consByF[line.factory - 1], item, qty * per);
  }

  // 입력: 배치(공장 전용)는 그 공장 부족분만 메우고 남으면 유휴. 전체는 공유풀에만.
  const exclByF = maps4();
  const exclInfByF: Set<string>[] = [
    new Set(),
    new Set(),
    new Set(),
    new Set(),
  ];
  const allDelta = new Map<string, number>();
  const allInf = new Set<string>();
  for (const inp of inputs) {
    const target: InputTarget =
      inp.target === 1 || inp.target === 2 || inp.target === 3 || inp.target === 4
        ? inp.target
        : "all";
    if (target === "all") {
      if (inp.infinite) allInf.add(inp.itemId);
      else add(allDelta, inp.itemId, inp.rate);
    } else if (inp.infinite) {
      exclInfByF[target - 1].add(inp.itemId);
    } else {
      add(exclByF[target - 1], inp.itemId, inp.rate);
    }
  }

  // 결산 대상 = 입력으로 지정했거나 레시피 입출력에 쓰인 자원만
  const resourceIds = new Set<string>();
  inputs.forEach((i) => resourceIds.add(i.itemId));
  for (const line of lines) {
    const recipe = recipeById.get(line.recipeId);
    if (!recipe) continue;
    Object.keys(recipe.out ?? {}).forEach((k) => resourceIds.add(k));
    Object.keys(recipe.in ?? {}).forEach((k) => resourceIds.add(k));
  }

  const byId = new Map<string, { total: Cell; factories: Cell[] }>();
  for (const item of resourceIds) {
    let contributionSum = 0; // 각 공장이 공유풀에 실제로 기여하는 유한량 합
    const factories: Cell[] = FACTORIES.map((f) => {
      const prod = prodByF[f - 1].get(item) ?? 0;
      const cons = consByF[f - 1].get(item) ?? 0;
      const excl = exclByF[f - 1].get(item) ?? 0;
      const exclInf = exclInfByF[f - 1].has(item);
      const net = prod - cons; // 레시피 순생산 (이동 가능)
      const shortfall = Math.max(0, cons - prod); // 자체 생산으로 못 메우는 소비
      const localBalance = net + excl; // 공장 열에 보이는 값

      let usedExcl: number; // 실제로 그 공장 소비를 메운 배치입력
      let idle: number; // 못 쓰고 남은 배치입력 (유휴)
      if (exclInf) {
        usedExcl = shortfall; // 무한 배치입력은 부족분을 전부 메움
        idle = Infinity; // 남는 무한 공급 (배지 표기 안 함)
      } else if (excl > 0) {
        usedExcl = Math.min(excl, shortfall);
        idle = excl - usedExcl;
      } else {
        usedExcl = excl; // 음수 = 드레인, 전량 반영
        idle = 0;
      }
      contributionSum += net + usedExcl; // 공유풀 기여분 (유한)
      return { inf: exclInf, delta: localBalance, idle };
    });

    // 전체 합 = 전체입력 + 공유풀 기여분 합. 배치된 무한 공급은 갇히므로 총합을 무한으로 만들지 않는다.
    const delta = (allDelta.get(item) ?? 0) + contributionSum;
    const total: Cell = { inf: allInf.has(item), delta };
    byId.set(item, { total, factories });
  }

  return byId;
}

/// "최대화" 가능 여부 ---------------------------------------------------
// ok       → 계산된 최대 수량으로 맞출 수 있음
// no-input → 입력이 없는 레시피 (맞출 게 없음)
// deficit  → 입력 자원의 가용 합이 0 이하 (부족해서 최대화 불가) → 빨간 비활성
// unbounded→ 입력이 전부 무한 공급 (상한을 정할 수 없음)
type MaxState =
  | { kind: "ok"; value: number }
  | { kind: "no-input" }
  | { kind: "deficit" }
  | { kind: "unbounded" };

function maxStateForLine(
  line: RecipeLine,
  lines: RecipeLine[],
  inputs: InputRow[],
  recipeById: RecipeMap,
): MaxState {
  const recipe = recipeById.get(line.recipeId);
  if (!recipe) return { kind: "no-input" };
  const ins = Object.entries(recipe.in ?? {});
  if (ins.length === 0) return { kind: "no-input" };

  // 이 레시피를 제외한 나머지 상태에서의 가용량
  const balances = computeBalances(
    lines.filter((l) => l.id !== line.id),
    inputs,
    recipeById,
  );

  let raw = Infinity;
  for (const [item, qty] of ins) {
    const perCount = (qty * 60) / recipe.time; // 수량 1개당 분당 소비
    if (perCount <= 0) continue;
    const b = balances.get(item);
    const total = b?.total ?? { inf: false, delta: 0 };
    if (total.inf) continue; // 전체 무한 공급 → 제한 안 함
    const cell = b?.factories[line.factory - 1];
    if (cell?.inf) continue; // 이 공장에 무한 배치입력 → 제한 안 함
    // 가용량 = 공유풀 순량 + 이 공장에 남아도는 배치입력(유휴)
    const idle = cell && Number.isFinite(cell.idle ?? 0) ? cell.idle ?? 0 : 0;
    raw = Math.min(raw, (total.delta + idle) / perCount);
  }

  if (!Number.isFinite(raw)) return { kind: "unbounded" };
  const value = cleanNumber(raw);
  if (value <= 0) return { kind: "deficit" };
  return { kind: "ok", value };
}

/// 페이지 ---------------------------------------------------------------

export default function FactoryPage() {
  const [inputs, setInputs] = useState<InputRow[]>([]);
  const [lines, setLines] = useState<RecipeLine[]>([]);
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [targetPerMin, setTargetPerMin] = useState(0);

  // 현재 편집 중인 공장. 레시피 추가/수정/삭제·목록 필터가 모두 이 값을 따른다.
  const [selectedFactory, setSelectedFactory] = useState<FactoryNum>(1);

  // 레시피 추가 패널의 "자원으로 필터" 값. 결산/입출력 아이콘 클릭으로도 세팅된다.
  const [filterItemId, setFilterItemId] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  // 자원 아이콘 클릭 → 그 자원으로 필터하고 추가 패널로 스크롤.
  const pickFilterItem = (itemId: string) => {
    setFilterItemId(itemId);
    pickerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // 사용자 정의 공정 (공정 관리 페이지에서 만든 것). 여기서는 읽기만 한다.
  const [processes, setProcesses] = useState<Process[]>([]);

  // 불러오기 (localStorage → 상태). 저장은 effect가 아니라 아래 commit 헬퍼로 변경 지점에서 동기로 한다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setProcesses(loadProcesses());
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<FactoryState>;
        if (Array.isArray(parsed.inputs)) {
          setInputs(parsed.inputs);
        }
        if (Array.isArray(parsed.lines)) {
          setLines(parsed.lines);
        }
        if (Array.isArray(parsed.vouchers)) {
          setVouchers(parsed.vouchers);
        }
        if (typeof parsed.targetPerMin === "number") {
          setTargetPerMin(parsed.targetPerMin);
        }
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  // 저장: 상태를 바꾸는 즉시 localStorage에도 쓴다.
  // effect로 저장하면 초기 로드 전에 빈 상태로 덮어써 데이터가 날아가므로(공정 페이지 참고) 쓰지 않는다.
  const persist = (state: FactoryState) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage errors
    }
  };
  const commitInputs = (next: InputRow[]) => {
    setInputs(next);
    persist({ inputs: next, lines, vouchers, targetPerMin });
  };
  const commitLines = (next: RecipeLine[]) => {
    setLines(next);
    persist({ inputs, lines: next, vouchers, targetPerMin });
  };
  const commitVouchers = (next: VoucherRow[]) => {
    setVouchers(next);
    persist({ inputs, lines, vouchers: next, targetPerMin });
  };
  const commitTargetPerMin = (next: number) => {
    setTargetPerMin(next);
    persist({ inputs, lines, vouchers, targetPerMin: next });
  };

  // 기본 레시피 + 공정 레시피를 합친 목록/조회맵
  const allRecipes = useMemo<FactoryRecipe[]>(
    () => [...RECIPES, ...processes.map(processToRecipe)],
    [processes],
  );
  const recipeById = useMemo<RecipeMap>(
    () => new Map(allRecipes.map((r) => [r.id, r])),
    [allRecipes],
  );

  /// 결산 계산 ----------------------------------------------------------
  const summary = useMemo(() => {
    const byId = computeBalances(lines, inputs, recipeById);
    // 관리권으로 지정한 자원별 개당 관리권 합 (같은 자원이 여러 번 지정될 수 있음)
    // 결산에 이미 잡힌 자원만 강조/우선 표시; 새로 추가하진 않는다.
    const voucherPerUnitById = new Map<string, number>();
    for (const v of vouchers) {
      voucherPerUnitById.set(
        v.itemId,
        (voucherPerUnitById.get(v.itemId) ?? 0) + v.perUnit,
      );
    }
    // 공장 입력으로 지정한 자원 집합 (파란색 강조 대상)
    const inputItemIds = new Set(inputs.map((i) => i.itemId));
    const totalById = new Map<string, Cell>();
    const rows = Array.from(byId, ([item, { total, factories }]) => {
      totalById.set(item, total);
      const perUnit = voucherPerUnitById.get(item);
      const isVoucher = perUnit !== undefined;
      // 그룹: 0 관리권 · 1 공장 입력 · 2 나머지. 관리권이 입력보다 우선.
      const group = isVoucher ? ROW_GROUP.voucher : inputItemIds.has(item) ? ROW_GROUP.input : ROW_GROUP.rest;
      // 이 자원이 만들어내는 관리권 양(분당) = 총생산량 × 개당 관리권
      const voucherAmount = perUnit ? cleanNumber(total.delta * perUnit) : 0;
      const voucherInf = isVoucher && total.inf && (perUnit ?? 0) > 0;
      // 정렬용 관리권 생산량: 무한은 맨 위(+∞), 관리권이 아니면 0이라 그룹 정렬에 영향 없음.
      const voucherSort = voucherInf ? Infinity : voucherAmount;
      return {
        itemId: item,
        name: itemName(item),
        total,
        factories,
        group,
        voucherAmount,
        voucherInf,
        voucherSort,
      };
    });

    rows.sort((a, b) => {
      // 1) 그룹: 관리권 → 공장 입력 → 나머지
      if (a.group !== b.group) return a.group - b.group;
      // 2) 관리권 생산량 (무한 우선 → 큰 값 순). 관리권 그룹이 아니면 둘 다 0이라 넘어감.
      if (a.voucherSort !== b.voucherSort) return b.voucherSort - a.voucherSort;
      // 3) 전체 합·공장별 수지 버킷
      const ka = [bucket(a.total), ...a.factories.map(bucket)];
      const kb = [bucket(b.total), ...b.factories.map(bucket)];
      for (let i = 0; i < ka.length; i++) {
        if (ka[i] !== kb[i]) return ka[i] - kb[i];
      }
      // 4) 이름
      return a.name.localeCompare(b.name, "en");
    });

    // 관리권 생산량 = Σ (자원 총생산량 × 개당 관리권)
    let voucherPerMin = 0;
    let voucherInf = false;
    for (const v of vouchers) {
      const total = totalById.get(v.itemId) ?? { inf: false, delta: 0 };
      if (total.inf) voucherInf = true;
      voucherPerMin += total.delta * v.perUnit;
    }

    return { rows, voucherPerMin, voucherInf };
  }, [inputs, lines, vouchers, recipeById]);

  /// 액션 --------------------------------------------------------------
  const addInput = () =>
    commitInputs([
      ...inputs,
      { id: uid(), itemId: ITEMS[0].id, rate: 0, infinite: false, target: "all" },
    ]);
  const addLine = (recipeId: string) =>
    commitLines([
      ...lines,
      { id: uid(), recipeId, count: 1, factory: selectedFactory },
    ]);
  const addVoucher = () =>
    commitVouchers([...vouchers, { id: uid(), itemId: ITEMS[0].id, perUnit: 1 }]);

  const patchInput = (id: string, patch: Partial<InputRow>) =>
    commitInputs(inputs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const patchLine = (id: string, patch: Partial<RecipeLine>) =>
    commitLines(lines.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const patchVoucher = (id: string, patch: Partial<VoucherRow>) =>
    commitVouchers(vouchers.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // 현재 선택한 공장에 배치된 레시피만 (목록 표시·편집 대상)
  const factoryLines = useMemo(
    () => lines.filter((l) => l.factory === selectedFactory),
    [lines, selectedFactory],
  );

  // 각 레시피 줄의 "최대화" 가능 여부 (버튼 상태·계산값 공유)
  const maxStateByLine = useMemo(() => {
    const m = new Map<string, MaxState>();
    for (const line of lines) {
      m.set(line.id, maxStateForLine(line, lines, inputs, recipeById));
    }
    return m;
  }, [lines, inputs, recipeById]);

  // 최대화: 계산된 최대 수량으로 맞춘다. (가능한 경우에만 작동, 다른 설정은 유지)
  const maximizeLine = (line: RecipeLine) => {
    const st = maxStateByLine.get(line.id);
    if (!st || st.kind !== "ok") return;
    patchLine(line.id, { count: st.value });
  };

  const resetAll = () => {
    if (!window.confirm("공장 계산기의 모든 입력을 초기화할까요?")) return;
    setInputs([]);
    setLines([]);
    setVouchers([]);
    setTargetPerMin(0);
    persist({ inputs: [], lines: [], vouchers: [], targetPerMin: 0 });
  };

  const voucherText = summary.voucherInf ? "∞" : formatNumber(summary.voucherPerMin);
  const voucherHourText = summary.voucherInf
    ? "∞"
    : formatNumber(summary.voucherPerMin * 60);

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4 text-zinc-900">
      <main className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold">공장 계산기</h1>
            <p className="text-sm text-zinc-600">
              들어오는 자원과 레시피를 배치해 공장별 분당 수지를 계산합니다. 레시피
              데이터는{" "}
              <a
                href="https://github.com/endfield-calc/factoriolab/"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-zinc-900"
              >
                endfield-calc/factoriolab
              </a>
              에서 가져옵니다.
            </p>
            <p className="text-xs text-zinc-500">
              브라우저에 자동 저장 · 자원 {ITEMS.length}종 · 레시피 {RECIPES.length}종
              {processes.length > 0 && ` · 공정 ${processes.length}개`}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <ImportExportButtons />
            <button
              type="button"
              onClick={resetAll}
              className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
            >
              공장만 초기화
            </button>
          </div>
        </header>

        {/* 1. 공장 입력 -------------------------------------------------- */}
        <Section
          title="공장 입력"
          hint="공짜로 들어오는 자원"
          right={
            <button type="button" onClick={addInput} className={addBtn}>
              + 자원 추가
            </button>
          }
        >
          {inputs.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-400">
              외부에서 무료로 공급되는 자원을 추가하세요. 수량을 음수로 두면 계속
              소비되는 자원, &quot;무한&quot;은 무제한 공급을 의미합니다.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-zinc-100">
              {inputs.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3"
                >
                  <div className="min-w-56 flex-1">
                    <ItemPicker
                      value={row.itemId}
                      clearable={false}
                      onSelect={(id) =>
                        id && patchInput(row.id, { itemId: id })
                      }
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-sm text-zinc-600">
                    <span className="text-xs text-zinc-500">분당</span>
                    <div className="w-28">
                      <NumInput
                        value={row.rate}
                        onChange={(n) => patchInput(row.id, { rate: n })}
                        disabled={row.infinite}
                      />
                    </div>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-zinc-500">배치</span>
                    <div className="flex gap-1">
                      {(["all", 1, 2, 3, 4] as const).map((t) => {
                        const active = (row.target ?? "all") === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => patchInput(row.id, { target: t })}
                            title={t === "all" ? "공장 전체" : `공장 ${t}에만 공급`}
                            className={
                              "h-7 rounded-md border px-1.5 text-xs font-semibold transition-colors " +
                              (active
                                ? "border-amber-500 bg-amber-500 text-white"
                                : "border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-100")
                            }
                          >
                            {t === "all" ? "전체" : t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      patchInput(row.id, { infinite: !row.infinite })
                    }
                    className={
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                      (row.infinite
                        ? "border-zinc-500 bg-zinc-700 text-white"
                        : "border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-100")
                    }
                  >
                    ∞ 무한
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      commitInputs(inputs.filter((r) => r.id !== row.id))
                    }
                    className={delBtn}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 2. 공장 설정 -------------------------------------------------- */}
        <Section
          title="공장 설정"
          hint={`공장 ${selectedFactory} · 레시피 ${factoryLines.length}개`}
          right={
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-500">공장</span>
              <div className="flex gap-1">
                {FACTORIES.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setSelectedFactory(f)}
                    title={`공장 ${f}`}
                    className={
                      "h-7 min-w-7 rounded-md border px-1.5 text-xs font-semibold transition-colors " +
                      (selectedFactory === f
                        ? "border-amber-500 bg-amber-500 text-white"
                        : "border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-100")
                    }
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          {/* 레시피 추가 패널 (기본 레시피 + 공정) → 선택한 공장에 추가된다 */}
          <div ref={pickerRef}>
            <RecipePicker
              recipes={allRecipes}
              onAdd={addLine}
              filterItemId={filterItemId}
              onFilterItemId={setFilterItemId}
            />
          </div>

          {/* 선택한 공장에 배치된 레시피 목록 */}
          {factoryLines.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-400">
              위에서 레시피를 추가하면 공장 {selectedFactory}에 배치되어 여기서
              수량·입출력을 조정할 수 있습니다.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-zinc-100">
              {factoryLines.map((line) => {
                const recipe = recipeById.get(line.recipeId);
                if (!recipe) return null;
                const isProcess = isProcessRecipeId(recipe.id);
                return (
                  <div key={line.id} className="flex flex-col gap-3 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <FactoryIcon id={recipe.icon} size={32} ring={isProcess} />
                      <div className="min-w-0 max-w-56">
                        <div className="truncate text-sm font-semibold text-zinc-800">
                          {recipe.name}
                        </div>
                        {recipe.producers && recipe.producers.length > 0 && (
                          <div className="truncate text-xs text-zinc-400">
                            {recipe.producers.map(itemName).join(", ")}
                          </div>
                        )}
                      </div>
                      {/* 원조 레시피 요약 (레시피당 입력 개수 · 소요 시간) */}
                      <RecipeFormula recipe={recipe} />
                      <div className="ml-auto flex items-center gap-2">
                        {(() => {
                          const st = maxStateByLine.get(line.id) ?? {
                            kind: "no-input" as const,
                          };
                          const style =
                            st.kind === "ok"
                              ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                              : st.kind === "deficit"
                                ? "cursor-not-allowed border-red-200 bg-red-50 text-red-300"
                                : "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-300";
                          const title =
                            st.kind === "deficit"
                              ? "입력 자원의 가용 합이 0 이하라 최대화할 수 없습니다"
                              : st.kind === "no-input"
                                ? "입력이 없는 레시피라 최대화할 게 없습니다"
                                : st.kind === "unbounded"
                                  ? "입력이 무한 공급이라 최대 수량을 정할 수 없습니다"
                                  : "입력 자원이 모자라지 않는 최대 수량으로 맞춥니다 (다른 설정은 유지)";
                          return (
                            <button
                              type="button"
                              onClick={() => maximizeLine(line)}
                              disabled={st.kind !== "ok"}
                              title={title}
                              className={
                                "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                                style
                              }
                            >
                              최대화
                            </button>
                          );
                        })()}
                        <label className="flex items-center gap-1.5">
                          <span className="text-xs text-zinc-500">수량</span>
                          <div className="w-24">
                            <NumInput
                              value={line.count}
                              onChange={(n) => patchLine(line.id, { count: n })}
                              allowNegative={false}
                            />
                          </div>
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            commitLines(lines.filter((r) => r.id !== line.id))
                          }
                          className={delBtn}
                        >
                          삭제
                        </button>
                      </div>
                    </div>

                    {/* 입력 → 출력 (분당 소비/산출) */}
                    <RecipeIOFields
                      recipe={recipe}
                      count={line.count}
                      onCount={(n) => patchLine(line.id, { count: n })}
                      onPickItem={pickFilterItem}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* 3. 결산 ------------------------------------------------------ */}
        <Section title="결산" hint="분당 순생산 기준">
          {/* 관리권 생산량 (생산량 / 목표) */}
          <div className="flex flex-wrap items-end gap-6 border-b border-zinc-200 bg-zinc-50/70 px-5 py-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                분당 관리권 생산량
              </div>
              <div className="text-2xl font-bold tabular-nums text-amber-600">
                {voucherText}
                {targetPerMin > 0 && (
                  <span className="font-medium text-zinc-400">
                    {" / "}
                    {formatNumber(targetPerMin)}
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                시간당 관리권 생산량
              </div>
              <div className="text-2xl font-bold tabular-nums text-amber-600">
                {voucherHourText}
                {targetPerMin > 0 && (
                  <span className="font-medium text-zinc-400">
                    {" / "}
                    {formatNumber(targetPerMin * 60)}
                  </span>
                )}
              </div>
            </div>
            {targetPerMin > 0 && (
              <div
                className={
                  "ml-auto text-lg font-bold " +
                  (summary.voucherInf || summary.voucherPerMin >= targetPerMin
                    ? "text-blue-600"
                    : "text-red-600")
                }
              >
                {summary.voucherInf || summary.voucherPerMin >= targetPerMin
                  ? "관리권 목표 달성!"
                  : "관리권 목표 미달"}
              </div>
            )}
          </div>

          {summary.rows.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-400">
              입력이나 레시피를 추가하면 자원별 수지가 표시됩니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-zinc-50 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="border-b border-zinc-200 px-4 py-2.5 text-left">
                      자원
                    </th>
                    <th className="border-b border-zinc-200 px-3 py-2.5 text-right">
                      전체 합
                    </th>
                    {FACTORIES.map((f) => (
                      <th
                        key={f}
                        className="border-b border-zinc-200 px-3 py-2.5 text-right"
                      >
                        공장 {f}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((row) => (
                    <tr
                      key={row.itemId}
                      className={
                        "border-b border-zinc-100 transition-colors last:border-b-0 " +
                        (row.group === ROW_GROUP.voucher
                          ? "bg-amber-50/50 hover:bg-amber-50"
                          : row.group === ROW_GROUP.input
                            ? "bg-blue-50/70 hover:bg-blue-100/70"
                            : "hover:bg-zinc-50/70")
                      }
                    >
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => pickFilterItem(row.itemId)}
                            title={`${row.name} · 클릭해서 자원으로 필터`}
                            className={
                              "rounded-md transition-colors " +
                              (row.group === ROW_GROUP.voucher
                                ? "hover:bg-amber-100"
                                : row.group === ROW_GROUP.input
                                  ? "hover:bg-blue-100"
                                  : "hover:bg-zinc-100")
                            }
                          >
                            <FactoryIcon id={row.itemId} size={22} />
                          </button>
                          <span className="text-zinc-800">{row.name}</span>
                          {row.group === ROW_GROUP.voucher && (
                            <span
                              title="이 자원이 만들어내는 분당 관리권"
                              className={
                                "ml-auto pl-3 text-xs font-semibold tabular-nums " +
                                voucherAmountClass(
                                  row.voucherInf,
                                  row.voucherAmount,
                                )
                              }
                            >
                              {voucherAmountText(
                                row.voucherInf,
                                row.voucherAmount,
                              )}
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        className={
                          "px-3 py-2 text-right font-semibold tabular-nums " +
                          cellClass(row.total)
                        }
                      >
                        {cellText(row.total)}
                      </td>
                      {row.factories.map((cell, i) => {
                        const idle =
                          cell.idle !== undefined && Number.isFinite(cell.idle)
                            ? cleanNumber(cell.idle)
                            : 0;
                        return (
                          <td
                            key={i}
                            className={
                              "px-3 py-2 text-right tabular-nums " +
                              cellClass(cell)
                            }
                          >
                            <span className="inline-flex items-center justify-end gap-1">
                              {cellText(cell)}
                              {idle > 0 && (
                                <span
                                  title="이 공장에서만 남아 다른 공장은 못 씀 (전체 합에 안 잡힘)"
                                  className="rounded bg-zinc-100 px-1 text-[10px] font-medium text-zinc-400"
                                >
                                  유휴 {formatNumber(idle)}
                                </span>
                              )}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* 4. 관리권 ---------------------------------------------------- */}
        <Section
          title="관리권"
          hint="자원 → 관리권 교환 설정"
          right={
            <button type="button" onClick={addVoucher} className={addBtn}>
              + 자원 추가
            </button>
          }
        >
          <div className="flex flex-wrap items-end gap-6 border-b border-zinc-200 px-5 py-4">
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-500">목표 분당</span>
              <div className="w-28">
                <NumInput
                  value={targetPerMin}
                  onChange={commitTargetPerMin}
                  allowNegative={false}
                />
              </div>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-500">목표 시간당</span>
              <div className="w-28">
                <NumInput
                  value={targetPerMin * 60}
                  onChange={(n) => commitTargetPerMin(n / 60)}
                  allowNegative={false}
                />
              </div>
            </label>
          </div>

          {vouchers.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-400">
              관리권으로 교환되는 자원과 개당 관리권 수를 추가하세요.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-zinc-100">
              {vouchers.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3"
                >
                  <div className="min-w-56 flex-1">
                    <ItemPicker
                      value={row.itemId}
                      clearable={false}
                      onSelect={(id) =>
                        id && patchVoucher(row.id, { itemId: id })
                      }
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-sm text-zinc-600">
                    <span className="text-xs text-zinc-500">개당 관리권</span>
                    <div className="w-24">
                      <NumInput
                        value={row.perUnit}
                        onChange={(n) => patchVoucher(row.id, { perUnit: n })}
                        allowNegative={false}
                      />
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      commitVouchers(vouchers.filter((r) => r.id !== row.id))
                    }
                    className={delBtn}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>
      </main>
    </div>
  );
}
