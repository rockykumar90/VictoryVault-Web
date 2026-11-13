import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useAppStore } from '../../store/useAppStore';
import { getCroppedImgFromReactImageCrop } from '../../utils/cropImage';
import ManualEraser from './ManualEraser';
import Modal from '../ui/Modal';
import { jsPDF } from 'jspdf';
import { 
  ArrowLeft, 
  Upload, 
  Camera, 
  Sparkles, 
  Sliders, 
  LayoutGrid, 
  Download, 
  ChevronRight, 
  HelpCircle,
  AlertCircle,
  RefreshCw,
  SlidersHorizontal,
  Settings,
  Printer
} from 'lucide-react';

export default function PassportStudio() {
  const {
    passportSrc,
    passportCropped,
    passportNoBg,
    passportFinal,
    passportBgColor,
    passportBrightness,
    passportContrast,
    passportSmoothness,
    passportCount,
    passportStatus,
    setPassportSrc,
    setPassportCropped,
    setPassportNoBg,
    setPassportFinal,
    setPassportBgColor,
    setPassportBrightness,
    setPassportContrast,
    setPassportSmoothness,
    setPassportCount,
    setPassportStatus,
    resetPassportStore,
    setMode,
    removeBgApiKey,
    hfToken,
    setRemoveBgApiKey,
    setHfToken
  } = useAppStore();

  const fileInputRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Cropper specific state
  const [crop, setCrop] = useState(null);
  const [completedCrop, setCompletedCrop] = useState(null);
  const [rotation, setRotation] = useState(0);
  const imageRef = useRef(null);
  const [selectedSlots, setSelectedSlots] = useState(Array.from({ length: 8 }, (_, i) => i));

  // Grid Layout Type: '42' (Default: 6x7 standard) or '63' (20% reduced: 7x9 compact, zero margin)
  const [gridType, setGridType] = useState('42');

  const gridConfig = gridType === '63' ? {
    cols: 7,
    rows: 9,
    totalSlots: 63,
    photoWidth: 24.7,
    photoHeight: 29.1,
    // (210 - 7 * 24.7) / 8 = 37.1 / 8 = 4.6375 mm (Left & Right margins and column gaps are all equally 4.64mm)
    colGap: (210 - 7 * 24.7) / 8,
    // (297 - 9 * 29.1) / 10 = 35.1 / 10 = 3.51 mm (Top & Bottom margins and row gaps are all equally 3.51mm)
    rowGap: (297 - 9 * 29.1) / 10,
    presets: [7, 14, 21, 28, 35, 42, 49, 56, 63],
    label: '63 Photos',
    sublabel: '7 × 9 (Equal Spacing & Margins)'
  } : {
    cols: 6,
    rows: 7,
    totalSlots: 42,
    photoWidth: 31,
    photoHeight: 37,
    colGap: 2,
    rowGap: 3,
    presets: [6, 12, 18, 24, 30, 36, 42],
    label: '42 Photos',
    sublabel: '6 × 7 (31 × 37 mm)'
  };

  const handleGridTypeChange = (type) => {
    setGridType(type);
    const newTotal = type === '63' ? 63 : 42;
    const defaultFill = type === '63' ? 7 : 6;
    const valid = selectedSlots.filter(id => id < newTotal);
    setSelectedSlots(valid.length > 0 ? valid : Array.from({ length: defaultFill }, (_, i) => i));
  };

  // Zoom and Pan states
  const cropContainerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  const handlePanXChange = (val) => {
    setPanX(val);
    const el = cropContainerRef.current;
    if (el) {
      const maxScroll = el.scrollWidth - el.clientWidth;
      el.scrollLeft = (val / 100) * maxScroll;
    }
  };

  const handlePanYChange = (val) => {
    setPanY(val);
    const el = cropContainerRef.current;
    if (el) {
      const maxScroll = el.scrollHeight - el.clientHeight;
      el.scrollTop = (val / 100) * maxScroll;
    }
  };

  const handleContainerScroll = () => {
    const el = cropContainerRef.current;
    if (el) {
      const maxScrollX = el.scrollWidth - el.clientWidth;
      const maxScrollY = el.scrollHeight - el.clientHeight;
      
      if (maxScrollX > 0) {
        setPanX(Math.round((el.scrollLeft / maxScrollX) * 100));
      } else {
        setPanX(0);
      }
      
      if (maxScrollY > 0) {
        setPanY(Math.round((el.scrollTop / maxScrollY) * 100));
      } else {
        setPanY(0);
      }
    }
  };

  useEffect(() => {
    if (zoom === 1) {
      setPanX(0);
      setPanY(0);
      const el = cropContainerRef.current;
      if (el) {
        el.scrollLeft = 0;
        el.scrollTop = 0;
      }
    }
  }, [zoom]);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleContainerScroll();
    }, 100);
    return () => clearTimeout(timer);
  }, [zoom]);

  useEffect(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, [passportSrc]);
  
  // AI loader states
  const [aiProgress, setAiProgress] = useState(0);
  const [aiMessage, setAiMessage] = useState('Initializing AI Background Removal...');
  const [aiError, setAiError] = useState(null);

  // Trigger crop save
  const onImageLoad = (e) => {
    // No default crop selection; user draws selection manually
    setCrop(null);
    setCompletedCrop(null);
  };

  const handleSaveCrop = async () => {
    if (!passportSrc || !completedCrop || !imageRef.current) return;
    try {
      const { url } = await getCroppedImgFromReactImageCrop(
        passportSrc,
        completedCrop,
        imageRef.current.width,
        imageRef.current.height,
        rotation
      );
      setPassportCropped(url);
    } catch (e) {
      console.error('Failed to crop passport image', e);
    }
  };

  // Run AI Background Removal
  useEffect(() => {
    if (passportStatus !== 'bg-remove' || !passportCropped) return;

    let isSubscribed = true;
    let progressInterval = null;

    const runAiBackgroundRemoval = async () => {
      try {
        setAiProgress(15);
        setAiMessage('Uploading photo to secure AI server...');
        setAiError(null);

        // Simulated progress interval to smoothly advance progress bar while waiting
        let progressVal = 15;
        progressInterval = setInterval(() => {
          if (progressVal < 90) {
            progressVal += 5;
            if (isSubscribed) {
              setAiProgress(progressVal);
              if (progressVal < 35) {
                setAiMessage('Uploading photo to secure AI server...');
              } else if (progressVal < 55) {
                setAiMessage('Connecting to high-precision BiRefNet model...');
              } else if (progressVal < 70) {
                setAiMessage('Analyzing portrait features & hair edges...');
              } else if (progressVal < 85) {
                setAiMessage('Refining transparency mask...');
              } else {
                setAiMessage('Downloading transparent output image...');
              }
            }
          }
        }, 1200);

        // Convert cropped object URL to file blob
        const response = await fetch(passportCropped);
        const blob = await response.blob();
        const file = new File([blob], 'passport-crop.jpg', { type: 'image/jpeg' });

        const formData = new FormData();
        formData.append('file', file);

        // Set custom headers if user has provided API keys
        const headers = {};
        if (removeBgApiKey) {
          headers['x-remove-bg-api-key'] = removeBgApiKey;
        }
        if (hfToken) {
          headers['x-hf-token'] = hfToken;
        }

        // Query backend proxy API
        const apiBaseUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : 'https://victoryvault-api.onrender.com');
        const apiResponse = await fetch(`${apiBaseUrl}/api/remove-bg`, {
          method: 'POST',
          headers: headers,
          body: formData
        });

        if (progressInterval) clearInterval(progressInterval);

        if (!apiResponse.ok) {
          const errData = await apiResponse.json().catch(() => ({}));
          throw new Error(errData.error || `Server error (${apiResponse.status})`);
        }

        const resultData = await apiResponse.json();
        if (resultData.url) {
          if (isSubscribed) {
            setAiProgress(100);
            setPassportNoBg(resultData.url);
          }
          return; // Success!
        }
        throw new Error('Server returned empty background url');

      } catch (err) {
        if (progressInterval) clearInterval(progressInterval);
        console.warn('Cloud AI background removal failed, launching local browser AI engine fallback...', err);
        
        if (!isSubscribed) return;

        // Fallback: Local Client-side AI removal using @imgly
        try {
          setAiMessage('Using local browser AI engine fallback...');
          setAiProgress(40);
          
          const removeBackgroundModule = await import('@imgly/background-removal');
          const removeBackground = removeBackgroundModule.removeBackground || removeBackgroundModule.default || removeBackgroundModule;

          if (!isSubscribed) return;

          const resultBlob = await removeBackground(passportCropped, {
            progress: (key, current, total) => {
              if (isSubscribed) {
                const pct = Math.round((current / total) * 100);
                if (key.includes('fetch')) {
                  setAiMessage(`Downloading local models: ${pct}%`);
                  setAiProgress(40 + Math.round(pct * 0.3));
                } else {
                  setAiMessage(`Local inference: ${pct}%`);
                  setAiProgress(70 + Math.round(pct * 0.25));
                }
              }
            }
          });

          if (!isSubscribed) return;

          setAiProgress(100);
          const resultUrl = URL.createObjectURL(resultBlob);
          setPassportNoBg(resultUrl);
        } catch (fallbackErr) {
          console.error('Local background removal also failed:', fallbackErr);
          if (isSubscribed) {
            setAiError('Both cloud AI and local browser AI engines failed to remove background. Please skip to manually brush.');
          }
        }
      }
    };

    runAiBackgroundRemoval();

    return () => {
      isSubscribed = false;
      if (progressInterval) clearInterval(progressInterval);
    };
  }, [passportStatus, passportCropped]);

  // Redraw preview canvas in Enhancements stage
  useEffect(() => {
    if (passportStatus !== 'enhancements' || !passportFinal) return;

    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Paint Background color
      ctx.fillStyle = passportBgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Paint processed Image with CSS-like filters
      ctx.save();
      ctx.filter = `brightness(${passportBrightness}%) contrast(${passportContrast}%)`;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    };
    img.src = passportFinal;
  }, [passportStatus, passportFinal, passportBgColor, passportBrightness, passportContrast, passportSmoothness]);

  const handleSkipAi = () => {
    // Skip to manual editing using the cropped image as base
    setPassportNoBg(passportCropped);
  };

  const handleManualSave = (transparentDataUrl) => {
    setPassportFinal(transparentDataUrl);
    setPassportStatus('enhancements');
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setPassportSrc(url);
    }
  };

  // Generate finalized single photo dataURL for layout grid
  const getEnhancedPhotoDataUrl = () => {
    return new Promise((resolve) => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 366; // 3.1cm in 300 DPI
      tempCanvas.height = 437; // 3.7cm in 300 DPI
      const ctx = tempCanvas.getContext('2d');

      // Paint BG
      ctx.fillStyle = passportBgColor;
      ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

      // Apply Filter & draw image
      const img = new Image();
      img.onload = () => {
        ctx.filter = `brightness(${passportBrightness}%) contrast(${passportContrast}%)`;
        ctx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
        resolve(tempCanvas.toDataURL('image/jpeg', 0.95));
      };
      img.onerror = () => {
        resolve(passportFinal);
      };
      img.src = passportFinal;
    });
  };

  // Generate A4 Sheet PDF containing the grid
  const handleDownloadA4Pdf = async (shouldPrint = false) => {
    const imgData = await getEnhancedPhotoDataUrl();

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const a4Width = 210;
    const a4Height = 297;
    
    const photoWidth = gridConfig.photoWidth; // mm
    const photoHeight = gridConfig.photoHeight; // mm
    const colGap = gridConfig.colGap; // mm
    const rowGap = gridConfig.rowGap; // mm
    const cols = gridConfig.cols;
    const rows = gridConfig.rows;

    // Calculate grid starting coordinates to center on A4 page
    const gridWidth = cols * photoWidth + (cols - 1) * colGap;
    const gridHeight = rows * photoHeight + (rows - 1) * rowGap;

    const startX = (a4Width - gridWidth) / 2;
    const startY = (a4Height - gridHeight) / 2;

    for (let i = 0; i < gridConfig.totalSlots; i++) {
      if (!selectedSlots.includes(i)) continue;

      const col = i % cols;
      const row = Math.floor(i / cols);

      const x = startX + col * (photoWidth + colGap);
      const y = startY + row * (photoHeight + rowGap);

      // Draw photo
      pdf.addImage(imgData, 'JPEG', x, y, photoWidth, photoHeight);

      // Draw solid thin black line border
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineDashPattern([], 0);
      pdf.setLineWidth(0.15);
      pdf.rect(x, y, photoWidth, photoHeight);
    }

    if (shouldPrint) {
      pdf.autoPrint();
      const blobUrl = pdf.output('bloburl');
      window.open(blobUrl, '_blank');
    } else {
      pdf.save(`passport-print-sheet-${gridType}photos.pdf`);
    }
  };

  // Generate A4 Sheet Image (JPEG) containing the grid
  const handleDownloadA4Image = async () => {
    const imgData = await getEnhancedPhotoDataUrl();

    // Create a 300 DPI A4 Canvas (2480 x 3508 pixels)
    const printCanvas = document.createElement('canvas');
    printCanvas.width = 2480;
    printCanvas.height = 3508;
    const ctx = printCanvas.getContext('2d');

    // Fill white backdrop
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, printCanvas.width, printCanvas.height);

    const mmToPx = (mm) => Math.round((mm / 25.4) * 300);

    const photoWidthPx = mmToPx(gridConfig.photoWidth);
    const photoHeightPx = mmToPx(gridConfig.photoHeight);
    const colGapPx = mmToPx(gridConfig.colGap);
    const rowGapPx = mmToPx(gridConfig.rowGap);
    const cols = gridConfig.cols;
    const rows = gridConfig.rows;

    const gridWidthMm = cols * gridConfig.photoWidth + (cols - 1) * gridConfig.colGap;
    const gridHeightMm = rows * gridConfig.photoHeight + (rows - 1) * gridConfig.rowGap;

    const startX = (210 - gridWidthMm) / 2;
    const startY = (297 - gridHeightMm) / 2;

    const startXPx = mmToPx(startX);
    const startYPx = mmToPx(startY);

    const img = new Image();
    img.onload = () => {
      // Draw Grid
      for (let i = 0; i < gridConfig.totalSlots; i++) {
        if (!selectedSlots.includes(i)) continue;

        const col = i % cols;
        const row = Math.floor(i / cols);

        const x = mmToPx(startX + col * (gridConfig.photoWidth + gridConfig.colGap));
        const y = mmToPx(startY + row * (gridConfig.photoHeight + gridConfig.rowGap));

        // Draw photo
        ctx.drawImage(img, x, y, photoWidthPx, photoHeightPx);

        // Draw thin solid black border
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(x, y, photoWidthPx, photoHeightPx);
      }

      // Download trigger
      const link = document.createElement('a');
      link.download = `passport-print-sheet-${gridType}photos.jpg`;
      link.href = printCanvas.toDataURL('image/jpeg', 0.95);
      link.click();
    };
    img.src = imgData;
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6">
      {/* Wizard Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 border-b border-white/5 pb-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              resetPassportStore();
              setMode('dashboard');
            }}
            className="p-2 rounded-xl bg-white/5 border border-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white">Passport Photo Maker</h1>
            <p className="text-sm text-gray-400">Generate bio-metric passport photos using AI background eraser</p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl bg-white/5 border border-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer flex items-center gap-1.5"
            title="AI Settings"
          >
            <Settings className="w-4.5 h-4.5" />
            <span className="text-xs font-semibold">AI Settings</span>
          </button>

          {passportSrc && (
            <div className="text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Step: {passportStatus.toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* STEP 1: Upload */}
      {passportStatus === 'upload' && (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center min-h-[50vh] rounded-2xl border-2 border-dashed border-white/10 bg-white/2 hover:border-blue-500/50 hover:bg-white/3 transition-all cursor-pointer p-8 text-center group"
        >
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden" 
            accept="image/*"
          />
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform duration-300">
            <Camera className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Upload your passport photo</h3>
          <p className="text-sm text-gray-400 max-w-sm leading-relaxed mb-6">
            Ensure you are facing forward with good lighting. We will automatically crop it and strip the background.
          </p>
          <button className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold cursor-pointer bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-blue-500/25">
            Select Photo
          </button>
        </div>
      )}

      {/* STEP 2: Strict Aspect Crop */}
      {passportStatus === 'crop' && (
        <div className="grid lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 glass-panel rounded-2xl p-6 flex flex-col gap-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Camera className="w-5 h-5 text-blue-400" />
              Aspect Ratio Alignment
            </h3>
            
            <div className="flex flex-col items-center w-full gap-2">
              <div className="flex items-stretch w-full gap-3 h-[280px] sm:h-[400px]">
                {/* Image Crop Container */}
                <div 
                  ref={cropContainerRef}
                  onScroll={handleContainerScroll}
                  className="relative flex-1 bg-black/40 rounded-xl border border-white/5 p-4 overflow-auto flex"
                >
                  <div className="m-auto">
                    <ReactCrop
                      crop={crop}
                      onChange={(c) => setCrop(c)}
                      onComplete={(c) => setCompletedCrop(c)}
                      style={{
                        maxWidth: 'none',
                        maxHeight: 'none'
                      }}
                    >
                      <img
                        ref={imageRef}
                        src={passportSrc}
                        alt="Passport source"
                        style={{ 
                          transform: `rotate(${rotation}deg)`, 
                          maxHeight: `${320 * zoom}px`,
                          maxWidth: 'none',
                          width: 'auto',
                          height: 'auto',
                          display: 'block'
                        }}
                        onLoad={onImageLoad}
                      />
                    </ReactCrop>
                  </div>
                </div>

                {/* Vertical Pan Slider */}
                {zoom > 1 && (
                  <div className="flex flex-col items-center justify-between py-4 bg-black/20 rounded-xl border border-white/5 px-2 w-10 shrink-0">
                    <span className="text-[9px] font-bold text-gray-500 select-none uppercase tracking-wider">Top</span>
                    <input 
                      type="range" 
                      min={0} 
                      max={100}
                      value={panY}
                      onChange={(e) => handlePanYChange(parseInt(e.target.value))}
                      className="h-full w-2 accent-blue-500 cursor-pointer"
                      style={{
                        writingMode: 'vertical-lr',
                        direction: 'rtl',
                        appearance: 'slider-vertical',
                        WebkitAppearance: 'slider-vertical'
                      }}
                    />
                    <span className="text-[9px] font-bold text-gray-500 select-none uppercase tracking-wider">Bot</span>
                  </div>
                )}
              </div>

              {/* Horizontal Pan Slider */}
              {zoom > 1 && (
                <div className="flex items-center gap-3 w-full bg-black/20 rounded-xl border border-white/5 py-2 px-4">
                  <span className="text-[9px] font-bold text-gray-500 select-none uppercase tracking-wider">Left</span>
                  <input 
                    type="range" 
                    min={0} 
                    max={100}
                    value={panX}
                    onChange={(e) => handlePanXChange(parseInt(e.target.value))}
                    className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <span className="text-[9px] font-bold text-gray-500 select-none uppercase tracking-wider">Right</span>
                </div>
              )}
            </div>



            <div className="flex justify-end gap-3 border-t border-white/5 pt-4">
              <button 
                onClick={() => setPassportSrc(null)}
                className="px-5 py-2.5 rounded-xl bg-white/5 text-gray-300 hover:text-white transition-colors text-sm font-semibold cursor-pointer"
              >
                Re-upload
              </button>
              <button 
                onClick={handleSaveCrop}
                disabled={!completedCrop || !completedCrop.width || !completedCrop.height}
                className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold cursor-pointer bg-gradient-to-r from-blue-500 to-indigo-600 shadow-blue-500/20 disabled:opacity-50"
              >
                Crop Photo
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-6 w-full">
            {/* Biometric Requirements */}
            <div className="glass-panel rounded-2xl p-6 space-y-4">
              <h4 className="font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-blue-400" />
                Biometric Requirements
              </h4>
              <ul className="space-y-3 text-xs text-gray-400 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                  Align your head in the center of the grids.
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                  Make sure your shoulders are slightly visible.
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                  The frame is strictly locked to the standard 3.1cm x 3.7cm passport dimensions.
                </li>
              </ul>
            </div>

            {/* Alignment Controls Card */}
            <div className="glass-panel rounded-2xl p-6 space-y-6">
              <h4 className="font-bold text-white flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-blue-400" />
                Alignment Controls
              </h4>

              {/* Fine straighten rotation slider */}
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-semibold text-gray-400">
                  <span>Straighten Photo (Fine Tilt)</span>
                  <span className="text-blue-400 font-bold">{rotation}°</span>
                </div>
                <div className="flex flex-col gap-2">
                  <input 
                    type="range" 
                    min={-180} 
                    max={180} 
                    step={0.5}
                    value={rotation}
                    onChange={(e) => setRotation(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <div className="flex gap-2 w-full">
                    <button 
                      onClick={() => setRotation(prev => {
                        let r = prev - 90;
                        if (r < -180) r += 360;
                        return r;
                      })}
                      className="flex-1 py-2 rounded-xl bg-white/5 border border-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors text-xs font-semibold cursor-pointer text-center"
                      title="Rotate 90° Left"
                    >
                      90° ↺
                    </button>
                    <button 
                      onClick={() => setRotation(0)}
                      className="px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:text-blue-300 transition-colors text-xs font-semibold cursor-pointer"
                    >
                      Reset
                    </button>
                    <button 
                      onClick={() => setRotation(prev => {
                        let r = prev + 90;
                        if (r > 180) r -= 360;
                        return r;
                      })}
                      className="flex-1 py-2 rounded-xl bg-white/5 border border-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors text-xs font-semibold cursor-pointer text-center"
                      title="Rotate 90° Right"
                    >
                      90° ↻
                    </button>
                  </div>
                </div>
              </div>

              {/* Zoom Slider */}
              <div className="space-y-3 pt-4 border-t border-white/5">
                <div className="flex justify-between text-xs font-semibold text-gray-400">
                  <span>Zoom Level</span>
                  <span className="text-blue-400 font-bold">{Math.round(zoom * 100)}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => {
                      const newZoom = Math.max(1, zoom - 0.2);
                      setZoom(newZoom);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/5 text-gray-300 hover:text-white text-xs font-bold cursor-pointer animate-none"
                  >
                    -
                  </button>
                  <input 
                    type="range" 
                    min={1} 
                    max={4} 
                    step={0.05}
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <button 
                    onClick={() => {
                      const newZoom = Math.min(4, zoom + 0.2);
                      setZoom(newZoom);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/5 text-gray-300 hover:text-white text-xs font-bold cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: AI Background Removal */}
      {passportStatus === 'bg-remove' && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] glass-panel rounded-2xl p-8 max-w-md mx-auto text-center border border-white/5 shadow-2xl">
          {aiError ? (
            <div className="space-y-6">
              <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto border border-red-500/20">
                <AlertCircle className="w-7 h-7 text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-white">AI Layer Extraction Interrupted</h3>
              <p className="text-xs text-gray-400 leading-relaxed max-w-xs mx-auto">
                {aiError}
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <button 
                  onClick={() => setPassportStatus('bg-remove')}
                  className="btn-primary py-2.5 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Retry AI removal
                </button>
                <button 
                  onClick={handleSkipAi}
                  className="px-4 py-2.5 rounded-xl bg-white/5 text-gray-300 hover:text-white transition-colors text-xs font-semibold cursor-pointer border border-white/5"
                >
                  Skip to Manual Eraser Brush
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 w-full">
              <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-1">Removing Background</h3>
                <p className="text-xs text-gray-400">{aiMessage}</p>
              </div>
              {/* Progress Slider */}
              <div className="space-y-1.5 w-full max-w-[280px] mx-auto">
                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${aiProgress}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-500 font-bold tracking-widest">{aiProgress}% COMPLETED</span>
              </div>
              <button 
                onClick={handleSkipAi}
                className="text-xs text-gray-500 hover:text-gray-300 font-semibold underline block mx-auto cursor-pointer pt-4"
              >
                Skip AI (Go straight to manual editor)
              </button>
            </div>
          )}
        </div>
      )}

      {/* STEP 4: Manual Eraser Canvas */}
      {passportStatus === 'manual-edit' && (
        <div className="glass-panel rounded-xl sm:rounded-2xl p-3 sm:p-6 border border-white/5 flex flex-col h-[75vh] sm:h-[80vh] min-h-[480px] sm:min-h-[600px]">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400" />
              Fine-Tune Background Layer
            </h3>
            <p className="text-xs text-gray-400">Brush away remaining backgrounds, or restore details like hair/ears accidentally cut by the AI.</p>
          </div>
          
          <div className="flex-1 min-h-0">
            <ManualEraser 
              originalSrc={passportCropped}
              bgRemovedSrc={passportNoBg}
              onSave={handleManualSave}
              onCancel={() => setPassportStatus('crop')}
            />
          </div>
        </div>
      )}

      {/* STEP 5: Color Pickers & Enhancement Sliders */}
      {passportStatus === 'enhancements' && (
        <div className="grid lg:grid-cols-3 gap-8 items-start">
          {/* Canvas Preview */}
          <div className="lg:col-span-1 glass-panel rounded-2xl p-6 flex flex-col items-center gap-6">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider text-center w-full">Passport Preview</h3>
            
            <div className="relative aspect-[3.1/3.7] w-full max-w-[240px] bg-black/20 rounded-xl overflow-hidden border border-white/10 shadow-2xl flex items-center justify-center">
              <canvas 
                ref={previewCanvasRef} 
                width={366} 
                height={437}
                className="w-full h-full object-contain"
              />
            </div>
            
            <div className="text-center">
              <span className="text-xs font-bold text-white uppercase tracking-widest px-2.5 py-1 rounded bg-white/5 border border-white/5">
                3.1 x 3.7 cm
              </span>
              <p className="text-[10px] text-gray-500 mt-2">Print Resolution: 300 DPI</p>
            </div>
          </div>

          {/* Controls */}
          <div className="lg:col-span-2 space-y-6">
            {/* Background Color Panel */}
            <div className="glass-panel rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-blue-400" />
                Background Color Setup
              </h3>
              
              <div className="flex flex-wrap gap-3 items-center">
                {[
                  { name: 'Plain White', value: '#FFFFFF' },
                  { name: 'Off White', value: '#F4F5F7' },
                  { name: 'Passport Blue', value: '#0047AB' },
                  { name: 'Light Blue', value: '#A4C2E4' },
                  { name: 'Dark Blue', value: '#0A1128' },
                  { name: 'Light Gray', value: '#E5E7EB' }
                ].map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setPassportBgColor(color.value)}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors
                      ${passportBgColor === color.value 
                        ? 'border-blue-500 bg-blue-500/10 text-white' 
                        : 'border-white/5 bg-white/2 text-gray-400 hover:text-white'}`}
                  >
                    <span 
                      className="w-3.5 h-3.5 rounded border border-white/10" 
                      style={{ backgroundColor: color.value }} 
                    />
                    {color.name}
                  </button>
                ))}

                {/* Custom Color Input */}
                <div className="flex items-center gap-2 pl-2 border-l border-white/10">
                  <span className="text-xs text-gray-400">Custom:</span>
                  <input 
                    type="color" 
                    value={passportBgColor}
                    onChange={(e) => setPassportBgColor(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                  />
                </div>
              </div>
            </div>

            {/* Adjustments Panel */}
            <div className="glass-panel rounded-2xl p-6 space-y-6">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-blue-400" />
                Image Enhancements
              </h3>

              <div className="space-y-5">
                {/* Brightness */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-gray-400">
                    <span>Brightness</span>
                    <span>{passportBrightness}%</span>
                  </div>
                  <input 
                    type="range"
                    min={60}
                    max={150}
                    value={passportBrightness}
                    onChange={(e) => setPassportBrightness(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Contrast */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-gray-400">
                    <span>Contrast</span>
                    <span>{passportContrast}%</span>
                  </div>
                  <input 
                    type="range"
                    min={60}
                    max={150}
                    value={passportContrast}
                    onChange={(e) => setPassportContrast(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setPassportStatus('manual-edit')}
                className="px-5 py-3 rounded-xl bg-white/5 border border-white/5 text-gray-300 hover:text-white transition-colors text-sm font-semibold cursor-pointer"
              >
                Back to Manual Brush
              </button>
              <button
                onClick={() => setPassportStatus('layout')}
                className="btn-primary px-7 py-3 rounded-xl text-sm font-semibold cursor-pointer bg-gradient-to-r from-blue-500 to-indigo-600 shadow-blue-500/20 flex items-center gap-1.5"
              >
                Next Step: Sheet Layout
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 6: Layout A4 Grid & Download */}
      {passportStatus === 'layout' && (
        <div className="grid lg:grid-cols-3 gap-8 items-start">
          {/* Grid Layout Setup */}
          <div className="lg:col-span-1 glass-panel rounded-2xl p-6 space-y-6">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-blue-400" />
              Printing Grid Setup
            </h3>

            {/* Grid Layout Switcher: 2 Buttons */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                Select Grid Layout
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleGridTypeChange('42')}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    gridType === '42'
                      ? 'border-blue-500 bg-blue-500/15 text-white ring-1 ring-blue-500/50 shadow-md'
                      : 'border-white/10 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <div className="text-xs font-bold flex items-center justify-between">
                    <span>42 Photos</span>
                    {gridType === '42' && <span className="w-2 h-2 rounded-full bg-blue-400"></span>}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">6 × 7 (31 × 37 mm)</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleGridTypeChange('63')}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    gridType === '63'
                      ? 'border-blue-500 bg-blue-500/15 text-white ring-1 ring-blue-500/50 shadow-md'
                      : 'border-white/10 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <div className="text-xs font-bold flex items-center justify-between">
                    <span>63 Photos</span>
                    {gridType === '63' && <span className="w-2 h-2 rounded-full bg-blue-400"></span>}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">7 × 9 • Equal Spacing & Margins</div>
                </button>
              </div>
            </div>

            {/* Photo count selector */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Quantity Preset (Auto-Fill)</span>
                <span className="text-[10px] text-gray-500 font-medium">{selectedSlots.length} / {gridConfig.totalSlots} Slots</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {gridConfig.presets.map((qty) => (
                  <button
                    key={qty}
                    onClick={() => {
                      setPassportCount(qty);
                      setSelectedSlots(Array.from({ length: qty }, (_, i) => i));
                    }}
                    className={`py-2 px-1 rounded-xl border text-xs font-bold cursor-pointer transition-all text-center
                      ${selectedSlots.length === qty 
                        ? 'border-blue-500 bg-blue-500/10 text-white shadow-md' 
                        : 'border-white/5 bg-white/2 text-gray-400 hover:text-white hover:bg-white/5'}`}
                  >
                    {qty}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedSlots(Array.from({ length: gridConfig.totalSlots }, (_, i) => i))}
                  className="flex-1 py-1.5 px-2 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 text-[10px] text-gray-300 font-semibold cursor-pointer transition-colors"
                >
                  Select All ({gridConfig.totalSlots})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSlots([])}
                  className="flex-1 py-1.5 px-2 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 text-[10px] text-gray-300 font-semibold cursor-pointer transition-colors"
                >
                  Clear All
                </button>
              </div>
              <p className="text-[10px] text-gray-500 leading-normal mt-1">
                {gridType === '63'
                  ? `Uniform equal spacing: ${Number(gridConfig.colGap).toFixed(1)}mm col gap / ${Number(gridConfig.rowGap).toFixed(1)}mm row gap (margins match photo gaps).`
                  : 'Centred printing grid with 2mm col gap / 3mm row gap. Click boxes on the preview map to manually activate/deactivate layout slots.'}
              </p>
            </div>

            {/* Export buttons */}
            <div className="space-y-3 pt-4 border-t border-white/5">
              <div className="flex gap-3">
                <button 
                  onClick={() => handleDownloadA4Pdf(false)}
                  disabled={selectedSlots.length === 0}
                  className="btn-primary flex-1 py-3.5 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer bg-gradient-to-r from-blue-500 to-indigo-600 shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>

                <button 
                  onClick={() => handleDownloadA4Pdf(true)}
                  disabled={selectedSlots.length === 0}
                  className="flex-1 py-3.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs"
                >
                  <Printer className="w-4 h-4 text-gray-400" />
                  Print PDF
                </button>
              </div>
              
              <button 
                onClick={handleDownloadA4Image}
                disabled={selectedSlots.length === 0}
                className="w-full py-3.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-white font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs"
              >
                <Download className="w-4 h-4 text-gray-400" />
                Download High-Res A4 Sheet (JPG)
              </button>
            </div>

            <button 
              onClick={() => setPassportStatus('enhancements')}
              className="text-xs text-gray-400 hover:text-white font-semibold underline block mx-auto pt-2 cursor-pointer"
            >
              Adjust colors or brightness
            </button>
          </div>

          {/* Sheet Preview Container */}
          <div className="lg:col-span-2 glass-panel rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">A4 Grid Interactive Map</h3>
                <span className="text-[11px] text-gray-500 font-medium">{gridConfig.label} • {gridConfig.sublabel}</span>
              </div>
              <span className="text-xs font-bold text-gray-400">
                Slots Selected: <strong className="text-blue-400">{selectedSlots.length}</strong> / {gridConfig.totalSlots}
              </span>
            </div>
            
            {/* Mock A4 Paper with Grid */}
            <div className="w-full bg-[#161823] border border-white/5 rounded-xl p-3 sm:p-6 flex items-center justify-center min-h-[380px] sm:min-h-[500px]">
              <div 
                className="bg-white text-black shadow-2xl relative transition-all duration-300 overflow-hidden w-full max-w-[340px] aspect-[210/297]"
                style={{ 
                  aspectRatio: '210/297'
                }}
              >
                {/* Tiny A4 indicator label */}
                <div className="absolute top-1 right-2 text-[8px] font-bold text-gray-300 select-none uppercase tracking-widest z-10 pointer-events-none">A4 Paper</div>

                {/* Grid Layout Preview: 42 slots (6x7) or 63 slots (7x9) */}
                <div 
                  className="grid w-full h-full"
                  style={{
                    gridTemplateColumns: `repeat(${gridConfig.cols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${gridConfig.rows}, minmax(0, 1fr))`,
                    columnGap: gridType === '63' ? '2.2%' : '2.5px',
                    rowGap: gridType === '63' ? '1.18%' : '3.75px',
                    padding: gridType === '63' ? '1.18% 2.2%' : '14px 10px'
                  }}
                >
                  {Array.from({ length: gridConfig.totalSlots }).map((_, index) => {
                    const isActive = selectedSlots.includes(index);
                    return (
                      <div 
                        key={index} 
                        onClick={() => {
                          if (isActive) {
                            setSelectedSlots(selectedSlots.filter(id => id !== index));
                          } else {
                            setSelectedSlots([...selectedSlots, index]);
                          }
                        }}
                        className={`w-full h-full relative flex items-center justify-center overflow-hidden cursor-pointer transition-all border
                          ${isActive 
                            ? 'border-solid border-gray-950 bg-gray-50' 
                            : 'border-dashed border-gray-300 bg-gray-100 hover:bg-gray-200'}`}
                        style={{
                          padding: '0.5px'
                        }}
                        title={isActive ? 'Click to remove photo' : 'Click to place photo'}
                      >
                        {isActive ? (
                          <img 
                            src={passportFinal} 
                            alt="passport-thumb" 
                            className="w-full h-full object-cover"
                            style={{
                              backgroundColor: passportBgColor,
                              filter: `brightness(${passportBrightness}%) contrast(${passportContrast}%)`
                            }}
                          />
                        ) : (
                          <span className="text-[7px] text-gray-400 font-bold select-none">+</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* API Keys Settings Modal */}
      <Modal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        title="AI Background Remover Settings"
      >
        <div className="space-y-6">
          <p className="text-sm text-gray-400">
            Configure premium API keys to get the absolute highest background removal accuracy (commercial grade). If no keys are provided, we will use our free public high-accuracy engine (BiRefNet).
          </p>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wide">
              Remove.bg API Key (Optional)
            </label>
            <input
              type="text"
              value={removeBgApiKey}
              onChange={(e) => setRemoveBgApiKey(e.target.value)}
              placeholder="Paste your remove.bg API key here..."
              className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white placeholder-gray-500 text-sm focus:border-blue-500 focus:outline-none transition-colors"
            />
            <p className="text-[10px] text-gray-500">
              Get 50 free credits per month by signing up at <a href="https://www.remove.bg/api" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">remove.bg/api</a>.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wide">
              Hugging Face Token (Optional)
            </label>
            <input
              type="password"
              value={hfToken}
              onChange={(e) => setHfToken(e.target.value)}
              placeholder="Paste your HF API token here..."
              className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white placeholder-gray-500 text-sm focus:border-blue-500 focus:outline-none transition-colors"
            />
            <p className="text-[10px] text-gray-500">
              Used to access private/gated Hugging Face spaces like `briaai/RMBG-1.4`. Generate a token at <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">huggingface.co/settings/tokens</a>.
            </p>
          </div>

          <div className="flex justify-end pt-4 border-t border-white/5">
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold cursor-pointer bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:opacity-90 transition-opacity"
            >
              Save & Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
