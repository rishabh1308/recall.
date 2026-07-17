# Code walkthrough and demo notes

This document is deliberately short enough to use before an interview. Read the files alongside it.

## Architecture in one sentence

React owns the screen and user interaction; Express owns the secret key and model request; OpenAI returns JSON; React validates that JSON before rendering it.

```
notes textarea → React fetch → Express API → OpenAI
                                      ↓
flashcards/quiz UI ← validated JSON ← response text
```

## `src/main.jsx`

This is the entry point. `createRoot` finds `<div id="root">` in `index.html` and renders `App`. `StrictMode` is a development helper: it highlights unsafe React patterns; it does not change the production UI.

## `src/App.jsx`

### State

`useState` stores information that should cause the screen to re-render when it changes:

- `notes`: textarea value.
- `studySet`: the validated AI result, or `null` before a result exists.
- `status`: `idle`, `loading`, `success`, or `error`; this controls loading/error/empty UI.
- `error`: human-readable failure message.
- `tab`, `cardIndex`, `isFlipped`: flashcard UI state.
- `answers`: an object like `{ 0: 2, 1: 0 }`, mapping quiz-question indexes to selected option indexes.

`useRef` creates `requestId`. Unlike state, changing it does not re-render. Each generation request captures its own number. If a newer request starts before an older one finishes, the older result is ignored. This prevents a slow, stale response from replacing the latest study set.

### Validation

`validateStudySet` is a trust boundary. Even though the server asks for a JSON schema, AI output is external/untrusted input. The function checks the root object, arrays, required string fields, exactly four answer options, and a valid `correctIndex`. If one check fails it throws, and the existing `catch` displays a retryable error rather than allowing a render crash.

### `generate`

1. It rejects too-short input early, avoiding an unnecessary API call.
2. It increments `requestId`, sets loading UI, and clears an old error.
3. It `fetch`es the local server, never OpenAI directly.
4. It checks the HTTP status, parses `body.raw` with `JSON.parse`, validates the result, and resets study UI for the fresh set.
5. It catches network, server, JSON, and validation failures. The special `SyntaxError` message makes malformed JSON understandable.

### Small UI functions

`chooseAnswer` uses the functional state form, so it safely merges an answer with the previous answers. `retryWrong` filters quiz questions where the chosen answer was not the correct index, replaces just the quiz with those questions, then clears answers. `answered`, `wrongCount`, and `complete` are derived values: they are calculated from the current state instead of stored separately, which avoids sync bugs.

### Components

`App` is the parent/orchestrator. It passes data and event functions down as props.

`Flashcards` is presentational plus local interaction: it receives the cards and current values. `move` wraps using modulo arithmetic, so moving forward from the last card returns to the first. The whole card is a button: it is keyboard accessible and flips with the same action as a tap.

`Quiz` maps each AI question to an `<article>`. Before a selection, option buttons are enabled. After a selection, every button for that question is disabled so the score cannot be changed. CSS classes mark the selected wrong option and the actual correct option. The explanation appears only after answering.

## `server/index.js`

The server uses three small middleware functions:

- `dotenv/config` reads local environment variables from `.env`.
- `cors()` allows the Vite browser origin to call this local API during development.
- `express.json()` reads JSON request bodies and limits them to 100 KB.

`studySetSchema` describes the exact structure requested from the model: title, 3–8 cards, and 3–6 quiz questions. `additionalProperties: false` rejects surprise fields, and `strict: true` asks OpenAI to follow the schema exactly.

`POST /api/generate` validates input again because APIs must never trust browser input. It returns 400 for bad notes and a useful message if the key is absent. It then calls OpenAI. The `AbortController` cancels requests after 30 seconds so a hung API call does not leave the app waiting forever. It sends only `raw` model JSON to the browser; React performs the parse/validation to visibly demonstrate client robustness.

The API key is read only on the server from `process.env.OPENAI_API_KEY`. There is no `VITE_` key, so Vite cannot bundle it into browser code.

## `src/styles.css`

This is plain CSS—no component library. CSS variables at the top define the reusable color palette. The desktop layout is constrained with `width: min(...)`; the media query below 580px changes the quiz options to one column and tightens spacing, making the app usable on a phone.

## Common interview questions

**Why both JSON Schema and client validation?** Schema reduces the chance of bad output; validation protects the UI if it still happens. One is generation guidance, the other is runtime safety.

**Why is the key on a server?** Anyone can inspect browser JavaScript and network requests. A server keeps the secret in an environment variable and exposes only the narrow endpoint needed.

**How do you prevent race conditions?** `requestId` means only the currently newest request is allowed to set state.

**How would you add saved sessions?** Save `notes`, `studySet`, and `answers` to `localStorage` after changes, then load and validate on startup. For multi-device use, add a database and authentication.

**How would you add a “number of cards” control?** Add a state value, send it in the request, validate it on the server, and set the JSON schema `minItems`/`maxItems` or prompt accordingly.

**What is one limitation?** AI can create an inaccurate question despite the prompt. The UI can make a bad answer look polished, so source material still needs human review.
