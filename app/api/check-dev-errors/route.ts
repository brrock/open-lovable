import { NextResponse } from 'next/server';
import { detectFramework, extractPackageFromImportError } from '@/lib/framework-detector';

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

    console.log('[check-dev-errors] Checking for development errors...');

    // First, detect the framework being used
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
    console.log(`[check-dev-errors] Detected framework: ${detection.framework} (confidence: ${detection.confidence})`);

    const errors: any[] = [];

    // Check if there's an error cache file from previous runs
    try {
      const cacheFile = `/tmp/${detection.framework}-errors.json`;
      const catResult = await provider.runCommand(`cat ${cacheFile}`);
      
      if (catResult.exitCode === 0) {
        const errorFileContent = await catResult.stdout();
        const data = JSON.parse(errorFileContent);
        errors.push(...(data.errors || []));
      }
    } catch {
      // No error file exists, that's OK
    }

    // Look for framework-specific log files that might contain errors
    const logFiles = detection.config.logFiles;
    
    for (const logFile of logFiles) {
      try {
        // Check if log file exists
        const testResult = await provider.runCommand(`test -f ${logFile}`);
        if (testResult.exitCode !== 0) continue;

        // Search for import errors using framework-specific patterns
        const grepResult = await provider.runCommand(`grep -i "failed to resolve" ${logFile} || grep -i "module not found" ${logFile} || grep -i "cannot resolve" ${logFile}`);
        
        if (grepResult.exitCode === 0) {
          const errorLines = (await grepResult.stdout()).split('\n').filter((line: string) => line.trim());
          
          for (const line of errorLines) {
            const packageName = extractPackageFromImportError(line, detection.framework);
            
            if (packageName) {
              const errorObj = {
                type: "npm-missing",
                package: packageName,
                message: `Failed to resolve import "${packageName}"`,
                file: "Unknown",
                framework: detection.framework
              };
              
              // Avoid duplicates
              if (!errors.some(e => e.package === errorObj.package)) {
                errors.push(errorObj);
              }
            }
          }
        }
      } catch {
        // Skip if grep fails or file doesn't exist
      }
    }

    // Also check for syntax errors and type errors
    for (const logFile of logFiles) {
      try {
        const testResult = await provider.runCommand(`test -f ${logFile}`);
        if (testResult.exitCode !== 0) continue;

        // Check for syntax errors
        const syntaxResult = await provider.runCommand(`grep -i "syntaxerror\\|syntax error" ${logFile}`);
        if (syntaxResult.exitCode === 0) {
          const syntaxLines = (await syntaxResult.stdout()).split('\n').filter((line: string) => line.trim());
          
          for (const line of syntaxLines.slice(0, 5)) { // Limit to 5 syntax errors
            errors.push({
              type: "syntax-error",
              message: line.trim(),
              framework: detection.framework
            });
          }
        }

        // Check for type errors (TypeScript)
        const typeResult = await provider.runCommand(`grep -i "type error\\|ts[0-9]" ${logFile}`);
        if (typeResult.exitCode === 0) {
          const typeLines = (await typeResult.stdout()).split('\n').filter((line: string) => line.trim());
          
          for (const line of typeLines.slice(0, 3)) { // Limit to 3 type errors
            errors.push({
              type: "type-error",
              message: line.trim(),
              framework: detection.framework
            });
          }
        }
      } catch {
        // Skip if checks fail
      }
    }

    // Deduplicate errors
    const uniqueErrors: any[] = [];
    const seenErrors = new Set<string>();
    
    for (const error of errors) {
      const key = `${error.type}-${error.package || error.message}`;
      if (!seenErrors.has(key)) {
        seenErrors.add(key);
        uniqueErrors.push(error);
      }
    }

    // Cache the results
    try {
      const cacheFile = `/tmp/${detection.framework}-errors.json`;
      const cacheData = {
        errors: uniqueErrors,
        lastChecked: Date.now(),
        framework: detection.framework
      };
      await provider.runCommand(`echo '${JSON.stringify(cacheData)}' > ${cacheFile}`);
    } catch {
      // Ignore cache write errors
    }

    return NextResponse.json({
      success: true,
      hasErrors: uniqueErrors.length > 0,
      errors: uniqueErrors,
      framework: detection.framework,
      confidence: detection.confidence,
      message: uniqueErrors.length > 0 
        ? `Found ${uniqueErrors.length} development errors in ${detection.config.name}`
        : `No development errors detected in ${detection.config.name}`
    });
    
  } catch (error) {
    console.error('[check-dev-errors] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}