import type { MessageCatalog } from '../messages';

/**
 * Arabic (`ar`) translations for the designer chrome (E10-S2). A right-to-left
 * demonstration catalog: with this locale active the designer shell also flips to
 * `dir="rtl"` (derived from the locale by the shell). Any omitted key falls back to
 * the English source ({@link EN_MESSAGES}).
 */
export const AR_MESSAGES: MessageCatalog = {
  'topBar.renameDocument': 'إعادة تسمية المستند',
  'topBar.status.saved': 'تم الحفظ',
  'topBar.status.unsaved': 'تغييرات غير محفوظة',
  'topBar.new': 'جديد',
  'topBar.open': 'فتح…',
  'topBar.importData': 'استيراد البيانات',
  'topBar.preview': 'معاينة',
  'topBar.export': 'تصدير',
  'topBar.moreActions': 'إجراءات إضافية',

  'statusBar.zoomOut': 'تصغير',
  'statusBar.zoomIn': 'تكبير',
  'statusBar.fit': 'ملاءمة',
  'statusBar.snap': 'محاذاة',
  'statusBar.snapAria': 'المحاذاة إلى الشبكة والأدلة',
  'statusBar.snapTitle': 'المحاذاة إلى الشبكة والأدلة (اضغط Alt للتجاوز)',
  'statusBar.pageSetupAria': 'إعداد الصفحة: {summary}',
  'statusBar.hint': '⌘D تكرار · Alt لتجاوز المحاذاة',

  'preview.backToEditor': 'العودة إلى المحرر',
  'preview.badge': 'معاينة',
  'preview.previousPage': 'الصفحة السابقة',
  'preview.nextPage': 'الصفحة التالية',
  'preview.pageNavigation': 'التنقل بين الصفحات',
  'preview.zoomOut': 'تصغير',
  'preview.zoomIn': 'تكبير',
  'preview.noSampleData': 'لم يتم استيراد بيانات نموذجية',
  'preview.renderedWith': 'تم العرض باستخدام {fileName}',
};
