package server

import "pi-web/internal/workers"

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
