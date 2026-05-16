import { useState } from 'react';
import { ProjectFile } from '../../lib/projectHooks';
import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

interface Props {
  file: ProjectFile;
  onChange: (content: string) => void;
}

export default function MobileEditor({ file, onChange }: Props) {
  const getExt = () => file.path.split('.').pop()?.toLowerCase();
  
  const extensions = [];
  if (getExt() === 'html') extensions.push(html());
  if (getExt() === 'css') extensions.push(css());
  if (getExt() === 'js') extensions.push(javascript());

  return (
    <div className="flex-1 w-full h-full bg-[#1e1e1e] flex flex-col text-white">
      <div className="h-10 border-b border-gray-700 flex items-center px-4 bg-[#252526] text-sm font-medium">
        <span className="text-gray-300 mr-2">تعديل:</span>
        <span className="text-blue-400">{file.path}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <CodeMirror
          value={file.content}
          height="100%"
          theme={vscodeDark}
          extensions={extensions}
          onChange={(val) => onChange(val)}
          style={{ fontSize: 14 }}
        />
      </div>
    </div>
  );
}
