export interface FrameworkConfig {
  name: string;
  devCommand: string;
  buildCommand: string;
  startCommand: string;
  testCommand?: string;
  devPort: number;
  logFiles: string[];
  errorPatterns: {
    importError: RegExp;
    syntaxError: RegExp;
    typeError: RegExp;
    buildError: RegExp;
  };
  packagePatterns: {
    dependencies: string[];
    devDependencies: string[];
  };
  configFiles: string[];
}

export const frameworkConfigs: Record<string, FrameworkConfig> = {
  nextjs: {
    name: 'Next.js',
    devCommand: 'npm run dev',
    buildCommand: 'npm run build',
    startCommand: 'npm start',
    testCommand: 'npm test',
    devPort: 3000,
    logFiles: ['/tmp/nextjs.log', '/tmp/next-dev.log', '.next/trace'],
    errorPatterns: {
      importError: /Module not found: Can't resolve '([^']+)'/,
      syntaxError: /SyntaxError: (.+)/,
      typeError: /Type error: (.+)/,
      buildError: /Failed to compile/
    },
    packagePatterns: {
      dependencies: ['next', 'react', 'react-dom'],
      devDependencies: ['@types/react', '@types/node']
    },
    configFiles: ['next.config.js', 'next.config.ts', 'next.config.mjs']
  },

  vite: {
    name: 'Vite',
    devCommand: 'npm run dev',
    buildCommand: 'npm run build',
    startCommand: 'npm run preview',
    testCommand: 'npm test',
    devPort: 5173,
    logFiles: ['/tmp/vite.log', '/tmp/vite-dev.log'],
    errorPatterns: {
      importError: /Failed to resolve import "([^"]+)"/,
      syntaxError: /SyntaxError: (.+)/,
      typeError: /TS\d+: (.+)/,
      buildError: /Build failed with \d+ error/
    },
    packagePatterns: {
      dependencies: ['vite'],
      devDependencies: ['@vitejs/plugin-react', '@vitejs/plugin-react-swc']
    },
    configFiles: ['vite.config.js', 'vite.config.ts', 'vite.config.mjs']
  },

  cra: {
    name: 'Create React App',
    devCommand: 'npm start',
    buildCommand: 'npm run build',
    startCommand: 'serve -s build',
    testCommand: 'npm test',
    devPort: 3000,
    logFiles: ['/tmp/react-scripts.log'],
    errorPatterns: {
      importError: /Module not found: Can't resolve '([^']+)'/,
      syntaxError: /SyntaxError: (.+)/,
      typeError: /TypeScript error in (.+)/,
      buildError: /Failed to compile/
    },
    packagePatterns: {
      dependencies: ['react-scripts'],
      devDependencies: []
    },
    configFiles: ['public/index.html', 'src/index.js', 'src/index.tsx']
  }
};

export interface DetectionResult {
  framework: string;
  confidence: number;
  config: FrameworkConfig;
  evidence: string[];
}

export async function detectFramework(
  packageJson?: any,
  fileExists?: (path: string) => Promise<boolean>,
  runCommand?: (cmd: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>
): Promise<DetectionResult> {
  const results: Array<{ framework: string; score: number; evidence: string[] }> = [];

  for (const [frameworkId, config] of Object.entries(frameworkConfigs)) {
    let score = 0;
    const evidence: string[] = [];

    // Check package.json dependencies
    if (packageJson) {
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      // Check for framework-specific dependencies
      for (const dep of config.packagePatterns.dependencies) {
        if (deps[dep]) {
          score += 30;
          evidence.push(`Found dependency: ${dep}`);
        }
      }

      for (const dep of config.packagePatterns.devDependencies) {
        if (deps[dep]) {
          score += 20;
          evidence.push(`Found dev dependency: ${dep}`);
        }
      }

      // Check scripts
      if (packageJson.scripts) {
        if (packageJson.scripts.dev && config.devCommand.includes('dev')) {
          score += 15;
          evidence.push('Has dev script');
        }
        if (packageJson.scripts.build && config.buildCommand.includes('build')) {
          score += 10;
          evidence.push('Has build script');
        }
      }
    }

    // Check for config files
    if (fileExists) {
      for (const configFile of config.configFiles) {
        try {
          if (await fileExists(configFile)) {
            score += 25;
            evidence.push(`Found config file: ${configFile}`);
          }
        } catch {
          // Ignore file check errors
        }
      }
    }

    // Check for running processes (if runCommand is available)
    if (runCommand) {
      try {
        const processCheck = await runCommand(`ps aux | grep -i ${config.name.toLowerCase().replace(/[^a-z]/g, '')}`);
        if (processCheck.exitCode === 0 && processCheck.stdout.trim()) {
          score += 15;
          evidence.push(`Found running ${config.name} process`);
        }
      } catch {
        // Ignore process check errors
      }
    }

    results.push({ framework: frameworkId, score, evidence });
  }

  // Sort by score and return the best match
  results.sort((a, b) => b.score - a.score);
  const best = results[0];

  if (best.score === 0) {
    // Default to Vite if no clear detection
    return {
      framework: 'vite',
      confidence: 0,
      config: frameworkConfigs.vite,
      evidence: ['No clear framework detected, defaulting to Vite']
    };
  }

  return {
    framework: best.framework,
    confidence: Math.min(best.score / 100, 1),
    config: frameworkConfigs[best.framework],
    evidence: best.evidence
  };
}

export function getFrameworkConfig(framework: string): FrameworkConfig | null {
  return frameworkConfigs[framework] || null;
}

export function getAllFrameworkConfigs(): Record<string, FrameworkConfig> {
  return frameworkConfigs;
}

// Helper function to extract package name from import error
export function extractPackageFromImportError(errorMessage: string, framework: string): string | null {
  const config = getFrameworkConfig(framework);
  if (!config) return null;

  const match = errorMessage.match(config.errorPatterns.importError);
  if (!match) return null;

  const importPath = match[1];
  
  // Skip relative imports
  if (importPath.startsWith('.')) return null;

  // Extract base package name
  if (importPath.startsWith('@')) {
    const parts = importPath.split('/');
    return parts.length >= 2 ? parts.slice(0, 2).join('/') : importPath;
  } else {
    return importPath.split('/')[0];
  }
}

// Helper function to get appropriate restart command
export function getRestartCommand(framework: string): string {
  const config = getFrameworkConfig(framework);
  if (!config) return 'npm run dev';

  return config.devCommand;
}

// Helper function to get log file paths for monitoring
export function getLogFilePaths(framework: string): string[] {
  const config = getFrameworkConfig(framework);
  if (!config) return ['/tmp/dev.log'];

  return config.logFiles;
}