#!/usr/bin/env bash
set -euo pipefail

# pi-web installer — downloads the binary and sets up auto-start
# Runs automatically via npm postinstall after `pi install git:github.com/ygncode/pi-web`
# Also runs on `pi update` when a new version is pulled.

REPO="ygncode/pi-web"
INSTALL_DIR="${PI_WEB_INSTALL_DIR:-/usr/local/bin}"
BINARY="$INSTALL_DIR/pi-web"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSION_FILE="${HOME}/.pi/agent/pi-web-version"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${GREEN}→${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
err()   { echo -e "${RED}✗${NC} $*"; }

# ── Detect platform ─────────────────────────────────────────────────
detect_platform() {
  local os arch
  case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    *)
      err "Unsupported OS: $(uname -s)"
      exit 1
      ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64) arch="amd64" ;;
    arm64|aarch64) arch="arm64" ;;
    *)
      err "Unsupported architecture: $(uname -m)"
      exit 1
      ;;
  esac

  echo "${os}-${arch}"
}

# ── Check latest release tag ────────────────────────────────────────
latest_tag() {
  local url="https://api.github.com/repos/${REPO}/releases/latest"
  local tag

  if command -v curl &>/dev/null; then
    tag="$(curl -fsS "$url" 2>/dev/null | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"
  elif command -v wget &>/dev/null; then
    tag="$(wget -qO- "$url" 2>/dev/null | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"
  else
    err "Neither curl nor wget found."
    exit 1
  fi

  if [[ -z "$tag" ]]; then
    err "Could not determine latest release tag from ${REPO}."
    exit 1
  fi

  echo "$tag"
}

# ── Get installed version ───────────────────────────────────────────
installed_version() {
  if [[ -x "$BINARY" ]]; then
    "$BINARY" --version 2>/dev/null || true
  elif [[ -f "$VERSION_FILE" ]]; then
    # Binary not executable yet (e.g., partial install); fall back to version file
    cat "$VERSION_FILE"
  fi
}

# ── Check if update is needed ───────────────────────────────────────
needs_update() {
  local latest="$1"

  if [[ ! -f "$BINARY" ]]; then
    return 0  # not installed yet
  fi

  local installed
  installed="$(installed_version)"
  if [[ -n "$installed" ]] && [[ "$installed" == "$latest" ]]; then
    return 1  # already up-to-date
  fi

  if [[ -n "$installed" ]]; then
    info "Update available: ${installed} → ${latest}"
  else
    info "Existing binary found (unknown version). Installing ${latest}."
  fi

  return 0  # needs update
}

# ── Download binary ─────────────────────────────────────────────────
download_binary() {
  local platform="$1"
  local tag="$2"
  local asset="pi-web-${platform}"
  local url="https://github.com/${REPO}/releases/download/${tag}/${asset}"

  info "Downloading pi-web ${tag} (${platform})..."
  info "  ${url}"

  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  if command -v curl &>/dev/null; then
    curl -fsSL --progress-bar -o "${tmp}/pi-web" "$url"
  elif command -v wget &>/dev/null; then
    wget -q --show-progress -O "${tmp}/pi-web" "$url"
  else
    err "Neither curl nor wget found. Install one and try again."
    exit 1
  fi

  chmod +x "${tmp}/pi-web"
  echo "${tmp}/pi-web"
}

# ── Install binary ──────────────────────────────────────────────────
install_binary() {
  local src="$1"
  local tag="$2"
  local is_update="${3:-false}"

  if [[ -f "$BINARY" ]] && [[ "$is_update" != "true" ]]; then
    # Interactive: ask before overwriting
    warn "pi-web already installed at ${BINARY}"
    read -rp "  Overwrite? [y/N] " answer
    if [[ ! "$answer" =~ ^[Yy]$ ]]; then
      info "Skipping binary install."
      return 1
    fi
  fi

  # Stop running instance before replacing
  if [[ -f "$BINARY" ]]; then
    if [[ "$(uname -s)" == "Linux" ]]; then
      systemctl --user stop pi-web.service 2>/dev/null || true
    elif [[ "$(uname -s)" == "Darwin" ]]; then
      launchctl unload "${HOME}/Library/LaunchAgents/com.pi-web.plist" 2>/dev/null || true
    fi
    # Also try pkill for manually-started instances
    pkill -f "${BINARY}" 2>/dev/null || true
    sleep 1
  fi

  if [[ ! -w "$INSTALL_DIR" ]]; then
    info "Installing to ${INSTALL_DIR} (requires sudo)..."
    sudo cp "$src" "$BINARY"
  else
    cp "$src" "$BINARY"
  fi

  # Record version
  mkdir -p "$(dirname "$VERSION_FILE")"
  echo "$tag" > "$VERSION_FILE"

  info "pi-web ${tag} installed to ${BINARY}"
  return 0
}

