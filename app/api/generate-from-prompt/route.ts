import { NextRequest, NextResponse } from 'next/server';
import { createGroq } from '@ai-sdk/groq';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { appConfig } from '@/config/app.config';
import { getFrameworkTemplate, frameworkTemplates } from '@/lib/framework-templates';

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
    const { prompt, style, model, framework } = await request.json();
    
    if (!prompt) {
      return NextResponse.json({
        success: false,
        error: 'Prompt is required'
      }, { status: 400 });
    }
    
    console.log('[generate-from-prompt] Generating project from prompt:', { prompt, style, model, framework });
    
    const selectedModel = model || appConfig.ai.defaultModel;
    const modelProvider = getModelProvider(selectedModel);
    const selectedFramework = framework || 'auto';
    
    let chosenFramework = selectedFramework;
    let frameworkTemplate = getFrameworkTemplate(selectedFramework);
    
    // If auto is selected, let AI decide the framework
    if (selectedFramework === 'auto') {
      const frameworkDecisionPrompt = `Analyze this project description and choose the best framework (nextjs or vite):

Project Description: "${prompt}"

Choose "nextjs" if:
- SEO is important
- Server-side rendering is needed
- Full-stack features are required
- Complex routing is needed
- Content-heavy application

Choose "vite" if:
- Simple single-page application
- Fast development is prioritized
- Interactive/app-like project
- No SSR needed
- Component-heavy application

Respond with just the framework name: "nextjs" or "vite"`;

      const frameworkDecision = await generateText({
        model: modelProvider,
        prompt: frameworkDecisionPrompt,
        temperature: 0.3,
        maxTokens: 50,
      });

      const decidedFramework = frameworkDecision.text.toLowerCase().trim();
      if (decidedFramework.includes('nextjs') || decidedFramework.includes('next')) {
        chosenFramework = 'nextjs';
      } else {
        chosenFramework = 'vite';
      }
      
      frameworkTemplate = getFrameworkTemplate(chosenFramework);
      console.log(`[generate-from-prompt] AI chose framework: ${chosenFramework}`);
    }

    if (!frameworkTemplate) {
      return NextResponse.json({
        success: false,
        error: 'Invalid framework selected'
      }, { status: 400 });
    }

    // Create framework-specific system prompt
    const systemPrompt = `${frameworkTemplate.systemPrompt}

STYLE PREFERENCES:
${style ? `Apply ${style} design principles throughout the application.` : 'Use a clean, modern design approach.'}

IMPORTANT: Generate a complete, working ${frameworkTemplate.name} application based on the user's requirements.

OUTPUT FORMAT:
Provide a JSON response with the following structure:
{
  "projectName": "descriptive-project-name",
  "description": "Brief description of what was built",
  "framework": "${chosenFramework}",
  "files": {
    // Include all necessary files for ${frameworkTemplate.name}
  },
  "mainFeatures": ["feature1", "feature2", "feature3"],
  "techStack": ["${frameworkTemplate.name}", "React", "TypeScript", "Tailwind CSS", "..."]
}

Make sure all files are complete and the application is immediately runnable with the ${frameworkTemplate.name} development server.`;

    const userPrompt = `Create a complete ${frameworkTemplate.name} application based on this description: ${prompt}

Generate all necessary files following the ${frameworkTemplate.name} structure:
${frameworkTemplate.fileStructure.map(file => `- ${file}`).join('\n')}

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
      
      // Fallback: create a basic structure using the template
      const fallbackFiles = { ...frameworkTemplate.defaultFiles };
      
      // Update the main component with the user's prompt
      const mainFile = chosenFramework === 'nextjs' ? 'app/page.tsx' : 'src/App.tsx';
      if (fallbackFiles[mainFile]) {
        fallbackFiles[mainFile] = fallbackFiles[mainFile].replace(
          /This is your custom.*application generated from your prompt\./,
          `This application was generated based on: "${prompt}"`
        );
      }
      
      // Update package.json
      const packageJson = { ...frameworkTemplate.packageJsonTemplate };
      packageJson.name = prompt.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 50) || 'custom-app';
      fallbackFiles['package.json'] = JSON.stringify(packageJson, null, 2);
      
      // Add README
      fallbackFiles['README.md'] = `# ${packageJson.name}

${prompt}

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

Generated with ${frameworkTemplate.name} framework.`;

      generatedProject = {
        projectName: packageJson.name,
        description: `${frameworkTemplate.name} application: ${prompt}`,
        framework: chosenFramework,
        files: fallbackFiles,
        mainFeatures: ["Custom Application"],
        techStack: [frameworkTemplate.name, "React", "TypeScript", "Tailwind CSS"]
      };
    }
    
    // Ensure framework is set in the response
    if (!generatedProject.framework) {
      generatedProject.framework = chosenFramework;
    }
    
    return NextResponse.json({
      success: true,
      project: generatedProject,
      metadata: {
        model: selectedModel,
        style: style || 'default',
        framework: chosenFramework,
        frameworkChosen: selectedFramework === 'auto' ? 'ai-decided' : 'user-selected',
        timestamp: new Date().toISOString(),
        source: 'prompt-based'
      },
      message: `${frameworkTemplate.name} project generated successfully from prompt`
    });
    
  } catch (error) {
    console.error('[generate-from-prompt] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}