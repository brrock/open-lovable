import { getFrameworkConfig } from './framework-detector';

export interface CommandMapping {
  install: string[];
  dev: string[];
  build: string[];
  start: string[];
  test?: string[];
  lint?: string[];
  typecheck?: string[];
  clean?: string[];
}

export const frameworkCommands: Record<string, CommandMapping> = {
  nextjs: {
    install: ['npm install', 'yarn install', 'pnpm install'],
    dev: ['npm run dev', 'yarn dev', 'pnpm dev'],
    build: ['npm run build', 'yarn build', 'pnpm build'],
    start: ['npm start', 'yarn start', 'pnpm start'],
    test: ['npm test', 'yarn test', 'pnpm test'],
    lint: ['npm run lint', 'yarn lint', 'pnpm lint'],
    typecheck: ['npx tsc --noEmit', 'yarn tsc --noEmit', 'pnpm tsc --noEmit'],
    clean: ['rm -rf .next', 'rm -rf node_modules/.cache']
  },

  vite: {
    install: ['npm install', 'yarn install', 'pnpm install'],
    dev: ['npm run dev', 'yarn dev', 'pnpm dev'],
    build: ['npm run build', 'yarn build', 'pnpm build'],
    start: ['npm run preview', 'yarn preview', 'pnpm preview'],
    test: ['npm test', 'yarn test', 'pnpm test'],
    lint: ['npm run lint', 'yarn lint', 'pnpm lint'],
    typecheck: ['npx tsc --noEmit', 'yarn tsc --noEmit', 'pnpm tsc --noEmit'],
    clean: ['rm -rf dist', 'rm -rf node_modules/.vite']
  },

  cra: {
    install: ['npm install', 'yarn install'],
    dev: ['npm start', 'yarn start'],
    build: ['npm run build', 'yarn build'],
    start: ['npx serve -s build', 'yarn global add serve && serve -s build'],
    test: ['npm test', 'yarn test'],
    lint: ['npm run lint', 'yarn lint'],
    typecheck: ['npx tsc --noEmit', 'yarn tsc --noEmit'],
    clean: ['rm -rf build', 'rm -rf node_modules/.cache']
  }
};

export interface PackageManagerInfo {
  name: string;
  lockFile: string;
  installCommand: string;
  runCommand: string;
}

export const packageManagers: Record<string, PackageManagerInfo> = {
  npm: {
    name: 'npm',
    lockFile: 'package-lock.json',
    installCommand: 'npm install',
    runCommand: 'npm run'
  },
  yarn: {
    name: 'yarn',
    lockFile: 'yarn.lock',
    installCommand: 'yarn install',
    runCommand: 'yarn'
  },
  pnpm: {
    name: 'pnpm',
    lockFile: 'pnpm-lock.yaml',
    installCommand: 'pnpm install',
    runCommand: 'pnpm'
  }
};

export async function detectPackageManager(
  fileExists: (path: string) => Promise<boolean>
): Promise<PackageManagerInfo> {
  // Check for lock files to determine package manager
  for (const [key, pm] of Object.entries(packageManagers)) {
    if (await fileExists(pm.lockFile)) {
      return pm;
    }
  }
  
  // Default to npm if no lock file found
  return packageManagers.npm;
}

export function getFrameworkCommands(framework: string): CommandMapping | null {
  return frameworkCommands[framework] || null;
}

export function getCommand(
  framework: string, 
  action: keyof CommandMapping, 
  packageManager: string = 'npm'
): string | null {
  const commands = getFrameworkCommands(framework);
  if (!commands || !commands[action]) return null;

  const actionCommands = commands[action];
  if (!actionCommands || actionCommands.length === 0) return null;

  // Find command that matches the package manager
  const pmInfo = packageManagers[packageManager];
  if (!pmInfo) return actionCommands[0]; // Fallback to first command

  // Look for command that starts with the package manager
  const matchingCommand = actionCommands.find(cmd => 
    cmd.startsWith(pmInfo.name) || cmd.startsWith(pmInfo.runCommand)
  );

  return matchingCommand || actionCommands[0];
}

export function buildCommand(
  framework: string,
  action: keyof CommandMapping,
  packageManager: string = 'npm',
  args: string[] = []
): string | null {
  const baseCommand = getCommand(framework, action, packageManager);
  if (!baseCommand) return null;

  if (args.length === 0) return baseCommand;

  // Add arguments to the command
  return `${baseCommand} ${args.join(' ')}`;
}

export function getInstallCommand(
  packages: string[],
  packageManager: string = 'npm',
  isDev: boolean = false
): string {
  const pmInfo = packageManagers[packageManager] || packageManagers.npm;
  
  if (packages.length === 0) {
    return pmInfo.installCommand;
  }

  const devFlag = isDev ? (packageManager === 'npm' ? '--save-dev' : '--dev') : '';
  const packagesStr = packages.join(' ');
  
  switch (packageManager) {
    case 'yarn':
      return `yarn add ${devFlag} ${packagesStr}`.trim();
    case 'pnpm':
      return `pnpm add ${devFlag} ${packagesStr}`.trim();
    default:
      return `npm install ${devFlag} ${packagesStr}`.trim();
  }
}

export function getUninstallCommand(
  packages: string[],
  packageManager: string = 'npm'
): string {
  if (packages.length === 0) return '';
  
  const packagesStr = packages.join(' ');
  
  switch (packageManager) {
    case 'yarn':
      return `yarn remove ${packagesStr}`;
    case 'pnpm':
      return `pnpm remove ${packagesStr}`;
    default:
      return `npm uninstall ${packagesStr}`;
  }
}

export function getProcessKillCommands(framework: string, port?: number): string[] {
  const config = getFrameworkConfig(framework);
  const commands: string[] = [];
  
  if (config) {
    // Kill by process name
    commands.push(`pkill -f "${config.devCommand}"`);
    commands.push(`pkill -f "${config.name.toLowerCase()}"`);
    
    // Kill by port
    const targetPort = port || config.devPort;
    commands.push(`lsof -ti:${targetPort} | xargs kill -9 || true`);
    commands.push(`fuser -k ${targetPort}/tcp || true`);
  }
  
  // Generic Node.js process cleanup
  commands.push('pkill -f "node.*dev"');
  commands.push('pkill -f "node.*start"');
  
  return commands;
}

export function getHealthCheckCommand(framework: string, port?: number): string {
  const config = getFrameworkConfig(framework);
  const targetPort = port || config?.devPort || 3000;
  
  return `curl -f http://localhost:${targetPort} > /dev/null 2>&1`;
}

export function getLogTailCommand(framework: string, lines: number = 50): string[] {
  const config = getFrameworkConfig(framework);
  if (!config) return [`tail -${lines} /tmp/dev.log`];
  
  return config.logFiles.map(logFile => `tail -${lines} ${logFile} 2>/dev/null || echo "Log file ${logFile} not found"`);
}