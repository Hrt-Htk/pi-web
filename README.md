# Pi Sessions Viewer

A local web viewer for all your [pi](https://pi.dev) coding agent sessions.

## Features

- 📂 Browse all sessions from `~/.pi/agent/sessions/`
- 🌐 Serves at `http://localhost:27183`
- 🌲 Full session tree view (same UI as pi's `/export`)
- 🔄 Live incremental updates — new messages appear without refresh
- 📜 Follow mode — auto-scrolls like a chat, pauses when you scroll up
- 📤 Share sessions as GitHub Gists directly from the browser
- ⌨️ `/view` command inside pi — opens current session in browser

## Install

```bash
# Clone
git clone https://github.com/ygncode/pi-sessions-viewer.git
cd pi-sessions-viewer

# Build
go build -o pi-sessions-viewer .

# Install to PATH
sudo cp pi-sessions-viewer /usr/local/bin/
# or
cp pi-sessions-viewer ~/.pi/agent/bin/
```

## Run

```bash
# Start server
pi-sessions-viewer

# Open browser automatically
pi-sessions-viewer -o

# Custom port
pi-sessions-viewer -p 8080
```

## Auto-start on login (macOS)

```bash
# Copy the launch agent
cp com.pi-sessions-viewer.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.pi-sessions-viewer.plist
```

## Pi Integration

### `/view` command

Install the extension to type `/view` inside pi:

```bash
cp view-sessions.ts ~/.pi/agent/extensions/
```

Then inside pi, type `/view` to open the current session in your browser.

### Skill

Copy the skill so pi knows when to suggest the viewer:

```bash
cp -r pi-sessions-viewer ~/.pi/agent/skills/
```

## Share

Click **"↗ Share"** on any session page to create a secret GitHub Gist and get a shareable link.

Requires:
- `gh` CLI installed: `brew install gh`
- Logged in: `gh auth login`

## License

MIT
