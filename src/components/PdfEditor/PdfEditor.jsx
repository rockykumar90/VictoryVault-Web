import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { jsPDF } from 'jspdf';
import Modal from '../ui/Modal';
import { 
  ArrowLeft, 
  UploadCloud, 
  Trash2, 
  FileDown, 
  Type, 
  PenTool, 
  Image as ImageIcon, 
  Sparkles, 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Check, 
  SlidersHorizontal,
  Move,
  X,
  Plus
} from 'lucide-react';

// Dynamically load PDFJS from Cloudflare CDN
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

const HANDWRITING_FONTS = [
  { id: 'Caveat', name: 'Caveat (Casual)', family: "'Caveat', cursive" },
  { id: 'Dancing Script', name: 'Dancing Script (Elegant)', family: "'Dancing Script', cursive" },
  { id: 'Great Vibes', name: 'Great Vibes (Calligraphy)', family: "'Great Vibes', cursive" },
  { id: 'Pacifico', name: 'Pacifico (Bold Brush)', family: "'Pacifico', cursive" }
];

const NORMAL_FONTS = [
  { id: 'sans-serif', name: 'Sans-Serif (Standard)', family: 'sans-serif' },
  { id: 'serif', name: 'Serif (Formal)', family: 'serif' },
  { id: 'monospace', name: 'Monospace (Typewriter)', family: 'monospace' }
];

