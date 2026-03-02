import { execFileAsync } from "./subprocess-utils.js";

export type TmuxSplitFlag = "-h" | "-v";

export interface TmuxPaneInfo {
  paneId: string;
  width: number;
  height: number;
  active: boolean;
}

export interface PlacementResult {
  targetPane: string;
  splitFlag: TmuxSplitFlag;
}

const LIST_PANES_FORMAT = "#{pane_id} #{pane_width} #{pane_height} #{pane_active}";

export async function listPanes(tmuxPath: string): Promise<TmuxPaneInfo[]> {
  const result = await execFileAsync(tmuxPath, ["list-panes", "-F", LIST_PANES_FORMAT], {
    timeout: 3000,
  });
  if (result.exitCode !== 0) return [];

  const panes: TmuxPaneInfo[] = [];
  for (const rawLine of result.stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 4) continue;

    const paneId = parts[0] ?? "";
    const width = Number.parseInt(parts[1] ?? "", 10);
    const height = Number.parseInt(parts[2] ?? "", 10);
    const activeRaw = parts[3] ?? "";

    if (!paneId || !Number.isFinite(width) || !Number.isFinite(height)) continue;
    panes.push({
      paneId,
      width,
      height,
      active: activeRaw === "1",
    });
  }

  return panes;
}

export function findBestSplit(panes: TmuxPaneInfo[]): PlacementResult | null {
  if (panes.length === 0) return null;

  let best = panes[0];
  let bestArea = best.width * best.height;

  for (let i = 1; i < panes.length; i++) {
    const pane = panes[i];
    if (!pane) continue;
    const area = pane.width * pane.height;
    if (area > bestArea) {
      best = pane;
      bestArea = area;
    }
  }

  // Terminal cells are ~2x taller than wide (typical monospace font aspect ratio).
  // Correct for this so BSP splits the visually longer axis, not just the higher
  // character count. Without this, a 77x68 pane looks "wider" in chars but is
  // actually much taller in pixels, and should split top/bottom (-v), not left/right.
  const CELL_ASPECT_RATIO = 2;
  const visualWidth = best.width;
  const visualHeight = best.height * CELL_ASPECT_RATIO;

  return {
    targetPane: best.paneId,
    splitFlag: visualWidth >= visualHeight ? "-h" : "-v",
  };
}
