import { useCallback } from 'react';
import { useSandboxState } from './useSandboxState';
import { useChatState } from './useChatState';
import { useSandbox } from './useSandbox';

interface SandboxData {
  sandboxId: string;
  url: string;
  template?: string;
  templateSource?: 'bundled' | 'github' | 'fallback' | 'e2b-template';
  skipTemplateSetup?: boolean;
  [key: string]: any;
}

/**
 * Hook for generation utility functions
 * Consolidates downloadZip, reapplyLastGeneration, and other utilities
 */
export function useGenerationUtils(applyGeneratedCode: (code: string, isEdit: boolean, overrideSandboxData?: SandboxData) => Promise<void>) {
  const { sandboxData, loading, setLoading } = useSandboxState();
  const { conversationContext } = useChatState();
  const { log, addChatMessage } = useSandbox();

  /**
   * Download the sandbox project as a ZIP file
   */
  const downloadZip = useCallback(async () => {
    if (!sandboxData) {
      addChatMessage('Please wait for the sandbox to be created before downloading.', 'system');
      return;
    }
    
    setLoading(true);
    log('Creating zip file...');
    addChatMessage('Creating ZIP file of your Vite app...', 'system');
    
    try {
      const response = await fetch('/api/create-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      if (data.success) {
        log('Zip file created!');
        addChatMessage('ZIP file created! Download starting...', 'system');
        
        const link = document.createElement('a');
        link.href = data.dataUrl;
        link.download = data.fileName || 'e2b-project.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        addChatMessage(
          'Your Vite app has been downloaded! To run it locally:\n' +
          '1. Unzip the file\n' +
          '2. Run: npm install\n' +
          '3. Run: npm run dev\n' +
          '4. Open http://localhost:5173',
          'system'
        );
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      log(`Failed to create zip: ${error.message}`, 'error');
      addChatMessage(`Failed to create ZIP: ${error.message}`, 'system');
    } finally {
      setLoading(false);
    }
  }, [sandboxData, setLoading, log, addChatMessage]);

  /**
   * Re-apply the last generated code
   */
  const reapplyLastGeneration = useCallback(async () => {
    if (!conversationContext.lastGeneratedCode) {
      addChatMessage('No previous generation to re-apply', 'system');
      return;
    }
    
    if (!sandboxData) {
      addChatMessage('Please create a sandbox first', 'system');
      return;
    }
    
    addChatMessage('Re-applying last generation...', 'system');
    const isEdit = conversationContext.appliedCode.length > 0;
    await applyGeneratedCode(conversationContext.lastGeneratedCode, isEdit);
  }, [conversationContext, sandboxData, addChatMessage, applyGeneratedCode]);

  return {
    downloadZip,
    reapplyLastGeneration
  };
}
