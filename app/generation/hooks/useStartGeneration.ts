import { useCallback } from 'react';
import { useSandboxState } from './useSandboxState';
import { useChatState } from './useChatState';
import { useUIState } from './useUIState';
import { useGenerationState } from './useGenerationState';
import { useSandbox } from './useSandbox';
import { STYLE_PATTERNS } from '../constants/generation';

interface SandboxData {
  sandboxId: string;
  url: string;
  template?: string;
  templateSource?: 'bundled' | 'github' | 'fallback' | 'e2b-template';
  skipTemplateSetup?: boolean;
  [key: string]: any;
}

interface ScrapeData {
  success: boolean;
  content?: string;
  url?: string;
  title?: string;
  source?: string;
  screenshot?: string;
  structured?: any;
  metadata?: any;
  message?: string;
  error?: string;
}

interface UseStartGenerationProps {
  createSandbox: (fromHomeScreen?: boolean, templateName?: string, skipAutoFetchFiles?: boolean) => Promise<SandboxData | null>;
  captureUrlScreenshot: (url: string) => void;
  applyGeneratedCode: (code: string, isEdit: boolean, overrideSandboxData?: SandboxData) => Promise<void>;
}

/**
 * Hook for the main code generation flow
 * Handles URL cloning and brand extension modes
 */
