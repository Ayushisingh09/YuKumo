# Contributing to Yukumo

Thank you for your interest in contributing to **Yukumo**! We welcome contributions from developers of all skill levels. Whether you are fixing a bug, adding a new feature, improving documentation, or optimizing performance, your help is greatly appreciated.

---

## 📜 Code of Conduct

Please be respectful, friendly, and inclusive in all interactions across issues, pull requests, and discussions.

---

## 🛠️ Development Setup

### Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher (or [Bun](https://bun.sh/) v1.0.0+)
- [npm](https://www.npmjs.com/) or [bun](https://bun.sh/)

### 1. Fork and Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/Yukumo.git
cd Yukumo/"Yukumo wrapper"
```

### 2. Install Dependencies
```bash
npm install
```

---

## 🚀 Development Workflow

### Scripts Overview

| Command | Description |
|---|---|
| `npm run build` | Builds CommonJS, ESM, and `.d.ts` declaration outputs using `tsup` |
| `npm run typecheck` | Validates TypeScript types strictly (`tsc --noEmit`) |
| `npm test` | Runs the full Vitest unit & integration test suite |
| `npm run format` | Formats code using Prettier |
| `npm run format:check` | Verifies code formatting compliance |
| `npm run lint` | Runs ESLint analysis |

---

## 🧪 Testing Guidelines

Before submitting a Pull Request, ensure that all unit tests pass and new features are covered by tests:

```bash
# Run unit tests
npm test

# Run strict typechecks
npm run typecheck

# Verify build outputs
npm run build
```

When creating new features or fixing bugs:
1. Add corresponding test files in `src/**/*.test.ts`.
2. Maintain zero `any` types in TypeScript declarations.
3. Include clear JSDoc annotations on all public functions, classes, and options so JavaScript users get rich autocomplete.

---

## 📥 Submitting a Pull Request (PR)

1. **Create a Feature Branch**:
   ```bash
   git checkout -b feat/my-amazing-feature
   ```
2. **Commit Your Changes**:
   Use descriptive commit messages following Conventional Commits (e.g. `feat: add custom filter preset`, `fix: player node failover retry`).
   ```bash
   git commit -m "feat: add custom filter preset"
   ```
3. **Push to Your Fork**:
   ```bash
   git push origin feat/my-amazing-feature
   ```
4. **Open a Pull Request**:
   Navigate to [titanxdevz/Yukumo](https://github.com/titanxdevz/Yukumo) and submit your PR with a summary of changes and testing evidence.

---

Thank you for making Yukumo the best Lavalink client in the Discord ecosystem! 🚀
