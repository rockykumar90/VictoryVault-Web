import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useAppStore } from '../../store/useAppStore';
import { getCroppedImgFromReactImageCrop } from '../../utils/cropImage';
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
  Image as ImageIcon,
  Crop,
  ChevronRight
} from 'lucide-react';

const formatSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const PRESETS = [
  { id: 'original', name: 'Original Aspect Ratio' },
  { id: 'upsc-photo', name: 'UPSC/SSC Passport Photo (350 x 450 px)', width: 350, height: 450 },
  { id: 'upsc-sig', name: 'UPSC/SSC Signature (350 x 140 px)', width: 350, height: 140 },
  { id: 'ibps-photo', name: 'IBPS/SBI Photo (200 x 230 px)', width: 200, height: 230 },
  { id: 'ibps-sig', name: 'IBPS/SBI Signature (140 x 60 px)', width: 140, height: 60 },
  { id: 'custom', name: 'Custom Dimensions (px)' }
];

export default function ImageCompressor() {
  const setMode = useAppStore((state) => state.setMode);

  // File states
  const [rawFile, setRawFile] = useState(null);
  const [rawSrc, setRawSrc] = useState(null);
  
  // Wizard steps: 'upload' | 'crop' | 'optimize'
  const [step, setStep] = useState('upload');
  
  // Crop & rotate states
  const [crop, setCrop] = useState(null);
  const [completedCrop, setCompletedCrop] = useState(null);
  const [rotation, setRotation] = useState(0);
  const imageRef = useRef(null);

  // Optimization states
  const [croppedUrl, setCroppedUrl] = useState(null);
  const [croppedBlob, setCroppedBlob] = useState(null);
  const [compressedBlob, setCompressedBlob] = useState(null);
  const [compressedUrl, setCompressedUrl] = useState(null);
  
  const [quality, setQuality] = useState(70); // 10% - 100%
  const [scale, setScale] = useState(90); // 20% - 100%
  const [isCompacting, setIsCompacting] = useState(false);
  const [compressedDimensions, setCompressedDimensions] = useState({ width: 0, height: 0 });

  // Custom presets & dimensions states
  const [originalCroppedDimensions, setOriginalCroppedDimensions] = useState({ width: 0, height: 0 });
  const [presetId, setPresetId] = useState('original');
  const [customWidth, setCustomWidth] = useState(0);
  const [customHeight, setCustomHeight] = useState(0);
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  const compressedUrlRef = useRef(null);

  const handleCustomWidthChange = (val) => {
    setCustomWidth(val);
    if (maintainAspectRatio && originalCroppedDimensions.width > 0) {
      const ratio = originalCroppedDimensions.width / originalCroppedDimensions.height;
      setCustomHeight(Math.round(val / ratio));
    }
  };

  const handleCustomHeightChange = (val) => {
    setCustomHeight(val);
    if (maintainAspectRatio && originalCroppedDimensions.height > 0) {
      const ratio = originalCroppedDimensions.width / originalCroppedDimensions.height;
      setCustomWidth(Math.round(val * ratio));
    }
  };

  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // Clean up Blob URLs
  useEffect(() => {
    return () => {
      if (rawSrc) URL.revokeObjectURL(rawSrc);
      if (croppedUrl) URL.revokeObjectURL(croppedUrl);
      if (compressedUrlRef.current) URL.revokeObjectURL(compressedUrlRef.current);
    };
  }, [rawSrc, croppedUrl]);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const processFile = (file) => {
    if (file && file.type.startsWith('image/')) {
      const src = URL.createObjectURL(file);
      setRawFile(file);
      setRawSrc(src);
      setRotation(0);
      setCrop(null);
      setCompletedCrop(null);
      setCroppedUrl(null);
      setCompressedUrl(null);
      setStep('crop');
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

  const onImageLoad = (e) => {
    const { width, height } = e.currentTarget;
    const initialCrop = {
      unit: 'px',
      width: width * 0.9,
      height: height * 0.9,
      x: width * 0.05,
      y: height * 0.05
    };
    setCrop(initialCrop);
    setCompletedCrop(initialCrop);
  };

  const handleApplyCrop = async () => {
    if (!rawSrc || !completedCrop || !imageRef.current) return;
    try {
      const cropResult = await getCroppedImgFromReactImageCrop(
        rawSrc,
        completedCrop,
        imageRef.current.width,
        imageRef.current.height,
        rotation
      );
      if (cropResult) {
        // Load the cropped image to read its natural width and height
        const img = new Image();
        img.src = cropResult.url;
        await new Promise((resolve) => (img.onload = resolve));
        
        const croppedWidth = img.naturalWidth;
        const croppedHeight = img.naturalHeight;
        
        setOriginalCroppedDimensions({ width: croppedWidth, height: croppedHeight });
        setCustomWidth(croppedWidth);
        setCustomHeight(croppedHeight);
        setPresetId('original');
        setScale(100);
        setQuality(70);

        setCroppedUrl(cropResult.url);
        setCroppedBlob(cropResult.blob);
        setStep('optimize');
      }
    } catch (err) {
      console.error('Failed to crop image', err);
    }
  };

  // Perform Image Compression (runs in real-time as sliders/presets are adjusted)
  const runCompression = useCallback(async () => {
    if (!croppedUrl) return;
    setIsCompacting(true);
    try {
      const img = new Image();
      img.src = croppedUrl;
      await new Promise((resolve) => (img.onload = resolve));

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let targetW = img.naturalWidth;
      let targetH = img.naturalHeight;

      if (presetId === 'original') {
        const sVal = scale / 100;
        targetW = Math.round(img.naturalWidth * sVal);
        targetH = Math.round(img.naturalHeight * sVal);
      } else if (presetId === 'upsc-photo') {
        targetW = 350;
        targetH = 450;
      } else if (presetId === 'upsc-sig') {
        targetW = 350;
        targetH = 140;
      } else if (presetId === 'ibps-photo') {
        targetW = 200;
        targetH = 230;
      } else if (presetId === 'ibps-sig') {
        targetW = 140;
        targetH = 60;
      } else if (presetId === 'custom') {
        targetW = parseInt(customWidth) || img.naturalWidth;
        targetH = parseInt(customHeight) || img.naturalHeight;
      }

      // Protect against zero or negative dimensions
      targetW = Math.max(1, targetW);
      targetH = Math.max(1, targetH);

      setCompressedDimensions({ width: targetW, height: targetH });

      canvas.width = targetW;
      canvas.height = targetH;
      ctx.drawImage(img, 0, 0, targetW, targetH);

      // Re-encode to JPEG with chosen quality
      const qVal = quality / 100;
      canvas.toBlob((blob) => {
        if (blob) {
          if (compressedUrlRef.current) {
            URL.revokeObjectURL(compressedUrlRef.current);
          }
          const compressedFileUrl = URL.createObjectURL(blob);
          compressedUrlRef.current = compressedFileUrl;
          setCompressedBlob(blob);
          setCompressedUrl(compressedFileUrl);
        }
        setIsCompacting(false);
      }, 'image/jpeg', qVal);
    } catch (err) {
      console.error('Compression pipeline failed', err);
      setIsCompacting(false);
    }
  }, [croppedUrl, quality, scale, presetId, customWidth, customHeight]);

  // Trigger initial compression only when entering the optimize step
  useEffect(() => {
    if (step === 'optimize') {
      runCompression();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleDownload = () => {
    if (!compressedUrl || !rawFile) return;
    const link = document.createElement('a');
    link.href = compressedUrl;
    const baseName = rawFile.name.substring(0, rawFile.name.lastIndexOf('.')) || rawFile.name;
    link.download = `${baseName}-optimized.jpg`;
    link.click();
  };

  const handlePrint = () => {
    if (!compressedUrl) return;
    const printWindow = window.open(compressedUrl, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  const handleReset = () => {
    setRawFile(null);
    setRawSrc(null);
    setCrop(null);
    setCompletedCrop(null);
    setCroppedUrl(null);
    setCroppedBlob(null);
    setCompressedBlob(null);
    setCompressedUrl(null);
    if (compressedUrlRef.current) {
      URL.revokeObjectURL(compressedUrlRef.current);
      compressedUrlRef.current = null;
    }
    setOriginalCroppedDimensions({ width: 0, height: 0 });
    setPresetId('original');
    setCustomWidth(0);
    setCustomHeight(0);
    setMaintainAspectRatio(true);
    setStep('upload');
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8 border-b border-white/5 pb-6">
        <button 
          onClick={() => {
            if (step === 'crop') {
              handleReset();
            } else if (step === 'optimize') {
              setStep('crop');
            } else {
              setMode('dashboard');
            }
          }}
          className="p-2 rounded-xl bg-white/5 border border-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white flex items-center gap-2">
            <Minimize2 className="w-6 h-6 text-emerald-500" />
            Image Size Reducer
          </h1>
          <p className="text-sm text-gray-400">Crop, straighten, and compress photos or signature scans into form-ready JPEGs</p>
        </div>
      </div>

      {/* STEP 1: Upload */}
      {step === 'upload' && (
        <div 
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center min-h-[45vh] rounded-2xl border-2 border-dashed transition-all cursor-pointer p-8 text-center relative group
            ${isDragActive 
              ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_30px_rgba(16,185,129,0.2)]' 
              : 'border-white/10 bg-white/2 hover:border-emerald-500/50 hover:bg-white/3'}`}
        >
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden" 
            accept="image/*"
          />
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform duration-300">
            <UploadCloud className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Drag & drop your photo/signature here</h3>
          <p className="text-sm text-gray-400 max-w-sm leading-relaxed mb-6">
            Supports PNG, JPEG, JPG, WEBP, and other formats. We will convert it to a size-optimized JPG.
          </p>
          <button className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-600 shadow-emerald-500/25">
            Select Image
          </button>
        </div>
      )}

      {/* STEP 2: Crop & Straighten */}
      {step === 'crop' && rawSrc && (
        <div className="grid lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 glass-panel rounded-2xl p-6 flex flex-col gap-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Crop className="w-5 h-5 text-emerald-400" />
              Crop & Straighten Image
            </h3>
            
            <div className="relative w-full max-h-[380px] bg-black/40 rounded-xl border border-white/5 p-4 flex items-center justify-center overflow-auto">
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                className="max-h-full"
              >
                <img
                  ref={imageRef}
                  src={rawSrc}
                  alt="Crop source"
                  style={{ transform: `rotate(${rotation}deg)`, maxHeight: '300px' }}
                  onLoad={onImageLoad}
                />
              </ReactCrop>
            </div>

            {/* Straighten Rotation Slider */}
            <div className="space-y-3 pt-2 border-t border-white/5">
              <div className="flex justify-between text-xs font-semibold text-gray-400">
                <span>Straighten Photo (Fine Tilt)</span>
                <span className="text-emerald-400 font-bold">{rotation}°</span>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setRotation(prev => {
                    let r = prev - 90;
                    if (r < -180) r += 360;
                    return r;
                  })}
                  className="px-3 py-2 rounded-xl bg-white/5 border border-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors text-xs font-semibold cursor-pointer"
                  title="Rotate 90° Left"
                >
                  Rotate 90° ↺
                </button>
                
                <input 
                  type="range" 
                  min={-180} 
                  max={180} 
                  step={0.5}
                  value={rotation}
                  onChange={(e) => setRotation(parseFloat(e.target.value))}
                  className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                
                <button 
                  onClick={() => setRotation(prev => {
                    let r = prev + 90;
                    if (r > 180) r -= 360;
                    return r;
                  })}
                  className="px-3 py-2 rounded-xl bg-white/5 border border-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors text-xs font-semibold cursor-pointer"
                  title="Rotate 90° Right"
                >
                  Rotate 90° ↻
                </button>
              </div>
              
              <div className="flex justify-between items-center text-[10px] text-gray-500">
                <span>-180° Left</span>
                <button 
                  onClick={() => setRotation(0)}
                  className="text-emerald-400 hover:underline cursor-pointer"
                >
                  Reset Straight
                </button>
                <span>+180° Right</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-white/5 pt-4">
              <button 
                onClick={handleReset}
                className="px-5 py-2.5 rounded-xl bg-white/5 text-gray-300 hover:text-white transition-colors text-sm font-semibold cursor-pointer"
              >
                Re-upload
              </button>
              <button 
                onClick={handleApplyCrop}
                disabled={!completedCrop}
                className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-600 shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-1.5"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Guidelines Sidebar */}
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <h4 className="font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              Signature & Photo Guidelines
            </h4>
            <ul className="space-y-3 text-xs text-gray-400 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                Drag the crop borders to fit only the relevant signature or face box.
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                If the document was scanned slanted, adjust the Straighten slider to level it.
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                Cropping removes useless margins and drastically improves compression efficiency.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* STEP 3: Optimize & Compress */}
      {step === 'optimize' && croppedUrl && (
        <div className="grid md:grid-cols-3 gap-8">
          {/* Controls Panel */}
          <div className="md:col-span-1 space-y-6">
            <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-6">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-emerald-500" />
                Image Optimization
              </h3>

              {/* Target Dimensions Presets */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 block">
                  Target Dimensions (Size)
                </label>
                <select
                  value={presetId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPresetId(val);
                    if (val !== 'original' && val !== 'custom') {
                      const preset = PRESETS.find(p => p.id === val);
                      if (preset) {
                        setCustomWidth(preset.width);
                        setCustomHeight(preset.height);
                      }
                    }
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 cursor-pointer"
                >
                  {PRESETS.map((p) => (
                    <option key={p.id} value={p.id} className="bg-zinc-900 text-white">
                      {p.id === 'original' 
                        ? `Original Cropped (${originalCroppedDimensions.width} x ${originalCroppedDimensions.height} px)` 
                        : p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Custom Dimensions Form Inputs */}
              {presetId === 'custom' && (
                <div className="space-y-3 pt-2 border-t border-white/5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">Width (px)</label>
                      <input
                        type="number"
                        min={10}
                        max={5000}
                        value={customWidth}
                        onChange={(e) => handleCustomWidthChange(parseInt(e.target.value) || 0)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">Height (px)</label>
                      <input
                        type="number"
                        min={10}
                        max={5000}
                        value={customHeight}
                        onChange={(e) => handleCustomHeightChange(parseInt(e.target.value) || 0)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-[10px] font-semibold text-gray-400 cursor-pointer hover:text-white select-none">
                    <input
                      type="checkbox"
                      checked={maintainAspectRatio}
                      onChange={(e) => setMaintainAspectRatio(e.target.checked)}
                      className="rounded bg-white/5 border-white/10 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900 w-3.5 h-3.5 accent-emerald-500"
                    />
                    Maintain Aspect Ratio
                  </label>
                </div>
              )}

              {/* Resolution scale control - only show if original aspect ratio is active */}
              {presetId === 'original' && (
                <div className="space-y-1.5 pt-2 border-t border-white/5">
                  <div className="flex justify-between text-xs font-semibold text-gray-400">
                    <span>Dimension Scale</span>
                    <span className="font-bold text-emerald-400">{scale}%</span>
                  </div>
                  <input 
                    type="range"
                    min={20}
                    max={100}
                    step={5}
                    value={scale}
                    disabled={isCompacting}
                    onChange={(e) => setScale(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500 disabled:opacity-50"
                  />
                  <p className="text-[10px] text-gray-500 leading-normal">
                    Reduces resolution dimensions. Keeps aspect ratio intact.
                  </p>
                </div>
              )}

              {/* Quality control */}
              <div className="space-y-1.5 pt-2 border-t border-white/5">
                <div className="flex justify-between text-xs font-semibold text-gray-400">
                  <span>Image Quality</span>
                  <span className="font-bold text-emerald-400">{quality}%</span>
                </div>
                <input 
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={quality}
                  disabled={isCompacting}
                  onChange={(e) => setQuality(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500 disabled:opacity-50"
                />
                <p className="text-[10px] text-gray-500 leading-normal">
                  Values below 60% provide massive compression, useful for signature files.
                </p>
              </div>

              {/* Compress Now Action */}
              <div className="pt-4 border-t border-white/5">
                <button
                  onClick={runCompression}
                  disabled={isCompacting}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/10 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isCompacting ? 'animate-spin' : ''}`} />
                  {isCompacting ? 'Compressing...' : 'Compress Now'}
                </button>
              </div>

              {/* Reset trigger */}
              <div className="pt-4 border-t border-white/5 space-y-3">
                <button
                  onClick={() => setStep('crop')}
                  disabled={isCompacting}
                  className="w-full py-2.5 rounded-xl border border-white/5 bg-white/2 hover:bg-white/5 text-xs text-gray-300 hover:text-white font-semibold cursor-pointer transition-colors"
                >
                  Back to Crop & Rotate
                </button>
              </div>
            </div>
          </div>

          {/* Preview & Size results */}
          <div className="md:col-span-2 space-y-6">
            {/* Live compression card */}
            <div className="glass-panel rounded-2xl border border-white/5 p-6 flex flex-col items-center gap-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider text-center w-full">Optimized JPEG Preview</h3>
              
              <div className="relative max-h-[260px] max-w-full bg-black/20 rounded-xl overflow-hidden border border-white/10 shadow-2xl flex items-center justify-center p-2">
                {isCompacting ? (
                  <div className="w-[180px] h-[180px] flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
                    <span className="text-xs text-gray-400">Compacting...</span>
                  </div>
                ) : (
                  <img 
                    src={compressedUrl || croppedUrl} 
                    alt="Compressed output"
                    className="max-h-[240px] max-w-full object-contain rounded"
                  />
                )}
              </div>

              {/* Compressed metrics */}
              {compressedDimensions.width > 0 && (
                <div className="text-center">
                  <span className="text-xs font-bold text-white uppercase tracking-widest px-2.5 py-1 rounded bg-white/5 border border-white/5">
                    {compressedDimensions.width} x {compressedDimensions.height} px
                  </span>
                </div>
              )}
            </div>

            {/* Statistics and Action Triggers */}
            {compressedBlob && (
              <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-base">Form-Ready JPEG Compiled</h4>
                    <p className="text-xs text-gray-400">Adjust compression sliders in the sidebar panel to hit specific size limits.</p>
                  </div>
                </div>

                {/* Compression stats meters */}
                <div className="grid sm:grid-cols-3 gap-4 py-4 border-t border-b border-white/5">
                  <div className="text-center p-3 bg-white/2 border border-white/5 rounded-xl">
                    <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold block mb-1">Uploaded Size</span>
                    <strong className="text-base text-gray-300">{formatSize(rawFile.size)}</strong>
                  </div>
                  <div className="text-center p-3 bg-white/2 border border-white/5 rounded-xl">
                    <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold block mb-1">Optimized JPG Size</span>
                    <strong className="text-base text-white font-extrabold">{formatSize(compressedBlob.size)}</strong>
                  </div>
                  <div className="text-center p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-12 h-12 bg-emerald-500/5 rounded-full blur-xl"></div>
                    <span className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold block mb-1 flex items-center justify-center gap-1">
                      <Percent className="w-3.5 h-3.5" /> Reduction
                    </span>
                    <strong className="text-lg text-emerald-400 font-black">
                      {Math.max(0, Math.round(((rawFile.size - compressedBlob.size) / rawFile.size) * 100))}% Saved
                    </strong>
                  </div>
                </div>

                {/* Warning flag if file is still huge (useful tip for online forms) */}
                {compressedBlob.size > 200 * 1024 && (
                  <div className="text-[10px] p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-400 leading-normal">
                    💡 **Tip**: Most online form uploads (passport photos/signatures) require files to be under **100 KB** or **200 KB**. If your size is still too large, slide the quality or scale values down.
                  </div>
                )}

                {/* Downloads triggers */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button 
                    onClick={handleDownload}
                    className="btn-primary flex-1 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer text-sm shadow-md bg-gradient-to-r from-emerald-500 to-teal-600 shadow-emerald-500/20"
                  >
                    <FileDown className="w-5 h-5" />
                    Download Optimized JPG
                  </button>

                  <button 
                    onClick={handlePrint}
                    className="flex-1 py-3.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-white font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors text-sm"
                  >
                    <Printer className="w-5 h-5 text-gray-400" />
                    Print Image
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
