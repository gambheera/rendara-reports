---
'@rendara/report-viewer': minor
---

Widen the Angular peer-dependency range for version tolerance (E9-S2). The
`@angular/core` and `@angular/cdk` peers now accept `>=20.0.0` (tested against
Angular 20–22), so the package installs into a host app's existing Angular
version without a peer conflict; Angular stays a peer and is never bundled. The
package is verified side-effect-free (tree-shakes away when unreferenced),
single-entry-point, and SSR-safe.
