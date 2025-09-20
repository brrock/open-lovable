# Unified Framework API System

This document describes the new unified API system that replaces framework-specific routes with framework-agnostic endpoints that automatically detect and work with Next.js, Vite, and Create React App projects.

## Overview

The unified API system provides:
- **Automatic framework detection** based on package.json, config files, and project structure
- **Framework-agnostic endpoints** that work with any supported framework
- **Backward compatibility** with existing Vite-specific routes
- **Extensible architecture** for adding new frameworks in the future

## Supported Frameworks

| Framework | Detection | Dev Command | Build Command | Dev Port |
|-----------|-----------|-------------|---------------|----------|
| **Next.js** | `next` dependency, `next.config.*` | `npm run dev` | `npm run build` | 3000 |
| **Vite** | `vite` dependency, `vite.config.*` | `npm run dev` | `npm run build` | 5173 |
| **Create React App** | `react-scripts` dependency | `npm start` | `npm run build` | 3000 |

## New Unified API Routes

### `/api/check-dev-errors`
**Replaces:** `/api/check-vite-errors`

Checks for development errors across all supported frameworks.

```typescript
GET /api/check-dev-errors

Response:
{
  "success": true,
  "hasErrors": boolean,
  "errors": Array<{
    "type": "npm-missing" | "syntax-error" | "type-error" | "build-error",
    "package"?: string,
    "message": string,
    "file"?: string,
    "framework": string
  }>,
  "framework": "nextjs" | "vite" | "cra",
  "confidence": number,
  "message": string
}
```

### `/api/restart-dev-server`
**Replaces:** `/api/restart-vite`

Restarts the development server for any framework.

```typescript
POST /api/restart-dev-server

Response:
{
  "success": true,
  "message": string,
  "framework": string,
  "command": string,
  "port": number
}
```

### `/api/monitor-dev-logs`
**Replaces:** `/api/monitor-vite-logs`

Monitors development logs and extracts errors, warnings, and info messages.

```typescript
GET /api/monitor-dev-logs

Response:
{
  "success": true,
  "framework": string,
  "frameworkName": string,
  "hasErrors": boolean,
  "hasWarnings": boolean,
  "errors": Array<ErrorObject>,
  "warnings": Array<WarningObject>,
  "info": Array<InfoObject>,
  "summary": {
    "errorCount": number,
    "warningCount": number,
    "lastChecked": string
  }
}
```

### `/api/clear-dev-errors-cache`
**Replaces:** `/api/clear-vite-errors-cache`

Clears the development error cache for the detected framework.

```typescript
POST /api/clear-dev-errors-cache

Response:
{
  "success": true,
  "message": string,
  "framework": string,
  "frameworkName": string,
  "clearedFiles": string[],
  "timestamp": string
}
```

### `/api/report-dev-error`
**Replaces:** `/api/report-vite-error`

Reports a development error to be cached and tracked.

```typescript
POST /api/report-dev-error
Body: {
  "error": string,
  "file"?: string,
  "line"?: number,
  "column"?: number,
  "stack"?: string,
  "type"?: string
}

Response:
{
  "success": true,
  "message": string,
  "framework": string,
  "frameworkName": string,
  "errorId": string,
  "isDuplicate": boolean,
  "totalErrors": number
}
```

### `/api/framework-operations` (New)
**Unified operations endpoint** for all framework-related tasks.

```typescript
POST /api/framework-operations
Body: {
  "operation": "install" | "dev" | "build" | "test" | "lint" | "clean" | "kill" | "status" | "logs",
  "packages"?: string[],
  "args"?: { dev?: boolean, lines?: number },
  "force"?: boolean
}

GET /api/framework-operations
// Returns framework detection info and available operations
```

**Supported Operations:**
- `install` - Install dependencies
- `dev` - Start development server
- `build` - Build for production
- `test` - Run tests
- `lint` - Run linting
- `clean` - Clean build artifacts
- `kill` - Stop development server
- `status` - Check server health
- `logs` - Get recent log entries

## Framework Detection System

The system automatically detects frameworks using:

1. **Package.json Analysis**
   - Dependencies and devDependencies
   - Scripts configuration
   - Framework-specific packages

2. **Config File Detection**
   - `next.config.*` for Next.js
   - `vite.config.*` for Vite
   - `public/index.html` + `src/index.*` for CRA

3. **Process Detection**
   - Running development servers
   - Framework-specific processes

4. **File Structure Analysis**
   - Framework-specific directory patterns
   - Entry point files

## Package Manager Detection

The system detects package managers by checking for lock files:
- `package-lock.json` → npm
- `yarn.lock` → yarn  
- `pnpm-lock.yaml` → pnpm

Commands are automatically adjusted based on the detected package manager.

## Migration Guide

### For Frontend Code

Replace old Vite-specific API calls:

```typescript
// OLD
fetch('/api/check-vite-errors')
fetch('/api/restart-vite', { method: 'POST' })
fetch('/api/monitor-vite-logs')

// NEW
fetch('/api/check-dev-errors')
fetch('/api/restart-dev-server', { method: 'POST' })
fetch('/api/monitor-dev-logs')
```

### For Backend Integration

Use the new unified operations endpoint:

```typescript
// Start dev server
fetch('/api/framework-operations', {
  method: 'POST',
  body: JSON.stringify({ operation: 'dev' })
})

// Install packages
fetch('/api/framework-operations', {
  method: 'POST', 
  body: JSON.stringify({ 
    operation: 'install',
    packages: ['lodash', 'axios']
  })
})

// Get framework info
fetch('/api/framework-operations')
```

## Backward Compatibility

All old Vite-specific routes remain functional but are marked as deprecated:
- They automatically redirect to new endpoints
- Responses include deprecation warnings
- Old response formats are maintained
- Migration path is clearly indicated

## Error Handling

The unified system provides consistent error handling:

```typescript
{
  "success": false,
  "error": "Error message",
  "framework"?: "detected-framework",
  "code"?: "ERROR_CODE"
}
```

## Extending the System

### Adding a New Framework

1. **Add framework config** in `lib/framework-detector.ts`:
```typescript
myframework: {
  name: 'My Framework',
  devCommand: 'npm run dev',
  buildCommand: 'npm run build', 
  // ... other config
}
```

2. **Add command mappings** in `lib/framework-commands.ts`:
```typescript
myframework: {
  install: ['npm install'],
  dev: ['npm run dev'],
  // ... other commands
}
```

3. **Framework is automatically available** in all unified endpoints

### Custom Detection Logic

Override detection logic by implementing custom `detectFramework` function with additional checks for your framework's specific patterns.

## Performance Considerations

- **Caching**: Framework detection results are cached per sandbox
- **Cooldowns**: Operations have built-in cooldowns to prevent spam
- **Async Operations**: Long-running operations (build, install) run in background
- **Log Rotation**: Error logs are automatically rotated to prevent disk usage

## Security

- **Sandbox Isolation**: All operations run within sandbox boundaries
- **Command Validation**: Commands are validated against allowed patterns
- **Input Sanitization**: All user inputs are sanitized before execution
- **Process Limits**: Development servers have resource limits

## Monitoring and Debugging

Enable debug logging:
```bash
DEBUG=framework-* npm run dev
```

Check framework detection:
```bash
curl http://localhost:3000/api/framework-operations
```

Monitor operations:
```bash
curl http://localhost:3000/api/framework-operations \
  -X POST \
  -d '{"operation": "logs"}'
```