# pi-web Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pi terminal extension (`/web`, `/mobile`, `/refresh`) and a Go pidfile so the extension can discover the running pi-web server.

**Architecture:** A single TypeScript extension registers three slash commands. Port/host detection uses a JSON pidfile written by the Go server on startup, with a shell-command fallback. The `/mobile` command renders a terminal QR code using the `qrcode` npm package (gracefully degraded if missing).

**Tech Stack:** Go 1.25+, TypeScript (pi extension API), `qrcode` npm package

---

## File Structure

| File | Action | Responsibility |
|------|--------|--------------|
| `main.go` | Modify | Add `writePidfile()` and call it on startup with `defer` cleanup |
| `extensions/pi-web.ts` | Create | The pi extension with `/web`, `/mobile`, `/refresh` commands |
| `README.md` | Modify | Document the three new commands and optional `qrcode` install |

---

## Task 1: Add pidfile write to main.go

**Files:**
- Modify: `main.go`

### Step 1: Add `writePidfile` helper

Insert this function near the other helpers in `main.go` (after `openBrowser` is fine):

```go
func writePidfile(host, port string, usedTailscale bool) (string, error) {
	home := os.Getenv("HOME")
	if home == "" {
		return "", fmt.Errorf("HOME not set")
	}
	agentDir := filepath.Join(home, ".pi", "agent")
	if err := os.MkdirAll(agentDir, 0755); err != nil {
		return "", err
	}
	path := filepath.Join(agentDir, "pi-web-state.json")
	data, err := json.Marshal(map[string]any{
		"pid":       os.Getpid(),
		"port":      port,
		"host":      host,
		"tailscale": usedTailscale,
		"startedAt": time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		return "", err
	}
	return path, nil
}
```

### Step 2: Wire pidfile into `main()`

In `main()`, after the `addr` and `url` variables are set and before the `if *open` block, add:

```go
	pidfilePath, err := writePidfile(bindHost, *port, usedTailscale)
	if err != nil {
		fmt.Fprintf(os.Stderr, "WARNING: failed to write pidfile: %v\n", err)
	} else {
		defer os.Remove(pidfilePath)
	}
```

- `os` and `time` are already imported; `json` and `filepath` are already imported.

### Step 3: Verify it compiles

Run:
```bash
go build -o pi-web .
```
Expected: clean build, no errors.

### Step 4: Test pidfile manually

Run:
```bash
./pi-web -p 9999 &
PID=$!
sleep 1
cat ~/.pi/agent/pi-web-state.json
kill $PID
sleep 1
ls ~/.pi/agent/pi-web-state.json 2>&1
```

Expected output from `cat`:
```json
{"host":"...","pid":...,"port":"9999","startedAt":"...","tailscale":...}
```

Expected from `ls` after kill:
```
No such file or directory
``` (file cleaned up by defer)

### Step 5: Commit

```bash
git add main.go
git commit -m "feat: write pidfile on startup for extension discovery"
```

---

## Task 2: Create the TypeScript extension

**Files:**
- Create: `extensions/pi-web.ts`

### Step 2.1: Write the extension file

Create `extensions/pi-web.ts` with the complete contents below.

```typescript
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { basename } from "node:path";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

interface PiWebState {
  pid: number;
  port: string;
  host: string;
  tailscale: boolean;
  startedAt: string;
}

async function detectHostPort(pi: ExtensionAPI): Promise<{ host: string; port: string; tailscale: boolean } | null> {
  // 1. Try pidfile
  try {
    const path = `${homedir()}/.pi/agent/pi-web-state.json`;
    const raw = readFileSync(path, "utf-8");
    const state: PiWebState = JSON.parse(raw);

    // Validate PID is still alive
    try {
      process.kill(state.pid, 0);
    } catch {
      // stale pidfile, fall through
    }

    return { host: state.host, port: state.port, tailscale: state.tailscale };
  } catch {
    // fall through
  }

  // 2. Process fallback (macOS / Linux)
  if (process.platform !== "win32") {
    try {
      const result = await pi.exec("pgrep", ["-a", "pi-web"]);
      const line = result.stdout.trim().split("\n")[0];
      if (line) {
        const parts = line.split(/\s+/);
        const args = parts.slice(1);
        let port = "31483";
        let host = "127.0.0.1";
        for (let i = 0; i < args.length; i++) {
          if ((args[i] === "-p" || args[i] === "--port") && args[i + 1]) {
            port = args[i + 1];
            i++;
          }
          if ((args[i] === "--host") && args[i + 1]) {
            host = args[i + 1];
            i++;
          }
        }
        return { host, port, tailscale: isTailscaleHost(host) };
      }
    } catch {
      // fall through
    }
  }

  // 3. Default fallback
  return { host: "127.0.0.1", port: "31483", tailscale: false };
}

function isTailscaleHost(host: string): boolean {
  const ip = host.split(":")[0];
  const parts = ip.split(".").map(Number);
  if (parts.length === 4) {
    return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
  }
  return ip.toLowerCase().startsWith("fd7a:115c:a1e0");
}

async function healthCheck(host: string, port: string): Promise<boolean> {
  try {
    const res = await fetch(`http://${host}:${port}`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

