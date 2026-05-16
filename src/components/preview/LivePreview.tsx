import { useEffect, useState, useRef } from 'react';
import { ProjectFile } from '../../lib/projectHooks';

interface Props {
  files: ProjectFile[];
}

export default function LivePreview({ files }: Props) {
  const [srcDoc, setSrcDoc] = useState('');
  
  useEffect(() => {
    // Generate the preview HTML
    const htmlFile = files.find(f => f.path.endsWith('.html'))?.content || '<h1>لا يوجد ملف HTML</h1>';
    
    // Inject CSS
    const cssFiles = files.filter(f => f.path.endsWith('.css'));
    let cssInject = '';
    cssFiles.forEach(c => {
      cssInject += `<style>${c.content}</style>\n`;
    });

    // Inject JS
    const jsFiles = files.filter(f => f.path.endsWith('.js'));
    let jsInject = '';
    jsFiles.forEach(j => {
      jsInject += `<script>${j.content}</script>\n`;
    });

    // Simple replacement, works if there is a </head> tag, else just appends.
    let finalDoc = htmlFile;
    if (finalDoc.includes('</head>')) {
      finalDoc = finalDoc.replace('</head>', `${cssInject}</head>`);
    } else {
      finalDoc = cssInject + finalDoc;
    }

    if (finalDoc.includes('</body>')) {
        finalDoc = finalDoc.replace('</body>', `${jsInject}</body>`);
    } else {
        finalDoc = finalDoc + jsInject;
    }

    setSrcDoc(finalDoc);
  }, [files]);

  return (
    <div className="flex-1 w-full h-full bg-white flex flex-col">
       <div className="h-10 border-b border-gray-200 flex items-center px-4 bg-gray-50 text-sm font-medium shadow-sm">
        <span className="text-gray-600">المعاينة المباشرة (Live Preview)</span>
      </div>
      <iframe 
        srcDoc={srcDoc}
        title="preview"
        sandbox="allow-scripts allow-modals"
        className="flex-1 w-full h-full border-none"
      />
    </div>
  );
}
