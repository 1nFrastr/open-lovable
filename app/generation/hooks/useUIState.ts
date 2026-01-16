import { useAtom } from 'jotai';
import {
  activeTabAtom,
  showHomeScreenAtom,
  homeScreenFadingAtom,
  homeUrlInputAtom,
  homeContextInputAtom,
  urlOverlayVisibleAtom,
  urlInputAtom,
  urlStatusAtom,
  selectedFileAtom,
  expandedFoldersAtom,
  sidebarScrolledAtom,
  showStyleSelectorAtom,
  selectedStyleAtom,
  promptInputAtom,
  aiModelAtom
} from '../atoms/ui';

/**
 * Hook for managing all UI-related state
 * Consolidates 15 UI atoms into a single hook
 */
export function useUIState() {
  const [activeTab, setActiveTab] = useAtom(activeTabAtom);
  const [showHomeScreen, setShowHomeScreen] = useAtom(showHomeScreenAtom);
  const [homeScreenFading, setHomeScreenFading] = useAtom(homeScreenFadingAtom);
  const [homeUrlInput, setHomeUrlInput] = useAtom(homeUrlInputAtom);
  const [homeContextInput, setHomeContextInput] = useAtom(homeContextInputAtom);
  const [urlOverlayVisible, setUrlOverlayVisible] = useAtom(urlOverlayVisibleAtom);
  const [urlInput, setUrlInput] = useAtom(urlInputAtom);
  const [urlStatus, setUrlStatus] = useAtom(urlStatusAtom);
  const [selectedFile, setSelectedFile] = useAtom(selectedFileAtom);
  const [expandedFolders, setExpandedFolders] = useAtom(expandedFoldersAtom);
  const [sidebarScrolled, setSidebarScrolled] = useAtom(sidebarScrolledAtom);
  const [showStyleSelector, setShowStyleSelector] = useAtom(showStyleSelectorAtom);
  const [selectedStyle, setSelectedStyle] = useAtom(selectedStyleAtom);
  const [promptInput, setPromptInput] = useAtom(promptInputAtom);
  const [aiModel, setAiModel] = useAtom(aiModelAtom);

  return {
    // Tab management
    activeTab,
    setActiveTab,
    
    // Home screen
    showHomeScreen,
    setShowHomeScreen,
    homeScreenFading,
    setHomeScreenFading,
    homeUrlInput,
    setHomeUrlInput,
    homeContextInput,
    setHomeContextInput,
    
    // URL handling
    urlOverlayVisible,
    setUrlOverlayVisible,
    urlInput,
    setUrlInput,
    urlStatus,
    setUrlStatus,
    
    // File tree
    selectedFile,
    setSelectedFile,
    expandedFolders,
    setExpandedFolders,
    
    // Sidebar
    sidebarScrolled,
    setSidebarScrolled,
    
    // Style selector
    showStyleSelector,
    setShowStyleSelector,
    selectedStyle,
    setSelectedStyle,
    
    // Input and model
    promptInput,
    setPromptInput,
    aiModel,
    setAiModel
  };
}
