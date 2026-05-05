/**
 * Backwards-compatible re-export shim.
 *
 * The 1207-LOC kanban card-detail modal was split into per-section components
 * under `./card-detail/`. This file kept its original path so existing
 * importers (KanbanBoard, etc.) keep working without churn.
 */
export { default } from './card-detail/CardDetailModal';
