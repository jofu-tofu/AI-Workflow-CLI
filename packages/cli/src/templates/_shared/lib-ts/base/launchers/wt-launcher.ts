import { execFileAsync, findExecutable } from "../subprocess-utils.js";
import type { PaneLaunchOptions, PaneLaunchResult, PaneLauncher } from "../pane-launcher.js";

function findPowerShell(): string {
  return findExecutable("pwsh") ?? findExecutable("powershell") ?? "powershell";
}

export class WtLauncher implements PaneLauncher {
  readonly backend = "wt" as const;

  async available(): Promise<boolean> {
    if (process.platform !== "win32") return false;
    return Boolean(findExecutable("wt") ?? findExecutable("wt.exe"));
  }

  async launch(options: PaneLaunchOptions): Promise<PaneLaunchResult> {
    if (process.platform !== "win32") {
      return {
        launched: false,
        backend: this.backend,
        reason: "wt launcher only available on Windows",
      };
    }

    const wtPath = findExecutable("wt") ?? findExecutable("wt.exe");
    if (!wtPath) {
      return {
        launched: false,
        backend: this.backend,
        reason: "wt.exe not found on PATH",
      };
    }

    const args = ["split-pane"];
    const splitDirection = options.splitDirection ?? "auto";
    if (splitDirection === "h") args.push("-H");
    if (splitDirection === "v") args.push("-V");

    if (options.cwd?.trim()) args.push("-d", options.cwd.trim());
    if (options.title?.trim()) args.push("--title", options.title.trim());

    const powershellPath = findPowerShell();
    args.push("--", powershellPath, "-NoProfile", "-Command", options.command);

    const result = await execFileAsync(wtPath, args, {
      timeout: 5000,
      shell: false,
    });

    if (result.exitCode !== 0) {
      return {
        launched: false,
        backend: this.backend,
        reason: "wt split-pane failed",
        stderr: result.stderr.trim() || undefined,
      };
    }

    return {
      launched: true,
      backend: this.backend,
    };
  }
}
