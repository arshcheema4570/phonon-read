# Phonon Read — TODO

## Offline Phonon reader core

- [ ] Run Gradium Phonon 31M fully in the browser with no server, API key, or cloud TTS, and cache the model for subsequent offline use.
- [ ] Provide a static, installable PWA with app icons, web manifest, service worker, Cache API support, and GitHub Pages-compatible paths and deployment structure.
- [ ] Support paste-to-read plus local import of plain text and Markdown files, with readable Markdown handling.
- [ ] Split content into sentence-aware segments and stream synthetic speech playback progressively rather than waiting for the whole document.

## Playback and reading experience

- [ ] Provide play, pause, resume, and stop controls together with built-in voice selection, playback speed, and volume controls.
- [ ] Display reading progress, current sentence or position, and an estimated total or remaining duration.
- [ ] Offer a distraction-reduced focus reading mode that keeps the active passage visually prominent during playback.
- [ ] Provide keyboard shortcuts for core reading and playback actions, with an accessible shortcut reference.

## Local library and status

- [ ] Maintain a saved local library of texts and imported documents using localStorage and browser-side cached data only.
- [ ] Show online/offline and model-cache readiness status, provide browser install guidance, and clearly disclose that Phonon 31M is English-only and that all speech is synthetic.
- [ ] Deliver static-friendly HTML/CSS/JavaScript source, app icons, manifest, service worker, and documentation in a GitHub-style repository compatible with GitHub Pages.
