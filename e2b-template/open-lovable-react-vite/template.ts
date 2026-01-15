import { Template, waitForPort } from 'e2b'

/**
 * E2B Custom Sandbox Template for Open Lovable
 * 
 * Pre-installs React + Vite + TypeScript + Tailwind CSS dependencies
 * to significantly reduce sandbox startup time.
 */

// Package.json content for the sandbox app
const packageJson = JSON.stringify({
  name: "sandbox-app",
  private: true,
  version: "0.0.0",
  type: "module",
  scripts: {
    dev: "vite --host",
    build: "tsc -b && vite build",
    lint: "eslint .",
    preview: "vite preview"
  },
  dependencies: {
    react: "^18.3.1",
    "react-dom": "^18.3.1"
  },
  devDependencies: {
    "@eslint/js": "^9.13.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    autoprefixer: "^10.4.20",
    eslint: "^9.13.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-react-refresh": "^0.4.14",
    globals: "^15.11.0",
    postcss: "^8.4.47",
    tailwindcss: "^3.4.14",
    typescript: "~5.6.2",
    "typescript-eslint": "^8.11.0",
    vite: "^5.4.10"
  }
}, null, 2);

// Vite config
const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: false,
    allowedHosts: ['.e2b.app', '.e2b.dev', '.vercel.run', 'localhost', '127.0.0.1']
  }
})`;

// TypeScript configs
const tsconfigJson = JSON.stringify({
  files: [],
  references: [
    { path: "./tsconfig.app.json" },
    { path: "./tsconfig.node.json" }
  ]
}, null, 2);

const tsconfigAppJson = JSON.stringify({
  compilerOptions: {
    tsBuildInfoFile: "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    target: "ES2020",
    useDefineForClassFields: true,
    lib: ["ES2020", "DOM", "DOM.Iterable"],
    module: "ESNext",
    skipLibCheck: true,
    moduleResolution: "bundler",
    allowImportingTsExtensions: true,
    isolatedModules: true,
    moduleDetection: "force",
    noEmit: true,
    jsx: "react-jsx",
    strict: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    noFallthroughCasesInSwitch: true,
    noUncheckedSideEffectImports: true
  },
  include: ["src"]
}, null, 2);

const tsconfigNodeJson = JSON.stringify({
  compilerOptions: {
    tsBuildInfoFile: "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    target: "ES2022",
    lib: ["ES2023"],
    module: "ESNext",
    skipLibCheck: true,
    moduleResolution: "bundler",
    allowImportingTsExtensions: true,
    isolatedModules: true,
    moduleDetection: "force",
    noEmit: true,
    strict: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    noFallthroughCasesInSwitch: true,
    noUncheckedSideEffectImports: true
  },
  include: ["vite.config.ts"]
}, null, 2);

// Tailwind config
const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`;

// PostCSS config
const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`;

// ESLint config
const eslintConfig = `import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
)`;

// HTML template
const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sandbox App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

// Main entry
const mainTsx = `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)`;

// App component
const appTsx = `function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white flex items-center justify-center p-4">
      <div className="text-center max-w-2xl">
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Sandbox Ready
        </h1>
        <p className="text-lg text-gray-400 mb-8">
          Start building your React app with Vite, TypeScript, and Tailwind CSS!
        </p>
      </div>
    </div>
  )
}

export default App`;

// CSS
const indexCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}`;

// Vite env types
const viteEnvDts = `/// <reference types="vite/client" />`;

// Helper to write file content with proper escaping
function writeFileCmd(path: string, content: string): string {
  // Use heredoc for multi-line content
  const escapedContent = content.replace(/\\/g, '\\\\').replace(/\$/g, '\\$');
  return `cat > ${path} << 'EOFCONTENT'
${escapedContent}
EOFCONTENT`;
}

export const template = Template()
  // Start from Node.js LTS image (includes npm)
  .fromNodeImage('20')
  // Install system tools (zip for download functionality)
  .aptInstall(['zip'])
  // Create app directory structure
  .makeDir(['/home/user/app', '/home/user/app/src', '/home/user/app/public'])
  .setWorkdir('/home/user/app')
  // Write config files
  .runCmd(writeFileCmd('package.json', packageJson))
  .runCmd(writeFileCmd('vite.config.ts', viteConfig))
  .runCmd(writeFileCmd('tsconfig.json', tsconfigJson))
  .runCmd(writeFileCmd('tsconfig.app.json', tsconfigAppJson))
  .runCmd(writeFileCmd('tsconfig.node.json', tsconfigNodeJson))
  .runCmd(writeFileCmd('tailwind.config.js', tailwindConfig))
  .runCmd(writeFileCmd('postcss.config.js', postcssConfig))
  .runCmd(writeFileCmd('eslint.config.js', eslintConfig))
  .runCmd(writeFileCmd('index.html', indexHtml))
  // Write source files
  .runCmd(writeFileCmd('src/main.tsx', mainTsx))
  .runCmd(writeFileCmd('src/App.tsx', appTsx))
  .runCmd(writeFileCmd('src/index.css', indexCss))
  .runCmd(writeFileCmd('src/vite-env.d.ts', viteEnvDts))
  // Install npm dependencies (this is cached in the template)
  .runCmd('npm install --legacy-peer-deps')
  // Set environment variables
  .setEnvs({
    NODE_ENV: 'development',
    FORCE_COLOR: '0',
    CI: 'true'
  })
  // Set start command - this runs when sandbox starts and waits for port 5173
  .setStartCmd('npm run dev', waitForPort(5173))
