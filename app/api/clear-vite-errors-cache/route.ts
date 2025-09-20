import { NextResponse } from 'next/server';

// DEPRECATED: Use /api/clear-dev-errors-cache instead

declare global {
  var viteErrorsCache: { errors: any[], timestamp: number } | null;
}

export async function POST() {
  console.log('[clear-vite-errors-cache] DEPRECATED: Redirecting to /api/clear-dev-errors-cache');
  
  try {
    // Make internal request to the new endpoint
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/clear-dev-errors-cache`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    
    // Also clear legacy cache for backward compatibility
    global.viteErrorsCache = null;
    
    return NextResponse.json({
      success: data.success,
      message: data.message || 'Development errors cache cleared',
      framework: data.framework,
      deprecated: true,
      newEndpoint: '/api/clear-dev-errors-cache'
    });
    
  } catch (error) {
    // Fallback to legacy behavior
    global.viteErrorsCache = null;
    
    return NextResponse.json({
      success: true,
      message: 'Cache cleared (fallback)',
      deprecated: true,
      newEndpoint: '/api/clear-dev-errors-cache',
      error: (error as Error).message
    });
  }
}