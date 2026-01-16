import { useAtom } from 'jotai';
import {
  sandboxDataAtom,
  sandboxFilesAtom,
  sandboxLoadingAtom,
  sandboxStatusAtom,
  fileStructureAtom,
  structureContentAtom,
  responseAreaAtom
} from '../atoms/sandbox';

/**
 * Hook for managing all sandbox-related state
 * Consolidates 7 sandbox atoms into a single hook
 */
export function useSandboxState() {
  const [sandboxData, setSandboxData] = useAtom(sandboxDataAtom);
  const [sandboxFiles, setSandboxFiles] = useAtom(sandboxFilesAtom);
  const [loading, setLoading] = useAtom(sandboxLoadingAtom);
  const [status, setStatus] = useAtom(sandboxStatusAtom);
  const [fileStructure, setFileStructure] = useAtom(fileStructureAtom);
  const [structureContent, setStructureContent] = useAtom(structureContentAtom);
  const [responseArea, setResponseArea] = useAtom(responseAreaAtom);

  return {
    // Sandbox data
    sandboxData,
    setSandboxData,
    sandboxFiles,
    setSandboxFiles,
    
    // Loading and status
    loading,
    setLoading,
    status,
    setStatus,
    
    // File structure
    fileStructure,
    setFileStructure,
    structureContent,
    setStructureContent,
    
    // Response area
    responseArea,
    setResponseArea
  };
}
