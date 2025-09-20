import { NextResponse } from 'next/server';

// DEPRECATED: Use /api/check-dev-errors instead
// This endpoint redirects to the new framework-agnostic error checking
export async function GET() {
  console.log('[check-vite-errors] DEPRECATED: Redirecting to /api/check-dev-errors');
  
  try {
    // Make internal request to the new endpoint
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/check-dev-errors`);
    const data = await response.json();
    
    // Transform response to match old format for backward compatibility
    return NextResponse.json({
      success: data.success,
      errors: data.errors || [],
      message: data.message || 'No development errors detected',
      framework: data.framework,
      deprecated: true,
      newEndpoint: '/api/check-dev-errors'
    });
  } catch (error) {
    // Fallback response
    return NextResponse.json({
      success: true,
      errors: [],
      message: 'No errors detected (fallback)',
      deprecated: true,
      newEndpoint: '/api/check-dev-errors',
      error: (error as Error).message
    });
  }
}