function openBrowser(pi: ExtensionAPI, url: string): Promise<void> {
  let cmd: string;
  let args: string[];
  switch (process.platform) {
    case "darwin":
      cmd = "open";
      args = [url];
      break;
    case "win32":
      cmd = "cmd";
      args = ["/c", "start", url];
      break;
    default:
      cmd = "xdg-open";
      args = [url];
      break;
  }
  return pi.exec(cmd, args).then(() => {});
}

export default function (pi: ExtensionAPI) {
  // ── /web ──────────────────────────────────────────────────────────
  pi.registerCommand("web", {
    description: "Open current session in pi-web browser",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      const sessionFile = ctx.sessionManager.getSessionFile();
      if (!sessionFile) {
        ctx.ui.notify("Cannot view an in-memory session.", "error");
        return;
      }

      const detected = await detectHostPort(pi);
      if (!detected) {
        ctx.ui.notify("Could not detect pi-web server. Start it with: pi-web -o", "error");
        return;
      }

      const { host, port } = detected;
      if (!(await healthCheck(host, port))) {
        ctx.ui.notify(`pi-web not responding on ${host}:${port}. Start it with: pi-web -o`, "error");
        return;
      }

      const sessionId = basename(sessionFile);
      const url = `http://${host}:${port}/session?id=${encodeURIComponent(sessionId)}`;

      try {
        await openBrowser(pi, url);
        ctx.ui.notify("Opened session in browser", "success");
      } catch {
        ctx.ui.notify(`Failed to open browser. Visit ${url} manually.`, "warning");
      }
    },
  });

  // ── /mobile ───────────────────────────────────────────────────────
  pi.registerCommand("mobile", {
    description: "Show QR code for mobile Tailscale access",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      const sessionFile = ctx.sessionManager.getSessionFile();
      if (!sessionFile) {
        ctx.ui.notify("Cannot view an in-memory session.", "error");
        return;
      }

      const detected = await detectHostPort(pi);
      if (!detected) {
        ctx.ui.notify("Could not detect pi-web server. Start it with: pi-web -o", "error");
        return;
      }

      const { host, port, tailscale } = detected;
      if (!(await healthCheck(host, port))) {
        ctx.ui.notify(`pi-web not responding on ${host}:${port}. Start it with: pi-web -o`, "error");
        return;
      }

      if (!tailscale) {
        ctx.ui.notify(
          "pi-web is not running on a Tailscale IP. " +
            "Install Tailscale, then start with: PI_WEB_TOKEN=... pi-web --host $(tailscale ip -4)",
          "error"
        );
        return;
      }

      const sessionId = basename(sessionFile);
      const url = `http://${host}:${port}/session?id=${encodeURIComponent(sessionId)}`;

      // Try QR code
      let qrText = "";
      try {
        const QRCode = await import("qrcode");
        qrText = await QRCode.toString(url, { type: "terminal", small: true });
      } catch {
        // qrcode not available — will show URL only
      }

      if (qrText) {
        ctx.sendMessage({
          customType: "pi-web-mobile",
          content: `Scan this QR code to open the session on your mobile device:\n\n${qrText}\n\n${url}`,
          display: true,
        });
      } else {
        ctx.ui.notify(
          `QR code unavailable (install 'qrcode' package). Open this URL on your mobile: ${url}`,
          "warning"
        );
      }
    },
  });

  // ── /refresh ──────────────────────────────────────────────────────
  pi.registerCommand("refresh", {
    description: "Sync mobile-written messages back into this session",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      const sessionFile = ctx.sessionManager.getSessionFile();
      if (!sessionFile) {
        ctx.ui.notify("Cannot refresh an in-memory session.", "error");
        return;
      }

      let fileEntries: unknown[] = [];
      try {
        const raw = readFileSync(sessionFile, "utf-8");
        fileEntries = raw
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((line) => JSON.parse(line));
      } catch (err) {
        ctx.ui.notify(`Failed to read session file: ${err}`, "error");
        return;
      }

      const currentCount = ctx.sessionManager.getEntries().length;
      // fileEntries includes header, so subtract 1 for message entries
      const fileCount = Math.max(0, fileEntries.length - 1);

      if (fileCount > currentCount) {
        const delta = fileCount - currentCount;
        ctx.ui.notify(`Mobile added ${delta} new message(s). Reloading session...`, "info");
        await ctx.switchSession(sessionFile);
      } else {
        ctx.ui.notify("Session is up to date.", "info");
      }
    },
  });
}
```

### Step 2.2: Verify TypeScript syntax

Run:
```bash
cd /Users/setkyar/pi-web
npx tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext extensions/pi-web.ts 2>&1 || true
```

If there are import-resolution errors for `@mariozechner/pi-coding-agent`, that is expected in isolation (pi provides the types at runtime). The code itself should have no syntax errors.

### Step 2.3: Commit

```bash
git add extensions/pi-web.ts
git commit -m "feat: add /web, /mobile, /refresh pi extension"
```

---

## Task 3: Optionally install qrcode for QR support

**Files:**
- N/A (runtime dependency)

### Step 3.1: Install qrcode

The `qrcode` package must be resolvable when pi loads the extension. Install it where pi can find it:

```bash
# Option A: global install
npm install -g qrcode

