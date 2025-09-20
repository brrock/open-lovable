export interface FrameworkTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultFiles: Record<string, string>;
  packageJsonTemplate: any;
  systemPrompt: string;
  fileStructure: string[];
}

export const frameworkTemplates: Record<string, FrameworkTemplate> = {
  nextjs: {
    id: 'nextjs',
    name: 'Next.js',
    description: 'React framework with SSR, routing, and full-stack capabilities',
    icon: '⚡',
    defaultFiles: {
      'app/page.tsx': `import React from 'react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-4 text-center">
          Welcome to Your App
        </h1>
        <p className="text-gray-600 text-center mb-6">
          This is your custom Next.js application generated from your prompt.
        </p>
        <div className="space-y-4">
          <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors">
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}`,
      'app/layout.tsx': `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Custom App',
  description: 'Generated with AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}`,
      'app/globals.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
}`,
      'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`,
      'next.config.js': `/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
}

module.exports = nextConfig`,
      'postcss.config.js': `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`
    },
    packageJsonTemplate: {
      name: "custom-nextjs-app",
      version: "0.1.0",
      private: true,
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        lint: "next lint"
      },
      dependencies: {
        next: "^14.0.0",
        react: "^18.2.0",
        "react-dom": "^18.2.0"
      },
      devDependencies: {
        "@types/node": "^20.0.0",
        "@types/react": "^18.2.0",
        "@types/react-dom": "^18.2.0",
        autoprefixer: "^10.4.16",
        eslint: "^8.0.0",
        "eslint-config-next": "^14.0.0",
        postcss: "^8.4.31",
        tailwindcss: "^3.3.5",
        typescript: "^5.2.0"
      }
    },
    systemPrompt: `You are creating a Next.js application with the App Router. Use these guidelines:

1. Use the app directory structure (app/page.tsx, app/layout.tsx)
2. Create TypeScript components with proper typing
3. Use Tailwind CSS for styling
4. Include proper metadata and SEO
5. Use modern React patterns (hooks, functional components)
6. Create reusable components in a components/ directory
7. Add proper error boundaries and loading states
8. Use Next.js features like Image, Link, and dynamic imports where appropriate

File structure should include:
- app/page.tsx (main page)
- app/layout.tsx (root layout)
- app/globals.css (global styles)
- components/ (reusable components)
- lib/ (utility functions)
- public/ (static assets)`,
    fileStructure: [
      'app/',
      'app/page.tsx',
      'app/layout.tsx',
      'app/globals.css',
      'components/',
      'lib/',
      'public/',
      'package.json',
      'next.config.js',
      'tailwind.config.js',
      'postcss.config.js',
      'tsconfig.json'
    ]
  },

  vite: {
    id: 'vite',
    name: 'Vite + React',
    description: 'Fast development with Vite bundler and React',
    icon: '⚡',
    defaultFiles: {
      'src/App.tsx': `import React, { useState } from 'react';
import './App.css';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-4 text-center">
          Vite + React App
        </h1>
        <p className="text-gray-600 text-center mb-6">
          This is your custom Vite application generated from your prompt.
        </p>
        <div className="space-y-4">
          <div className="text-center">
            <button
              className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              onClick={() => setCount((count) => count + 1)}
            >
              Count is {count}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;`,
      'src/main.tsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);`,
      'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}`,
      'src/App.css': `.App {
  text-align: center;
}

.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}

.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}`,
      'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Custom Vite App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
      'vite.config.ts': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
});`,
      'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`,
      'postcss.config.js': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`
    },
    packageJsonTemplate: {
      name: "custom-vite-app",
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc && vite build",
        lint: "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
        preview: "vite preview"
      },
      dependencies: {
        react: "^18.2.0",
        "react-dom": "^18.2.0"
      },
      devDependencies: {
        "@types/react": "^18.2.43",
        "@types/react-dom": "^18.2.17",
        "@typescript-eslint/eslint-plugin": "^6.14.0",
        "@typescript-eslint/parser": "^6.14.0",
        "@vitejs/plugin-react": "^4.2.1",
        autoprefixer: "^10.4.16",
        eslint: "^8.55.0",
        "eslint-plugin-react-hooks": "^4.6.0",
        "eslint-plugin-react-refresh": "^0.4.5",
        postcss: "^8.4.32",
        tailwindcss: "^3.3.6",
        typescript: "^5.2.2",
        vite: "^5.0.8"
      }
    },
    systemPrompt: `You are creating a Vite + React application. Use these guidelines:

1. Use the src/ directory structure with main.tsx as entry point
2. Create TypeScript components with proper typing
3. Use Tailwind CSS for styling
4. Include proper component structure and state management
5. Use modern React patterns (hooks, functional components)
6. Create reusable components in src/components/
7. Add proper error boundaries and loading states
8. Use Vite's fast HMR capabilities
9. Include proper TypeScript configuration

File structure should include:
- src/App.tsx (main app component)
- src/main.tsx (entry point)
- src/index.css (global styles)
- src/components/ (reusable components)
- src/hooks/ (custom hooks)
- src/utils/ (utility functions)
- public/ (static assets)
- index.html (HTML template)`,
    fileStructure: [
      'src/',
      'src/App.tsx',
      'src/main.tsx',
      'src/index.css',
      'src/components/',
      'src/hooks/',
      'src/utils/',
      'public/',
      'index.html',
      'package.json',
      'vite.config.ts',
      'tailwind.config.js',
      'postcss.config.js',
      'tsconfig.json'
    ]
  },

  auto: {
    id: 'auto',
    name: 'Let AI Decide',
    description: 'AI will choose the best framework for your project',
    icon: '🤖',
    defaultFiles: {},
    packageJsonTemplate: {},
    systemPrompt: `You are an expert web developer who will analyze the user's prompt and choose the most appropriate framework (Next.js or Vite + React) based on the requirements.

Choose Next.js when:
- The project needs SSR/SSG
- SEO is important
- Full-stack features are needed
- Complex routing is required
- The project is content-heavy

Choose Vite + React when:
- The project is a simple SPA
- Fast development is prioritized
- The project is component-heavy
- No SSR is needed
- The project is more interactive/app-like

First, analyze the prompt and explain your framework choice, then generate the appropriate project structure.`,
    fileStructure: []
  }
};

export function getFrameworkTemplate(frameworkId: string): FrameworkTemplate | null {
  return frameworkTemplates[frameworkId] || null;
}

export function getAllFrameworks(): FrameworkTemplate[] {
  return Object.values(frameworkTemplates);
}

export function getFrameworkChoices(): Array<{id: string, name: string, description: string, icon: string}> {
  return getAllFrameworks().map(framework => ({
    id: framework.id,
    name: framework.name,
    description: framework.description,
    icon: framework.icon
  }));
}