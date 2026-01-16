import {
  FiFile,
  SiJavascript,
  SiReact,
  SiCss3,
  SiJson
} from '@/lib/icons';

/**
 * Get icon component for a file based on its extension
 */
export function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  if (ext === 'jsx' || ext === 'js') {
    return <SiJavascript style={{ width: '16px', height: '16px' }} className="text-yellow-500" />;
  } else if (ext === 'tsx' || ext === 'ts') {
    return <SiReact style={{ width: '16px', height: '16px' }} className="text-blue-500" />;
  } else if (ext === 'css') {
    return <SiCss3 style={{ width: '16px', height: '16px' }} className="text-blue-500" />;
  } else if (ext === 'json') {
    return <SiJson style={{ width: '16px', height: '16px' }} className="text-gray-600" />;
  } else {
    return <FiFile style={{ width: '16px', height: '16px' }} className="text-gray-600" />;
  }
}

/**
 * File type configuration for icons
 */
export const FILE_TYPE_CONFIGS = {
  jsx: { icon: SiJavascript, color: 'text-yellow-500' },
  js: { icon: SiJavascript, color: 'text-yellow-500' },
  tsx: { icon: SiReact, color: 'text-blue-500' },
  ts: { icon: SiReact, color: 'text-blue-500' },
  css: { icon: SiCss3, color: 'text-blue-500' },
  json: { icon: SiJson, color: 'text-gray-600' },
  default: { icon: FiFile, color: 'text-gray-600' }
};