const COLOR_PRESETS = [
  { name: 'Black', hex: '#000000' },
  { name: 'Navy Blue', hex: '#1e3a8a' },
  { name: 'Royal Blue', hex: '#2563eb' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Dark Green', hex: '#166534' },
  { name: 'White', hex: '#ffffff' }
];

export default function PdfEditor() {
  const setMode = useAppStore((state) => state.setMode);

  // PDF Document State
  const [file, setFile] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomScale, setZoomScale] = useState(1.2);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Canvas Refs
  const pdfCanvasRef = useRef(null);
  const containerRef = useRef(null);

  // Annotations Store: { [pageNumber]: Array<AnnotationItem> }
  const [annotations, setAnnotations] = useState({});
  const [selectedId, setSelectedId] = useState(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, initialAnnX: 0, initialAnnY: 0 });

  // Signature Tool Modal State
  const [isSigModalOpen, setIsSigModalOpen] = useState(false);
  const [sigMode, setSigMode] = useState('upload'); // 'upload' | 'draw'
  const [sigRawImage, setSigRawImage] = useState(null);
  const [sigThreshold, setSigThreshold] = useState(200); // 100 - 255 for paper bg removal
  const [sigContrast, setSigContrast] = useState(130);  // contrast boost
  const [sigColorMode, setSigColorMode] = useState('black'); // 'original' | 'black' | 'navy'
  const [cleanedSigUrl, setCleanedSigUrl] = useState(null);

  // Draw Signature Pad Ref
  const drawCanvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // File Upload Handler
  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile || uploadedFile.type !== 'application/pdf') return;

    try {
      setIsLoadingPdf(true);
      setFile(uploadedFile);
      const arrayBuffer = await uploadedFile.arrayBuffer();
      const pdfjsLib = await loadPdfJs();
      const loadedPdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      setPdfDoc(loadedPdf);
      setNumPages(loadedPdf.numPages);
      setCurrentPage(1);
      setAnnotations({});
      setSelectedId(null);
    } catch (err) {
      console.error('Error loading PDF file:', err);
      alert('Failed to load PDF file. Please ensure it is a valid PDF.');
    } finally {
      setIsLoadingPdf(false);
    }
  };

  // Render current PDF page onto canvas
  useEffect(() => {
    if (!pdfDoc) return;

    let isMounted = true;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: zoomScale });
        const canvas = pdfCanvasRef.current;
        if (!canvas || !isMounted) return;

        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        if (isMounted) {
          setPageSize({ width: viewport.width, height: viewport.height });
        }

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport
        };

        await page.render(renderContext).promise;
      } catch (err) {
        console.error('Error rendering page:', err);
      }
    };

    renderPage();

    return () => {
      isMounted = false;
    };
  }, [pdfDoc, currentPage, zoomScale]);

  // Current page annotations list
  const currentAnnList = annotations[currentPage] || [];

  // Add new Text Annotation
  const handleAddText = (isHandwriting = false) => {
    const id = `text_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newAnnotation = {
      id,
      type: 'text',
      text: isHandwriting ? 'Sign Name' : 'Type Text Here',
      x: 35, // percentage of container width
      y: 35, // percentage of container height
      fontSize: 22,
      fontFamily: isHandwriting ? 'Caveat' : 'sans-serif',
      isHandwritten: isHandwriting,
      color: '#000000',
      fontWeight: 'normal'
    };

    setAnnotations(prev => ({
      ...prev,
      [currentPage]: [...(prev[currentPage] || []), newAnnotation]
    }));
    setSelectedId(id);
  };

  // Add Signature Annotation (From Cleaned Sig Data URL)
  const handleAttachSignature = (sigUrl) => {
    if (!sigUrl) return;
    const id = `sig_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newAnnotation = {
      id,
      type: 'signature',
      imgUrl: sigUrl,
      x: 40,
      y: 40,
      width: 180, // initial width in px
      height: 70   // initial height in px
    };

    setAnnotations(prev => ({
      ...prev,
      [currentPage]: [...(prev[currentPage] || []), newAnnotation]
    }));
    setSelectedId(id);
    setIsSigModalOpen(false);
  };

  // Update Annotation Property
  const updateAnnotation = (id, updates) => {
    setAnnotations(prev => ({
      ...prev,
      [currentPage]: (prev[currentPage] || []).map(ann => 
        ann.id === id ? { ...ann, ...updates } : ann
      )
    }));
  };

  // Delete Annotation
  const handleDeleteAnnotation = (id) => {
    setAnnotations(prev => ({
      ...prev,
      [currentPage]: (prev[currentPage] || []).filter(ann => ann.id !== id)
    }));
    if (selectedId === id) setSelectedId(null);
  };

  // Dragging Handlers
  const handlePointerDown = (e, ann) => {
    e.stopPropagation();
    setSelectedId(ann.id);
    setIsDragging(true);

    const containerRect = containerRef.current.getBoundingClientRect();
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
      initialX: ann.x,
      initialY: ann.y
    };
  };

  const handlePointerMove = (e) => {
    if (!isDragging || !selectedId) return;

    const { clientX, clientY, containerWidth, containerHeight, initialX, initialY } = dragStartRef.current;
    const deltaXPixels = e.clientX - clientX;
    const deltaYPixels = e.clientY - clientY;

    const deltaXPercent = (deltaXPixels / containerWidth) * 100;
    const deltaYPercent = (deltaYPixels / containerHeight) * 100;

    let newX = Math.max(0, Math.min(92, initialX + deltaXPercent));
    let newY = Math.max(0, Math.min(95, initialY + deltaYPercent));

    updateAnnotation(selectedId, { x: newX, y: newY });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  // ----------------------------------------------------
  // SIGNATURE CLEANING ALGORITHM
  // ----------------------------------------------------
  useEffect(() => {
    if (!sigRawImage || sigMode !== 'upload') return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = sigRawImage;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
      let hasInk = false;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Calculate luminosity / brightness
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

        // If brightness is greater than threshold, consider it paper background -> turn transparent
        if (brightness >= sigThreshold) {
          data[i + 3] = 0; // Alpha 0
        } else {
          // Darken ink / contrast adjustment
          const factor = (sigContrast / 100);
          let newR = Math.max(0, Math.min(255, (r - 128) * factor + 128));
          let newG = Math.max(0, Math.min(255, (g - 128) * factor + 128));
          let newB = Math.max(0, Math.min(255, (b - 128) * factor + 128));

          if (sigColorMode === 'black') {
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
          } else if (sigColorMode === 'navy') {
            data[i] = 10;
            data[i + 1] = 30;
            data[i + 2] = 120;
          } else {
            data[i] = newR;
            data[i + 1] = newG;
            data[i + 2] = newB;
          }

          // Track bounding box of non-transparent pixels
          const pxIndex = i / 4;
          const x = pxIndex % canvas.width;
          const y = Math.floor(pxIndex / canvas.width);

          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          hasInk = true;
        }
      }

      ctx.putImageData(imgData, 0, 0);

      // Auto trim empty margins if valid bounds found
      if (hasInk && maxX > minX && maxY > minY) {
        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;
        const trimmedCanvas = document.createElement('canvas');
        trimmedCanvas.width = cropW;
        trimmedCanvas.height = cropH;
        const trimmedCtx = trimmedCanvas.getContext('2d');
        trimmedCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
        setCleanedSigUrl(trimmedCanvas.toDataURL('image/png'));
      } else {
        setCleanedSigUrl(canvas.toDataURL('image/png'));
      }
    };
  }, [sigRawImage, sigThreshold, sigContrast, sigColorMode, sigMode]);

  // Digital Signature Pad Drawing Logic
  const startDrawing = (e) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = sigColorMode === 'navy' ? '#1e3a8a' : '#000000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawing(true);
  };

  const drawMove = (e) => {
    if (!isDrawing) return;
    const canvas = drawCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearDrawPad = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const saveDrawPad = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    handleAttachSignature(canvas.toDataURL('image/png'));
  };

  // ----------------------------------------------------
  // HIGH-RESOLUTION PDF EXPORT
  // ----------------------------------------------------
  const handleExportPdf = async () => {
    if (!pdfDoc) return;

    try {
      setIsExporting(true);
      setExportProgress(10);

      // Load PDF.js engine
      const pdfjsLib = await loadPdfJs();
      let pdfWriter = null;

      for (let i = 1; i <= numPages; i++) {
        setExportProgress(Math.round(10 + (i / numPages) * 85));

        const page = await pdfDoc.getPage(i);
        const exportScale = 2.0; // High DPI for crisp printing
        const viewport = page.getViewport({ scale: exportScale });

        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = viewport.width;
        exportCanvas.height = viewport.height;
        const ctx = exportCanvas.getContext('2d');

        // Render PDF page
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Render annotations for this page
        const pageAnns = annotations[i] || [];
        for (const ann of pageAnns) {
          if (ann.type === 'text') {
            ctx.save();
            ctx.fillStyle = ann.color || '#000000';
            const scaledFontSize = ann.fontSize * exportScale;
            
            // Calculate exact position offsets matching HTML DOM rendering
            const padX = 2 * (exportScale / (zoomScale / 1.2));
            const ascenderOffset = ann.isHandwritten ? (scaledFontSize * 0.06) : 0;

            const posX = (ann.x / 100) * exportCanvas.width + padX;
            const posY = (ann.y / 100) * exportCanvas.height + ascenderOffset;

            let fontFam = ann.fontFamily;
            if (ann.isHandwritten) {
              const fontObj = HANDWRITING_FONTS.find(f => f.id === ann.fontFamily);
              fontFam = fontObj ? fontObj.family : "'Caveat', cursive";
            }

            ctx.font = `${ann.fontWeight === 'bold' ? 'bold ' : ''}${scaledFontSize}px ${fontFam}`;
            ctx.textBaseline = 'top';
            ctx.fillText(ann.text, posX, posY);
            ctx.restore();
          } else if (ann.type === 'signature' && ann.imgUrl) {
            const posX = (ann.x / 100) * exportCanvas.width;
            const posY = (ann.y / 100) * exportCanvas.height;

            await new Promise((resolve) => {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.src = ann.imgUrl;
              img.onload = () => {
                const scaledW = ann.width * exportScale;
                const scaledH = ann.height * exportScale;
                ctx.drawImage(img, posX, posY, scaledW, scaledH);
                resolve();
              };
              img.onerror = () => resolve();
            });
          }
        }

        const imgData = exportCanvas.toDataURL('image/jpeg', 0.95);
        const isLandscape = viewport.width > viewport.height;
        const orientation = isLandscape ? 'l' : 'p';

        if (!pdfWriter) {
          pdfWriter = new jsPDF({
            orientation,
            unit: 'px',
            format: [viewport.width, viewport.height]
          });
        } else {
          pdfWriter.addPage([viewport.width, viewport.height], orientation);
        }

        pdfWriter.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height);
      }

      setExportProgress(100);
      const outputName = file ? file.name.replace(/\.pdf$/i, '_edited.pdf') : 'edited_document.pdf';
      pdfWriter.save(outputName);
    } catch (err) {
      console.error('Error exporting PDF:', err);
      alert('An error occurred while exporting your PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const selectedAnnotation = currentAnnList.find(ann => ann.id === selectedId);

  return (
    <div 
      className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 glass-panel p-5 rounded-2xl">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setMode('dashboard')}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all cursor-pointer border border-white/5"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              PDF Editor & Signature Suite
              <span className="text-xs font-normal bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/20">Client-Side Privacy</span>
            </h1>
            <p className="text-xs text-gray-400">
              {file ? `${file.name} (${formatSize(file.size)})` : 'Upload PDF to add text, handwriting fonts, and clean signatures'}
            </p>
          </div>
        </div>

        {file && (
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={() => {
                setFile(null);
                setPdfDoc(null);
                setAnnotations({});
                setSelectedId(null);
              }}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-red-500/10 text-gray-400 hover:text-red-400 text-xs font-semibold cursor-pointer border border-white/5 transition-all flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Change PDF
            </button>

            <button
              onClick={handleExportPdf}
              disabled={isExporting}
              className="btn-primary px-4 py-2 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-2"
            >
              {isExporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Exporting ({exportProgress}%)...
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4" />
                  Download Edited PDF
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Main Workspace Layout */}
      {!file ? (
        /* Upload Area */
        <div className="glass-panel rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[480px] border-2 border-dashed border-white/10 hover:border-purple-500/40 transition-all group">
          <div className="w-20 h-20 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-6 text-purple-400 group-hover:scale-110 transition-transform">
            <UploadCloud className="w-10 h-10" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">Upload your PDF Document</h3>
          <p className="text-gray-400 text-sm max-w-md mb-8 leading-relaxed">
            Drag and drop your PDF here or click below. Easily overlay typing text, converted handwriting script, or upload & clean signature photos.
          </p>

          <label className="btn-primary px-8 py-3.5 rounded-xl text-sm font-semibold cursor-pointer flex items-center gap-2 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all">
            <UploadCloud className="w-5 h-5" />
            Select PDF File
            <input 
              type="file" 
              accept="application/pdf" 
              onChange={handleFileUpload} 
              className="hidden" 
            />
          </label>

          <div className="mt-8 flex items-center gap-6 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-purple-400" />
              Client-Side Processing
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-purple-400" />
              Signature Background Cleaning
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-purple-400" />
              Cursive Handwriting Conversion
            </span>
          </div>
        </div>
      ) : (
        /* PDF Editing Workspace */
        <div className="grid lg:grid-cols-4 gap-6 items-start">
          
          {/* Left Toolbar / Controls (1 Col) */}
          <div className="lg:col-span-1 glass-panel p-5 rounded-2xl flex flex-col gap-5 sticky top-24">
            
            {/* Quick Action Buttons */}
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-3">
                Add Elements
              </label>
              <div className="grid grid-cols-1 gap-2.5">
                <button
                  onClick={() => handleAddText(false)}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-semibold cursor-pointer border border-white/5 transition-all"
                >
                  <Type className="w-4 h-4 text-indigo-400" />
                  + Normal Typing Text
                </button>

                <button
                  onClick={() => handleAddText(true)}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-xs font-semibold cursor-pointer border border-purple-500/20 transition-all"
                >
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  + Handwriting Script Text
                </button>

                <button
                  onClick={() => setIsSigModalOpen(true)}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-xs font-semibold cursor-pointer border border-blue-500/20 transition-all"
                >
                  <PenTool className="w-4 h-4 text-blue-400" />
                  + Clean Signature (Photo / Pad)
                </button>
              </div>
            </div>

            {/* Selected Element Controls */}
            {selectedAnnotation && (
              <div className="border-t border-white/10 pt-4 flex flex-col gap-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                    Edit {selectedAnnotation.type === 'text' ? 'Text' : 'Signature'}
                  </span>
                  <button
                    onClick={() => handleDeleteAnnotation(selectedAnnotation.id)}
                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer border border-red-500/20 transition-all"
                    title="Delete Element"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {selectedAnnotation.type === 'text' && (
                  <>
                    {/* Text Input */}
                    <div>
                      <label className="text-xs text-gray-400 block mb-1.5">Content</label>
                      <input 
                        type="text" 
                        value={selectedAnnotation.text} 
                        onChange={(e) => updateAnnotation(selectedAnnotation.id, { text: e.target.value })}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-purple-500"
                      />
                    </div>

                    {/* Font Mode / Style */}
                    <div>
                      <label className="text-xs text-gray-400 block mb-1.5">Style Mode</label>
                      <div className="grid grid-cols-2 gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5">
                        <button
                          onClick={() => updateAnnotation(selectedAnnotation.id, { 
                            isHandwritten: false, 
                            fontFamily: 'sans-serif' 
                          })}
                          className={`py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${!selectedAnnotation.isHandwritten ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-gray-400 hover:text-white'}`}
                        >
                          Normal
                        </button>
                        <button
                          onClick={() => updateAnnotation(selectedAnnotation.id, { 
                            isHandwritten: true, 
                            fontFamily: 'Caveat' 
                          })}
                          className={`py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${selectedAnnotation.isHandwritten ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'text-gray-400 hover:text-white'}`}
                        >
                          ✍️ Handwriting
                        </button>
                      </div>
                    </div>

                    {/* Font Family Selector */}
                    <div>
                      <label className="text-xs text-gray-400 block mb-1.5">Font Family</label>
                      <select
                        value={selectedAnnotation.fontFamily}
                        onChange={(e) => updateAnnotation(selectedAnnotation.id, { fontFamily: e.target.value })}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                      >
                        {(selectedAnnotation.isHandwritten ? HANDWRITING_FONTS : NORMAL_FONTS).map(font => (
                          <option key={font.id} value={font.id} className="bg-gray-900 text-white">
                            {font.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Font Size Slider */}
                    <div>
                      <div className="flex justify-between items-center mb-1 text-xs text-gray-400">
                        <span>Font Size</span>
                        <span className="text-white font-mono">{selectedAnnotation.fontSize}px</span>
                      </div>
                      <input 
                        type="range" 
                        min="12" 
                        max="64" 
                        value={selectedAnnotation.fontSize} 
                        onChange={(e) => updateAnnotation(selectedAnnotation.id, { fontSize: parseInt(e.target.value) })}
                        className="w-full accent-purple-500"
                      />
                    </div>

                    {/* Ink Color Picker */}
                    <div>
                      <label className="text-xs text-gray-400 block mb-1.5">Text Color</label>
                      <div className="flex items-center gap-2 flex-wrap">
                        {COLOR_PRESETS.map(c => (
                          <button
                            key={c.hex}
                            onClick={() => updateAnnotation(selectedAnnotation.id, { color: c.hex })}
                            style={{ backgroundColor: c.hex }}
                            className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer ${selectedAnnotation.color === c.hex ? 'scale-110 border-purple-400 shadow-md' : 'border-white/20 hover:scale-105'}`}
                            title={c.name}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {selectedAnnotation.type === 'signature' && (
                  <div>
                    <label className="text-xs text-gray-400 block mb-1.5">Signature Width</label>
                    <input 
                      type="range" 
                      min="80" 
                      max="350" 
                      value={selectedAnnotation.width} 
                      onChange={(e) => {
                        const newW = parseInt(e.target.value);
                        const ratio = selectedAnnotation.height / selectedAnnotation.width;
                        updateAnnotation(selectedAnnotation.id, { 
                          width: newW, 
                          height: Math.round(newW * ratio) 
                        });
                      }}
                      className="w-full accent-blue-500"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Page Navigation & Zoom Bar */}
            <div className="border-t border-white/10 pt-4 flex flex-col gap-3">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
                Navigation & Zoom
              </label>

              <div className="flex items-center justify-between bg-black/40 p-2 rounded-xl border border-white/5">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-semibold text-gray-300">
                  Page {currentPage} of {numPages}
                </span>
                <button
                  disabled={currentPage >= numPages}
                  onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setZoomScale(z => Math.max(0.6, z - 0.2))}
                  className="flex-1 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 flex items-center justify-center gap-1 cursor-pointer border border-white/5"
                >
                  <ZoomOut className="w-3.5 h-3.5" /> Zoom Out
                </button>
                <button
                  onClick={() => setZoomScale(z => Math.min(2.5, z + 0.2))}
                  className="flex-1 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 flex items-center justify-center gap-1 cursor-pointer border border-white/5"
                >
                  <ZoomIn className="w-3.5 h-3.5" /> Zoom In
                </button>
              </div>
            </div>
          </div>

          {/* Right Main PDF Preview Workspace (3 Cols) */}
          <div className="lg:col-span-3 flex flex-col items-center overflow-x-auto glass-panel p-6 rounded-2xl relative min-h-[600px] select-none">
            
            {isLoadingPdf && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-md z-30 flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm font-semibold text-white">Rendering PDF Page...</p>
              </div>
            )}

            {/* Container mapping Page & Overlay Annotations */}
            <div 
              ref={containerRef}
              className="relative shadow-2xl rounded-lg overflow-hidden bg-white border border-white/20"
              style={{
                width: pageSize.width ? `${pageSize.width}px` : 'auto',
                height: pageSize.height ? `${pageSize.height}px` : 'auto'
              }}
              onClick={() => setSelectedId(null)}
            >
              {/* PDF Canvas Layer */}
              <canvas ref={pdfCanvasRef} className="block w-full h-full" />

              {/* Overlay Annotations Layer */}
              {currentAnnList.map((ann) => {
                const isSelected = ann.id === selectedId;

                if (ann.type === 'text') {
                  const fontObj = HANDWRITING_FONTS.find(f => f.id === ann.fontFamily);
                  const fontStyleFamily = ann.isHandwritten 
                    ? (fontObj ? fontObj.family : "'Caveat', cursive")
                    : (ann.fontFamily || 'sans-serif');

                  return (
                    <div
                      key={ann.id}
                      onPointerDown={(e) => handlePointerDown(e, ann)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        left: `${ann.x}%`,
                        top: `${ann.y}%`,
                        fontFamily: fontStyleFamily,
                        fontSize: `${ann.fontSize * (zoomScale / 1.2)}px`,
                        color: ann.color || '#000000',
                        fontWeight: ann.fontWeight || 'normal',
                        cursor: isDragging ? 'grabbing' : 'grab',
                        lineHeight: 1,
                        padding: '2px 4px',
                        margin: 0,
                        transform: 'translate(0, 0)',
                        whiteSpace: 'nowrap'
                      }}
                      className={`rounded transition-shadow ${isSelected ? 'ring-2 ring-purple-500 bg-purple-500/10 shadow-lg' : 'hover:ring-1 hover:ring-purple-400/50'}`}
                    >
                      {ann.text}
                    </div>
                  );
                }

                if (ann.type === 'signature') {
                  const scaledW = ann.width * (zoomScale / 1.2);
                  const scaledH = ann.height * (zoomScale / 1.2);

                  return (
                    <div
                      key={ann.id}
                      onPointerDown={(e) => handlePointerDown(e, ann)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        left: `${ann.x}%`,
                        top: `${ann.y}%`,
                        width: `${scaledW}px`,
                        height: `${scaledH}px`,
                        cursor: isDragging ? 'grabbing' : 'grab'
                      }}
                      className={`p-1 rounded transition-shadow ${isSelected ? 'ring-2 ring-blue-500 bg-blue-500/10 shadow-lg' : 'hover:ring-1 hover:ring-blue-400/50'}`}
                    >
                      <img 
                        src={ann.imgUrl} 
                        alt="Signature" 
                        className="w-full h-full object-contain pointer-events-none"
                      />
                    </div>
                  );
                }

                return null;
              })}
            </div>
          </div>
        </div>
      )}

      {/* Signature Cleaning & Drawing Modal */}
      <Modal 
        isOpen={isSigModalOpen} 
        onClose={() => setIsSigModalOpen(false)}
        title="Add & Clean Signature"
      >
        <div className="flex flex-col gap-5">

            {/* Mode Switcher Tabs */}
            <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
              <button
                onClick={() => setSigMode('upload')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${sigMode === 'upload' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'text-gray-400 hover:text-white'}`}
              >
                Upload Photo & Remove Bg
              </button>
              <button
                onClick={() => setSigMode('draw')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${sigMode === 'draw' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'text-gray-400 hover:text-white'}`}
              >
                Draw Signature Pad
              </button>
            </div>

            {sigMode === 'upload' ? (
              <div className="flex flex-col gap-4">
                {!sigRawImage ? (
                  <label className="border-2 border-dashed border-white/15 hover:border-purple-500/50 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all">
                    <ImageIcon className="w-10 h-10 text-gray-400 mb-2" />
                    <span className="text-sm font-semibold text-white">Upload Signature Image</span>
                    <span className="text-xs text-gray-500 mt-1">Supports JPG, PNG photo of paper signature</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => setSigRawImage(ev.target?.result);
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                ) : (
                  <div className="flex flex-col gap-4">
                    {/* Real-time Clean Preview Box */}
                    <div className="bg-[#111] p-4 rounded-2xl border border-white/10 flex flex-col items-center gap-2">
                      <span className="text-xs text-gray-400">Cleaned Transparent Signature Preview:</span>
                      <div 
                        className="w-full h-32 rounded-xl flex items-center justify-center p-2 border border-white/5"
                        style={{
                          backgroundImage: 'radial-gradient(#333 1px, transparent 1px)',
                          backgroundSize: '12px 12px'
                        }}
                      >
                        {cleanedSigUrl && (
                          <img src={cleanedSigUrl} alt="Cleaned Preview" className="max-h-full max-w-full object-contain" />
                        )}
                      </div>
                    </div>

                    {/* Processing Controls */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>Paper Bg Removal Threshold</span>
                          <span className="font-mono text-white">{sigThreshold}</span>
                        </div>
                        <input 
                          type="range" 
                          min="120" 
                          max="245" 
                          value={sigThreshold} 
                          onChange={(e) => setSigThreshold(parseInt(e.target.value))}
                          className="w-full accent-purple-500"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>Ink Contrast</span>
                          <span className="font-mono text-white">{sigContrast}</span>
                        </div>
                        <input 
                          type="range" 
                          min="80" 
                          max="200" 
                          value={sigContrast} 
                          onChange={(e) => setSigContrast(parseInt(e.target.value))}
                          className="w-full accent-purple-500"
                        />
                      </div>
                    </div>

                    {/* Color Presets */}
                    <div>
                      <label className="text-xs text-gray-400 block mb-1.5">Ink Color Conversion</label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => setSigColorMode('original')}
                          className={`py-1.5 rounded-lg text-xs font-semibold border transition-all ${sigColorMode === 'original' ? 'bg-purple-500/20 border-purple-500 text-white' : 'border-white/10 text-gray-400'}`}
                        >
                          Original Ink
                        </button>
                        <button
                          onClick={() => setSigColorMode('black')}
                          className={`py-1.5 rounded-lg text-xs font-semibold border transition-all ${sigColorMode === 'black' ? 'bg-purple-500/20 border-purple-500 text-white' : 'border-white/10 text-gray-400'}`}
                        >
                          Clean Black
                        </button>
                        <button
                          onClick={() => setSigColorMode('navy')}
                          className={`py-1.5 rounded-lg text-xs font-semibold border transition-all ${sigColorMode === 'navy' ? 'bg-purple-500/20 border-purple-500 text-white' : 'border-white/10 text-gray-400'}`}
                        >
                          Navy Blue
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-between gap-3 mt-2">
                      <button
                        onClick={() => setSigRawImage(null)}
                        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300"
                      >
                        Choose Different Photo
                      </button>
                      <button
                        onClick={() => handleAttachSignature(cleanedSigUrl)}
                        className="btn-primary px-6 py-2 rounded-xl text-xs font-bold"
                      >
                        Attach Clean Signature to Document
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Draw Signature Pad */
              <div className="flex flex-col gap-4">
                <div className="border border-white/15 rounded-2xl overflow-hidden bg-white">
                  <canvas 
                    ref={drawCanvasRef}
                    width={480}
                    height={200}
                    onMouseDown={startDrawing}
                    onMouseMove={drawMove}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    className="w-full h-48 cursor-crosshair block"
                  />
                </div>

                <div className="flex justify-between items-center">
                  <button
                    onClick={clearDrawPad}
                    className="px-4 py-2 rounded-xl bg-white/5 hover:bg-red-500/10 text-xs font-semibold text-red-400 border border-white/5"
                  >
                    Clear Drawing
                  </button>
                  <button
                    onClick={saveDrawPad}
                    className="btn-primary px-6 py-2 rounded-xl text-xs font-bold"
                  >
                    Attach Drawn Signature
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
    </div>
  );
}
