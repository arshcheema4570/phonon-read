# Phonon Read

Phonon Read is a private, offline-first Speechify alternative. It turns pasted text and local `.txt` or `.md` files into streamed speech directly in the browser using [Gradium Phonon 31M](https://huggingface.co/gradium/phonon-31m-en). There is no application server, API key, account, or cloud TTS request.

## Run locally

```bash
pnpm install
pnpm dev
```

Open the local HTTPS/localhost preview, load the model once, and the Phonon runtime stores its checkpoint in the browser Cache API for later offline use. The app shell is cached by `sw.js`; model files are cached by `phonon-tts`.

## Model and license

Phonon 31M is English-only, outputs 24 kHz mono audio, and is distributed under Apache 2.0. The browser package is `phonon-tts` and uses CPU or WebGPU inference in a dedicated worker. Speech is synthetic. Do not present generated speech as a real person or clone a voice without consent.

## GitHub Pages

The project is a static Vite build. `pnpm build` creates `dist/`, which can be published by GitHub Pages from a workflow or any static host. No runtime secrets are required.
