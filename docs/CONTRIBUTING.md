# Contributing to QuickFinance

## Development Setup

1. Clone the repository
2. Run `npm install`
3. Run `npm run dev` for the development server
4. Run `npm run test:watch` for test runner

## Code Style

- TypeScript strict mode
- ESLint + Prettier for formatting
- Functional React components with hooks
- Named exports (no default exports except App.tsx page components)

## Module Guidelines

### Adding a New Feature
1. Create a new directory under `src/features/your-feature/`
2. Include `components/`, `hooks/`, `utils/` subdirectories as needed
3. Export public API through `index.ts`
4. Add types to `src/core/types/index.ts`
5. Add Dexie schema migration if new tables needed
6. Write unit tests in `tests/unit/your-feature/`
7. Update documentation

### Modifying Existing Features
1. Only modify files within the target feature module
2. If shared types change, update `src/core/types/index.ts`
3. Never import from other feature modules
4. Add/update tests for changed functionality
5. Run full test suite before submitting

## Pull Request Process

1. Create a feature branch from `main`
2. Make changes following module guidelines
3. Ensure all tests pass: `npm run test`
4. Ensure type checking passes: `npm run type-check`
5. Ensure linting passes: `npm run lint`
6. Ensure build succeeds: `npm run build`
7. Submit PR with description of changes

## Agent-Generated PRs

PRs from the auto-resolver agent use `agent/` branch prefixes and are auto-merged if CI passes. Human review is required for:
- Database schema changes
- Security-related changes
- Changes to agent configurations
- Changes affecting more than 3 feature modules

## Commit Messages

Use conventional commits:
- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `test:` tests
- `refactor:` code restructuring
- `chore:` maintenance
