'use client';

import React, { useMemo, memo } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import {
  FiChevronRight,
  FiChevronDown,
  BsFolderFill,
  BsFolder2Open,
} from '@/lib/icons';
import * as FileIconLib from 'react-file-icon';
import { selectedFileAtom, expandedFoldersAtom, toggleExpandedFolderAtom } from '../atoms/ui';
import { generationProgressAtom, type GenerationFile } from '../atoms/generation';

const { FileIcon, defaultStyles } = FileIconLib as any;

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  fileData?: GenerationFile;
}

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  
  // Get default styles for the extension, or use a fallback
  const iconStyles = defaultStyles?.[ext] || {};
  
  return (
    <div 
      className="flex-shrink-0" 
      style={{ 
        width: '12px', 
        height: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: 'saturate(1.4) brightness(0.95) contrast(1.1)'
      }}
    >
      <div style={{ width: '100%', height: '100%' }}>
        <FileIcon extension={ext} {...iconStyles} />
      </div>
    </div>
  );
}

function buildFileTree(files: GenerationFile[]): FileNode[] {
  const root: FileNode[] = [];
  const folderMap = new Map<string, FileNode>();

  for (const file of files) {
    const parts = file.path.split('/');
    let currentPath = '';
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (isFile) {
        currentLevel.push({
          name: part,
          path: file.path,
          type: 'file',
          fileData: file,
        });
      } else {
        let folder = folderMap.get(currentPath);
        if (!folder) {
          folder = {
            name: part,
            path: currentPath,
            type: 'folder',
            children: [],
          };
          folderMap.set(currentPath, folder);
          currentLevel.push(folder);
        }
        currentLevel = folder.children!;
      }
    }
  }

  // Sort: folders first, then files, alphabetically
  const sortNodes = (nodes: FileNode[]): FileNode[] => {
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  };

  const sortRecursive = (nodes: FileNode[]): FileNode[] => {
    const sorted = sortNodes(nodes);
    for (const node of sorted) {
      if (node.children) {
        node.children = sortRecursive(node.children);
      }
    }
    return sorted;
  };

  return sortRecursive(root);
}

interface FileTreeItemProps {
  node: FileNode;
  depth: number;
}

const FileTreeItem = memo(function FileTreeItem({ node, depth }: FileTreeItemProps) {
  const [selectedFile, setSelectedFile] = useAtom(selectedFileAtom);
  const expandedFolders = useAtomValue(expandedFoldersAtom);
  const toggleFolder = useAtom(toggleExpandedFolderAtom)[1];

  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedFile === node.path;

  const handleClick = () => {
    if (node.type === 'folder') {
      toggleFolder(node.path);
    } else {
      setSelectedFile(node.path);
    }
  };

  return (
    <>
      <div
        className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white rounded ${
          isSelected ? 'bg-white shadow-sm' : ''
        }`}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
        onClick={handleClick}
      >
        {node.type === 'folder' ? (
          <>
            {isExpanded ? (
              <FiChevronDown className="w-3 h-3 text-gray-500 flex-shrink-0" />
            ) : (
              <FiChevronRight className="w-3 h-3 text-gray-500 flex-shrink-0" />
            )}
            {isExpanded ? (
              <BsFolder2Open style={{ width: '16px', height: '16px' }} className="text-yellow-600 flex-shrink-0" />
            ) : (
              <BsFolderFill style={{ width: '16px', height: '16px' }} className="text-yellow-600 flex-shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-3" />
            {getFileIcon(node.name)}
          </>
        )}
        <span
          className={`text-sm truncate ${
            node.fileData?.edited ? 'text-orange-600 font-medium' : 'text-gray-700'
          }`}
        >
          {node.name}
          {node.fileData?.edited && <span className="ml-1 text-orange-500">•</span>}
        </span>
      </div>

      {node.type === 'folder' && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </>
  );
});

export function FileTreePanel() {
  const generationProgress = useAtomValue(generationProgressAtom);

  const fileTree = useMemo(() => {
    return buildFileTree(generationProgress.files);
  }, [generationProgress.files]);

  if (generationProgress.files.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500 text-center">
        No files generated yet
      </div>
    );
  }

  return (
    <div className="py-2">
      {fileTree.map((node) => (
        <FileTreeItem key={node.path} node={node} depth={0} />
      ))}
    </div>
  );
}

export default FileTreePanel;
