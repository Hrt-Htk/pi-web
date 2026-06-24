//go:build windows

package app

import (
	"os"
	"strings"

	"golang.org/x/sys/windows/registry"
)

// tokenFromEnv reads PI_WEB_TOKEN from the environment, falling back to the
// live USER registry value. Explorer-launched processes inherit a stale
// environment block that predates setx, so the registry read is needed when
// the exe is double-clicked.
func tokenFromEnv() string {
	if v := strings.TrimSpace(os.Getenv(tokenEnvVar)); v != "" {
		return v
	}
	k, err := registry.OpenKey(registry.CURRENT_USER, "Environment", registry.QUERY_VALUE)
	if err != nil {
		return ""
	}
	defer k.Close()
	v, _, err := k.GetStringValue(tokenEnvVar)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(v)
}
