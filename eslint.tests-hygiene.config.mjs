// Standalone ESLint config for test-file-only hygiene rules.
//
// Why this is a SEPARATE config file rather than another block in
// eslint.config.mjs: that file globally ignores `tests/**` and
// `**/*.test.{ts,tsx,js,jsx,mjs,cjs}` (see the comment there — test suites
// are typechecked and executed but not held to the prod-style lint ruleset,
// which would otherwise flood ~pre-existing fixture-style violations like
// heavy `any`). ESLint flat config's "global ignores" (a config object with
// only `ignores`, no `files`) apply project-wide and cannot be selectively
// un-ignored by a later block in the SAME config array — so a rule that must
// see test files needs its own config, run as its own command
// (`bun run lint:test-hygiene`), never as part of `bun run lint` / the
// pre-commit hook / CI's `Lint & checks` job.
//
// PUX-119: this repo has now hit the same flake shape three times (PUX-100,
// PUX-045, PUX-119) — a button captured via
// `Array.from(container.querySelectorAll(...)).find(...)` on one statement,
// then clicked with `fireEvent.click(...)` on a later one. A re-render in
// between detaches the node; the click silently no-ops; the following
// `waitFor` burns the full 5s global timeout (tests/setup.ts:18) and fails.
// The safe form re-queries through a getter and clicks inside `act`.
//
// Set to "warn", not "error": ~33 known existing instances (17 in
// app-portal-websites-taxonomy-page.test.tsx, 12 in
// app-portal-brain-decision-detail-page.test.tsx, plus others) are NOT fixed
// by this change — an "error" would break every gate that runs this config
// immediately. This rule's job is to stop NEW instances, not retro-fix old
// ones.

import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/** @type {import('eslint').Rule.RuleModule} */
const noDetachedNodeClick = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Disallow fireEvent.click(x) where x was captured via querySelectorAll(...).find() (directly, or via Array.from(...).find()) on an earlier statement. A re-render between the capture and the click can detach the node, so the click silently fires on nothing and the following waitFor burns its full timeout. Re-query through a getter and click inside act() instead.",
      recommended: false,
    },
    schema: [],
    messages: {
      detachedNodeClick:
        "'{{name}}' was captured from a querySelectorAll(...).find() on an earlier statement — a re-render can detach it before this click fires, so the click silently does nothing (see PUX-119). Re-query through a getter (e.g. `() => Array.from(container.querySelectorAll(...)).find(...)`) immediately before clicking, and click inside act().",
    },
  },
  create(context) {
    // `node` is expected to be the CallExpression `<source>.find(callback)`.
    // Matches both `Array.from(x.querySelectorAll(...)).find(...)` and the
    // (non-standard, but seen) direct `x.querySelectorAll(...).find(...)`.
    function isDomQueryFindCall(node) {
      if (
        !node ||
        node.type !== 'CallExpression' ||
        node.callee.type !== 'MemberExpression' ||
        node.callee.property.type !== 'Identifier' ||
        node.callee.property.name !== 'find'
      ) {
        return false;
      }

      const source = node.callee.object;

      const isQuerySelectorAllCall = (n) =>
        n &&
        n.type === 'CallExpression' &&
        n.callee.type === 'MemberExpression' &&
        n.callee.property.type === 'Identifier' &&
        n.callee.property.name === 'querySelectorAll';

      // Array.from(<...>.querySelectorAll(...)).find(...)
      if (
        source.type === 'CallExpression' &&
        source.callee.type === 'MemberExpression' &&
        source.callee.object.type === 'Identifier' &&
        source.callee.object.name === 'Array' &&
        source.callee.property.type === 'Identifier' &&
        source.callee.property.name === 'from' &&
        source.arguments.length > 0 &&
        isQuerySelectorAllCall(source.arguments[0])
      ) {
        return true;
      }

      // <...>.querySelectorAll(...).find(...) directly.
      if (isQuerySelectorAllCall(source)) {
        return true;
      }

      return false;
    }

    // Peel off `as X`, `x!`, `x satisfies Y` wrappers to reach the underlying
    // call expression.
    function unwrap(node) {
      let n = node;
      while (
        n &&
        (n.type === 'TSAsExpression' ||
          n.type === 'TSNonNullExpression' ||
          n.type === 'TSSatisfiesExpression')
      ) {
        n = n.expression;
      }
      return n;
    }

    function findVariable(scope, name) {
      let s = scope;
      while (s) {
        const variable = s.set.get(name);
        if (variable) return variable;
        s = s.upper;
      }
      return null;
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.object.type !== 'Identifier' ||
          node.callee.object.name !== 'fireEvent' ||
          node.callee.property.type !== 'Identifier' ||
          node.callee.property.name !== 'click'
        ) {
          return;
        }

        const arg = node.arguments[0];
        if (!arg || arg.type !== 'Identifier') return;

        const sourceCode = context.sourceCode ?? context.getSourceCode();
        const scope =
          typeof sourceCode.getScope === 'function'
            ? sourceCode.getScope(node)
            : context.getScope();

        const variable = findVariable(scope, arg.name);
        if (!variable || variable.defs.length === 0) return;

        const def = variable.defs[0];
        if (
          def.type !== 'Variable' ||
          !def.node ||
          def.node.type !== 'VariableDeclarator' ||
          !def.node.init
        ) {
          return;
        }

        // Must be declared on an earlier statement, not inline in this call
        // (an inline capture-and-click has no gap for a re-render to land in).
        if (def.node.range[1] > node.range[0]) return;

        const init = unwrap(def.node.init);
        if (!isDomQueryFindCall(init)) return;

        context.report({
          node,
          messageId: 'detachedNodeClick',
          data: { name: arg.name },
        });
      },
    };
  },
};

export default [
  {
    files: ['tests/**/*.{ts,tsx}'],
    // This config only turns on ONE rule, but test files carry
    // `/* eslint-disable @typescript-eslint/... */` directives written for
    // the full app-level ruleset (eslint.config.mjs). Without this, every
    // such directive reports as "unused" here and drowns out this rule's
    // findings — noise unrelated to what this config is checking.
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'test-hygiene': {
        rules: {
          'no-detached-node-click': noDetachedNodeClick,
        },
      },
      // Registered (but not turned on) purely so ESLint recognizes the
      // `/* eslint-disable @typescript-eslint/... */` / `react-hooks/...`
      // directive comments already present in these test files (written for
      // eslint.config.mjs's full ruleset) — without it, ESLint errors with
      // "Definition for rule 'X' was not found" on every file that carries
      // one, which would drown out this rule's own output across `tests/`.
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': reactHooks,
    },
    rules: {
      'test-hygiene/no-detached-node-click': 'warn',
    },
  },
];
