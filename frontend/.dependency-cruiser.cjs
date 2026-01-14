/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    /* Rules for layered architecture similar to backend */
    {
      name: "no-circular",
      severity: "error",
      comment:
        "This dependency is part of a circular relationship. You might want to revise " +
        "your solution (i.e. use some form of injection or split modules).",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment:
        "This is an orphan module - it's likely not used (anymore?). Either use it or " +
        "remove it. If it's logical this module is an orphan (i.e. it's a config file), " +
        "add an exception for it in your dependency-cruiser configuration.",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$", // dot files
          "\\.d\\.ts$", // typescript definitions
          "(^|/)tsconfig\\.json$",
          "(^|/)(babel|webpack)\\.config\\.(js|cjs|mjs|ts|json)$", // other configs
          "vite.config.ts",
          "vitest.config.ts",
          ".dependency-cruiser.js",
          "src/main.tsx", // Entry point
          "src/i18n.ts",
          "postcss.config.js",
          "tailwind.config.js",
          "eslint.config.js",
        ],
      },
      to: {},
    },
    {
      name: "no-internal-imports",
      severity: "error",
      comment:
        "Components should not import from internal implementations of other modules.",
      from: {},
      to: {
        path: "^src/([^/]+)/internal/",
        pathNot: "^src/$1/internal/",
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    moduleSystems: ["amd", "cjs", "es6", "tsd"],
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
    reporterOptions: {
      dot: {
        /* Pattern of modules that can consolidate in the detailed graphical dependency graph. */
        collapsePattern: "node_modules/[^/]+",
      },
      archi: {
        /* Pattern of modules that can consolidate in the high level graphical dependency graph. */
        collapsePattern:
          "^(node_modules|packages|src|lib|app|bin|test(s?)|spec(s?))/[^/]+",
      },
    },
  },
};
