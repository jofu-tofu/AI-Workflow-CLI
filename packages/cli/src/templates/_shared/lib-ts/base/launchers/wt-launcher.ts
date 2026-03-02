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

    if (!findExecutable("wt") && !findExecutable("wt.exe")) {
      return {
        launched: false,
        backend: this.backend,
        reason: "wt.exe not found on PATH",
      };
    }

    // Build the wt command as a single string for cmd.exe /c.
    // We invoke via cmd.exe explicitly (shell: false) instead of using
    // shell: true or calling wt.exe directly because:
    // 1. bun's execFile cannot resolve UWP app stubs (WindowsApps\wt.exe) → ENOENT
    // 2. shell: true loses the WT window association → splits in a new window
    // 3. cmd.exe /c preserves the WT_SESSION context → splits in the current window
    const wtArgs = ["-w", "0", "split-pane"];

    const splitDirection = options.splitDirection ?? "auto";
    if (splitDirection === "h") wtArgs.push("-H");
    if (splitDirection === "v") wtArgs.push("-V");

    if (options.cwd?.trim()) wtArgs.push("-d", `"${options.cwd.trim()}"`);
    if (options.title?.trim()) wtArgs.push("--title", `"${options.title.trim()}"`);

    const powershellPath = findPowerShell();
    // Use -EncodedCommand to avoid quoting/escaping issues with complex
    // PowerShell scripts containing backticks, quotes, semicolons, etc.
    const encoded = Buffer.from(options.command, "utf16le").toString("base64");
    wtArgs.push("--", `"${powershellPath}"`, "-NoProfile", "-EncodedCommand", encoded);

    const wtCommand = `wt ${wtArgs.join(" ")}`;

    const result = await execFileAsync("cmd.exe", ["/c", wtCommand], {
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
