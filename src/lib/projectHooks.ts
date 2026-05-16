import { useState, useEffect, useCallback } from 'react';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { collection, doc, setDoc, getDocs, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { saveLocalFile, saveLocalProject, getLocalFiles, getLocalProjects } from './idb';

export interface ProjectFile {
  id?: string;
  projectId: string;
  path: string;
  content: string;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
}

export function useProjectSystem() {
  const [user, setUser] = useState<User | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activeFile, setActiveFile] = useState<ProjectFile | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthInitialized(true);
    });
    return unsub;
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const loadProjects = useCallback(async () => {
    if (!user) {
      // Load from local idb
      const local = await getLocalProjects();
      setProjects(local.map(loc => ({ id: loc.id, name: loc.name, userId: 'local' })));
      return;
    }
    try {
      const q = query(collection(db, 'projects'), where('userId', '==', user.uid));
      const snapshot = await getDocs(q);
      const remoteProjects = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Project));
      setProjects(remoteProjects);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'projects');
    }
  }, [user]);

  useEffect(() => {
    if (authInitialized) {
      loadProjects();
    }
  }, [authInitialized, loadProjects]);

  const selectProject = async (project: Project) => {
    setCurrentProject(project);
    if (!user || project.userId === 'local') {
      const localFiles = await getLocalFiles(project.id);
      setFiles(localFiles);
      if (localFiles.length) setActiveFile(localFiles[0]);
      return;
    }

    try {
      const parentDoc = doc(db, 'projects', project.id);
      const filesRef = collection(parentDoc, 'files');
      
      onSnapshot(filesRef, (snap) => {
        const loadedFiles = snap.docs.map(d => ({id: d.id, ...d.data()} as ProjectFile));
        setFiles(loadedFiles);
        if (loadedFiles.length && !activeFile) {
          setActiveFile(loadedFiles[0]);
        }
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, `projects/${project.id}/files`);
      });
    } catch (err) {
       handleFirestoreError(err, OperationType.LIST, `projects/${project.id}/files`);
    }
  };

  const createProject = async (name: string) => {
    const id = "proj_" + Date.now();
    const newProj = { id, name, userId: user ? user.uid : 'local' };
    
    if (user) {
      try {
        await setDoc(doc(db, 'projects', id), {
          ...newProj,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          version: 1
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `projects`);
      }
    } else {
      await saveLocalProject(id, name);
    }
    
    setProjects(prev => [...prev, newProj]);
    await selectProject(newProj);
    
    // Create base files for TikSaver
    const htmlContent = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>TikSaver</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="style.css">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-gray-50 flex flex-col min-h-screen">
  <header class="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 shadow-md rounded-b-3xl">
    <div class="flex justify-center items-center">
      <i class="fa-brands fa-tiktok text-3xl ml-3"></i>
      <h1 class="text-2xl font-bold">TikSaver Pro</h1>
    </div>
    <p class="text-center text-sm opacity-80 mt-2">تحميل الفيديوهات بدون علامة مائية</p>
  </header>

  <main class="flex-1 p-6 flex flex-col items-center mt-4">
    <div class="w-full max-w-md bg-white rounded-2xl shadow-lg p-6">
      <label class="block text-gray-700 text-sm font-bold mb-2">رابط الفيديو</label>
      <input type="url" id="tiktokUrl" placeholder="https://www.tiktok.com/@..." class="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 text-left" dir="ltr" >
      
      <button id="downloadBtn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition duration-200 flex justify-center items-center">
         <i class="fa-solid fa-download ml-2"></i> جلب الفيديو
      </button>

      <div id="loading" class="hidden mt-4 text-center text-blue-600 font-bold">
        <i class="fa-solid fa-spinner fa-spin text-2xl"></i>
        <p class="mt-2 text-sm">جاري جلب الفيديو...</p>
      </div>
      
      <div id="error" class="hidden mt-4 text-center text-red-500 font-bold text-sm bg-red-50 p-3 rounded-lg border border-red-100">
      </div>
    </div>

    <div id="result" class="hidden w-full max-w-md mt-6 bg-white rounded-2xl shadow-lg p-6 flex flex-col items-center">
      <img id="videoThumb" class="w-32 h-auto rounded-lg shadow-md mb-4" src="" alt="Thumbnail">
      <p id="videoTitle" class="text-xs text-gray-600 text-center mb-4 truncate w-full"></p>
      
      <div class="flex gap-2 w-full">
        <button id="saveVideoBtn" class="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-xl text-sm flex items-center justify-center">
          <i class="fa-solid fa-video ml-2"></i> حفظ الفيديو
        </button>
        <button id="saveAudioBtn" class="flex-1 bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-4 rounded-xl text-sm flex items-center justify-center">
          <i class="fa-solid fa-music ml-2"></i> حفظ الصوت
        </button>
      </div>
    </div>
  </main>
  <script src="script.js"></script>
</body>
</html>`;

    const cssContent = `* { -webkit-tap-highlight-color: transparent; }
body { overscroll-behavior-y: none; }
input:focus { box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2); }`;

    const jsContent = `document.getElementById('downloadBtn').addEventListener('click', async () => {
    const url = document.getElementById('tiktokUrl').value;
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const result = document.getElementById('result');
    const downloadBtn = document.getElementById('downloadBtn');

    if(!url) {
        showError('الرجاء إدخال رابط صحيح');
        return;
    }

    loading.classList.remove('hidden');
    error.classList.add('hidden');
    result.classList.add('hidden');
    downloadBtn.disabled = true;

    try {
        const response = await fetch(\`https://www.tikwm.com/api/?url=\${encodeURIComponent(url)}\`);
        const data = await response.json();
        
        if (data.code === -1 || !data.data) {
            showError('لم يتم العثور على الفيديو. تأكد من الرابط.');
            return;
        }

        const videoData = data.data;
        
        document.getElementById('videoThumb').src = videoData.cover;
        document.getElementById('videoTitle').textContent = videoData.title;
        
        const saveVideoBtn = document.getElementById('saveVideoBtn');
        saveVideoBtn.onclick = () => window.open(videoData.play, '_blank');
        
        const saveAudioBtn = document.getElementById('saveAudioBtn');
        saveAudioBtn.onclick = () => window.open(videoData.music, '_blank');
        
        result.classList.remove('hidden');
        result.classList.add('flex');

    } catch (err) {
        showError('حدث خطأ في الاتصال بالخادم. ' + err.message);
    } finally {
        loading.classList.add('hidden');
        downloadBtn.disabled = false;
    }
});

function showError(msg) {
    const error = document.getElementById('error');
    error.textContent = msg;
    error.classList.remove('hidden');
}`;

    // Create base files
    await createFile(newProj, 'index.html', htmlContent);
    await createFile(newProj, 'style.css', cssContent);
    await createFile(newProj, 'script.js', jsContent);
  };

  const createFile = async (project: Project, path: string, content: string = '') => {
    const fileId = "file_" + Date.now() + Math.floor(Math.random()*1000);
    const newFile = { projectId: project.id, path, content };
    
    if (user && project.userId !== 'local') {
      try {
        await setDoc(doc(db, `projects/${project.id}/files/${fileId}`), {
          ...newFile,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `projects/${project.id}/files`);
      }
    } else {
      await saveLocalFile(project.id, path, content);
      setFiles(prev => [...prev, newFile]); // Only need explicit local update because no snapshot listener
    }
  };

  const updateFileContent = async (project: Project, file: ProjectFile, content: string) => {
    if (user && project.userId !== 'local' && file.id) {
      try {
        await setDoc(doc(db, `projects/${project.id}/files/${file.id}`), {
          content,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
         handleFirestoreError(err, OperationType.UPDATE, `projects/${project.id}/files`);
      }
    } else {
      await saveLocalFile(project.id, file.path, content);
      // Update local state optimistic
      setFiles(prev => prev.map(f => f.path === file.path ? { ...f, content } : f));
      if (activeFile && activeFile.path === file.path) {
         setActiveFile({...activeFile, content});
      }
    }
  };

  return {
    user,
    login,
    authInitialized,
    projects,
    currentProject,
    selectProject,
    createProject,
    files,
    activeFile,
    setActiveFile,
    createFile,
    updateFileContent
  };
}