export function useStartGeneration({
  createSandbox,
  captureUrlScreenshot,
  applyGeneratedCode
}: UseStartGenerationProps) {
  const { sandboxData, structureContent } = useSandboxState();
  const { 
    setChatMessages,
    conversationContext, 
    setConversationContext,
    setAiChatInput 
  } = useChatState();
  const {
    homeUrlInput,
    homeContextInput,
    setHomeScreenFading,
    setShowHomeScreen,
    setActiveTab,
    setUrlInput,
    setUrlOverlayVisible,
    setUrlStatus,
    aiModel,
    setPromptInput,
    setHomeContextInput
  } = useUIState();
  const {
    setIsStartingNewGeneration,
    setLoadingStage,
    setShowLoadingBackground,
    setIsPreparingDesign,
    setIsScreenshotLoaded,
    setUrlScreenshot,
    setTargetUrl,
    setScreenshotError,
    generationProgress,
    setGenerationProgress
  } = useGenerationState();
  const { addChatMessage } = useSandbox();

  const startGeneration = useCallback(async () => {
    if (!homeUrlInput.trim()) return;
    
    setHomeScreenFading(true);
    
    // Set immediate loading state for better UX
    setIsStartingNewGeneration(true);
    setLoadingStage('gathering');
    
    // Immediately switch to preview tab to show loading
    setActiveTab('preview');
    
    // Set loading background to ensure proper visual feedback
    setShowLoadingBackground(true);
    
    // Clear messages and immediately show the initial message
    setChatMessages([]);
    let displayUrl = homeUrlInput.trim();
    if (!displayUrl.match(/^https?:\/\//i)) {
      displayUrl = 'https://' + displayUrl;
    }
    // Remove protocol for cleaner display
    const cleanUrl = displayUrl.replace(/^https?:\/\//i, '');

    // Check if we're in brand extension mode
    const brandExtensionMode = sessionStorage.getItem('brandExtensionMode') === 'true';

    addChatMessage(
      brandExtensionMode
        ? `Analyzing brand from ${cleanUrl}...`
        : `Starting to clone ${cleanUrl}...`,
      'system'
    );
    
    // Start creating sandbox and capturing screenshot immediately in parallel
    const sandboxPromise = !sandboxData ? createSandbox(true) : Promise.resolve(null);
    
    // Set loading stage immediately before hiding home screen
    setLoadingStage('gathering');
    // Also ensure we're on preview tab to show the loading overlay
    setActiveTab('preview');
    
    // Always capture screenshot for new URLs, even if sandbox exists
    // This ensures the loading screen shows properly
    captureUrlScreenshot(displayUrl);
    
    setTimeout(async () => {
      setShowHomeScreen(false);
      setHomeScreenFading(false);
      
      // Clear the starting flag after transition
      setTimeout(() => {
        setIsStartingNewGeneration(false);
      }, 1000);
      
      // Wait for sandbox to be ready (if it's still creating)
      const createdSandbox = await sandboxPromise;
      
      // Now start the clone process which will stream the generation
      setUrlInput(homeUrlInput);
      setUrlOverlayVisible(false); // Make sure overlay is closed
      setUrlStatus(['Scraping website content...']);
      
      try {
        // Scrape the website
        let url = homeUrlInput.trim();
        if (!url.match(/^https?:\/\//i)) {
          url = 'https://' + url;
        }

        // Check if we're in brand extension mode
        const brandExtensionMode = sessionStorage.getItem('brandExtensionMode') === 'true';
        const brandExtensionPrompt = sessionStorage.getItem('brandExtensionPrompt') || '';

        // Screenshot is already being captured in parallel above

        let scrapeData: ScrapeData | undefined;
        let brandGuidelines: any;

        if (brandExtensionMode) {
          // === BRAND EXTENSION MODE ===
          addChatMessage('Extracting brand styles from the website...', 'system');

          // Call the brand extraction endpoint
          const extractResponse = await fetch('/api/extract-brand-styles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url,
              prompt: brandExtensionPrompt
            })
          });

          if (!extractResponse.ok) {
            throw new Error('Failed to extract brand styles');
          }

          brandGuidelines = await extractResponse.json();

          if (!brandGuidelines.success) {
            throw new Error(brandGuidelines.error || 'Failed to extract brand styles');
          }

          // Display branding summary with visual UI
          addChatMessage(`Acquired branding format from ${cleanUrl}`, 'system', {
            brandingData: brandGuidelines.guidelines,
            sourceUrl: cleanUrl
          });
          addChatMessage(`Building your custom component using these brand guidelines...`, 'system');

          // Clear the flags after use
          sessionStorage.removeItem('brandExtensionMode');
          sessionStorage.removeItem('brandExtensionPrompt');

        } else {
          // === NORMAL CLONE MODE ===
          // Check if we have pre-scraped markdown content from search results
          const storedMarkdown = sessionStorage.getItem('siteMarkdown');
        if (storedMarkdown) {
          // Use the pre-scraped content
          scrapeData = {
            success: true,
            content: storedMarkdown,
            title: new URL(url).hostname,
            source: 'search-result'
          };
          sessionStorage.removeItem('siteMarkdown'); // Clear after use
          addChatMessage('Using cached content from search results...', 'system');
        } else {
          // Perform fresh scraping
          const scrapeResponse = await fetch('/api/scrape-url-enhanced', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
          });
          
          if (!scrapeResponse.ok) {
            throw new Error('Failed to scrape website');
          }
          
          scrapeData = await scrapeResponse.json() as ScrapeData;
          
          if (!scrapeData.success) {
            throw new Error(scrapeData.error || 'Failed to scrape website');
          }
        }
        }

        setUrlStatus(brandExtensionMode ? ['Brand styles extracted!', 'Building your component...'] : ['Website scraped successfully!', 'Generating React app...']);

        // Clear preparing design state and switch to generation tab
        setIsPreparingDesign(false);
        setIsScreenshotLoaded(false); // Reset loaded state
        setUrlScreenshot(null); // Clear screenshot when starting generation
        setTargetUrl(''); // Clear target URL

        // Update loading stage to planning
        setLoadingStage('planning');

        // Brief pause before switching to generation tab
        setTimeout(() => {
          setLoadingStage('generating');
          setActiveTab('generation');
        }, 1500);

        // Build the appropriate prompt based on mode
        let prompt;

        if (brandExtensionMode && brandGuidelines) {
          // Brand extension prompt construction
          prompt = buildBrandExtensionPrompt(brandGuidelines, brandExtensionPrompt, url);
          
          // Store brand guidelines in conversation context
          setConversationContext(prev => ({
            ...prev,
            scrapedWebsites: [...prev.scrapedWebsites, {
              url: url,
              content: { brandGuidelines },
              timestamp: new Date()
            }],
            currentProject: `Custom build using ${url} brand`
          }));
        } else {
          // Normal clone mode
          if (!scrapeData) {
            throw new Error('Scrape data is missing');
          }
          
          prompt = buildClonePrompt(scrapeData, url, homeContextInput);
          
          // Store scraped data in conversation context
          setConversationContext(prev => ({
            ...prev,
            scrapedWebsites: [...prev.scrapedWebsites, {
              url: url,
              content: scrapeData,
              timestamp: new Date()
            }],
            currentProject: `${url} Clone`
          }));
        }

        // Initialize generation progress
        setGenerationProgress(prev => ({
          isGenerating: true,
          status: 'Initializing AI...',
          components: [],
          currentComponent: 0,
          streamedCode: '',
          isStreaming: true,
          isThinking: false,
          thinkingText: undefined,
          thinkingDuration: undefined,
          files: prev.files || [],
          currentFile: undefined,
          lastProcessedPosition: 0
        }));
        
        // Call AI generation API
        const aiResponse = await fetch('/api/generate-ai-code-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            prompt,
            model: aiModel,
            context: {
              sandboxId: sandboxData?.sandboxId,
              structure: structureContent,
              conversationContext: conversationContext
            }
          })
        });
        
        if (!aiResponse.ok || !aiResponse.body) {
          throw new Error('Failed to generate code');
        }
        
        // Process SSE stream
        const reader = aiResponse.body.getReader();
        const decoder = new TextDecoder();
        let generatedCode = '';
        let explanation = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === 'status') {
                  setGenerationProgress(prev => ({ ...prev, status: data.message }));
                } else if (data.type === 'tool-call-start') {
                  // Tool call is starting - show immediate feedback
                  addChatMessage(
                    data.message,
                    'system',
                    { 
                      toolName: data.tool, 
                      toolCallId: data.toolCallId,
                      isStarting: true
                    }
                  );
                  setGenerationProgress(prev => ({ 
                    ...prev, 
                    status: data.message,
                    currentToolCall: {
                      tool: data.tool,
                      toolCallId: data.toolCallId,
                      startTime: Date.now()
                    }
                  }));
                } else if (data.type === 'tool-call-progress') {
                  // Tool call arguments are being streamed
                  if (data.tool === 'writeFile' && data.path) {
                    // Update the message to show file path
                    addChatMessage(
                      data.message,
                      'system',
                      { 
                        toolName: data.tool, 
                        toolCallId: data.toolCallId,
                        path: data.path,
                        bytesWritten: data.bytesWritten
                      }
                    );
                    setGenerationProgress(prev => ({ 
                      ...prev, 
                      status: data.message,
                      currentFile: { path: data.path, content: '', type: 'javascript' }
                    }));
                  } else if (data.tool === 'installPackages' && data.package) {
                    addChatMessage(
                      data.message,
                      'system',
                      { 
                        toolName: data.tool, 
                        toolCallId: data.toolCallId,
                        package: data.package
                      }
                    );
                  }
                } else if (data.type === 'tool-call-complete') {
                  // Tool call finished
                  setGenerationProgress(prev => ({ 
                    ...prev, 
                    currentToolCall: undefined
                  }));
                } else if (data.type === 'tool-call') {
                  // Legacy: Handle tool call events (from onStepFinish)
                  const toolIcons: Record<string, string> = {
                    writeFile: '📝',
                    installPackages: '📦'
                  };
                  const toolIcon = toolIcons[data.tool] || '🔧';
                  
                  let toolMessage = '';
                  if (data.tool === 'writeFile') {
                    toolMessage = `Writing file: ${data.args.path}`;
                  } else if (data.tool === 'installPackages') {
                    toolMessage = `Installing packages: ${data.args.packages.join(', ')}`;
                  } else {
                    toolMessage = `${data.tool}(${JSON.stringify(data.args)})`;
                  }
                  
                  addChatMessage(
                    `${toolIcon} ${toolMessage}`,
                    'system',
                    { 
                      toolName: data.tool, 
                      args: data.args,
                      result: data.result 
                    }
                  );
                } else if (data.type === 'thinking') {
                  setGenerationProgress(prev => ({ 
                    ...prev, 
                    isThinking: true,
                    thinkingText: (prev.thinkingText || '') + data.text
                  }));
                } else if (data.type === 'thinking_complete') {
                  setGenerationProgress(prev => ({ 
                    ...prev, 
                    isThinking: false,
                    thinkingDuration: data.duration
                  }));
                } else if (data.type === 'conversation') {
                  // Add conversational text to chat
                  let text = data.text || '';
                  text = text.replace(/<package>[^<]*<\/package>/g, '');
                  text = text.replace(/<packages>[^<]*<\/packages>/g, '');
                  
                  if (!text.includes('<file') && !text.includes('</file>') &&
                      !text.includes('<package') && !text.includes('</package') &&
                      !text.includes('<explanation') && !text.includes('</explanation') &&
                      !text.includes('import React') && 
                      !text.includes('export default') && !text.includes('className=') &&
                      text.trim().length > 0) {
                    addChatMessage(text.trim(), 'ai');
                  }
                } else if (data.type === 'stream' && data.raw) {
                  processStreamChunk(data, setGenerationProgress);
                } else if (data.type === 'complete') {
                  generatedCode = data.generatedCode;
                  explanation = data.explanation;

                  if (data.packagesToInstall && data.packagesToInstall.length > 0) {
                    console.log('[generate-code] Packages to install from tools:', data.packagesToInstall);
                    (window as any).pendingPackages = data.packagesToInstall;
                  }
                  
                  setConversationContext(prev => ({
                    ...prev,
                    lastGeneratedCode: generatedCode
                  }));
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', e);
              }
            }
          }
        }
        
        // Complete generation
        setGenerationProgress(prev => ({
          ...prev,
          isGenerating: false,
          isStreaming: false,
          status: 'Generation complete!'
        }));
        
        if (generatedCode) {
          addChatMessage('AI recreation generated!', 'system');
          
          if (explanation && explanation.trim()) {
            addChatMessage(explanation, 'ai');
          }
          
          setPromptInput(generatedCode);
          await applyGeneratedCode(generatedCode, false);

          addChatMessage(
            brandExtensionMode
              ? `Successfully built your custom component using ${cleanUrl}'s brand guidelines! You can now ask me to modify it or add more features.`
              : `Successfully recreated ${url} as a modern React app${homeContextInput ? ` with your requested context: "${homeContextInput}"` : ''}! The scraped content is now in my context, so you can ask me to modify specific sections or add features based on the original site.`,
            'ai',
            {
              scrapedUrl: url,
              scrapedContent: brandExtensionMode ? { brandGuidelines } : scrapeData,
              generatedCode: generatedCode
            }
          );
          
          setConversationContext(prev => ({
            ...prev,
            generatedComponents: [],
            appliedCode: [...prev.appliedCode, {
              files: [],
              timestamp: new Date()
            }]
          }));
        } else {
          throw new Error('Failed to generate recreation');
        }
        
        // Cleanup
        setUrlInput('');
        setUrlStatus([]);
        setHomeContextInput('');
        setIsScreenshotLoaded(false);
        setUrlScreenshot(null);
        setIsPreparingDesign(false);
        setTargetUrl('');
        setScreenshotError(null);
        setLoadingStage(null);
        setIsStartingNewGeneration(false);
        setShowLoadingBackground(false);
        
        setTimeout(() => {
          setActiveTab('preview');
        }, 1000);
      } catch (error: any) {
        addChatMessage(`Failed to clone website: ${error.message}`, 'system');
        setUrlStatus([]);
        setIsPreparingDesign(false);
        setIsStartingNewGeneration(false);
        setLoadingStage(null);
        setGenerationProgress(prev => ({
          ...prev,
          isGenerating: false,
          isStreaming: false,
          status: '',
          files: prev.files
        }));
      }
    }, 500);
  }, [
    homeUrlInput, homeContextInput, sandboxData, structureContent, conversationContext, aiModel,
    setHomeScreenFading, setShowHomeScreen, setActiveTab, setIsStartingNewGeneration,
    setLoadingStage, setShowLoadingBackground, setChatMessages, setUrlInput,
    setUrlOverlayVisible, setUrlStatus, setIsPreparingDesign, setIsScreenshotLoaded,
    setUrlScreenshot, setTargetUrl, setScreenshotError, setGenerationProgress,
    setConversationContext, setPromptInput, setHomeContextInput,
    createSandbox, captureUrlScreenshot, applyGeneratedCode, addChatMessage
  ]);

  return { startGeneration };
}

