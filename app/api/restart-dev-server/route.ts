import { NextResponse } from 'next/server';
import { detectFramework, getRestartCommand } from '@/lib/framework-detector';

declare global {
  var activeSandbox: any;
  var activeSandboxProvider: any;
  var lastDevRestartTime: number;
  var devRestartInProgress: boolean;
}

const RESTART_COOLDOWN_MS = 5000; // 5 second cooldown between restarts

export async function POST() {
  try {
    const provider = global.activeSandbox || global.activeSandboxProvider;
    
    if (!provider) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }
    
    // Check if restart is already in progress
    if (global.devRestartInProgress) {
      console.log('[restart-dev-server] Dev server restart already in progress, skipping...');
      return NextResponse.json({
        success: true,
        message: 'Dev server restart already in progress'
      });
    }
    
    // Check cooldown
    const now = Date.now();
    if (global.lastDevRestartTime && (now - global.lastDevRestartTime) < RESTART_COOLDOWN_MS) {
      const remainingTime = Math.ceil((RESTART_COOLDOWN_MS - (now - global.lastDevRestartTime)) / 1000);
      console.log(`[restart-dev-server] Cooldown active, ${remainingTime}s remaining`);
      return NextResponse.json({
        success: true,
        message: `Dev server was recently restarted, cooldown active (${remainingTime}s remaining)`
      });
    }
    
    // Set the restart flag
    global.devRestartInProgress = true;
    
    // Detect the framework being used
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
    console.log(`[restart-dev-server] Detected framework: ${detection.framework} (${detection.config.name})`);
    
    // Use the provider's restart method if available
    if (typeof provider.restartDevServer === 'function') {
      await provider.restartDevServer();
      console.log(`[restart-dev-server] ${detection.config.name} restarted via provider method`);
    } else {
      // Fallback to manual restart
      console.log(`[restart-dev-server] Fallback to manual ${detection.config.name} restart...`);
      
      // Kill existing dev server processes
      const killCommands = [
        `pkill -f "${detection.config.devCommand}"`,
        `pkill -f "node.*${detection.config.name.toLowerCase()}"`,
        `pkill -f "${detection.config.name.toLowerCase()}"`,
        `lsof -ti:${detection.config.devPort} | xargs kill -9 || true`
      ];

      for (const killCmd of killCommands) {
        try {
          await provider.runCommand(killCmd);
          console.log(`[restart-dev-server] Executed: ${killCmd}`);
        } catch {
          // Ignore kill command failures
        }
      }
      
      // Wait a moment for processes to terminate
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Clear any error tracking files
      try {
        const errorFile = `/tmp/${detection.framework}-errors.json`;
        await provider.runCommand(`echo '{"errors": [], "lastChecked": ${Date.now()}, "framework": "${detection.framework}"}' > ${errorFile}`);
      } catch {
        // Ignore if this fails
      }
      
      // Start dev server in background
      const logFile = `/tmp/${detection.framework}-dev.log`;
      const startCommand = `sh -c "nohup ${detection.config.devCommand} > ${logFile} 2>&1 &"`;
      
      await provider.runCommand(startCommand);
      console.log(`[restart-dev-server] ${detection.config.name} dev server restarted with: ${detection.config.devCommand}`);
      
      // Wait for dev server to start up
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Update global state
    global.lastDevRestartTime = Date.now();
    global.devRestartInProgress = false;
    
    return NextResponse.json({
      success: true,
      message: `${detection.config.name} dev server restarted successfully`,
      framework: detection.framework,
      command: detection.config.devCommand,
      port: detection.config.devPort
    });
    
  } catch (error) {
    console.error('[restart-dev-server] Error:', error);
    
    // Clear the restart flag on error
    global.devRestartInProgress = false;
    
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}