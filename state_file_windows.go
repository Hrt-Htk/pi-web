//go:build windows

package main

import "os"

// lockStateFile is a no-op on Windows (unsupported platform).
func lockStateFile(_ *os.File) error { return nil }
