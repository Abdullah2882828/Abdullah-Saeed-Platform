import React, { useState } from 'react';
import { useProjectSystem } from './lib/projectHooks';
import FileTree from './components/files/FileTree';
import MobileEditor from './components/editor/MobileEditor';
import LivePreview from './components/preview/LivePreview';
import AppBuilder from './components/build/AppBuilder';
import { Code, Play, Folder, Settings, LogIn, MonitorSmartphone } from 'lucide-react';

type Tab = 'editor' | 'preview' | 'files' | 'build';

export default function App() {
  const {
    user, login, authInitialized,
    projects, currentProject, selectProject, createProject,
    files, activeFile, setActiveFile, createFile, updateFileContent
  } = useProjectSystem();

  const [activeTab, setActiveTab] = useState<Tab>('files');
  const [newProjName, setNewProjName] = useState('');

  if (!authInitialized) {
    return <div className="h-screen flex text-white bg-[#1e1e1e] items-center justify-center">جاري التحميل...</div>;
  }

  const handleEditorChange = (val: string) => {
    if (currentProject && activeFile) {
      updateFileContent(currentProject, activeFile, val);
    }
  };

  // Login / Projects Screen
  if (!currentProject) {
    return (
      <div className="h-screen bg-gray-50 flex flex-col items-center justify-center p-6" dir="rtl">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">منصة Abdullah Saeed</h1>
        <p className="text-gray-500 mb-8 text-center max-w-sm">
          بيئة تطوير احترافية من هاتفك. ابدأ بكتابة الأكواد وصمم تطبيقاتك أينما كنت.
        </p>

        {!user && (
          <button onClick={login} className="mb-8 w-full max-w-xs flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700">
            <LogIn className="ml-2 w-5 h-5"/> تسجيل الدخول بحساب Google
          </button>
        )}

        <div className="w-full max-w-xs bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold mb-4">مشاريعي</h2>
          {projects.length === 0 && <p className="text-gray-500 text-sm mb-4">لا توجد مشاريع حاليا.</p>}
          <div className="space-y-2 mb-6">
            {projects.map(p => (
              <button 
                key={p.id} 
                onClick={() => selectProject(p)}
                className="w-full text-right px-4 py-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors"
              >
                {p.name}
              </button>
            ))}
          </div>
          <div className="flex space-x-reverse space-x-2">
             <input type="text" placeholder="اسم المشروع الجديد" 
                value={newProjName} onChange={e => setNewProjName(e.target.value)}
                className="flex-1 bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
             />
             <button onClick={() => { if(newProjName) createProject(newProjName) }} 
               className="bg-blue-600 px-4 py-2 text-white rounded-lg font-bold text-sm">
               إنشاء
             </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-screen flex flex-col bg-[#1e1e1e] overflow-hidden" dir="rtl">
      {/* Top Header */}
      <div className="h-12 bg-[#2d2d2d] flex items-center justify-between px-4 shadow-md z-10 shrink-0">
        <div className="flex items-center text-white font-bold">
          <MonitorSmartphone className="w-5 h-5 ml-2 text-blue-400" />
          <span className="truncate max-w-[200px]">{currentProject.name}</span>
        </div>
        <div className="text-xs text-gray-400">
          {user ? 'سحابي (مزامنة تلقائية)' : 'محلي (IndexedDB)'}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden">
        {activeTab === 'files' && (
           <FileTree 
             project={currentProject} 
             files={files} 
             activeFile={activeFile} 
             onSelect={(f) => { setActiveFile(f); setActiveTab('editor'); }} 
             onCreate={(name) => createFile(currentProject, name)} 
           />
        )}
        {activeTab === 'editor' && activeFile && (
           <MobileEditor file={activeFile} onChange={handleEditorChange} />
        )}
        {activeTab === 'editor' && !activeFile && (
           <div className="flex-1 h-full flex items-center justify-center text-gray-500">الرجاء اختيار ملف</div>
        )}
        {activeTab === 'preview' && (
           <LivePreview files={files} />
        )}
        {activeTab === 'build' && (
           <AppBuilder project={currentProject} files={files} />
        )}
      </div>

      {/* Bottom Tab Navigation */}
      <div className="h-16 bg-[#252526] border-t border-gray-800 flex items-center justify-around shrink-0 pb-safe">
        <TabButton icon={<Folder/>} label="الملفات" isActive={activeTab === 'files'} onClick={() => setActiveTab('files')} />
        <TabButton icon={<Code/>} label="المحرر" isActive={activeTab === 'editor'} onClick={() => setActiveTab('editor')} />
        <TabButton icon={<Play/>} label="تشغيل" isActive={activeTab === 'preview'} onClick={() => setActiveTab('preview')} />
        <TabButton icon={<Settings/>} label="بناء APK" isActive={activeTab === 'build'} onClick={() => setActiveTab('build')} />
      </div>
    </div>
  );
}

function TabButton({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
    >
      <div className="[&>svg]:w-6 [&>svg]:h-6">{icon}</div>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