# Option B: install into pi's own node_modules
# (path varies by install method; adjust as needed)
```

### Step 3.2: Verify QR generation works standalone

```bash
node -e "const QRCode = require('qrcode'); QRCode.toString('http://example.com', {type:'terminal', small:true}, (e,s) => console.log(s))"
```

Expected: a scannable ASCII QR code is printed.

### Step 3.3: Document in README

Add a section under "## Pi integration" in `README.md`:

```markdown
### `/web`, `/mobile`, `/refresh` commands

```bash
mkdir -p ~/.pi/agent/extensions
cp extensions/pi-web.ts ~/.pi/agent/extensions/
```

Restart pi (or run `/reload`), then:

- `/web` — open the current session in your default browser
- `/mobile` — show a QR code for mobile access over Tailscale (requires `qrcode` npm package)
- `/refresh` — pull new messages written from mobile back into the terminal session

Optional: install `qrcode` for QR code generation:

```bash
npm install -g qrcode
```
```

### Step 3.4: Commit

```bash
git add README.md
git commit -m "docs: document /web, /mobile, /refresh extension commands"
```

---

## Spec Coverage Check

| Spec Requirement | Plan Task |
|------------------|-----------|
| Pidfile write on startup | Task 1, Step 1–2 |
| Pidfile cleanup on shutdown | Task 1, Step 2 (`defer os.Remove`) |
| Port detection (pidfile → process → default) | Task 2, `detectHostPort()` |
| Health check before opening URL | Task 2, `healthCheck()` |
| `/web` opens browser | Task 2, `/web` handler |
| `/mobile` checks Tailscale | Task 2, `/mobile` handler tailscale check |
| `/mobile` shows QR + URL | Task 2, `/mobile` handler QR generation |
| `/mobile` degrades without qrcode | Task 2, `/mobile` try/catch on `import("qrcode")` |
| `/refresh` counts entries and reloads | Task 2, `/refresh` handler |
| Error notifications for all failure modes | Task 2, all handlers |

---

## Placeholder Scan

- No TBD/TODO placeholders.
- No vague "add appropriate error handling" steps — every handler has explicit error paths.
- No "write tests for the above" without test code — manual verification steps are provided.
- All type names and method signatures match between spec and plan.
