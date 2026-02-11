
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Icons, ACCEPTED_EXTENSIONS } from './constants';
import { RenameSettings } from './types';
import { GoogleGenAI } from "@google/genai";

declare const JSZip: any;

export default function App() {
  const [settings, setSettings] = useState<RenameSettings>({
    startNumber: 1,
    zeroPad: 2
  });
  const [activeTab, setActiveTab] = useState<'web' | 'code'>('web');
  const [uploadedFiles, setUploadedFiles] = useState<{ 
    file: File; 
    id: string; 
    preview: string; 
    aiTitle?: string; 
    status: 'idle' | 'processing' | 'done' | 'error' 
  }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-run AI whenever files are in 'idle' state (100% First Logic)
  useEffect(() => {
    const idleFile = uploadedFiles.find(f => f.status === 'idle');
    if (idleFile) {
      processFileWithAi(idleFile.id);
    }
  }, [uploadedFiles]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      addFilesToQueue(files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      const files = Array.from(e.dataTransfer.files);
      addFilesToQueue(files);
    }
  };

  const addFilesToQueue = (files: File[]) => {
    const newFiles = files.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      preview: URL.createObjectURL(file),
      aiTitle: undefined,
      status: 'idle' as const
    }));
    setUploadedFiles(prev => [...prev, ...newFiles].slice(0, 200));
  };

  const clearFiles = () => {
    uploadedFiles.forEach(f => URL.revokeObjectURL(f.preview));
    setUploadedFiles([]);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = error => reject(error);
    });
  };

  const processFileWithAi = async (id: string) => {
    const item = uploadedFiles.find(f => f.id === id);
    if (!item || !item.file.type.startsWith('image/')) return;

    setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'processing' } : f));

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const base64 = await fileToBase64(item.file);
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          { 
            text: "Analyze this image in extreme detail. Provide a very long, descriptive, and unique title (up to 200 characters) that captures the colors, subjects, mood, and background. Use hyphens (-) instead of spaces. The output should be a single continuous string safe for a filename. Do not provide any other text." 
          },
          { inlineData: { mimeType: item.file.type, data: base64 } }
        ]
      });

      const rawText = response.text || 'high-fidelity-image-description';
      const cleanTitle = rawText.trim().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .substring(0, 190); 

      setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, aiTitle: cleanTitle, status: 'done' } : f));
    } catch (error) {
      console.error("AI Error:", error);
      setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error' } : f));
    }
  };

  const downloadRenamedFiles = async () => {
    const finished = uploadedFiles.filter(f => f.status === 'done');
    if (finished.length === 0) {
      alert("No files processed by AI yet.");
      return;
    }

    setIsProcessing(true);
    try {
      const zip = new JSZip();
      finished.forEach((item, index) => {
        const ext = item.file.name.substring(item.file.name.lastIndexOf('.'));
        const num = (settings.startNumber + index).toString().padStart(settings.zeroPad, '0');
        const newName = `${item.aiTitle}-${num}${ext}`;
        zip.file(newName, item.file);
      });

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vision-ai-renamed.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      alert("Error creating ZIP.");
    } finally {
      setIsProcessing(false);
    }
  };

  const pythonCode = useMemo(() => {
    return `import os
import tkinter as tk
from tkinter import filedialog, messagebox

class VisionRenamer:
    def __init__(self, root):
        self.root = root
        self.root.title("Vision Pro - Offline Renamer")
        self.root.geometry("600x400")
        self.root.configure(bg="#020617")
        self.folder_path = tk.StringVar()
        self.setup_ui()

    def setup_ui(self):
        tk.Label(self.root, text="OFFLINE BULK RENAMER", font=("Impact", 24), bg="#020617", fg="#6366f1").pack(pady=30)
        tk.Button(self.root, text="BROWSE FOLDER", command=self.browse, bg="#6366f1", fg="white", font=("Arial", 10, "bold"), padx=20, pady=10).pack()
        tk.Entry(self.root, textvariable=self.folder_path, state='readonly', width=50).pack(pady=20)
        tk.Button(self.root, text="RENAME NOW", command=self.run, bg="#10b981", fg="white", font=("Arial", 12, "bold"), padx=40, pady=15).pack(pady=20)

    def browse(self):
        p = filedialog.askdirectory()
        if p: self.folder_path.set(p)

    def run(self):
        path = self.folder_path.get()
        if not path: return
        files = sorted([f for f in os.listdir(path) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))])
        for i, f in enumerate(files, 1):
            ext = os.path.splitext(f)[1]
            os.rename(os.path.join(path, f), os.path.join(path, f"auto-renamed-{i:03d}{ext}"))
        messagebox.showinfo("Success", "All files renamed!")

if __name__ == "__main__":
    root = tk.Tk()
    VisionRenamer(root)
    root.mainloop()`;
  }, []);

  const totalFiles = uploadedFiles.length;
  const processedFiles = uploadedFiles.filter(f => f.status === 'done').length;
  const progressPercent = totalFiles > 0 ? (processedFiles / totalFiles) * 100 : 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500/30">
      <header className="bg-slate-900/80 backdrop-blur-xl border-b border-white/5 px-10 py-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-6">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3.5 rounded-[1.2rem] shadow-[0_0_40px_-10px_rgba(99,102,241,0.6)]">
            <Icons.Code />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tighter">VISION AI RENAMER</h1>
            <p className="text-[9px] text-indigo-400 font-black uppercase tracking-[0.6em]">Full Automatic Visual Intelligence</p>
          </div>
        </div>
        
        <div className="flex bg-slate-800/40 p-1 rounded-2xl border border-white/5">
          <button onClick={() => setActiveTab('web')} className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'web' ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400 hover:text-slate-200'}`}>Cloud Engine</button>
          <button onClick={() => setActiveTab('code')} className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'code' ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400 hover:text-slate-200'}`}>Desktop Code</button>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-10 grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-4 space-y-10">
          <section className="bg-slate-900/50 rounded-[3rem] border border-white/5 p-10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/10 blur-[80px]"></div>
            <h2 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.5em] mb-10">Real-time Analysis Feed</h2>
            
            <div className="space-y-8">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-5xl font-black text-white tracking-tighter">{Math.round(progressPercent)}%</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Queue Completed</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-indigo-400">{processedFiles} / {totalFiles}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Images Named</p>
                </div>
              </div>

              <div className="h-5 bg-slate-950 rounded-full border border-white/5 p-1.5 shadow-inner">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000 shadow-[0_0_20px_rgba(99,102,241,0.4)]"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>

              <div className="grid grid-cols-2 gap-6 pt-4">
                <div className="bg-slate-950 p-5 rounded-3xl border border-white/5">
                  <label className="block text-[9px] font-black text-slate-500 uppercase mb-2 ml-1 tracking-widest">Start From</label>
                  <input type="number" value={settings.startNumber} onChange={(e) => setSettings({ ...settings, startNumber: parseInt(e.target.value) || 1 })} className="w-full bg-transparent outline-none font-black text-white text-xl" />
                </div>
                <div className="bg-slate-950 p-5 rounded-3xl border border-white/5">
                  <label className="block text-[9px] font-black text-slate-500 uppercase mb-2 ml-1 tracking-widest">Padding</label>
                  <select value={settings.zeroPad} onChange={(e) => setSettings({ ...settings, zeroPad: parseInt(e.target.value) })} className="w-full bg-transparent outline-none font-black text-white text-xl appearance-none cursor-pointer">
                    <option value={1} className="bg-slate-900">1</option>
                    <option value={2} className="bg-slate-900">01</option>
                    <option value={3} className="bg-slate-900">001</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          {activeTab === 'web' && uploadedFiles.length > 0 && (
            <div className="space-y-5">
              <button 
                onClick={downloadRenamedFiles}
                disabled={isProcessing || processedFiles === 0}
                className="w-full bg-white text-slate-950 p-8 rounded-[3rem] font-black uppercase tracking-[0.25em] shadow-[0_20px_50px_rgba(255,255,255,0.15)] hover:scale-[1.03] transition-all flex items-center justify-center gap-5 active:scale-95 disabled:opacity-20 disabled:grayscale"
              >
                {isProcessing ? 'Packaging ZIP...' : <><Icons.Download /> Get Renamed Files</>}
              </button>
              
              <button onClick={clearFiles} className="w-full py-2 text-[10px] font-black text-red-500 uppercase tracking-[0.4em] hover:text-red-400 transition-colors">
                Wipe All Data
              </button>
            </div>
          )}

          <div className="bg-slate-900/30 rounded-[2.5rem] p-10 border border-white/5">
             <div className="flex items-center gap-4 mb-6">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_15px_#6366f1]"></div>
                <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Vision Logic Active</h4>
             </div>
             <p className="text-[11px] font-medium text-slate-500 leading-loose italic">
               "Deep visual mapping enabled. Gemini 3 is providing high-density titles based on composition, lighting, and subjects. Manual overrides disabled for maximum precision."
             </p>
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col h-[850px]">
          {activeTab === 'web' ? (
            <div className="bg-slate-900/50 rounded-[3.5rem] border border-white/5 shadow-2xl flex flex-col h-full overflow-hidden relative">
              {uploadedFiles.length === 0 ? (
                <div 
                  className="flex-1 flex flex-col items-center justify-center p-24 text-center group"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                >
                  <div className="w-36 h-36 bg-white/5 rounded-[3.5rem] flex items-center justify-center text-indigo-400 mb-12 border border-white/5 shadow-inner group-hover:scale-110 transition-all duration-700">
                    <Icons.Upload />
                  </div>
                  <h2 className="text-5xl font-black text-white mb-6 tracking-tighter">DROP YOUR MEDIA</h2>
                  <p className="text-slate-400 max-w-sm mx-auto text-xs font-bold leading-loose uppercase tracking-[0.3em] mb-14">
                    AI Vision will start generating titles <span className="text-indigo-400 underline decoration-indigo-500/50">automatically</span>.
                  </p>
                  <button 
                    onClick={() => fileInputRef.current?.click()} 
                    className="px-20 py-7 bg-indigo-600 text-white rounded-[2rem] font-black uppercase tracking-[0.3em] shadow-[0_20px_40px_rgba(99,102,241,0.4)] hover:bg-indigo-500 transition-all active:scale-95"
                  >
                    Select Local Files
                  </button>
                  <input type="file" ref={fileInputRef} multiple onChange={handleFileUpload} className="hidden" accept={ACCEPTED_EXTENSIONS.join(',')} />
                </div>
              ) : (
                <>
                  <div className="px-12 py-8 border-b border-white/5 flex items-center justify-between bg-slate-900/60 backdrop-blur-3xl sticky top-0 z-20">
                    <div className="flex items-center gap-5">
                       <span className="text-[10px] font-black text-indigo-400 bg-indigo-500/10 px-5 py-2.5 rounded-full border border-indigo-500/20 uppercase tracking-widest">
                         {totalFiles} Visual Assets
                       </span>
                    </div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Autonomous Vision Stream</span>
                  </div>
                  
                  <div className="flex-1 overflow-auto p-10 space-y-6">
                    {uploadedFiles.map((item, index) => {
                      const ext = item.file.name.substring(item.file.name.lastIndexOf('.'));
                      const num = (settings.startNumber + index).toString().padStart(settings.zeroPad, '0');
                      
                      return (
                        <div key={item.id} className="group relative flex items-center gap-10 p-8 rounded-[3rem] bg-slate-800/20 border border-white/5 hover:bg-slate-800/50 hover:border-indigo-500/30 transition-all duration-700 animate-in fade-in slide-in-from-bottom-10">
                          <div className="w-32 h-32 rounded-[2.5rem] overflow-hidden bg-slate-950 border border-white/5 flex-shrink-0 relative shadow-2xl">
                             <img src={item.preview} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-all duration-1000" alt="Analysis" />
                             {item.status === 'processing' && (
                               <div className="absolute inset-0 bg-indigo-950/90 flex flex-col items-center justify-center gap-4">
                                 <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                 <span className="text-[7px] font-black text-indigo-400 uppercase tracking-[0.4em] animate-pulse">Scanning Asset</span>
                               </div>
                             )}
                             {item.status === 'done' && (
                               <div className="absolute bottom-3 right-3 bg-green-500 text-white p-2 rounded-full shadow-2xl scale-110">
                                 <Icons.Check />
                               </div>
                             )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                             <div className="flex items-center gap-4 mb-4">
                               <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] truncate flex-1">{item.file.name}</p>
                               {item.status === 'done' && <span className="text-[8px] bg-green-500/10 text-green-500 px-3 py-1 rounded-full font-black uppercase tracking-widest">Analyzed</span>}
                             </div>
                             
                             <div className="bg-slate-950/80 p-6 rounded-3xl border border-white/5 group-hover:border-indigo-500/20 transition-all">
                                {item.status === 'done' ? (
                                  <h3 className="text-sm font-mono font-black text-indigo-300 break-words leading-relaxed">
                                    {item.aiTitle}-{num}{ext}
                                  </h3>
                                ) : (
                                  <div className="space-y-3">
                                     <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500/50 w-1/3 animate-[shimmer_2s_infinite]"></div>
                                     </div>
                                     <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest animate-pulse">Computing Descriptive Mapping...</p>
                                  </div>
                                )}
                             </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="bg-slate-900 rounded-[3.5rem] border border-white/5 shadow-2xl flex flex-col h-full overflow-hidden">
               <div className="p-10 border-b border-white/5 flex items-center justify-between bg-slate-950/50 backdrop-blur-3xl">
                  <div className="flex items-center gap-4">
                    <div className="w-3.5 h-3.5 rounded-full bg-red-500/20 border border-red-500/50"></div>
                    <div className="w-3.5 h-3.5 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
                    <div className="w-3.5 h-3.5 rounded-full bg-green-500/20 border border-green-500/50"></div>
                  </div>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(pythonCode);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className={`px-12 py-5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.25em] transition-all shadow-2xl ${copied ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-white/5'}`}
                  >
                    {copied ? 'Optimized Code Copied' : 'Copy Desktop Engine'}
                  </button>
               </div>
               <div className="flex-1 overflow-auto p-16 font-mono text-[14px] leading-loose text-indigo-400/50 bg-slate-950/40">
                 <pre className="whitespace-pre">{pythonCode}</pre>
               </div>
            </div>
          )}
        </div>
      </main>

      <footer className="p-12 text-center border-t border-white/5 bg-slate-950/80">
        <div className="flex items-center justify-center gap-6 mb-6 opacity-30">
           <div className="h-[1px] w-24 bg-indigo-500"></div>
           <span className="text-white text-[10px] font-black uppercase tracking-[0.8em]">Neural Renaming System</span>
           <div className="h-[1px] w-24 bg-indigo-500"></div>
        </div>
        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.4em]">
          Gemini 3 Flash Integrated • Autonomous Workflow • Vision-First Architecture
        </p>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
        ::-webkit-scrollbar {
          width: 10px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.05);
          border-radius: 100px;
          border: 3px solid transparent;
          background-clip: content-box;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.1);
          background-clip: content-box;
        }
      `}} />
    </div>
  );
}
