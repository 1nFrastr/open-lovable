declare module 'react-file-icon' {
  import { FC } from 'react';

  export interface FileIconProps {
    extension?: string;
    filename?: string;
    size?: number;
    type?: string;
    color?: string;
    glyphColor?: string;
    labelColor?: string;
    labelTextColor?: string;
    labelUppercase?: boolean;
    fold?: boolean;
    radius?: number;
    gradientColor?: string;
    gradientOpacity?: number;
    foldColor?: string;
  }

  export const FileIcon: FC<FileIconProps>;
  
  export const defaultStyles: {
    [extension: string]: Partial<FileIconProps>;
  };
}
