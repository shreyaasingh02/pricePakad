# PriceCrash React project

This Vite + React project preserves the supplied PriceCrash HTML page's original elements, CSS, and JavaScript interactions by hosting that page inside a React component. This approach is intentional for the first migration step: it avoids changing the existing design and DOM behavior while giving you a runnable React project.

## Run locally

1. Install Node.js (LTS) if it is not installed.
2. Open this folder in VS Code.
3. Open Terminal in VS Code and run:

   ```bash
   npm install
   npm run dev
   ```

4. Open the local URL printed by Vite (usually http://localhost:5173).

## Build for deployment

```bash
npm run build
```

Vite outputs the production site in `dist/`. For Render, create a **Static Site** with build command `npm install && npm run build` and publish directory `dist`.

## Important

This preserves the current prototype, including its sample prices and local/demo-only alerts. It does not add live retailer price feeds, a backend, a database, or real email notifications. The current HTML's existing behavior is preserved rather than rewritten into individual React state components; that deeper refactor can be done later without changing the design.
