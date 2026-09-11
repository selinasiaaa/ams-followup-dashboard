# React + Vite

## Firestore protection

`firestore.rules` is a ready-to-deploy baseline: signed-in staff can read and update quotations, while an administrator profile in `users/{uid}` is required to delete records and manage agents/phones. It has **not** been deployed automatically, so existing users and records remain untouched.

Before deploying, create an administrator document for the Firebase user who manages the dashboard:

```json
{ "role": "admin" }
```

Then deploy from a machine logged in to the correct Firebase project:

```bash
firebase deploy --only firestore:rules
```

Use **Settings → Download backup** before deploying rules or making major data changes.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
