/**
 * Designer message catalog (E10-S2) — the externalised, translatable UI strings
 * for the designer chrome, so the interface can be localised without touching the
 * components (brief §9 i18n). English is the **source of truth**: {@link EN_MESSAGES}
 * is complete and is what {@link I18nService} falls back to for any key a
 * translation omits, so a partial translation never blanks a label.
 *
 * A string is keyed by a dotted, component-scoped {@link MessageKey}. Placeholders
 * are `{name}` tokens filled from the caller's {@link MessageParams} at lookup time
 * (see {@link I18nService.t}), so a message can carry interpolated values (a file
 * name, a page summary) without string concatenation in the template.
 *
 * **Scope (E10-S2):** the always-visible chrome — the top bar, the status bar and
 * preview mode. The data-driven palette/panels and the property editors are a
 * documented follow-up; they keep their literal strings until then.
 */

/** The externalised designer-chrome message keys (E10-S2 scope). */
export type MessageKey =
  // Top bar (rdr-top-bar)
  | 'topBar.renameDocument'
  | 'topBar.status.saved'
  | 'topBar.status.unsaved'
  | 'topBar.new'
  | 'topBar.open'
  | 'topBar.importData'
  | 'topBar.preview'
  | 'topBar.export'
  | 'topBar.moreActions'
  // Status bar (rdr-status-bar)
  | 'statusBar.zoomOut'
  | 'statusBar.zoomIn'
  | 'statusBar.fit'
  | 'statusBar.snap'
  | 'statusBar.snapAria'
  | 'statusBar.snapTitle'
  | 'statusBar.pageSetupAria'
  | 'statusBar.hint'
  // Preview mode (rdr-preview-mode)
  | 'preview.backToEditor'
  | 'preview.badge'
  | 'preview.previousPage'
  | 'preview.nextPage'
  | 'preview.pageNavigation'
  | 'preview.zoomOut'
  | 'preview.zoomIn'
  | 'preview.noSampleData'
  | 'preview.renderedWith';

/** Interpolation values for a message's `{name}` placeholders. */
export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * A locale's translations. Every key is optional: a missing key falls back to the
 * English source ({@link EN_MESSAGES}), so a partial translation is valid and never
 * blanks the UI.
 */
export type MessageCatalog = Partial<Record<MessageKey, string>>;

/**
 * The English source catalog — complete by construction (a `Record`, so a new
 * {@link MessageKey} fails the build until it is translated here). This is both the
 * default-locale text and the fallback for every other locale.
 */
export const EN_MESSAGES: Record<MessageKey, string> = {
  'topBar.renameDocument': 'Rename document',
  'topBar.status.saved': 'Saved',
  'topBar.status.unsaved': 'Unsaved changes',
  'topBar.new': 'New',
  'topBar.open': 'Open…',
  'topBar.importData': 'Import data',
  'topBar.preview': 'Preview',
  'topBar.export': 'Export',
  'topBar.moreActions': 'More actions',

  'statusBar.zoomOut': 'Zoom out',
  'statusBar.zoomIn': 'Zoom in',
  'statusBar.fit': 'Fit',
  'statusBar.snap': 'Snap',
  'statusBar.snapAria': 'Snap to grid and guides',
  'statusBar.snapTitle': 'Snap to grid and guides (hold Alt to bypass)',
  'statusBar.pageSetupAria': 'Page setup: {summary}',
  'statusBar.hint': '⌘D Duplicate · Alt to bypass snap',

  'preview.backToEditor': 'Back to editor',
  'preview.badge': 'Preview',
  'preview.previousPage': 'Previous page',
  'preview.nextPage': 'Next page',
  'preview.pageNavigation': 'Page navigation',
  'preview.zoomOut': 'Zoom out',
  'preview.zoomIn': 'Zoom in',
  'preview.noSampleData': 'No sample data imported',
  'preview.renderedWith': 'Rendered with {fileName}',
};

/**
 * Fills a message template's `{name}` placeholders from `params`. An unknown token
 * is left verbatim (no throw), so a translation with a stray placeholder degrades
 * gracefully rather than crashing the UI.
 */
export function interpolate(template: string, params: MessageParams): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
