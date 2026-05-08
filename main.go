package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"pi-web/internal/auth"
	"pi-web/internal/rpc"
	"pi-web/internal/server"
	"pi-web/internal/sessions"
	"pi-web/internal/workers"
)

const defaultPort = "31483"
const tokenEnvVar = "PI_WEB_TOKEN"

// indexScriptPath is the URL path at which the index page's Vite module is
// served. It defaults to a stable path and is overwritten at startup if a
// hashed asset is found in the Vite manifest. The index template reads it via
// funcMap so the rendered <script src> tracks the build hash.
var indexScriptPath = "/static/assets/index.js"

func main() {
	port := flag.String("p", defaultPort, "port to listen on")
	hostOverride := flag.String("host", "", "host/IP to bind; defaults to Tailscale IP when available, otherwise 127.0.0.1")
	open := flag.Bool("o", false, "auto-open browser")
	insecure := flag.Bool("insecure", false, "allow non-loopback bind without "+tokenEnvVar+" (DANGEROUS)")
	flag.Parse()

	sessionsDir := filepath.Join(os.Getenv("HOME"), ".pi", "agent", "sessions")
	if _, err := os.Stat(sessionsDir); os.IsNotExist(err) {
		fmt.Fprintf(os.Stderr, "sessions directory not found: %s\n", sessionsDir)
		os.Exit(1)
	}

	bindHost, usedTailscale := chooseBindHost(*hostOverride, detectTailscaleIP)
	token := os.Getenv(tokenEnvVar)
	if token == "" && !isLoopbackHost(bindHost) && !*insecure {
		fmt.Fprintf(os.Stderr,
			"refusing to bind %s without %s set: anyone reachable on this address could view sessions and drive pi.\n"+
				"  set %s=$(openssl rand -hex 16) to require a token, or pass --insecure to override.\n",
			bindHost, tokenEnvVar, tokenEnvVar)
		os.Exit(1)
	}
	authMiddleware := auth.New(token)

	srv := server.New(server.Deps{
		SessionsDir:   sessionsDir,
		Auth:          authMiddleware,
		ChatSender:    workers.NewManager(rpc.NewPiWorker),
		Cache:         sessions.NewCache(),
		RenderIndex:   func(w io.Writer, ss []sessions.Session) error { return indexTmpl.Execute(w, ss) },
		RenderSession: generateExportHtml,
		Models: func(ctx context.Context) (json.RawMessage, error) {
			return defaultModelsCache.get(ctx)
		},
	})

	mux := http.NewServeMux()
	srv.Register(mux)
	mux.HandleFunc("/static/alpine.js", serveStaticJS(alpineJs))
	if scriptPath, js, err := loadIndexScript(distFS()); err == nil {
		indexScriptPath = scriptPath
		mux.HandleFunc(scriptPath, serveIndexJS(js, scriptPath != "/static/assets/index.js"))
	} else {
		fmt.Fprintf(os.Stderr, "WARNING: failed to load Vite index script: %v (index page JS will be unavailable)\n", err)
	}

	addr := net.JoinHostPort(bindHost, *port)
	url := "http://" + addr
	fmt.Printf("Pi Sessions Viewer -> %s\n", url)
	if !usedTailscale && *hostOverride == "" {
		fmt.Println("Tailscale IP not detected; using localhost.")
	}
	fmt.Printf("Serving from: %s\n", sessionsDir)
	if authMiddleware.Enabled() {
		fmt.Println("Auth: enabled (set PI_WEB_TOKEN to require token)")
	} else {
		fmt.Printf("Auth: disabled — set %s to require a token for access.\n", tokenEnvVar)
	}

	pidfilePath, err := writePidfile(bindHost, *port, usedTailscale)
	if err != nil {
		fmt.Fprintf(os.Stderr, "WARNING: failed to write pidfile: %v\n", err)
	} else {
		defer os.Remove(pidfilePath)
	}

	if *open {
		go func() {
			time.Sleep(300 * time.Millisecond)
			openBrowser(url)
		}()
	}

	warmModelsCache()

	httpServer := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		// WriteTimeout intentionally 0 — SSE streams are long-lived.
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(shutdownCtx)
		srv.Shutdown()
	}()

	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}

func openBrowser(url string) {
	var cmd string
	var args []string
	switch runtime.GOOS {
	case "darwin":
		cmd = "open"
		args = []string{url}
	case "windows":
		cmd = "cmd"
		args = []string{"/c", "start", url}
	default:
		cmd = "xdg-open"
		args = []string{url}
	}
	exec.Command(cmd, args...).Start()
}

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
