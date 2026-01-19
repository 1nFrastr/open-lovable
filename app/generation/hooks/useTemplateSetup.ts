import { useCallback, RefObject } from 'react';
import { useSandboxState } from './useSandboxState';
import { useChatState } from './useChatState';
import { useUIState } from './useUIState';
import { useGenerationState } from './useGenerationState';
import { useSandbox } from './useSandbox';
import type { PreviewPaneRef } from '../components/PreviewPane';

interface SandboxData {
  sandboxId: string;
  url: string;
  template?: string;
  templateSource?: 'bundled' | 'github' | 'fallback' | 'e2b-template';
  skipTemplateSetup?: boolean;
  [key: string]: any;
}

interface UseTemplateSetupProps {
  previewPaneRef: RefObject<PreviewPaneRef | null>;
  fetchSandboxFiles: () => Promise<void>;
}

/**
 * Hook for template setup logic
 * Downloads template files and applies them to sandbox
 */
export function useTemplateSetup({ previewPaneRef, fetchSandboxFiles }: UseTemplateSetupProps) {
  const { sandboxData } = useSandboxState();
  const { setConversationContext, setAiChatInput } = useChatState();
  const { setActiveTab } = useUIState();
  const { setPendingAutoSendMessage } = useGenerationState();
  const { addChatMessage } = useSandbox();

  const handleTemplateSetup = useCallback(async (
    templateName: string,
    projectTitle: string,
    userPrompt: string,
    newSandboxData?: SandboxData | null
  ) => {
    console.log('[handleTemplateSetup] Starting template setup:', templateName);
    console.log('[handleTemplateSetup] Sandbox data:', newSandboxData?.sandboxId, newSandboxData?.url);
    
    try {
      // Get template config
      const { getTemplateByName } = await import('@/config/templates');
      const template = getTemplateByName(templateName);
      
      if (!template || !template.githubRepo) {
        throw new Error(`Template "${templateName}" not found or has no GitHub repo`);
      }
      
      addChatMessage(`Initializing "${projectTitle}" with ${template.label} template...`, 'system');
      
      // Download template files
      console.log('[handleTemplateSetup] Downloading template files from:', template.githubRepo);
      const downloadResponse = await fetch(`/api/download-template?repo=${encodeURIComponent(template.githubRepo)}`);
      
      if (!downloadResponse.ok) {
        throw new Error(`Failed to download template: ${downloadResponse.statusText}`);
      }
      
      const templateFiles = await downloadResponse.json();
      
      if (templateFiles.error) {
        throw new Error(templateFiles.error);
      }
      
      console.log(`[handleTemplateSetup] Downloaded ${templateFiles.length} files`);
      
      // Format files as Open Lovable format
      const { formatAsOpenLovable } = await import('@/lib/template-project');
      const formattedCode = formatAsOpenLovable(templateFiles, projectTitle);
      
      // Wait a moment for sandbox to be fully ready
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Apply the template files to sandbox
      console.log('[handleTemplateSetup] Applying template files to sandbox...');
      console.log('[handleTemplateSetup] Formatted code preview:', formattedCode.substring(0, 500));
      
      const applyResponse = await fetch('/api/apply-ai-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response: formattedCode,
          isEdit: false,
          isTemplateImport: true  // Preserve exact paths from template
        })
      });
      
      const applyResult = await applyResponse.json();
      console.log('[handleTemplateSetup] Apply result:', JSON.stringify(applyResult, null, 2));
      
      if (!applyResult.success) {
        console.error('[handleTemplateSetup] Apply error:', applyResult);
        throw new Error(applyResult.error || applyResult.message || 'Failed to apply template files');
      }
      
      // Check if files were actually written to sandbox
      if (applyResult.message?.includes('Create a sandbox to apply them')) {
        console.error('[handleTemplateSetup] Sandbox not ready for file writes');
        throw new Error('Sandbox not ready. Please try again.');
      }
      
      console.log('[handleTemplateSetup] Template applied successfully');
      console.log('[handleTemplateSetup] Files created:', applyResult.results?.filesCreated);
      
      // Use the passed sandbox data or fall back to state
      const activeSandboxData = newSandboxData || sandboxData;
      
      // Refresh iframe with the correct URL
      const sandboxUrl = activeSandboxData?.url;
      if (previewPaneRef.current && sandboxUrl) {
        console.log('[handleTemplateSetup] Refreshing iframe with URL:', sandboxUrl);
        setTimeout(() => {
          if (previewPaneRef.current) {
            previewPaneRef.current.refreshIframe();
          }
        }, 3000);
      } else {
        console.log('[handleTemplateSetup] Cannot refresh iframe - no URL available');
      }
      
      // Build file list for display
      const fileList = applyResult.results?.filesCreated?.slice(0, 10).join('\n- ') || 
                       templateFiles.slice(0, 10).map((f: any) => f.path).join('\n- ');
      const totalFiles = applyResult.results?.filesCreated?.length || templateFiles.length;
      const moreFiles = totalFiles > 10 ? `\n... and ${totalFiles - 10} more files` : '';
      
      addChatMessage(
        `✅ Template "${template.label}" has been set up successfully!\n\n` +
        `**Project:** ${projectTitle}\n` +
        `**Files created (${totalFiles}):**\n- ${fileList}${moreFiles}\n\n` +
        `The project is ready! You can now describe what you want me to build or modify.`,
        'system'
      );
      
      // Set conversation context to indicate we have an existing project
      setConversationContext(prev => ({
        ...prev,
        currentProject: projectTitle,
        appliedCode: [{
          files: templateFiles.map((f: any) => f.path),
          timestamp: new Date()
        }]
      }));
      
      // Wait for files to sync, then start AI generation
      console.log('[handleTemplateSetup] Template setup complete. Waiting for files to sync...');
      
      // Build the message based on the user's prompt
      const messageToSend = userPrompt && !userPrompt.toLowerCase().includes('create a react') && 
          !userPrompt.toLowerCase().includes('create a vue') &&
          !userPrompt.toLowerCase().includes('create a next')
        ? `Based on the ${template.label} template, ${userPrompt}`
        : userPrompt;
      
      // Sync files, switch to generation tab, and start AI
      setTimeout(async () => {
        console.log('[handleTemplateSetup] Syncing sandbox files before AI generation...');
        await fetchSandboxFiles();
        console.log('[handleTemplateSetup] Files synced, switching to generation tab and starting AI');
        setActiveTab('generation');
        setPendingAutoSendMessage(messageToSend);
      }, 2000);
      
    } catch (error: any) {
      console.error('[handleTemplateSetup] Error:', error);
      addChatMessage(
        `❌ Failed to set up template: ${error.message}\n\n` +
        `The sandbox is ready but the template files could not be loaded.\n` +
        `You can describe what you want to build and I'll create it from scratch.`,
        'error'
      );
      // Pre-fill with user's request so they can easily continue
      setAiChatInput(userPrompt);
    }
  }, [sandboxData, previewPaneRef, fetchSandboxFiles, addChatMessage, setConversationContext, setActiveTab, setPendingAutoSendMessage, setAiChatInput]);

  return { handleTemplateSetup };
}
