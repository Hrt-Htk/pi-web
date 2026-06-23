import { FileText, Pencil, Terminal, Search } from '../../shared/icons.js';

/**
 * Map a tool name to its display icon component (Lucide node).
 */
export function iconForTool(name) {
  if (!name) return FileText;
  switch (name) {
    case 'read':
    case 'write':
      return FileText;
    case 'edit':
      return Pencil;
    case 'bash':
      return Terminal;
    case 'grep':
    case 'find':
    case 'ls':
      return Search;
    default:
      return FileText;
  }
}
