import { NextResponse } from 'next/server';
import { detectFramework, extractPackageFromImportError, getLogFilePaths } from '@/lib/framework-detector';

declare global {
  var activeSandbox: any;
  var activeSandboxProvider: any;
}

export async function GET() {
  try {
    const provider = global.activeSandbox || global.activeSandboxProvider;
    
    if (!provider) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }
    
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
    console.log(`[monitor-dev-logs] Monitoring ${detection.config.name} logs...`);
    
    const errors: any[] = [];
    const warnings: any[] = [];
    const info: any[] = [];

    // Check if there's an error file from previous runs
    try {
      const errorFile = `/tmp/${detection.framework}-errors.json`;
      const catResult = await provider.runCommand(`cat ${errorFile}`);
      
      if (catResult.exitCode === 0) {
        const errorFileContent = await catResult.stdout();
        const data = JSON.parse(errorFileContent);
        errors.push(...(data.errors || []));
      }
    } catch {
      // No error file exists, that's OK
    }

    // Look for framework-specific log files that might contain errors
    const logFiles = getLogFilePaths(detection.framework);
    
    for (const logFile of logFiles) {
      try {
        // Check if log file exists
        const testResult = await provider.runCommand(`test -f ${logFile}`);
        if (testResult.exitCode !== 0) continue;

        // Get recent log entries (last 100 lines)
        const tailResult = await provider.runCommand(`tail -100 ${logFile}`);
        if (tailResult.exitCode !== 0) continue;

        const logContent = await tailResult.stdout();
        const logLines = logContent.split('\n').filter(line => line.trim());

        for (const line of logLines) {
          const lowerLine = line.toLowerCase();
          
          // Check for import/module errors
          if (lowerLine.includes('failed to resolve') || 
              lowerLine.includes('module not found') || 
              lowerLine.includes('cannot resolve')) {
            
            const packageName = extractPackageFromImportError(line, detection.framework);
            
            if (packageName) {
              const errorObj = {
                type: "npm-missing",
                package: packageName,
                message: `Failed to resolve import "${packageName}"`,
                file: "Unknown",
                framework: detection.framework,
                timestamp: new Date().toISOString()
              };
              
              // Avoid duplicates
              if (!errors.some(e => e.package === errorObj.package)) {
                errors.push(errorObj);
              }
            }
          }
          
          // Check for syntax errors
          else if (lowerLine.includes('syntaxerror') || lowerLine.includes('syntax error')) {
            errors.push({
              type: "syntax-error",
              message: line.trim(),
              framework: detection.framework,
              timestamp: new Date().toISOString()
            });
          }
          
          // Check for type errors
          else if (lowerLine.includes('type error') || /ts\d+/.test(lowerLine)) {
            errors.push({
              type: "type-error",
              message: line.trim(),
              framework: detection.framework,
              timestamp: new Date().toISOString()
            });
          }
          
          // Check for build errors
          else if (lowerLine.includes('failed to compile') || 
                   lowerLine.includes('build failed') ||
                   lowerLine.includes('compilation failed')) {
            errors.push({
              type: "build-error",
              message: line.trim(),
              framework: detection.framework,
              timestamp: new Date().toISOString()
            });
          }
          
          // Check for warnings
          else if (lowerLine.includes('warning') || lowerLine.includes('warn')) {
            warnings.push({
              type: "warning",
              message: line.trim(),
              framework: detection.framework,
              timestamp: new Date().toISOString()
            });
          }
          
          // Check for successful compilation/build messages
          else if (lowerLine.includes('compiled successfully') || 
                   lowerLine.includes('ready in') ||
                   lowerLine.includes('local:') ||
                   lowerLine.includes('network:')) {
            info.push({
              type: "success",
              message: line.trim(),
              framework: detection.framework,
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (error) {
        console.error(`[monitor-dev-logs] Error reading ${logFile}:`, error);
      }
    }

    // Deduplicate and limit results
    const uniqueErrors = Array.from(
      new Map(errors.map(e => [`${e.type}-${e.package || e.message}`, e])).values()
    ).slice(0, 10);

    const uniqueWarnings = Array.from(
      new Map(warnings.map(w => [w.message, w])).values()
    ).slice(0, 5);

    const recentInfo = info.slice(-3); // Last 3 info messages

    // Update error cache
    try {
      const errorFile = `/tmp/${detection.framework}-errors.json`;
      const cacheData = {
        errors: uniqueErrors,
        warnings: uniqueWarnings,
        lastChecked: Date.now(),
        framework: detection.framework
      };
      await provider.runCommand(`echo '${JSON.stringify(cacheData)}' > ${errorFile}`);
    } catch {
      // Ignore cache write errors
    }

    return NextResponse.json({
      success: true,
      framework: detection.framework,
      frameworkName: detection.config.name,
      hasErrors: uniqueErrors.length > 0,
      hasWarnings: uniqueWarnings.length > 0,
      errors: uniqueErrors,
      warnings: uniqueWarnings,
      info: recentInfo,
      logFiles: logFiles.filter(async (file) => {
        try {
          const result = await provider.runCommand(`test -f ${file}`);
          return result.exitCode === 0;
        } catch {
          return false;
        }
      }),
      summary: {
        errorCount: uniqueErrors.length,
        warningCount: uniqueWarnings.length,
        lastChecked: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('[monitor-dev-logs] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}