// Helper functions
function buildBrandExtensionPrompt(brandGuidelines: any, brandExtensionPrompt: string, url: string): string {
  const branding = brandGuidelines.guidelines;
  
  const brandInstructions = `
BRAND GUIDELINES FROM ${url}:

COLOR SYSTEM:
- Color Scheme: ${branding.colorScheme || 'light'} mode
- Primary Color: ${branding.colors?.primary || 'not specified'}
- Accent Color: ${branding.colors?.accent || 'not specified'}
- Background: ${branding.colors?.background || 'not specified'}
- Text Primary: ${branding.colors?.textPrimary || 'not specified'}
- Link Color: ${branding.colors?.link || 'not specified'}

TYPOGRAPHY:
- Primary Font: ${branding.typography?.fontFamilies?.primary || 'system default'}
- Heading Font: ${branding.typography?.fontFamilies?.heading || 'system default'}
- Font Stack (Body): ${branding.typography?.fontStacks?.body?.join(', ') || 'system-ui, sans-serif'}
- Font Stack (Heading): ${branding.typography?.fontStacks?.heading?.join(', ') || 'system-ui, sans-serif'}
- H1 Size: ${branding.typography?.fontSizes?.h1 || '36px'}
- H2 Size: ${branding.typography?.fontSizes?.h2 || '30px'}
- Body Size: ${branding.typography?.fontSizes?.body || '16px'}

SPACING & LAYOUT:
- Base Spacing Unit: ${branding.spacing?.baseUnit || '4'}px
- Border Radius: ${branding.spacing?.borderRadius || '6px'}

BUTTON STYLES:
Primary Button:
  - Background: ${branding.components?.buttonPrimary?.background || branding.colors?.primary}
  - Text Color: ${branding.components?.buttonPrimary?.textColor || '#FFFFFF'}
  - Border Radius: ${branding.components?.buttonPrimary?.borderRadius || branding.spacing?.borderRadius || '8px'}
  - Shadow: ${branding.components?.buttonPrimary?.shadow || 'none'}

Secondary Button:
  - Background: ${branding.components?.buttonSecondary?.background || '#F9F9F9'}
  - Text Color: ${branding.components?.buttonSecondary?.textColor || branding.colors?.textPrimary}
  - Border Radius: ${branding.components?.buttonSecondary?.borderRadius || branding.spacing?.borderRadius || '8px'}
  - Shadow: ${branding.components?.buttonSecondary?.shadow || 'none'}

INPUT FIELDS:
- Border Color: ${branding.components?.input?.borderColor || '#CCCCCC'}
- Border Radius: ${branding.components?.input?.borderRadius || branding.spacing?.borderRadius || '6px'}

BRAND PERSONALITY:
- Tone: ${branding.personality?.tone || 'professional'}
- Energy: ${branding.personality?.energy || 'medium'}
- Target Audience: ${branding.personality?.targetAudience || 'general'}

DESIGN SYSTEM:
- Framework: ${branding.designSystem?.framework || 'tailwind'}
- Component Library: ${branding.designSystem?.componentLibrary || 'custom'}

ASSETS:
${branding.images?.logo ? `- Logo Available: Yes (use carefully if needed)` : '- Logo: Not available'}
${branding.images?.favicon ? `- Favicon: ${branding.images.favicon}` : ''}`;

  return `I want you to build a NEW React component/application based on these brand guidelines and the user's requirements.

<branding-format source="${url}">
${brandInstructions}

RAW BRAND DATA (for reference):
${JSON.stringify(branding, null, 2)}
</branding-format>

USER'S REQUEST:
${brandExtensionPrompt || 'Build a modern web component using these brand guidelines'}

IMPORTANT: The content above in the <branding-format> tags contains the extracted brand guidelines from ${url}.
Use these guidelines (colors, fonts, spacing, design patterns) to build what the user requested.

CRITICAL REQUIREMENTS:
- DO NOT recreate the original website at ${url}
- DO create a COMPLETELY NEW component that fulfills the user's request
- The user wants: "${brandExtensionPrompt}"
- Build ONLY what the user requested - nothing more
- App.jsx should render ONLY the requested component - no extra Header/Footer/Hero unless specifically requested
- Make it a minimal, focused implementation of the user's request

STYLING REQUIREMENTS:
- Apply the EXACT colors from the brand palette (primary, accent, background, text colors)
- Use the EXACT typography (font families, font sizes for h1, h2, body)
- Apply the spacing system (base unit: ${branding.spacing?.baseUnit || '4'}px)
- Use the specified border radius (${branding.spacing?.borderRadius || '6px'}) consistently
- Implement button styles EXACTLY as specified (colors, shadows, border radius)
- Style input fields with the exact border color and border radius
- Match the brand's ${branding.colorScheme || 'light'} color scheme
- Apply the brand personality: ${branding.personality?.tone || 'professional'} tone with ${branding.personality?.energy || 'medium'} energy
- Use Tailwind CSS with inline color values matching the brand palette EXACTLY
- If fonts need to be imported, add @import or @font-face rules to index.css
- Create custom CSS classes in index.css for complex shadows/effects that can't be done with Tailwind

FONT SETUP:
${branding.typography?.fontFamilies?.primary ? `
- Add font family "${branding.typography.fontFamilies.primary}" to your CSS
- Use font stack: ${branding.typography?.fontStacks?.body?.join(', ') || 'system-ui, sans-serif'}
- Set body font size to ${branding.typography?.fontSizes?.body || '16px'}` : '- Use system fonts'}

COMPONENT STRUCTURE:
- src/index.css - Include brand fonts, custom shadows/effects, and base styling
- src/App.jsx - Should ONLY render the requested component (e.g., just <PricingPage /> if user wants pricing)
- src/components/[RequestedComponent].jsx - The actual component fulfilling the user's request

TECHNICAL REQUIREMENTS:
- Create a WORKING, self-contained application
- DO NOT import components that don't exist
- Make sure the app renders immediately with visible content
- All colors must match the brand palette EXACTLY
- All spacing must use the ${branding.spacing?.baseUnit || '4'}px base unit
- Buttons must have the exact styling specified in the guidelines

Focus on building something NEW, minimal, and functional that perfectly matches the ${brandGuidelines.styleName || 'brand'} aesthetic and design system.`;
}