# ── macOS auto-start ─────────────────────────────────────────────────
setup_macos() {
  local plist_src="${SRC_DIR}/com.pi-web.plist"
  local plist_dst="${HOME}/Library/LaunchAgents/com.pi-web.plist"
  local needs_reload=true

  if [[ ! -f "$plist_src" ]]; then
    warn "com.pi-web.plist not found in package — skipping macOS auto-start."
    return 0
  fi

  mkdir -p "${HOME}/Library/LaunchAgents"

  # Check if plist changed
  if [[ -f "$plist_dst" ]]; then
    local tmp_dst
    tmp_dst="$(mktemp)"
    sed "s|/usr/local/bin/pi-web|${BINARY}|g" "$plist_src" > "$tmp_dst"
    if cmp -s "$tmp_dst" "$plist_dst"; then
      info "Auto-start config unchanged."
      needs_reload=false
    fi
    rm -f "$tmp_dst"
  fi

  if [[ "$needs_reload" == "true" ]]; then
    sed "s|/usr/local/bin/pi-web|${BINARY}|g" "$plist_src" > "$plist_dst"
    launchctl unload "$plist_dst" 2>/dev/null || true
    launchctl load "$plist_dst"
    info "macOS auto-start configured (launchd)"
  fi

  # Restart if already running
  launchctl stop com.pi-web 2>/dev/null || true
  launchctl start com.pi-web 2>/dev/null || true
}

# ── Linux auto-start (systemd user service) ──────────────────────────
setup_linux() {
  local service_src="${SRC_DIR}/pi-web.service"
  local service_dir="${HOME}/.config/systemd/user"
  local service_dst="${service_dir}/pi-web.service"
  local needs_reload=true

  if [[ ! -f "$service_src" ]]; then
    warn "pi-web.service not found in package — skipping Linux auto-start."
    return 0
  fi

  mkdir -p "$service_dir"

  # Check if service file changed
  if [[ -f "$service_dst" ]]; then
    if cmp -s "$service_src" "$service_dst"; then
      info "Service config unchanged."
      needs_reload=false
    fi
  fi

  if [[ "$needs_reload" == "true" ]]; then
    cp "$service_src" "$service_dst"
    systemctl --user daemon-reload
    info "Linux auto-start updated (systemd user service)"
  fi

  # Enable and restart
  systemctl --user enable pi-web.service 2>/dev/null || true
  systemctl --user restart pi-web.service 2>/dev/null || {
    # Service may not be running yet (first install)
    systemctl --user start pi-web.service 2>/dev/null || true
  }
}

# ── Token reminder ──────────────────────────────────────────────────
token_reminder() {
  if [[ -z "${PI_WEB_TOKEN:-}" ]]; then
    echo ""
    warn "PI_WEB_TOKEN is not set."
    warn "pi-web will only bind to loopback (127.0.0.1) without a token."
    warn "For Tailscale or LAN access, set it in your shell profile:"
    warn "  export PI_WEB_TOKEN=\$(openssl rand -hex 16)"
    echo ""
  fi
}

# ── Main ────────────────────────────────────────────────────────────
main() {
  echo ""
  info "pi-web installer"
  echo ""

  local platform
  platform="$(detect_platform)"

  local tag
  tag="$(latest_tag)"

  if ! needs_update "$tag"; then
    info "Already up-to-date (${tag})."
    echo ""
    exit 0
  fi

  local tmp_binary
  tmp_binary="$(download_binary "$platform" "$tag")"

  # Check if running interactively
  local is_update=false
  if [[ ! -t 0 ]]; then
    is_update=true  # non-interactive → update mode (no prompts)
  fi

  if ! install_binary "$tmp_binary" "$tag" "$is_update"; then
    # User chose not to overwrite
    exit 0
  fi

  case "$(uname -s)" in
    Darwin) setup_macos ;;
    Linux)  setup_linux ;;
  esac

  token_reminder

  info "Done! pi-web ${tag} is ready."
  echo ""
}

main
