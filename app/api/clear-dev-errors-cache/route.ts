import { NextResponse } from 'next/server';
import { detectFramework } from '@/lib/framework-detector';

declare global {
  var activeSandbox: any;
  var activeSandboxProvider: any;
}

export async function POST() {
  try {
    const provider = global.activeSandbox || global.activeSandboxProvider;
    
    if (!provider) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }

    console.log('[clear-dev-errors-cache] Clearing development error cache...');

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
    console.log(`[clear-dev-errors-cache] Detected framework: ${detection.framework}`);

    const clearedFiles: string[] = [];
    const errors: string[] = [];

    // Clear framework-specific error cache
    const errorFile = `/tmp/${detection.framework}-errors.json`;
    try {
      const clearResult = await provider.runCommand(`rm -f ${errorFile}`);
      if (clearResult.exitCode === 0) {
        clearedFiles.push(errorFile);
        console.log(`[clear-dev-errors-cache] Cleared ${errorFile}`);
      }
    } catch (error) {
      errors.push(`Failed to clear ${errorFile}: ${(error as Error).message}`);
    }

    // Clear all framework error caches (in case framework detection changed)
    const allFrameworks = ['nextjs', 'vite', 'cra'];
    for (const framework of allFrameworks) {
      if (framework === detection.framework) continue; // Already handled above
      
      const cacheFile = `/tmp/${framework}-errors.json`;
      try {
        const clearResult = await provider.runCommand(`rm -f ${cacheFile}`);
        if (clearResult.exitCode === 0) {
          clearedFiles.push(cacheFile);
          console.log(`[clear-dev-errors-cache] Cleared ${cacheFile}`);
        }
      } catch (error) {
        // Ignore errors for other framework caches
      }
    }

    // Clear log files if requested (optional)
    const clearLogs = false; // Could be made configurable
    if (clearLogs) {
      for (const logFile of detection.config.logFiles) {
        try {
          const clearResult = await provider.runCommand(`rm -f ${logFile}`);
          if (clearResult.exitCode === 0) {
            clearedFiles.push(logFile);
            console.log(`[clear-dev-errors-cache] Cleared log file ${logFile}`);
          }
        } catch (error) {
          errors.push(`Failed to clear log file ${logFile}: ${(error as Error).message}`);
        }
      }
    }

    // Create fresh error cache
    try {
      const freshCache = {
        errors: [],
        warnings: [],
        lastChecked: Date.now(),
        framework: detection.framework,
        cleared: true
      };
      
      await provider.runCommand(`echo '${JSON.stringify(freshCache)}' > ${errorFile}`);
      console.log(`[clear-dev-errors-cache] Created fresh error cache for ${detection.framework}`);
    } catch (error) {
      errors.push(`Failed to create fresh cache: ${(error as Error).message}`);
    }

    return NextResponse.json({
      success: true,
      message: `Development error cache cleared for ${detection.config.name}`,
      framework: detection.framework,
      frameworkName: detection.config.name,
      clearedFiles,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[clear-dev-errors-cache] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}