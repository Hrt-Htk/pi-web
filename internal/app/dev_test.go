package app

import "testing"

func TestResolveAuthToken(t *testing.T) {
	tests := []struct {
		name     string
		dev      bool
		envToken string
		want     string
	}{
		{"dev ignores env token", true, "secret", ""},
		{"dev with empty env token", true, "", ""},
		{"non-dev passes token through", false, "secret", "secret"},
		{"non-dev with empty token", false, "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := resolveAuthToken(tt.dev, tt.envToken); got != tt.want {
				t.Errorf("resolveAuthToken(%v, %q) = %q, want %q", tt.dev, tt.envToken, got, tt.want)
			}
		})
	}
}
