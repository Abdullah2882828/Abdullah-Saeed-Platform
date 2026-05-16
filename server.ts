import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";

// Type definition for a Build Job
interface BuildJob {
  id: string;
  projectId: string;
  projectName: string;
  status: 'starting' | 'compiling' | 'completed' | 'error';
  logs: string[];
  apkPath?: string;
  error?: string;
  pushLog: (log: string) => void;
}

const buildJobs = new Map<string, BuildJob>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload size for file submissions
  app.use(express.json({ limit: "200mb" }));

  // ---- API ROUTES ----

  // 1. Trigger Build
  app.post("/api/build/start", async (req, res) => {
    try {
      const { projectId, projectName, files, iconDataUrl } = req.body;
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const job: BuildJob = {
        id: jobId,
        projectId,
        projectName,
        status: 'starting',
        logs: [],
        pushLog: function(msg: string) {
          this.logs.push(`[${new Date().toISOString()}] ${msg}`);
        }
      };
      
      buildJobs.set(jobId, job);

      // Start asynchronous compilation
      runBuildPipeline(job, files, iconDataUrl).catch(err => {
        job.status = 'error';
        job.error = err.message;
        job.pushLog(`[FATAL] ${err.message}`);
        console.error("Build Pipeline Error:", err);
      });

      res.json({ jobId });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 2. Stream Build Logs (SSE)
  app.get("/api/build/stream/:jobId", (req, res) => {
    const { jobId } = req.params;
    const job = buildJobs.get(jobId);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send previous logs
    job.logs.forEach(msg => {
      res.write(`data: ${JSON.stringify({ type: 'log', message: msg })}\n\n`);
    });

    const checkInterval = setInterval(() => {
      if (job.status === 'completed') {
        res.write(`data: ${JSON.stringify({ type: 'done', downloadUrl: `/api/build/download/${jobId}` })}\n\n`);
        clearInterval(checkInterval);
        res.end();
      } else if (job.status === 'error') {
        res.write(`data: ${JSON.stringify({ type: 'error', message: job.error || 'Build failed' })}\n\n`);
        clearInterval(checkInterval);
        res.end();
      } else {
        res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`);
      }
      
      // we need to dynamically stream new logs. We'll hack it by monkeypatching pushLog for this connection
      // For simplicity, we just poll but in a real system we'd use event emitters.
    }, 1000);

    // Keep connection alive, listen for client close
    req.on('close', () => clearInterval(checkInterval));
    
    // Monkey patch pushLog to also write to the stream directly for instant terminal updates
    const originalPushLog = job.pushLog.bind(job);
    job.pushLog = (msg: string) => {
      originalPushLog(msg);
      res.write(`data: ${JSON.stringify({ type: 'log', message: job.logs[job.logs.length - 1] })}\n\n`);
    };
  });

  // 3. Download Result
  app.get("/api/build/download/:jobId", (req, res) => {
    const { jobId } = req.params;
    const job = buildJobs.get(jobId);
    
    if (!job || job.status !== 'completed' || !job.apkPath) {
      return res.status(404).send("APK not found or build not finished");
    }

    res.download(job.apkPath, `${job.projectName}.apk`);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production SPA serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Integrated Build Environment (Server) running on port ${PORT}`);
  });
}

// ---- PLATFORM BUILD ENGINE (REAL APK COMPILER VIA GITHUB ACTIONS) ----

async function githubFetch(endpoint: string, options: any = {}) {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(`https://api.github.com${endpoint}`, {
      ...options,
      headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(options.headers || {})
      }
  });
  
  if (!res.ok) {
      const msg = await res.text();
      throw new Error(`GitHub API Error on ${endpoint}: ${res.status} - ${msg}`);
  }
  
  if (res.status === 204) return null;
  return res.json();
}

async function runBuildPipeline(job: BuildJob, files: {path: string, content: string}[], iconDataUrl?: string) {
  job.status = 'compiling';
  
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO = (process.env.GITHUB_REPO || "Abdullah2882828/Abdullah-Saeed-Platform").trim();

  // App Name processing for Capacitor compatibility
  const safeAppName = job.projectName.replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'App';
  const appId = `com.abdullah.${safeAppName.replace(/\s+/g, '').toLowerCase() || 'app'}`;

  if (!GITHUB_TOKEN) {
      job.pushLog(`[FATAL] GITHUB_TOKEN is missing in Platform Environment.`);
      job.pushLog(`[INFO] To enable Real APK Compilation:`);
      job.pushLog(`  1. Create a public/private repo on GitHub.`);
      job.pushLog(`  2. Generate a Personal Access Token (classic) with 'repo' & 'workflow' scopes.`);
      job.pushLog(`  3. Add GITHUB_TOKEN and GITHUB_REPO variables to AI Studio Secrets.`);
      job.status = 'error';
      return;
  }

  job.pushLog(`[Platform] Authenticating via Webhook to Native Compiler Repo: ${GITHUB_REPO}...`);

  let branch = "main";
  // Pre-flight check: Verify Repo Access
  try {
      const repoData = await githubFetch(`/repos/${GITHUB_REPO}`);
      if (repoData.default_branch) {
          branch = repoData.default_branch;
      }
      job.pushLog(`[Platform] Setup: Successfully connected to GitHub Repo (${repoData.visibility}). Default Branch: ${branch}`);
  } catch (err: any) {
      job.pushLog(`[FATAL] Repository Check Failed: ${err.message}`);
      job.pushLog(`[INFO] Ensure the repository "${GITHUB_REPO}" exists and the token has 'repo' scope.`);
      job.status = 'error';
      return;
  }

  async function pushFileContents(path: string, content: string, commitMessage: string, isBase64: boolean = false) {
      let sha = undefined;
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      try {
          const fileData = await githubFetch(`/repos/${GITHUB_REPO}/contents/${encodedPath}?ref=${branch}`);
          sha = fileData.sha;
      } catch (err) {
          // File doesn't exist, which is fine
      }
      
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${encodedPath}`, {
          method: 'PUT',
          headers: {
              'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({
              message: commitMessage,
              content: isBase64 ? content : Buffer.from(content).toString('base64'),
              branch: branch,
              ...(sha ? { sha } : {})
          })
      });
      
      if (!res.ok) {
          const errText = await res.text();
          if (res.status === 404 && path.includes('.github/workflows')) {
              throw new Error(`[FATAL] Missing 'workflow' permission. GitHub returned 404 when uploading ${path}. Ensure your Personal Access Token has the 'workflow' scope activated.`);
          }
          throw new Error(`Failed to push ${path}: ${errText}`);
      }
  }

  job.pushLog(`[Platform] Uploading project files sequentially to distributed compiler nodes...`);
  
  // 1. Upload Source Files
  for (const file of files) {
     const cleanPath = file.path.replace(/^\/+/, '');
     const targetPath = `src_files/${cleanPath}`;
     await pushFileContents(targetPath, file.content, `IDE Build Target: ${job.projectName} - ${cleanPath}`);
  }

  // 1.5 Upload custom icon if provided
  if (iconDataUrl) {
     try {
         // iconDataUrl is something like "data:image/png;base64,iVBORw0K..."
         const base64Data = iconDataUrl.split(',')[1];
         await pushFileContents(`src_files/assets/icon.png`, base64Data, `Upload custom app icon`, true);
         job.pushLog(`[Platform] Custom app icon successfully uploaded.`);
     } catch (err) {
         job.pushLog(`[WARNING] Failed to upload custom icon, continuing with default.`);
     }
  }

  // 2. Add/Update GitHub Actions workflow
  const workflowYaml = `
name: Compile APK
on:
  repository_dispatch:
    types: [build_apk]

jobs:
  build:
    runs-on: ubuntu-22.04
    steps:
      - name: Free Disk Space
        run: |
          sudo rm -rf /usr/share/dotnet
          sudo rm -rf /opt/ghc
          sudo rm -rf "/usr/local/share/boost"
          sudo rm -rf "$AGENT_TOOLSDIRECTORY"
      - name: Checkout Repository
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: 'zulu'
          java-version: '17'
      - name: Prepare Capacitor App
        run: |
          mkdir -p build_output
          cp -r src_files/* build_output/ || true
          cd build_output
          
          # Initialize or Install
          if [ ! -f "package.json" ]; then
            npm init -y
          else
            npm install --legacy-peer-deps
          fi
          
          # Build Web Files
          if grep -q '"build":' package.json; then
            npm run build || true
          fi
          
          # Ensure dist folder exists for Capacitor and contains the web app
          if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
            mkdir -p dist
            echo "Copying raw web files to dist..."
            # Copy all files from src_files directly to dist as fallback
            cp -r ../src_files/* dist/ || true
          fi
          
          npm install @capacitor/core@6 @capacitor/cli@6 @capacitor/android@6
          npx cap init "${safeAppName}" "${appId}" --web-dir dist
          
          # Generate custom icon
          if [ -f "assets/icon.png" ]; then
             echo "Using custom uploaded icon..."
          elif [ -f "assets/icon.svg" ]; then
             echo "Using custom uploaded SVG icon..."
          else
             echo "Generating default SVG icon..."
             mkdir -p assets
             cat << 'EOF' > assets/icon.svg
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="background:#1e3a8a;">
            <path fill="#fff" d="M412 114v80c-44 0-83 17-111 44v149c0 78-63 141-141 141S18 465 18 387s63-141 141-141c10 0 20 1 30 3V332c-10-3-20-5-30-5-34 0-61 27-61 61s27 61 61 61 61-27 61-61V18h80c0 44 36 80 80 80v-80h32v96z"/>
          </svg>
EOF
          fi
          
          npm install -g @capacitor/assets
          npx @capacitor/assets generate --assetPath assets --iconBackgroundColor '#1e3a8a' || echo "Icon generation failed/skipped"
          
          npx cap add android
          npx cap copy android
          npx cap sync android
          
          cd android
          chmod +x gradlew
          export _JAVA_OPTIONS="-Xmx2048m"
          ./gradlew assembleDebug --no-daemon
      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: app-debug
          path: build_output/android/app/build/outputs/apk/debug/app-debug.apk
`;

  await pushFileContents(`.github/workflows/android-build.yml`, workflowYaml.trim(), `Update Compiler Workflow`);

  // Trigger Dispatch
  job.pushLog(`[Compiler] Triggering Cloud Build Engine (GitHub Actions SDKs)...`);
  const dispatchTime = Date.now();
  await githubFetch(`/repos/${GITHUB_REPO}/dispatches`, {
     method: 'POST',
     body: JSON.stringify({
         event_type: 'build_apk',
         client_payload: { appName: job.projectName, jobId: job.id }
     })
  });

  job.pushLog(`[Compiler] Action Dispatched. Waiting for Hardware Runner assignment...`);

  let runId: number | null = null;
  let attempts = 0;

  // Poll for Action Run ID
  while (!runId && attempts < 30) {
      await delay(3000);
      const runsData = await githubFetch(`/repos/${GITHUB_REPO}/actions/runs?event=repository_dispatch&per_page=5`);
      const recentRun = runsData.workflow_runs.find((r: any) => new Date(r.created_at).getTime() >= dispatchTime - 10000); // 10s window
      if (recentRun && recentRun.status !== 'completed') {
          runId = recentRun.id;
          job.pushLog(`[Compiler] Runner Assigned: Node ID #${runId}`);
          job.pushLog(`[Compiler] Executing Native SDKs (Setup Java, Capacitor, Gradle)...`);
          break;
      }
      attempts++;
  }

  if (!runId) {
      throw new Error(`Timeout waiting for Cloud Build Engine to allocate resources.`);
  }

  let runStatus = "in_progress";
  let loggedGradle = false;

  while (runStatus !== "completed") {
      await delay(8000); // Wait 8 seconds between polls to avoid rate limits
      const runInfo = await githubFetch(`/repos/${GITHUB_REPO}/actions/runs/${runId}`);
      runStatus = runInfo.status;
      
      if (runStatus === "in_progress" && !loggedGradle) {
           job.pushLog(`[Gradle] Building Native Android modules (This usually takes 1-3 minutes)...`);
           loggedGradle = true;
      }
      
      if (runStatus === "completed") {
          if (runInfo.conclusion !== "success") {
               throw new Error(`Cloud Build Failed with conclusion: ${runInfo.conclusion}. Check GitHub Actions console for details.`);
          }
          break;
      }
  }

  job.pushLog(`[Compiler] Build Success! Fetching APK artifact...`);

  const artifactsData = await githubFetch(`/repos/${GITHUB_REPO}/actions/runs/${runId}/artifacts`);
  const apkArtifact = artifactsData.artifacts.find((a: any) => a.name === "app-debug");

  if (!apkArtifact) {
      throw new Error("Artifact 'app-debug' not found in build results.");
  }

  job.pushLog(`[System] Downloading Artifact securely into Platform Server...`);
  
  const artifactRes = await fetch(apkArtifact.archive_download_url, {
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}` }
  });

  if (!artifactRes.ok) {
       throw new Error(`Failed to download artifact chunk: ${artifactRes.statusText}`);
  }

  // Save artifact zip to temp file
  const JSZip = (await import('jszip')).default;
  
  const workspacePath = path.join(os.tmpdir(), job.id);
  await fs.mkdir(workspacePath, { recursive: true });
  const zipPath = path.join(workspacePath, 'artifact.zip');
  
  const buffer = await artifactRes.arrayBuffer();
  await fs.writeFile(zipPath, Buffer.from(buffer));
  
  // Extract APK
  job.pushLog(`[System] Extracting finalized APK...`);
  const zipData = await fs.readFile(zipPath);
  const zip = await JSZip.loadAsync(zipData);
  const apkFiles = Object.keys(zip.files).filter(k => k.endsWith('.apk'));
  
  if (apkFiles.length === 0) {
      throw new Error("APK file not found inside the downloaded artifact.");
  }
  
  const apkContent = await zip.files[apkFiles[0]].async('nodebuffer');
  const apkPath = path.join(workspacePath, `${job.projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.apk`);
  await fs.writeFile(apkPath, apkContent);

  job.pushLog(`[System] SIGNED APK is ready for installation.`);
  job.apkPath = apkPath;
  job.status = 'completed';
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

startServer();
