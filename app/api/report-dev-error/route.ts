import { NextRequest, NextResponse } from 'next/server';
import { detectFramework } from '@/lib/framework-detector';

declare global {
  var activeSandbox: any;
  var activeSandboxProvider: any;
}

export async function POST(request: NextRequest) {
  try {
    const provider = global.activeSandbox || global.activeSandboxProvider;
    
    if (!provider) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }

    const { error, file, line, column, stack, type } = await request.json();

    if (!error) {
      return NextResponse.json({
        success: false,
        error: 'Error message is required'
      }, { status: 400 });
    }

    console.log('[report-dev-error] Reporting development error:', { error, file, type });

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

    // Create error object
    const errorObj = {
      type: type || 'runtime-error',
      message: error,
      file: file || 'Unknown',
      line: line || null,
      column: column || null,
      stack: stack || null,
      framework: detection.framework,
      timestamp: new Date().toISOString(),
      reported: true
    };

    // Load existing errors
    let existingErrors: any[] = [];
    const errorFile = `/tmp/${detection.framework}-errors.json`;
    
    try {
      const catResult = await provider.runCommand(`cat ${errorFile}`);
      if (catResult.exitCode === 0) {
        const errorFileContent = await catResult.stdout();
        const data = JSON.parse(errorFileContent);
        existingErrors = data.errors || [];
      }
    } catch {
      // No existing error file, start fresh
    }

    // Add new error (avoid duplicates)
    const isDuplicate = existingErrors.some(e => 
      e.message === errorObj.message && 
      e.file === errorObj.file && 
      e.line === errorObj.line
    );

    if (!isDuplicate) {
      existingErrors.push(errorObj);
      
      // Keep only the last 20 errors to prevent file from growing too large
      if (existingErrors.length > 20) {
        existingErrors = existingErrors.slice(-20);
      }
    }

    // Save updated errors
    try {
      const updatedCache = {
        errors: existingErrors,
        lastUpdated: Date.now(),
        framework: detection.framework
      };
      
      await provider.runCommand(`echo '${JSON.stringify(updatedCache)}' > ${errorFile}`);
      console.log(`[report-dev-error] Error reported and cached for ${detection.framework}`);
    } catch (cacheError) {
      console.error('[report-dev-error] Failed to cache error:', cacheError);
      // Continue anyway, don't fail the request
    }

    // Also append to framework-specific log file
    try {
      const logFile = `/tmp/${detection.framework}-dev.log`;
      const logEntry = `[${new Date().toISOString()}] ERROR: ${error}${file ? ` in ${file}` : ''}${line ? `:${line}` : ''}\n`;
      
      await provider.runCommand(`echo '${logEntry}' >> ${logFile}`);
    } catch (logError) {
      console.error('[report-dev-error] Failed to write to log file:', logError);
      // Continue anyway
    }

    return NextResponse.json({
      success: true,
      message: `Error reported for ${detection.config.name}`,
      framework: detection.framework,
      frameworkName: detection.config.name,
      errorId: `${detection.framework}-${Date.now()}`,
      isDuplicate,
      totalErrors: existingErrors.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[report-dev-error] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}