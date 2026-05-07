package main

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type sessionCacheEntry struct {
	modTime time.Time
	dirName string
	session Session
}

type sessionCache struct {
	mu      sync.Mutex
	entries map[string]sessionCacheEntry // keyed by full file path

	parses int // diagnostic: number of parseSession calls
	hits   int // diagnostic: number of cache hits
}

func newSessionCache() *sessionCache {
	return &sessionCache{entries: make(map[string]sessionCacheEntry)}
}

// loadAll returns all sessions under dir. Files whose modtime hasn't changed
// since the previous call are returned from the cache; files that are new or
// modified are re-parsed; files that have disappeared are evicted.
func (c *sessionCache) loadAll(dir string) ([]Session, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	seen := make(map[string]struct{})
	var sessions []Session
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		subDir := filepath.Join(dir, e.Name())
		subs, err := os.ReadDir(subDir)
		if err != nil {
			continue
		}
		for _, f := range subs {
			if f.IsDir() || !strings.HasSuffix(f.Name(), ".jsonl") {
				continue
			}
			path := filepath.Join(subDir, f.Name())
			seen[path] = struct{}{}
			info, err := f.Info()
			if err != nil {
				continue
			}
			if cached, ok := c.entries[path]; ok && cached.modTime.Equal(info.ModTime()) && cached.dirName == e.Name() {
				c.hits++
				sessions = append(sessions, cached.session)
				continue
			}
			sess, err := parseSession(path, e.Name(), f.Name())
			if err != nil {
				continue
			}
			c.parses++
			c.entries[path] = sessionCacheEntry{modTime: info.ModTime(), dirName: e.Name(), session: sess}
			sessions = append(sessions, sess)
		}
	}

	// Evict files no longer present.
	for p := range c.entries {
		if _, ok := seen[p]; !ok {
			delete(c.entries, p)
		}
	}

	sortSessionsByActivity(sessions)
	return sessions, nil
}

func (c *sessionCache) stats() (parses, hits, size int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.parses, c.hits, len(c.entries)
}
