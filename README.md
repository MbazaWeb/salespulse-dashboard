# SalesPulse — Regional Sales Dashboard

Responsive React/Vite dashboard for regional sales, territories, team performance, telesales and report exports.

## Local development

```bash
npm ci
npm run dev
```

## Validation

```bash
npm run test:import
npm run build
```

`npm run test:nav` uses Playwright and requires its browser installation and a running application; see `scripts/test-nav.mjs`.

## Data handling

The dashboard starts with an illustrative built-in snapshot dated 26 October 2026. Imported workbooks and preferences are stored in browser localStorage, **not** synchronized across devices or users. Do not treat the snapshot as live sales data. Review imports and reconciliation totals before using reports for decisions.

## Deployment

Connect the GitHub repository to a Vite-compatible hosting provider. Build command: `npm run build`; output directory: `dist`. The SPA currently has no backend or authentication.
