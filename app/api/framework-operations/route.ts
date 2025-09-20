import { NextRequest, NextResponse } from 'next/server';
import { detectFramework, getFrameworkConfig } from '@/lib/framework-detector';
import { 
  detectPackageManager, 
  getCommand, 
  buildCommand, 
  getInstallCommand,
  getProcessKillCommands,
  getHealthCheckCommand,
  getLogTailCommand
} from '@/lib/framework-commands';

declare global {
  var activeSandbox: any;
  var activeSandboxProvider: any;
  var lastOperationTime: Record<string, number>;
  var operationInProgress: Record<string, boolean>;
}

// Initialize global state
if (!global.lastOperationTime) global.lastOperationTime = {};
if (!global.operationInProgress) global.operationInProgress = {};

const OPERATION_COOLDOWN_MS = 3000; // 3 second cooldown between operations

export async function POST(request: NextRequest) {
  try {
    const provider = global.activeSandbox || global.activeSandboxProvider;
    
    if (!provider) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }

    const { operation, packages, args, force } = await request.json();

    if (!operation) {
      return NextResponse.json({
        success: false,
        error: 'Operation is required'
      }, { status: 400 });
    }

    console.log(`[framework-operations] Executing operation: ${operation}`, { packages, args });

    // Check if operation is already in progress
    if (global.operationInProgress[operation] && !force) {
      return NextResponse.json({
        success: true,
        message: `${operation} operation already in progress`,
        inProgress: true
      });
    }

    // Check cooldown (except for status checks)
    if (!['status', 'health', 'logs'].includes(operation)) {
      const now = Date.now();
      const lastTime = global.lastOperationTime[operation] || 0;
      
      if (!force && (now - lastTime) < OPERATION_COOLDOWN_MS) {
        const remainingTime = Math.ceil((OPERATION_COOLDOWN_MS - (now - lastTime)) / 1000);
        return NextResponse.json({
          success: true,
          message: `${operation} was recently executed, cooldown active (${remainingTime}s remaining)`,
          cooldown: remainingTime
        });
      }
    }

    // Set operation in progress
    global.operationInProgress[operation] = true;

    // Detect framework and package manager
    let packageJson;
    try {
      const packageResult = await provider.runCommand('cat package.json');
      if (packageResult.exitCode === 0) {
        packageJson = JSON.parse(await packageResult.stdout());
      }
    } catch {
      // Ignore if package.json can't be read
    }

    const fileExists = async (path: string) => {
      try {
        const result = await provider.runCommand(`test -f ${path}`);
        return result.exitCode === 0;
      } catch {
        return false;
      }
    };

    const runCommand = async (cmd: string) => {
      try {
        const result = await provider.runCommand(cmd);
        return {
          stdout: await result.stdout(),
          stderr: await result.stderr(),
          exitCode: result.exitCode
        };
      } catch (error) {
        return {
          stdout: '',
          stderr: (error as Error).message,
          exitCode: 1
        };
      }
    };

    const detection = await detectFramework(packageJson, fileExists, runCommand);
    const packageManager = await detectPackageManager(fileExists);

    console.log(`[framework-operations] Detected: ${detection.config.name} with ${packageManager.name}`);

    let result: any = {
      success: true,
      framework: detection.framework,
      frameworkName: detection.config.name,
      packageManager: packageManager.name,
      operation
    };

    try {
      switch (operation) {
        case 'install':
          if (packages && packages.length > 0) {
            const installCmd = getInstallCommand(packages, packageManager.name, args?.dev || false);
            const installResult = await provider.runCommand(installCmd);
            result.command = installCmd;
            result.exitCode = installResult.exitCode;
            result.output = await installResult.stdout();
            result.error = await installResult.stderr();
          } else {
            const installCmd = packageManager.installCommand;
            const installResult = await provider.runCommand(installCmd);
            result.command = installCmd;
            result.exitCode = installResult.exitCode;
            result.output = await installResult.stdout();
            result.error = await installResult.stderr();
          }
          break;

        case 'dev':
        case 'start':
          const devCmd = getCommand(detection.framework, 'dev', packageManager.name);
          if (devCmd) {
            // Kill existing processes first
            const killCommands = getProcessKillCommands(detection.framework);
            for (const killCmd of killCommands) {
              try {
                await provider.runCommand(killCmd);
              } catch {
                // Ignore kill failures
              }
            }
            
            // Wait for processes to terminate
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Start dev server in background
            const logFile = `/tmp/${detection.framework}-dev.log`;
            const startCmd = `sh -c "nohup ${devCmd} > ${logFile} 2>&1 &"`;
            
            const startResult = await provider.runCommand(startCmd);
            result.command = devCmd;
            result.logFile = logFile;
            result.port = detection.config.devPort;
            result.exitCode = startResult.exitCode;
            
            // Wait a moment and check if it started
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const healthCmd = getHealthCheckCommand(detection.framework);
            const healthResult = await provider.runCommand(healthCmd);
            result.healthy = healthResult.exitCode === 0;
          }
          break;

        case 'build':
          const buildCmd = getCommand(detection.framework, 'build', packageManager.name);
          if (buildCmd) {
            const buildResult = await provider.runCommand(buildCmd);
            result.command = buildCmd;
            result.exitCode = buildResult.exitCode;
            result.output = await buildResult.stdout();
            result.error = await buildResult.stderr();
          }
          break;

        case 'test':
          const testCmd = getCommand(detection.framework, 'test', packageManager.name);
          if (testCmd) {
            const testResult = await provider.runCommand(`${testCmd} --watchAll=false --passWithNoTests`);
            result.command = testCmd;
            result.exitCode = testResult.exitCode;
            result.output = await testResult.stdout();
            result.error = await testResult.stderr();
          }
          break;

        case 'lint':
          const lintCmd = getCommand(detection.framework, 'lint', packageManager.name);
          if (lintCmd) {
            const lintResult = await provider.runCommand(lintCmd);
            result.command = lintCmd;
            result.exitCode = lintResult.exitCode;
            result.output = await lintResult.stdout();
            result.error = await lintResult.stderr();
          }
          break;

        case 'clean':
          const cleanCommands = getCommand(detection.framework, 'clean', packageManager.name);
          if (cleanCommands) {
            const cleanResult = await provider.runCommand(cleanCommands);
            result.command = cleanCommands;
            result.exitCode = cleanResult.exitCode;
            result.output = await cleanResult.stdout();
          }
          break;

        case 'kill':
        case 'stop':
          const killCommands = getProcessKillCommands(detection.framework);
          const killResults = [];
          
          for (const killCmd of killCommands) {
            try {
              const killResult = await provider.runCommand(killCmd);
              killResults.push({
                command: killCmd,
                exitCode: killResult.exitCode
              });
            } catch (error) {
              killResults.push({
                command: killCmd,
                error: (error as Error).message
              });
            }
          }
          
          result.killCommands = killResults;
          break;

        case 'status':
        case 'health':
          const healthCmd = getHealthCheckCommand(detection.framework);
          const healthResult = await provider.runCommand(healthCmd);
          result.healthy = healthResult.exitCode === 0;
          result.port = detection.config.devPort;
          result.url = `http://localhost:${detection.config.devPort}`;
          
          // Also check for running processes
          const processCheck = await provider.runCommand(`ps aux | grep -v grep | grep "${detection.config.devCommand}"`);
          result.processRunning = processCheck.exitCode === 0;
          break;

        case 'logs':
          const logCommands = getLogTailCommand(detection.framework, args?.lines || 50);
          const logs = [];
          
          for (const logCmd of logCommands) {
            try {
              const logResult = await provider.runCommand(logCmd);
              if (logResult.exitCode === 0) {
                logs.push({
                  command: logCmd,
                  content: await logResult.stdout()
                });
              }
            } catch {
              // Skip failed log commands
            }
          }
          
          result.logs = logs;
          break;

        default:
          result.success = false;
          result.error = `Unknown operation: ${operation}`;
      }

    } catch (operationError) {
      result.success = false;
      result.error = (operationError as Error).message;
    }

    // Update global state
    global.lastOperationTime[operation] = Date.now();
    global.operationInProgress[operation] = false;

    result.timestamp = new Date().toISOString();
    result.confidence = detection.confidence;

    return NextResponse.json(result);
    
  } catch (error) {
    console.error('[framework-operations] Error:', error);
    
    // Clear operation in progress flag
    const { operation } = await request.json().catch(() => ({ operation: 'unknown' }));
    global.operationInProgress[operation] = false;
    
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const provider = global.activeSandbox || global.activeSandboxProvider;
    
    if (!provider) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }

    // Get framework info without performing operations
    let packageJson;
    try {
      const packageResult = await provider.runCommand('cat package.json');
      if (packageResult.exitCode === 0) {
        packageJson = JSON.parse(await packageResult.stdout());
      }
    } catch {
      // Ignore if package.json can't be read
    }

    const fileExists = async (path: string) => {
      try {
        const result = await provider.runCommand(`test -f ${path}`);
        return result.exitCode === 0;
      } catch {
        return false;
      }
    };

    const runCommand = async (cmd: string) => {
      try {
        const result = await provider.runCommand(cmd);
        return {
          stdout: await result.stdout(),
          stderr: await result.stderr(),
          exitCode: result.exitCode
        };
      } catch (error) {
        return {
          stdout: '',
          stderr: (error as Error).message,
          exitCode: 1
        };
      }
    };

    const detection = await detectFramework(packageJson, fileExists, runCommand);
    const packageManager = await detectPackageManager(fileExists);

    return NextResponse.json({
      success: true,
      framework: detection.framework,
      frameworkName: detection.config.name,
      confidence: detection.confidence,
      evidence: detection.evidence,
      packageManager: packageManager.name,
      config: {
        devPort: detection.config.devPort,
        devCommand: detection.config.devCommand,
        buildCommand: detection.config.buildCommand,
        logFiles: detection.config.logFiles
      },
      operations: {
        inProgress: global.operationInProgress || {},
        lastExecuted: global.lastOperationTime || {}
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[framework-operations] GET Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}