function buildClonePrompt(scrapeData: ScrapeData, url: string, homeContextInput: string): string {
  // Filter out style-related context
  let filteredContext = homeContextInput;
  if (url && homeContextInput) {
    const startsWithStyle = STYLE_PATTERNS.some(pattern =>
      homeContextInput.trim().startsWith(pattern)
    );

    if (startsWithStyle) {
      const additionalMatch = homeContextInput.match(/\. (.+)$/);
      filteredContext = additionalMatch ? additionalMatch[1] : '';
    }
  }

  return `I want to recreate the ${url} website as a complete React application based on the scraped content below.

${JSON.stringify(scrapeData, null, 2)}

${filteredContext ? `ADDITIONAL CONTEXT/REQUIREMENTS FROM USER:
${filteredContext}

Please incorporate these requirements into the design and implementation.` : ''}

IMPORTANT INSTRUCTIONS:
- Create a COMPLETE, working React application
- Implement ALL sections and features from the original site
- Use Tailwind CSS for all styling (no custom CSS files)
- Make it responsive and modern
- Ensure all text content matches the original
- Create proper component structure
- Make sure the app actually renders visible content
- Create ALL components that you reference in imports
${filteredContext ? '- Apply the user\'s context/theme requirements throughout the application' : ''}

Focus on the key sections and content, making it clean and modern.`;
}

