import { useState } from 'react';
import { ProjectFile, Project } from '../../lib/projectHooks';
import { FileCode, FileJson, FileText, Plus, Folder } from 'lucide-react';

interface Props {
  project: Project;
  files: ProjectFile[];
  activeFile: ProjectFile | null;
  onSelect: (f: ProjectFile) => void;
  onCreate: (name: string) => void;
}

export default function FileTree({ project, files, activeFile, onSelect, onCreate }: Props) {
  const [newFileName, setNewFileName] = useState('');
  const [showInput, setShowInput] = useState(false);

  const getIcon = (path: string) => {
    if (path.endsWith('.js') || path.endsWith('.ts')) return <FileCode className="w-5 h-5 text-yellow-400" />;
    if (path.endsWith('.css')) return <FileCode className="w-5 h-5 text-blue-400" />;
    if (path.endsWith('.html')) return <FileCode className="w-5 h-5 text-orange-400" />;
    if (path.endsWith('.json')) return <FileJson className="w-5 h-5 text-green-400" />;
    return <FileText className="w-5 h-5 text-gray-400" />;
  };

  const handleCreate = () => {
    if (newFileName.trim()) {
      onCreate(newFileName.trim());
      setNewFileName('');
      setShowInput(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#252526] text-gray-300 p-4" dir="rtl">
      <div className="flex items-center justify-between mb-6 border-b border-gray-700 pb-2">
        <h2 className="text-lg font-bold flex items-center text-white">
          <Folder className="w-5 h-5 mr-3 ml-2 text-blue-400" />
          {project.name}
        </h2>
        <button 
          onClick={() => setShowInput(true)}
          className="p-1 rounded-md hover:bg-gray-700 bg-gray-800 text-gray-200"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {showInput && (
        <div className="flex items-center mb-4 space-x-reverse space-x-2">
          <input 
            type="text" 
            value={newFileName}
            onChange={e => setNewFileName(e.target.value)}
            placeholder="اسم الملف (مثال: style.css)"
            className="flex-1 bg-[#1e1e1e] border border-gray-600 rounded px-3 py-1.5 text-sm w-full outline-none focus:border-blue-500 transition-colors"
          />
          <button 
            onClick={handleCreate}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium"
          >
            إنشاء
          </button>
        </div>
      )}

      <ul className="space-y-1">
        {files.map(f => (
          <li key={f.path}>
            <button
              onClick={() => onSelect(f)}
              className={`w-full flex items-center text-left px-3 py-2.5 rounded-md transition-colors ${activeFile?.path === f.path ? 'bg-blue-600 text-white' : 'hover:bg-[#2a2d2e]'}`}
            >
              {getIcon(f.path)}
              <span className="mr-3 text-[15px]">{f.path}</span>
            </button>
          </li>
        ))}
        {files.length === 0 && (
          <li className="text-center text-gray-500 mt-10">
            لا توجد ملفات. قم بإنشاء ملف جديد.
          </li>
        )}
      </ul>
    </div>
  );
}
