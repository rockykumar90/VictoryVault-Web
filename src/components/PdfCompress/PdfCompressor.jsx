import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { jsPDF } from 'jspdf';
import Modal from '../ui/Modal';
import { 
  ArrowLeft, 
  UploadCloud, 
  Trash2, 
  RefreshCw, 
  FileDown, 
  Printer, 
  SlidersHorizontal,
  Minimize2,
  Sparkles,
  Percent,
  CheckCircle,
  FileText
} from 'lucide-react';

// Dynamically load PDFJS from Cloudflare CDN to avoid worker bundler issues
const loadPdfJs = () => {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      resolve(window.pdfjsLib);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error('Failed to load PDF.js engine'));
    document.head.appendChild(script);
  });
};

const formatSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default function PdfCompressor() {
  const setMode = useAppStore((state) => state.setMode);

  const [file, setFile] = useState(null);
  const [originalSize, setOriginalSize] = useState(0);
  const [compressedSize, setCompressedSize] = useState(0);
  
  // Compression parameters
  const [quality, setQuality] = useState(60); // 10% - 100%
  const [scale, setScale] = useState(80); // 50% - 100%
  
  // Status hooks
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'compressing' | 'completed' | 'error'
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Output variables
  const [compressedPdfBlob, setCompressedPdfBlob] = useState(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // Clean up Blob URLs when unmounting
  useEffect(() => {
    return () => {
      if (compressedPdfBlob) {
        URL.revokeObjectURL(compressedPdfBlob);
      }
    };
  }, [compressedPdfBlob]);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const processFile = (selectedFile) => {
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setOriginalSize(selectedFile.size);
      setCompressedSize(0);
      setCompressedPdfBlob(null);
      setStatus('idle');
      setErrorMsg('');
    } else {
      setErrorMsg('Invalid file format. Please upload a PDF document.');
      setStatus('error');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleCompress = async () => {
    if (!file) return;
    setStatus('loading');
    setProgressPct(0);
    setProgressMsg('Loading PDF rendering engine...');
    setErrorMsg('');

    try {
      const pdfjsLib = await loadPdfJs();
      
      setProgressMsg('Reading PDF structure...');
      const fileReader = new FileReader();
      const arrayBuffer = await new Promise((resolve, reject) => {
        fileReader.onload = () => resolve(fileReader.result);
        fileReader.onerror = () => reject(new Error('Failed to read file buffer'));
        fileReader.readAsArrayBuffer(file);
      });

      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdfDoc = await loadingTask.promise;
      const totalPages = pdfDoc.numPages;

      setStatus('compressing');
      
      // Initialize jsPDF
      // Fetch page 1 first to resolve initial viewport orientation
      const firstPage = await pdfDoc.getPage(1);
      const firstViewport = firstPage.getViewport({ scale: 1 });
      const isFirstLandscape = firstViewport.width > firstViewport.height;

      const newPdf = new jsPDF({
        orientation: isFirstLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const qVal = quality / 100;
      const sVal = scale / 100;

      for (let i = 1; i <= totalPages; i++) {
        setProgressPct(Math.round(((i - 1) / totalPages) * 100));
        setProgressMsg(`Rendering & compressing page ${i} of ${totalPages}...`);

        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: sVal });

        // Draw page on temporary canvas
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to initialize canvas context');

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;

        // Re-encode canvas image data to compressed JPEG
        const imgDataUrl = canvas.toDataURL('image/jpeg', qVal);

        const isLandscape = viewport.width > viewport.height;
        const pageW = isLandscape ? 297 : 210;
        const pageH = isLandscape ? 210 : 297;

        if (i > 1) {
          newPdf.addPage('a4', isLandscape ? 'landscape' : 'portrait');
        }

        // Draw full-bleed image onto page
        newPdf.addImage(imgDataUrl, 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST');
      }

      setProgressPct(100);
      setProgressMsg('Compiling finalized PDF...');

      const outputBlob = newPdf.output('blob');
      setCompressedSize(outputBlob.size);
      
      const fileUrl = URL.createObjectURL(outputBlob);
      setCompressedPdfBlob(fileUrl);
      
      setStatus('completed');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'An error occurred during PDF size reduction.');
      setStatus('error');
    }
  };

  const handleDownload = () => {
    if (!compressedPdfBlob) return;
    const link = document.createElement('a');
    link.href = compressedPdfBlob;
    const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    link.download = `${baseName}-compressed.pdf`;
    link.click();
  };

  const handlePrint = () => {
    if (!compressedPdfBlob) return;
    
    // Create an iframe and trigger printing on it
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.src = compressedPdfBlob;
    
    document.body.appendChild(iframe);
    
    iframe.onload = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      } catch (err) {
        console.error('Direct print failed, fallback to new tab', err);
        // Fallback: Open in new tab which auto-prints if standard autoPrint was set,
        // or let the browser open pdf viewer.
        window.open(compressedPdfBlob, '_blank');
        document.body.removeChild(iframe);
      }
    };
  };

  const handleReset = () => {
    setFile(null);
    setOriginalSize(0);
    setCompressedSize(0);
    if (compressedPdfBlob) {
      URL.revokeObjectURL(compressedPdfBlob);
    }
    setCompressedPdfBlob(null);
    setStatus('idle');
    setErrorMsg('');
  };

  const percentReduction = originalSize > 0 && compressedSize > 0
    ? Math.round(((originalSize - compressedSize) / originalSize) * 100)
    : 0;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6">
      {/* Header Bar */}
      <div className="flex items-center gap-4 mb-8 border-b border-white/5 pb-6">
        <button 
          onClick={() => setMode('dashboard')}
          className="p-2 rounded-xl bg-white/5 border border-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white flex items-center gap-2">
            <Minimize2 className="w-6 h-6 text-primary" />
            PDF Size Reducer
          </h1>
          <p className="text-sm text-gray-400">Compress document files completely in your browser without sacrificing legibility</p>
        </div>
      </div>

      {status === 'error' && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/25 rounded-2xl text-red-400 text-sm flex items-center gap-3 animate-fade-in">
          <span>⚠️ {errorMsg}</span>
          <button onClick={handleReset} className="ml-auto text-xs font-bold underline hover:no-underline">Reset</button>
        </div>
      )}

      {!file ? (
        /* Drag & Drop Upload Panel */
        <div 
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center min-h-[45vh] rounded-2xl border-2 border-dashed transition-all cursor-pointer p-8 text-center relative group
            ${isDragActive 
              ? 'border-primary bg-primary/10 shadow-[0_0_30px_rgba(170,59,255,0.2)]' 
              : 'border-white/10 bg-white/2 hover:border-primary/50 hover:bg-white/3'}`}
        >
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden" 
            accept="application/pdf"
          />
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center mb-6 shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform duration-300">
            <UploadCloud className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Drag & drop your PDF file here</h3>
          <p className="text-sm text-gray-400 max-w-sm leading-relaxed mb-6">
            Upload document PDFs. We will reduce file size using dynamic JPEG canvas downsampling.
          </p>
          <button className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold cursor-pointer">
            Select PDF File
          </button>
        </div>
      ) : (
        /* Compressor Settings and Actions Workspace */
        <div className="grid md:grid-cols-3 gap-8">
          {/* Settings Left Column */}
          <div className="md:col-span-1 space-y-6">
            <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-6">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-primary" />
                Compression Controls
              </h3>

              {/* Quality slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-gray-400">
                  <span>Image Quality</span>
                  <span className="font-bold text-primary">{quality}%</span>
                </div>
                <input 
                  type="range"
                  min={10}
                  max={90}
                  step={5}
                  value={quality}
                  disabled={status === 'loading' || status === 'compressing'}
                  onChange={(e) => setQuality(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50"
                />
                <p className="text-[10px] text-gray-500 leading-normal">
                  Higher quality produces sharper text and images but results in larger files.
                </p>
              </div>

              {/* Resolution scale slider */}
              <div className="space-y-1.5 pt-2 border-t border-white/5">
                <div className="flex justify-between text-xs font-semibold text-gray-400">
                  <span>Resolution Scale</span>
                  <span className="font-bold text-primary">{scale}%</span>
                </div>
                <input 
                  type="range"
                  min={50}
                  max={100}
                  step={5}
                  value={scale}
                  disabled={status === 'loading' || status === 'compressing'}
                  onChange={(e) => setScale(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50"
                />
                <p className="text-[10px] text-gray-500 leading-normal">
                  Scaling down decreases resolution of the image pages, highly effective for size savings.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-white/5 space-y-3">
                <button
                  onClick={handleCompress}
                  disabled={status === 'loading' || status === 'compressing'}
                  className="btn-primary w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Minimize2 className="w-4.5 h-4.5" />
                  Compress PDF
                </button>
                
                <button
                  onClick={handleReset}
                  disabled={status === 'loading' || status === 'compressing'}
                  className="w-full py-3 rounded-xl border border-white/5 bg-white/2 hover:bg-white/5 text-xs text-gray-300 hover:text-white font-semibold cursor-pointer transition-colors"
                >
                  Upload New File
                </button>
              </div>
            </div>
          </div>

          {/* Stats and Results Right Column */}
          <div className="md:col-span-2 space-y-6">
            {/* File info card */}
            <div className="glass-panel rounded-2xl border border-white/5 p-6 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-white text-base truncate" title={file.name}>
                  {file.name}
                </h4>
                <p className="text-xs text-gray-400 mt-1">
                  Original File Size: <strong className="text-gray-200">{formatSize(originalSize)}</strong>
                </p>
              </div>
            </div>

            {/* Status updates */}
            {(status === 'loading' || status === 'compressing') && (
              <div className="glass-panel rounded-2xl border border-white/5 p-8 flex flex-col items-center justify-center text-center space-y-6">
                <RefreshCw className="w-10 h-10 text-primary animate-spin" />
                <div className="space-y-2">
                  <h4 className="font-bold text-white text-base">Processing Document...</h4>
                  <p className="text-xs text-gray-400">{progressMsg}</p>
                </div>
                {/* Progress bar */}
                <div className="w-full max-w-xs bg-white/5 h-2 rounded-full overflow-hidden border border-white/5">
                  <div 
                    className="bg-gradient-to-r from-primary to-purple-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Completion results card */}
            {status === 'completed' && (
              <div className="glass-panel rounded-2xl border border-white/5 p-8 space-y-6 animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-lg">Compression Completed!</h4>
                    <p className="text-xs text-gray-400">PDF successfully compiled and compressed entirely client-side.</p>
                  </div>
                </div>

                {/* Compression stats meters */}
                <div className="grid sm:grid-cols-3 gap-4 py-4 border-t border-b border-white/5">
                  <div className="text-center p-4 bg-white/2 border border-white/5 rounded-xl">
                    <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold block mb-1">Before</span>
                    <strong className="text-lg text-gray-300">{formatSize(originalSize)}</strong>
                  </div>
                  <div className="text-center p-4 bg-white/2 border border-white/5 rounded-xl">
                    <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold block mb-1">After</span>
                    <strong className="text-lg text-white font-extrabold">{formatSize(compressedSize)}</strong>
                  </div>
                  <div className="text-center p-4 bg-primary/10 border border-primary/20 rounded-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-12 h-12 bg-primary/5 rounded-full blur-xl"></div>
                    <span className="text-[10px] text-primary uppercase tracking-widest font-bold block mb-1 flex items-center justify-center gap-1">
                      <Percent className="w-3.5 h-3.5" /> Size Saved
                    </span>
                    <strong className="text-xl text-primary font-black">
                      {percentReduction}% Less
                    </strong>
                  </div>
                </div>

                {/* Downloads triggers */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button 
                    onClick={handleDownload}
                    className="btn-primary flex-1 py-4 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer text-sm shadow-md"
                  >
                    <FileDown className="w-5 h-5" />
                    Download Compressed PDF
                  </button>

                  <button 
                    onClick={handlePrint}
                    className="flex-1 py-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-white font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors text-sm"
                  >
                    <Printer className="w-5 h-5 text-gray-400" />
                    Print Document
                  </button>
                </div>
              </div>
            )}
            
            {status === 'idle' && (
              <div className="glass-panel rounded-2xl border border-white/5 p-8 flex flex-col items-center justify-center text-center space-y-4">
                <Sparkles className="w-8 h-8 text-primary/40" />
                <div>
                  <h4 className="font-bold text-white text-base">Ready for Compression</h4>
                  <p className="text-xs text-gray-400 max-w-sm mx-auto leading-normal">
                    Adjust the quality and resolution sliders in the sidebar panel, then click **Compress PDF** to launch the processing script.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
