// Conventional Commits для хука commit-msg.
// Правила заданы здесь, без `extends`: @commitlint/config-conventional живёт
// в node_modules, а commitlint ставится изолированно через mise — резолв
// пакета из чужого дерева стал бы лишней точкой отказа. Набор типов совпадает
// с историей репозитория (проверено по git log), включая `style` и `merge`.
export default {
  rules: {
    "type-empty": [2, "never"],
    "type-case": [2, "always", "lower-case"],
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "style", "refactor", "test", "chore", "build", "ci", "perf", "revert", "merge"],
    ],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 100],
  },
};
