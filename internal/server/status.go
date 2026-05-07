package server

import (
	"fmt"

	"pi-web/internal/workers"
)

// computeRunningStatus is the single source of truth for "is this session
// running right now". Both the HTTP handler (handleWorkerStatus) and the SSE
// broadcaster (recomputeAndBroadcastStatus) call this; that is what keeps
// terminal sessions, chat workers, and the recent-activity fallback from
// drifting apart.
//
// Order matches the historical behaviour of handleWorkerStatus:
//  1. session-status/<id> file (terminal sessions)
//  2. in-process chat worker status
//  3. recent jsonl mtime within recentSessionActivityWindow
func (s *Server) computeRunningStatus(sessionID string) bool {
	if sessionID == "" {
		return false
	}
	if status := s.readSessionStatus(sessionID); status != nil && status.State == workers.WorkerStateRunning {
		return true
	}
	if s.chatSender != nil && s.chatSender.Status(sessionID).State == workers.WorkerStateRunning {
		return true
	}
	return s.hasRecentSessionActivity(sessionID)
}

// recomputeAndBroadcastStatus recomputes the running state for sessionID and,
// if it changed since the last broadcast, sends a status-delta SSE event to
// every __all__ subscriber.
//
// `lastKnown` is the set of session ids currently broadcast as running.
// Absence == idle. We only emit when (now == running) != (id ∈ lastKnown).
// First-touch idle is therefore silent (no spurious running:false flood when
// the sweeper rescans).
func (s *Server) recomputeAndBroadcastStatus(sessionID string) {
	if sessionID == "" {
		return
	}
	now := s.computeRunningStatus(sessionID)

	s.lastKnownMu.Lock()
	_, was := s.lastKnown[sessionID]
	if now == was {
		s.lastKnownMu.Unlock()
		return
	}
	if now {
		s.lastKnown[sessionID] = struct{}{}
	} else {
		delete(s.lastKnown, sessionID)
	}
	s.lastKnownMu.Unlock()

	payload := fmt.Sprintf(`{"id":%q,"running":%t}`, sessionID, now)
	s.broadcast(globalSessID, "event: status-delta\ndata: "+payload)
}