function processStreamChunk(data: any, setGenerationProgress: any) {
  setGenerationProgress((prev: any) => {
    const newStreamedCode = prev.streamedCode + data.text;
    
    const updatedState = { 
      ...prev, 
      streamedCode: newStreamedCode,
      isStreaming: true,
      isThinking: false,
      status: 'Generating code...'
    };
    
    // Process complete files from the accumulated stream
    const fileRegex = /<file path="([^"]+)">([^]*?)<\/file>/g;
    let match;
    const processedFiles = new Set(prev.files.map((f: any) => f.path));
    
    while ((match = fileRegex.exec(newStreamedCode)) !== null) {
      const filePath = match[1];
      const fileContent = match[2];
      
      if (!processedFiles.has(filePath)) {
        const fileExt = filePath.split('.').pop() || '';
        const fileType = fileExt === 'jsx' || fileExt === 'js' ? 'javascript' :
                        fileExt === 'css' ? 'css' :
                        fileExt === 'json' ? 'json' :
                        fileExt === 'html' ? 'html' : 'text';
        
        const existingFileIndex = updatedState.files.findIndex((f: any) => f.path === filePath);
        
        if (existingFileIndex >= 0) {
          updatedState.files = [
            ...updatedState.files.slice(0, existingFileIndex),
            {
              ...updatedState.files[existingFileIndex],
              content: fileContent.trim(),
              type: fileType,
              completed: true,
              edited: true
            },
            ...updatedState.files.slice(existingFileIndex + 1)
          ];
        } else {
          updatedState.files = [...updatedState.files, {
            path: filePath,
            content: fileContent.trim(),
            type: fileType,
            completed: true,
            edited: false
          }];
        }
        
        if (!prev.isEdit) {
          updatedState.status = `Completed ${filePath}`;
        }
        processedFiles.add(filePath);
      }
    }
    
    // Check for current file being generated
    const lastFileMatch = newStreamedCode.match(/<file path="([^"]+)">([^]*?)$/);
    if (lastFileMatch && !lastFileMatch[0].includes('</file>')) {
      const filePath = lastFileMatch[1];
      const partialContent = lastFileMatch[2];
      
      if (!processedFiles.has(filePath)) {
        const fileExt = filePath.split('.').pop() || '';
        const fileType = fileExt === 'jsx' || fileExt === 'js' ? 'javascript' :
                        fileExt === 'css' ? 'css' :
                        fileExt === 'json' ? 'json' :
                        fileExt === 'html' ? 'html' : 'text';
        
        updatedState.currentFile = { 
          path: filePath, 
          content: partialContent, 
          type: fileType 
        };
        if (!prev.isEdit) {
          updatedState.status = `Generating ${filePath}`;
        }
      }
    } else {
      updatedState.currentFile = undefined;
    }
    
    return updatedState;
  });
}
