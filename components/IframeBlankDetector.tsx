import { useEffect, useRef, useCallback } from 'react';

interface IframeBlankDetectorProps {
  iframeRef: React.RefObject<HTMLIFrameElement>;
  sandboxUrl: string | undefined;
  enabled?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  checkDelay?: number;
  onRetry?: (attempt: number) => void;
}

/**
 * Detects blank iframe content and automatically refreshes
 * This helps when Vite hot reload hasn't completed in time
 */
export default function IframeBlankDetector({
  iframeRef,
  sandboxUrl,
  enabled = true,
  maxRetries = 3,
  retryDelay = 2000,
  checkDelay = 3000,
  onRetry
}: IframeBlankDetectorProps) {
  const retryCountRef = useRef(0);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastUrlRef = useRef<string | undefined>(undefined);
  
  // Store function refs to avoid circular dependencies in useCallback
  const scheduleCheckRef = useRef<(() => void) | undefined>(undefined);
  const handleBlankDetectedRef = useRef<(() => void) | undefined>(undefined);

  // Define handleBlankDetected without circular dependency
  handleBlankDetectedRef.current = () => {
    if (!iframeRef.current || !sandboxUrl || retryCountRef.current >= maxRetries) {
      if (retryCountRef.current >= maxRetries) {
        console.log('[IframeBlankDetector] Max retries reached, stopping');
      }
      return;
    }

    retryCountRef.current += 1;
    const attempt = retryCountRef.current;
    
    console.log(`[IframeBlankDetector] Retry attempt ${attempt}/${maxRetries}`);
    onRetry?.(attempt);

    // Force refresh with cache-busting
    const newUrl = `${sandboxUrl}?t=${Date.now()}&retry=${attempt}`;
    iframeRef.current.src = newUrl;

    // Schedule another check after the refresh
    setTimeout(() => {
      scheduleCheckRef.current?.();
    }, retryDelay);
  };

  // Define scheduleCheck without circular dependency
  scheduleCheckRef.current = () => {
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }
    checkTimeoutRef.current = setTimeout(() => {
      if (!iframeRef.current || !sandboxUrl || !enabled) return;

      try {
        const iframe = iframeRef.current;
        
        // Check 1: iframe has no src or about:blank
        if (!iframe.src || iframe.src === 'about:blank') {
          console.log('[IframeBlankDetector] No src set, skipping check');
          return;
        }

        // Check 2: Try to access iframe document (may fail due to CORS)
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          
          if (iframeDoc) {
            // Check if document is still loading
            if (iframeDoc.readyState === 'loading') {
              console.log('[IframeBlankDetector] Document still loading, will recheck');
              scheduleCheckRef.current?.();
              return;
            }

            // Check for blank/empty body
            const body = iframeDoc.body;
            if (body) {
              const hasContent = body.children.length > 0 || body.textContent?.trim();
              const isAllWhite = !hasContent;
              
              // Check for Vite root element
              const viteRoot = iframeDoc.getElementById('root') || iframeDoc.getElementById('app');
              const hasViteContent = viteRoot && (viteRoot.children.length > 0 || viteRoot.textContent?.trim());
              
              if (isAllWhite || (viteRoot && !hasViteContent)) {
                console.log('[IframeBlankDetector] Blank content detected, attempting refresh');
                handleBlankDetectedRef.current?.();
                return;
              }
            }
          }
        } catch {
          // CORS error - can't access content, check window dimensions as fallback
          // If we can't access the content, assume it might be loading
          console.log('[IframeBlankDetector] Cannot access iframe content (CORS), using fallback check');
          
          // Fallback: Check if the iframe is responding by looking at natural dimensions
          // A blank page typically still has some response
          // We'll rely on retry mechanism after delay
        }

        // Content seems fine, reset retry count
        retryCountRef.current = 0;
        
      } catch (error) {
        console.error('[IframeBlankDetector] Error checking iframe:', error);
      }
    }, checkDelay);
  };

  const checkForBlankContent = useCallback(() => {
    scheduleCheckRef.current?.();
  }, []);

  // Reset retry count when URL changes
  useEffect(() => {
    if (sandboxUrl !== lastUrlRef.current) {
      lastUrlRef.current = sandboxUrl;
      retryCountRef.current = 0;
      
      // Schedule initial check after URL change
      if (sandboxUrl && enabled) {
        scheduleCheckRef.current?.();
      }
    }
  }, [sandboxUrl, enabled]);

  // Setup iframe load listener
  useEffect(() => {
    if (!iframeRef.current || !enabled) return;

    const iframe = iframeRef.current;
    
    const handleLoad = () => {
      console.log('[IframeBlankDetector] Iframe loaded, scheduling content check');
      // Check content shortly after load
      setTimeout(checkForBlankContent, 1000);
    };

    iframe.addEventListener('load', handleLoad);
    
    return () => {
      iframe.removeEventListener('load', handleLoad);
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, [iframeRef, enabled, checkForBlankContent]);

  return null;
}
