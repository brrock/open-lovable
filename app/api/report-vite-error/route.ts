import { NextRequest, NextResponse } from 'next/server';

declare global {
  var viteErrors: any[];
}

// Initialize global viteErrors array if it doesn't exist
if (!global.viteErrors) {
  global.viteErrors = [];
}

// DEPRECATED: Use /api/report-dev-error instead

export async function POST(request: NextRequest) {
  console.log('[report-vite-error] DEPRECATED: Redirecting to /api/report-dev-error');
  
  try {
    const body = await request.json();
    
    // Make internal request to the new endpoint
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/report-dev-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    
    // Transform response to match old format for backward compatibility
    return NextResponse.json({
      success: data.success,
      message: data.message || 'Error reported successfully',
      framework: data.framework,
      deprecated: true,
      newEndpoint: '/api/report-dev-error'
    });
  } catch (error) {
    console.error('[report-vite-error] Fallback to legacy error reporting');
  }
  
  // Fallback to original logic if new endpoint fails
  try {
    const { error, file, type = 'runtime-error' } = await request.json();
    
    if (!error) {
      return NextResponse.json({ 
        success: false, 
        error: 'Error message is required' 
      }, { status: 400 });
    }
    
    // Parse the error to extract useful information
    const errorObj: any = {
      type,
      message: error,
      file: file || 'unknown',
      timestamp: new Date().toISOString()
    };
    
    // Extract import information if it's an import error
    const importMatch = error.match(/Failed to resolve import ['"]([^'"]+)['"] from ['"]([^'"]+)['"]/);
    if (importMatch) {
      errorObj.type = 'import-error';
      errorObj.import = importMatch[1];
      errorObj.file = importMatch[2];
    }
    
    // Add to global errors array
    global.viteErrors.push(errorObj);
    
    // Keep only last 50 errors
    if (global.viteErrors.length > 50) {
      global.viteErrors = global.viteErrors.slice(-50);
    }
    
    console.log('[report-vite-error] Error reported:', errorObj);
    
    return NextResponse.json({
      success: true,
      message: 'Error reported successfully',
      error: errorObj
    });
    
  } catch (error) {
    console.error('[report-vite-error] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}