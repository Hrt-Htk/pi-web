//go:build !windows

package app

import (
	"os"
	"strings"
)

func tokenFromEnv() string {
	return strings.TrimSpace(os.Getenv(tokenEnvVar))
}
