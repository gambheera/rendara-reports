import type { MessageCatalog } from '../messages';

/**
 * German (`de`) translations for the designer chrome (E10-S2). A demonstration
 * catalog proving the strings are translatable; any omitted key falls back to the
 * English source ({@link EN_MESSAGES}).
 */
export const DE_MESSAGES: MessageCatalog = {
  'topBar.renameDocument': 'Dokument umbenennen',
  'topBar.status.saved': 'Gespeichert',
  'topBar.status.unsaved': 'Nicht gespeicherte Änderungen',
  'topBar.new': 'Neu',
  'topBar.open': 'Öffnen…',
  'topBar.importData': 'Daten importieren',
  'topBar.preview': 'Vorschau',
  'topBar.export': 'Exportieren',
  'topBar.moreActions': 'Weitere Aktionen',

  'statusBar.zoomOut': 'Verkleinern',
  'statusBar.zoomIn': 'Vergrößern',
  'statusBar.fit': 'Anpassen',
  'statusBar.snap': 'Einrasten',
  'statusBar.snapAria': 'An Raster und Hilfslinien einrasten',
  'statusBar.snapTitle': 'An Raster und Hilfslinien einrasten (Alt zum Umgehen halten)',
  'statusBar.pageSetupAria': 'Seiteneinrichtung: {summary}',
  'statusBar.hint': '⌘D Duplizieren · Alt zum Umgehen des Einrastens',

  'preview.backToEditor': 'Zurück zum Editor',
  'preview.badge': 'Vorschau',
  'preview.previousPage': 'Vorherige Seite',
  'preview.nextPage': 'Nächste Seite',
  'preview.pageNavigation': 'Seitennavigation',
  'preview.zoomOut': 'Verkleinern',
  'preview.zoomIn': 'Vergrößern',
  'preview.noSampleData': 'Keine Beispieldaten importiert',
  'preview.renderedWith': 'Gerendert mit {fileName}',
};
