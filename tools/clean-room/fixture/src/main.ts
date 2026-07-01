import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app';

// A brand-new, zoneless Angular app (no Zone.js) — the same posture the brief
// mandates and a real host would use — bootstrapping the standalone viewer.
bootstrapApplication(App, {
  providers: [provideZonelessChangeDetection()],
}).catch((err) => console.error(err));
