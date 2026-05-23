package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

func piWebCertDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	if runtime.GOOS == "darwin" {
		// Tailscale.app on macOS can be sandboxed/Privacy-restricted when writing
		// into user home directories, including hidden dirs and Application Support.
		// /tmp is writable by the Tailscale helper and the key is protected by the
		// per-user 0700 directory created in ensureTailscaleCert.
		return filepath.Join(os.TempDir(), fmt.Sprintf("pi-web-certs-%d", os.Getuid())), nil
	}
	return filepath.Join(home, ".pi", "agent", "certs"), nil
}

func tailscaleCLI() (string, error) {
	if bin, err := exec.LookPath("tailscale"); err == nil {
		return bin, nil
	}

	for _, path := range []string{
		"/Applications/Tailscale.app/Contents/MacOS/Tailscale",
		"/Applications/Tailscale.app/Contents/MacOS/tailscale",
		"/opt/homebrew/bin/tailscale",
		"/usr/local/bin/tailscale",
		"/usr/bin/tailscale",
	} {
		if st, err := os.Stat(path); err == nil && !st.IsDir() && st.Mode()&0111 != 0 {
			return path, nil
		}
	}

	return "", fmt.Errorf("tailscale CLI not found in PATH or common install locations")
}

// tailscaleSelfDNS returns the Tailscale MagicDNS name for this node
// (e.g. "personal-laptop.tail9f98d.ts.net"). Returns an error if the
// tailscale CLI is unavailable, the node is not connected, or HTTPS is
// not enabled in the tailnet.
func tailscaleSelfDNS() (string, error) {
	bin, err := tailscaleCLI()
	if err != nil {
		return "", err
	}
	out, err := exec.Command(bin, "status", "--json").Output()
	if err != nil {
		return "", fmt.Errorf("tailscale status failed: %w", err)
	}
	var status struct {
		BackendState string `json:"BackendState"`
		Self         struct {
			DNSName string `json:"DNSName"`
		} `json:"Self"`
		CurrentTailnet struct {
			MagicDNSEnabled bool   `json:"MagicDNSEnabled"`
			MagicDNSSuffix  string `json:"MagicDNSSuffix"`
		} `json:"CurrentTailnet"`
	}
	if err := json.Unmarshal(out, &status); err != nil {
		return "", fmt.Errorf("parse tailscale status: %w", err)
	}
	if status.BackendState != "Running" {
		return "", fmt.Errorf("tailscale not running (BackendState=%s)", status.BackendState)
	}
	name := strings.TrimSuffix(status.Self.DNSName, ".")
	if name == "" {
		return "", fmt.Errorf("tailscale Self.DNSName is empty; is MagicDNS enabled in your tailnet admin console?")
	}
	return name, nil
}

// ensureTailscaleCert provisions a TLS certificate for hostname using the
// `tailscale cert` command and returns paths to (cert, key). Files are cached
// under ~/.pi/agent/certs/ and reused across runs; tailscale will refresh
// them transparently when they near expiry.
//
// Requires Tailscale HTTPS to be enabled in the admin console
// (https://login.tailscale.com/admin/dns) under "HTTPS Certificates".
func ensureTailscaleCert(hostname string) (certPath, keyPath string, err error) {
	certDir, err := piWebCertDir()
	if err != nil {
		return "", "", err
	}
	if err := os.MkdirAll(certDir, 0700); err != nil {
		return "", "", err
	}
	certPath = filepath.Join(certDir, hostname+".crt")
	keyPath = filepath.Join(certDir, hostname+".key")

	bin, err := tailscaleCLI()
	if err != nil {
		return "", "", err
	}

	cmd := exec.Command(bin, "cert",
		"--cert-file="+certPath,
		"--key-file="+keyPath,
		hostname,
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return "", "", fmt.Errorf("tailscale cert %s failed: %w\n\nEnable HTTPS in the Tailscale admin console:\n  https://login.tailscale.com/admin/dns\nunder \"HTTPS Certificates\".", hostname, err)
	}
	return certPath, keyPath, nil
}
