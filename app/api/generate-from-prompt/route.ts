import { NextRequest, NextResponse } from 'next/server';
import { createGroq } from '@ai-sdk/groq';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { appConfig } from '@/config/app.config';

// Force dynamic route
export const dynamic = 'force-dynamic';

// Check if we're using Vercel AI Gateway
const isUsingAIGateway = !!process.env.AI_GATEWAY_API_KEY;
const aiGatewayBaseURL = 'https://ai-gateway.vercel.sh/v1';

const groq = createGroq({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.GROQ_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : undefined,
});

const anthropic = createAnthropic({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.ANTHROPIC_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1'),
});

const googleGenerativeAI = createGoogleGenerativeAI({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.GEMINI_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : undefined,
});

const openai = createOpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.OPENAI_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : process.env.OPENAI_BASE_URL,
});

function getModelProvider(model: string) {
  if (model.startsWith('llama') || model.startsWith('mixtral') || model.startsWith('gemma')) {
    return groq(model);
  } else if (model.startsWith('claude')) {
    return anthropic(model);
  } else if (model.startsWith('gemini')) {
    return googleGenerativeAI(model);
  } else if (model.startsWith('gpt') || model.startsWith('o1')) {
    return openai(model);
  }
  
  // Default fallback
  return groq(appConfig.ai.defaultModel);
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, style, model } = await request.json();
    
    if (!prompt) {
      return NextResponse.json({
        success: false,
        error: 'Prompt is required'
      }, { status: 400 });
    }
    
    console.log('[generate-from-prompt] Generating project from prompt:', { prompt, style, model });
    
    const selectedModel = model || appConfig.ai.defaultModel;
    const modelProvider = getModelProvider(selectedModel);
    
    // Create a comprehensive system prompt for generating a complete web application
    const systemPrompt = `You are an expert web developer who creates complete, modern web applications. Based on the user's prompt, you will generate a full-stack web application with proper structure, styling, and functionality.

IMPORTANT GUIDELINES:
1. Create a complete, working application - not just components
2. Use modern React with TypeScript and Tailwind CSS
3. Include proper file structure with multiple components
4. Add realistic content and functionality
5. Make it visually appealing and responsive
6. Include proper error handling and loading states
7. Use modern patterns like hooks, context, and proper state management
8. Add interactive features where appropriate

STYLE PREFERENCES:
${style ? `Apply ${style} design principles throughout the application.` : 'Use a clean, modern design approach.'}

OUTPUT FORMAT:
Provide a JSON response with the following structure:
{
  "projectName": "descriptive-project-name",
  "description": "Brief description of what was built",
  "files": {
    "src/App.tsx": "// Main App component code",
    "src/components/ComponentName.tsx": "// Component code",
    "src/styles/globals.css": "// Global styles",
    "package.json": "// Package.json with dependencies",
    "README.md": "// Project documentation"
  },
  "mainFeatures": ["feature1", "feature2", "feature3"],
  "techStack": ["React", "TypeScript", "Tailwind CSS", "..."]
}

Make sure all files are complete and the application is immediately runnable.`;

    const userPrompt = `Create a complete web application based on this description: ${prompt}

Please generate all necessary files for a working application including:
- Main App component
- Multiple reusable components
- Proper styling with Tailwind CSS
- Package.json with all required dependencies
- README with setup instructions
- Any additional files needed for the application to work

Make it production-ready with proper error handling, loading states, and responsive design.`;

    const result = await generateText({
      model: modelProvider,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
      maxTokens: 4000,
    });

    // Try to parse the JSON response
    let generatedProject;
    try {
      // Extract JSON from the response (in case there's additional text)
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        generatedProject = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('[generate-from-prompt] Failed to parse JSON response:', parseError);
      
      // Fallback: create a basic structure
      generatedProject = {
        projectName: "custom-app",
        description: "Custom application generated from prompt",
        files: {
          "src/App.tsx": `import React from 'react';

function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">
          Custom Application
        </h1>
        <p className="text-gray-600">
          ${prompt}
        </p>
      </div>
    </div>
  );
}

export default App;`,
          "package.json": JSON.stringify({
            "name": "custom-app",
            "version": "0.1.0",
            "private": true,
            "dependencies": {
              "react": "^18.2.0",
              "react-dom": "^18.2.0",
              "typescript": "^4.9.5"
            },
            "scripts": {
              "start": "react-scripts start",
              "build": "react-scripts build",
              "test": "react-scripts test",
              "eject": "react-scripts eject"
            }
          }, null, 2)
        },
        mainFeatures: ["Basic React App"],
        techStack: ["React", "TypeScript"]
      };
    }
    
    return NextResponse.json({
      success: true,
      project: generatedProject,
      metadata: {
        model: selectedModel,
        style: style || 'default',
        timestamp: new Date().toISOString(),
        source: 'prompt-based'
      },
      message: 'Project generated successfully from prompt'
    });
    
  } catch (error) {
    console.error('[generate-from-prompt] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}