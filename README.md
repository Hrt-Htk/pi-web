# pi-web (Remote Control Your Pi)

Drive your [pi](https://pi.dev) coding agent from any browser on your network — laptop, phone, or tablet.

## Screenshots

<div align="center">
  <img src="assets/desktop-dark-mode.png" alt="Desktop — dark mode" width="90%" /><br />
  <em>Desktop — dark mode</em>
  <br /><br />
  <img src="assets/desktop-white-mode.png" alt="Desktop — light mode" width="90%" /><br />
  <em>Desktop — light mode</em>
  <br /><br />
  <img src="assets/mobile-pwa.png" alt="Mobile PWA" width="90%" /><br />
  <em>Mobile PWA</em>
</div>

## How It Fits Together

```
 pi (terminal)                 Browser (phone / tablet / laptop)
      │                                │
      │  writes JSONL                  │  HTTP + SSE
      ▼                                ▼
 ~/.pi/agent/sessions/  ←───  pi-web (Go HTTP server)
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
              pi --mode rpc      fsnotify         tailscale serve
            (per‑session       (live reload)      (remote HTTPS
             chat worker)                           via MagicDNS)
```

- **pi** writes conversation JSONL to `~/.pi/agent/sessions/` as it works.
- **pi-web** is a Go server that reads those files, renders them in the browser, and streams live updates via SSE.
- **pi --mode rpc** workers handle browser-initiated chat — one per session, reaped after 10 min idle.
- **fsnotify** watches the sessions directory so the browser reloads within milliseconds of new output.
- **Tailscale Serve** publishes the localhost server as an HTTPS endpoint on your tailnet.

## Install

```bash
pi install npm:@ygncode/pi-web
```

That's it — it downloads the binary, sets up auto‑start, and registers the `/remote`, `/refresh`, and `set_tab_title` commands.

For manual installs, binary downloads, or building from source, see [docs/install.md](docs/install.md).

## Features

### Remote control

- Continue any session from the browser with text or image attachments
- Start a brand-new session against any project path, right from the web UI
- In-browser model switching and thinking-level selector, per session
- Per-session worker status (idle / running / error) with auto-recovery on crash
- Multiple sessions run in parallel — kick off work in one, watch another stream
- `PI_WEB_TOKEN` for safe LAN exposure — required by default for any explicit non-loopback bind

### Reading sessions

- Browse sessions across projects with filters, search, and full branch navigation
- Live incremental updates while pi is still running (via fsnotify; ~ms latency)
- Follow mode for tailing active sessions
- Deep links to individual messages
- Download a session as JSONL
- Share static snapshots as secret GitHub Gists
- `/remote`, `/refresh` pi extensions for remote QR and session sync

## Pi Integration

After `pi install npm:@ygncode/pi-web`, you get:

| Command | What it does |
|---------|--------------|
| `/pi-web` | Show status, version, start/stop/restart the server, or update |
| `/remote` | Show a QR code and URL for remote access over Tailscale |
| `/refresh` | Pull new messages written from remote browsers back into the terminal session |
| `set_tab_title` | Tool that updates the session title; also auto‑derives a short title from each user message |

The package also installs the pi-web binary to `~/.pi/agent/bin/pi-web` and sets up auto-start on login.

## How It Works

pi-web reads session JSONL files from `~/.pi/agent/sessions/` and renders them with pi's own export templates, embedded into the binary at build time. Three moving parts:

- **Live reload and chat preview.** A `fsnotify` watcher tails the sessions directory and pushes SSE reload events to connected browsers when pi appends to the file. Session pages fetch `/api/session` and upsert canonical JSONL entries in place. Browser-started chat also streams best-effort assistant previews over the same SSE connection.
- **Per-session workers.** When you send a message from the browser, pi-web spawns a headless `pi --mode rpc` subprocess scoped to that session, switches it to the session file, and forwards your prompt. Subsequent messages reuse the same worker. If the worker crashes it's evicted and replaced; idle workers are reaped after 10 minutes.
- **Sharing.** Renders a self-contained HTML snapshot and shells out to `gh gist create --public=false`. Snapshots don't live-update.

A single binary, no database, no daemon — just a Go HTTP server reading the same JSONL pi already writes.

## Auto-Start on Login

The `pi install npm:@ygncode/pi-web` command sets this up automatically:

| OS | Mechanism |
|----|-----------|
| macOS | launchd plist at `~/Library/LaunchAgents/com.pi-web.plist` |
| Linux | systemd user service at `~/.config/systemd/user/pi-web.service` |

To set a token for remote access, create `~/.config/pi-web/env`:

```
PI_WEB_TOKEN=your-token-here
```

For more details (manual setup, custom ports, non-loopback binds), see [docs/install.md](docs/install.md).

## Development

```bash
make setup   # install frontend deps and download Go modules
make check   # frontend test/build + Go test/vet
make build   # setup if needed, build frontend, then build ./pi-web
```

## License

MIT
