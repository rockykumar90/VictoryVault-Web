import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useAppStore } from '../../store/useAppStore';
import { getCroppedImgFromReactImageCrop } from '../../utils/cropImage';
import { generateA4Pdf } from '../../utils/pdfGenerator';
import { warpPerspective } from '../../utils/perspectiveWarp';
import Modal from '../ui/Modal';
import { 
  ArrowLeft, 
  UploadCloud, 
  Trash2, 
  Crop, 
  RotateCw, 
  ChevronLeft, 
  ChevronRight, 
  FileDown, 
  Layout, 
  RefreshCw,
  Plus,
  SlidersHorizontal,
  Printer
} from 'lucide-react';

export default function PdfSuite() {
  const {
    pdfImages,
    addPdfImage,
    setPdfImages,
    removePdfImage,
    updatePdfImage,
    clearPdfImages,
    setMode,
    pdfBrightness,
    pdfContrast,
    setPdfBrightness,
    setPdfContrast
  } = useAppStore();

  const [isDragActive, setIsDragActive] = useState(false);
  const [fileName, setFileName] = useState('document');
  const [layoutMode, setLayoutMode] = useState('single'); // 'single', 'grid-2', 'grid-4', 'custom'
  const [isGenerating, setIsGenerating] = useState(false);
  const [gridDirection, setGridDirection] = useState('vertical'); // 'vertical' | 'horizontal'

  // Custom drag layout states
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dragStartPos, setDragStartPos] = useState({ mouseX: 0, mouseY: 0, imgX: 0, imgY: 0 });
  const [resizingId, setResizingId] = useState(null);
  const [resizeHandle, setResizeHandle] = useState(null); // 't', 'b', 'l', 'r', 'tl', 'tr', 'bl', 'br'
  const [resizeStart, setResizeStart] = useState({ mouseX: 0, mouseY: 0, width: 0, height: 0, customX: 0, customY: 0 });
  const [viewTab, setViewTab] = useState('manage'); // 'manage' | 'preview'
  const [activePreviewPage, setActivePreviewPage] = useState(0);

  // Cropper states
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [activeImgId, setActiveImgId] = useState(null);
  const [crop, setCrop] = useState(null);
  const [completedCrop, setCompletedCrop] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState(undefined); // free form by default
  const [cropMode, setCropMode] = useState('perspective'); // 'regular' | 'perspective'
  const [perspectivePoints, setPerspectivePoints] = useState([
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 }
  ]);
  const [draggingPointIndex, setDraggingPointIndex] = useState(null);
  const [renderedSize, setRenderedSize] = useState({ width: 0, height: 0 });
  const imageRef = useRef(null);

  const fileInputRef = useRef(null);

  // Find currently active image for cropping
  const activeImage = pdfImages.find((img) => img.id === activeImgId);

  // Handle drag and drop
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const processFiles = (files) => {
    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        const imgElement = new Image();
        imgElement.onload = () => {
          addPdfImage({
            id: crypto.randomUUID(),
            file,
            url,
            croppedUrl: null,
            cropArea: null,
            name: file.name,
            rotation: 0,
            width: imgElement.naturalWidth,
            height: imgElement.naturalHeight,
            brightness: 100,
            contrast: 100
          });
        };
        imgElement.src = url;
      }
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFiles(e.target.files);
    }
  };

  const handleOpenCropper = (id) => {
    const img = pdfImages.find((i) => i.id === id);
    if (img) {
      setActiveImgId(id);
      setRotation(img.rotation || 0);
      setCrop(null);
      setCompletedCrop(null);
      setRenderedSize({ width: 0, height: 0 });
      setCropModalOpen(true);
    }
  };

  const onImageLoad = (e) => {
    const { width, height } = e.currentTarget;
    setRenderedSize({ width, height });

    let cropWidth = width * 0.9;
    let cropHeight = height * 0.9;
    
    if (aspect) {
      if (cropWidth / aspect > height) {
        cropHeight = height * 0.9;
        cropWidth = cropHeight * aspect;
      } else {
        cropWidth = width * 0.9;
        cropHeight = cropWidth / aspect;
      }
    }

    const newCrop = {
      unit: 'px',
      width: cropWidth,
      height: cropHeight,
      x: (width - cropWidth) / 2,
      y: (height - cropHeight) / 2
    };

    setCrop(newCrop);
    setCompletedCrop(newCrop);

    // Initialize 4 perspective handles in a square/rectangle relative to the image size
    setPerspectivePoints([
      { x: width * 0.15, y: height * 0.15 }, // TL
      { x: width * 0.85, y: height * 0.15 }, // TR
      { x: width * 0.85, y: height * 0.85 }, // BR
      { x: width * 0.15, y: height * 0.85 }  // BL
    ]);
  };

  const handlePerspectiveMouseDown = (idx, e) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingPointIndex(idx);
  };

  useEffect(() => {
    if (draggingPointIndex === null || !imageRef.current) return;

    const handleGlobalMove = (e) => {
      const container = imageRef.current.parentElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const relX = clientX - centerX;
      const relY = clientY - centerY;

      const rad = (-rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      const rotatedX = relX * cos - relY * sin;
      const rotatedY = relX * sin + relY * cos;

      let localX = rotatedX + renderedSize.width / 2;
      let localY = rotatedY + renderedSize.height / 2;

      localX = Math.max(0, Math.min(renderedSize.width, localX));
      localY = Math.max(0, Math.min(renderedSize.height, localY));

      setPerspectivePoints(prev => {
        const nextPoints = [...prev];
        const [TL, TR, BR, BL] = nextPoints;

        if (typeof draggingPointIndex === 'number') {
          // Corner point dragging
          nextPoints[draggingPointIndex] = { x: localX, y: localY };
        } else if (draggingPointIndex === 't') {
          const currentMidY = (TL.y + TR.y) / 2;
          const diffY = localY - currentMidY;
          nextPoints[0] = { ...TL, y: Math.max(0, Math.min(renderedSize.height, TL.y + diffY)) };
          nextPoints[1] = { ...TR, y: Math.max(0, Math.min(renderedSize.height, TR.y + diffY)) };
        } else if (draggingPointIndex === 'b') {
          const currentMidY = (BL.y + BR.y) / 2;
          const diffY = localY - currentMidY;
          nextPoints[3] = { ...BL, y: Math.max(0, Math.min(renderedSize.height, BL.y + diffY)) };
          nextPoints[2] = { ...BR, y: Math.max(0, Math.min(renderedSize.height, BR.y + diffY)) };
        } else if (draggingPointIndex === 'l') {
          const currentMidX = (TL.x + BL.x) / 2;
          const diffX = localX - currentMidX;
          nextPoints[0] = { ...TL, x: Math.max(0, Math.min(renderedSize.width, TL.x + diffX)) };
          nextPoints[3] = { ...BL, x: Math.max(0, Math.min(renderedSize.width, BL.x + diffX)) };
        } else if (draggingPointIndex === 'r') {
          const currentMidX = (TR.x + BR.x) / 2;
          const diffX = localX - currentMidX;
          nextPoints[1] = { ...TR, x: Math.max(0, Math.min(renderedSize.width, TR.x + diffX)) };
          nextPoints[2] = { ...BR, x: Math.max(0, Math.min(renderedSize.width, BR.x + diffX)) };
        }

        return nextPoints;
      });
    };

    const handleGlobalUp = () => {
      setDraggingPointIndex(null);
    };

    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleGlobalUp);
    window.addEventListener('touchmove', handleGlobalMove, { passive: false });
    window.addEventListener('touchend', handleGlobalUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchmove', handleGlobalMove);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [draggingPointIndex, rotation, renderedSize]);

  const handleSaveCrop = async () => {
    if (!activeImage || !imageRef.current) return;

    try {
      let croppedUrl;
      let croppedAspect;
      let cropArea;

      if (cropMode === 'perspective') {
        const naturalW = imageRef.current.naturalWidth;
        const naturalH = imageRef.current.naturalHeight;
        
        const scaleX = naturalW / renderedSize.width;
        const scaleY = naturalH / renderedSize.height;

        const naturalPoints = perspectivePoints.map(pt => ({
          x: pt.x * scaleX,
          y: pt.y * scaleY
        }));

        const dist = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
        
        const wTop = dist(naturalPoints[0], naturalPoints[1]);
        const wBot = dist(naturalPoints[3], naturalPoints[2]);
        const destW = Math.round(Math.max(wTop, wBot));

        const hLeft = dist(naturalPoints[0], naturalPoints[3]);
        const hRight = dist(naturalPoints[1], naturalPoints[2]);
        const destH = Math.round(Math.max(hLeft, hRight));

        croppedUrl = warpPerspective(imageRef.current, naturalPoints, destW, destH, rotation);
        
        if (!croppedUrl) throw new Error('Perspective warping failed');

        croppedAspect = destW / destH;
        cropArea = { x: 0, y: 0, width: destW, height: destH };
      } else {
        if (!completedCrop) return;
        const { url } = await getCroppedImgFromReactImageCrop(
          activeImage.url,
          completedCrop,
          imageRef.current.width,
          imageRef.current.height,
          rotation
        );
        croppedUrl = url;
        croppedAspect = completedCrop.width / completedCrop.height;
        cropArea = completedCrop;
      }

      // Recalculate dimensions of the containing box based on the new cropped aspect ratio
      const currentWidth = activeImage.customWidth !== undefined ? activeImage.customWidth : 40;
      const newHeight = (currentWidth * 0.7071) / croppedAspect;

      let nextY = activeImage.customY !== undefined ? activeImage.customY : 5;
      if (nextY + newHeight > 100) {
        nextY = Math.max(0, 100 - newHeight);
      }

      updatePdfImage(activeImgId, {
        croppedUrl,
        rotation,
        cropArea,
        aspectRatio: croppedAspect,
        customHeight: newHeight,
        customY: nextY
      });

      setCropModalOpen(false);
      setActiveImgId(null);
    } catch (e) {
      console.error('Failed to crop image', e);
    }
  };

  const handleRotateQuick = (id) => {
    const img = pdfImages.find((i) => i.id === id);
    if (img) {
      const nextRotation = ((img.rotation || 0) + 90) % 360;
      updatePdfImage(id, { rotation: nextRotation });
    }
  };

  const handleAdjustImage = (id) => {
    const img = pdfImages.find((i) => i.id === id);
    if (img) {
      setViewTab('preview');
      setSelectedLayerId(id);
      setActivePreviewPage(img.pageIndex || 0);
      handleOpenCropper(id);
    }
  };

  const handleMove = (index, direction) => {
    const newImages = [...pdfImages];
    const targetIndex = index + direction;
    if (targetIndex >= 0 && targetIndex < newImages.length) {
      const temp = newImages[index];
      newImages[index] = newImages[targetIndex];
      newImages[targetIndex] = temp;
      setPdfImages(newImages);
    }
  };

  // Trigger layout position updates when mode/direction/order changes
  const imagesIdString = pdfImages.map(img => img.id).join(',');
  useEffect(() => {
    if (pdfImages.length === 0) return;
    
    let needsUpdate = false;
    const updated = pdfImages.map((img, idx) => {
      const aspect = img.croppedUrl && img.cropArea && img.cropArea.width && img.cropArea.height
        ? img.cropArea.width / img.cropArea.height
        : (img.width && img.height ? img.width / img.height : 1.3);
      let targetPageIndex = 0;
      let defaultX = 5;
      let defaultY = 5;
      let defaultW = 40;
      let defaultH = 30;

      if (layoutMode === 'single') {
        targetPageIndex = idx;
        defaultW = 90;
        defaultH = (90 * 0.7071) / aspect;
        if (defaultH > 90) {
          defaultH = 90;
          defaultW = (90 * aspect) / 0.7071;
        }
        defaultX = 50 - defaultW / 2;
        defaultY = 50 - defaultH / 2;
      } else if (layoutMode === 'grid-2') {
        targetPageIndex = Math.floor(idx / 2);
        const slotIndex = idx % 2;

        if (gridDirection === 'vertical') {
          const slotWidth = 90;
          const slotHeight = 44;
          const slotAspect = 0.90 / (0.44 * 1.4142);
          if (aspect > slotAspect) {
            defaultW = slotWidth;
            defaultH = (slotWidth * 0.7071) / aspect;
          } else {
            defaultH = slotHeight;
            defaultW = (slotHeight * aspect) / 0.7071;
          }
          defaultX = 50 - defaultW / 2;
          defaultY = (slotIndex === 0 ? 25 : 75) - defaultH / 2;
        } else {
          const slotWidth = 44;
          const slotHeight = 90;
          const slotAspect = 0.44 / (0.90 * 1.4142);
          if (aspect > slotAspect) {
            defaultW = slotWidth;
            defaultH = (slotWidth * 0.7071) / aspect;
          } else {
            defaultH = slotHeight;
            defaultW = (slotHeight * aspect) / 0.7071;
          }
          defaultX = (slotIndex === 0 ? 25 : 75) - defaultW / 2;
          defaultY = 50 - defaultH / 2;
        }
      } else if (layoutMode === 'grid-4') {
        targetPageIndex = Math.floor(idx / 4);
        const slotIndex = idx % 4;
        const col = slotIndex % 2;
        const row = Math.floor(slotIndex / 2);

        const slotWidth = 44;
        const slotHeight = 44;
        const slotAspect = 0.44 / (0.44 * 1.4142);
        if (aspect > slotAspect) {
          defaultW = slotWidth;
          defaultH = (slotWidth * 0.7071) / aspect;
        } else {
          defaultH = slotHeight;
          defaultW = (slotHeight * aspect) / 0.7071;
        }
        defaultX = (col === 0 ? 25 : 75) - defaultW / 2;
        defaultY = (row === 0 ? 25 : 75) - defaultH / 2;
      } else if (layoutMode === 'custom') {
        targetPageIndex = 0;
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        defaultW = 40;
        defaultH = (40 * 0.7071) / aspect;
        defaultX = col * 45 + 5;
        defaultY = row * 30 + 5;
      }

      const isModeChanged = img.lastMode !== layoutMode || (layoutMode === 'grid-2' && img.lastDirection !== gridDirection);
      const hasNoCoords = img.customX === undefined || img.customY === undefined || img.pageIndex === undefined;
      
      if (hasNoCoords || isModeChanged) {
        needsUpdate = true;
        return {
          ...img,
          pageIndex: targetPageIndex,
          customX: defaultX,
          customY: defaultY,
          customWidth: defaultW,
          customHeight: defaultH,
          aspectRatio: aspect,
          lastMode: layoutMode,
          lastDirection: gridDirection
        };
      }
      
      if (img.pageIndex !== targetPageIndex) {
        needsUpdate = true;
        return {
          ...img,
          pageIndex: targetPageIndex
        };
      }

      return img;
    });

    if (needsUpdate) {
      setPdfImages(updated);
      // Ensure we select a valid layer if none is selected
      if (updated.length > 0 && !selectedLayerId) {
        setSelectedLayerId(updated[0].id);
      }
    }
  }, [layoutMode, gridDirection, imagesIdString, selectedLayerId, setPdfImages]);

  const handleSelectCustomLayout = () => {
    setLayoutMode('custom');
    setViewTab('preview');
    setActivePreviewPage(0);
  };

  const handleResizeStart = (id, handle, e) => {
    e.stopPropagation(); // Prevent triggering parent drag / select
    setResizingId(id);
    setResizeHandle(handle);
    setSelectedLayerId(id);

    const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
    const img = pdfImages.find(i => i.id === id);
    if (img) {
      setResizeStart({
        mouseX: clientX,
        mouseY: clientY,
        width: img.customWidth !== undefined ? img.customWidth : 40,
        height: img.customHeight !== undefined ? img.customHeight : 30,
        customX: img.customX !== undefined ? img.customX : 5,
        customY: img.customY !== undefined ? img.customY : 5
      });
    }
    
    if (e.cancelable) {
      e.preventDefault();
    }
  };

  const handlePointerDown = (id, e) => {
    setSelectedLayerId(id);
    setDraggingId(id);
    const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
    const img = pdfImages.find(i => i.id === id);
    if (img) {
      setDragStartPos({
        mouseX: clientX,
        mouseY: clientY,
        imgX: img.customX !== undefined ? img.customX : 5,
        imgY: img.customY !== undefined ? img.customY : 5
      });
    }
    // Prevent default dragging behaviors except on sliders/buttons
    if (e.cancelable && !e.target.tagName.match(/INPUT|BUTTON|SELECT/i)) {
      e.preventDefault();
    }
  };

  const handlePointerMove = (e) => {
    // A4 preview screen container dimensions
    const previewWidth = 350;
    const previewHeight = 495;

    // Resizing Logic
    if (resizingId && resizeHandle) {
      const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
      const deltaX = clientX - resizeStart.mouseX;
      const deltaY = clientY - resizeStart.mouseY;

      const deltaPercentX = (deltaX / previewWidth) * 100;
      const deltaPercentY = (deltaY / previewHeight) * 100;

      const img = pdfImages.find(i => i.id === resizingId);
      if (!img) return;

      const startX = resizeStart.customX;
      const startY = resizeStart.customY;
      const startW = resizeStart.width;
      const startH = resizeStart.height;

      let nextX = startX;
      let nextY = startY;
      let nextW = startW;
      let nextH = startH;

      // Min size limit
      const minW = 5;
      const minH = 5;

      if (resizeHandle.includes('r')) {
        nextW = startW + deltaPercentX;
        nextW = Math.max(minW, Math.min(100 - startX, nextW));
      }
      if (resizeHandle.includes('l')) {
        nextX = startX + deltaPercentX;
        nextX = Math.max(0, Math.min(startX + startW - minW, nextX));
        nextW = startX + startW - nextX;
      }
      if (resizeHandle.includes('b')) {
        nextH = startH + deltaPercentY;
        nextH = Math.max(minH, Math.min(100 - startY, nextH));
      }
      if (resizeHandle.includes('t')) {
        nextY = startY + deltaPercentY;
        nextY = Math.max(0, Math.min(startY + startH - minH, nextY));
        nextH = startY + startH - nextY;
      }

      const newAspect = (nextW * 0.7071) / nextH;

      updatePdfImage(resizingId, {
        customX: nextX,
        customY: nextY,
        customWidth: nextW,
        customHeight: nextH,
        aspectRatio: newAspect
      });
      return;
    }

    // Dragging Logic
    if (!draggingId) return;
    const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
    const deltaX = clientX - dragStartPos.mouseX;
    const deltaY = clientY - dragStartPos.mouseY;

    const deltaPercentX = (deltaX / previewWidth) * 100;
    const deltaPercentY = (deltaY / previewHeight) * 100;

    const img = pdfImages.find(i => i.id === draggingId);
    if (!img) return;

    let nextX = dragStartPos.imgX + deltaPercentX;
    let nextY = dragStartPos.imgY + deltaPercentY;

    // Clamp boundary
    nextX = Math.max(0, Math.min(100 - (img.customWidth || 40), nextX));
    nextY = Math.max(0, Math.min(100 - (img.customHeight || 30), nextY));

    updatePdfImage(draggingId, {
      customX: nextX,
      customY: nextY
    });
  };

  const handlePointerUp = () => {
    setDraggingId(null);
    setResizingId(null);
    setResizeHandle(null);
  };

  const handleWidthChange = (id, widthVal) => {
    const img = pdfImages.find(i => i.id === id);
    if (!img) return;
    const aspect = img.aspectRatio || 1.3;
    const newHeight = widthVal * 0.707 / aspect;
    
    updatePdfImage(id, {
      customWidth: widthVal,
      customHeight: newHeight
    });
  };

  const handleResetPositions = () => {
    const updated = pdfImages.map(img => ({
      ...img,
      customX: undefined,
      customY: undefined,
      customWidth: undefined,
      customHeight: undefined,
      lastMode: undefined,
      lastDirection: undefined
    }));
    setPdfImages(updated);
  };

  const handleGeneratePdf = async (printOnly = false) => {
    if (pdfImages.length === 0) return;
    setIsGenerating(true);
    try {
      await generateA4Pdf(pdfImages, fileName, layoutMode, gridDirection, pdfBrightness, pdfContrast, printOnly);
    } catch (err) {
      console.error('Error generating PDF', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6">
      {/* Global Hidden Input File Picker */}
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden" 
        multiple 
        accept="image/*"
      />

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 border-b border-white/5 pb-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setMode('dashboard')}
            className="p-2 rounded-xl bg-white/5 border border-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white">Photo to PDF Converter</h1>
            <p className="text-sm text-gray-400">Combine, crop, and layout images into high-resolution A4 PDFs</p>
          </div>
        </div>

        {pdfImages.length > 0 && (
          <button
            onClick={clearPdfImages}
            className="text-sm text-red-400 hover:text-red-300 font-medium px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 transition-all cursor-pointer"
          >
            Clear All Pages
          </button>
        )}
      </div>

      {pdfImages.length === 0 ? (
        /* Drag & Drop Area */
        <div 
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center min-h-[50vh] rounded-2xl border-2 border-dashed transition-all cursor-pointer p-8 text-center relative group
            ${isDragActive 
              ? 'border-primary bg-primary/10 shadow-[0_0_30px_rgba(170,59,255,0.2)]' 
              : 'border-white/10 bg-white/2 hover:border-primary/50 hover:bg-white/3'}`}
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center mb-6 shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform duration-300">
            <UploadCloud className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Drag & drop your document images here</h3>
          <p className="text-sm text-gray-400 max-w-sm leading-relaxed mb-6">
            Supports PNG, JPEG, HEIC, and WebP. Add multiple photos to arrange them into sheets.
          </p>
          <button className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold cursor-pointer">
            Browse Files
          </button>
        </div>
      ) : (
        /* Document Workspace */
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main workspace */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex gap-2 mb-6">
              <button 
                onClick={() => setViewTab('manage')}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border
                  ${viewTab === 'manage' 
                    ? 'bg-primary/15 border-primary text-white shadow-md shadow-primary/10' 
                    : 'bg-white/5 border-white/5 text-gray-400 hover:text-white hover:bg-white/10'}`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Manage Pages
              </button>
              <button 
                onClick={() => setViewTab('preview')}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border
                  ${viewTab === 'preview' 
                    ? 'bg-primary/15 border-primary text-white shadow-md shadow-primary/10' 
                    : 'bg-white/5 border-white/5 text-gray-400 hover:text-white hover:bg-white/10'}`}
              >
                <Layout className="w-4 h-4" />
                Interactive A4 Layout
              </button>
            </div>

            {viewTab === 'preview' ? (
              /* Virtual A4 Canvas Workspace */
              <div className="glass-panel rounded-2xl p-6 flex flex-col items-center gap-4">
                <div className="text-center">
                  <h3 className="text-base font-bold text-white uppercase tracking-wider">A4 Page Composer</h3>
                  <p className="text-xs text-gray-400">Click a layer to select, drag to reposition, use slider to resize.</p>
                </div>
                
                {/* Virtual A4 Canvas Box */}
                <div 
                  className="w-full bg-[#161823] border border-white/5 rounded-xl p-6 flex flex-col items-center justify-center min-h-[500px]"
                  onMouseMove={handlePointerMove}
                  onMouseUp={handlePointerUp}
                  onMouseLeave={handlePointerUp}
                  onTouchMove={handlePointerMove}
                  onTouchEnd={handlePointerUp}
                >
                  <div 
                    className="bg-white text-black shadow-2xl relative select-none overflow-hidden"
                    style={{ 
                      width: '350px', 
                      height: '495px', // Scale: 1.414 aspect ratio of A4 paper
                    }}
                  >
                    <div className="absolute top-1 right-2 text-[8px] font-bold text-gray-400 uppercase tracking-widest">A4 Page {activePreviewPage + 1}</div>
                    
                    {pdfImages
                      .filter((img) => img.pageIndex === activePreviewPage)
                      .map((img) => {
                        const isSelected = img.id === selectedLayerId;
                        return (
                          <div
                            key={img.id}
                            onMouseDown={(e) => handlePointerDown(img.id, e)}
                            onTouchStart={(e) => handlePointerDown(img.id, e)}
                            className={`absolute select-none cursor-move transition-shadow duration-150 flex items-center justify-center
                              ${isSelected ? 'ring-2 ring-primary shadow-xl z-20 overflow-visible' : 'shadow hover:shadow-md hover:ring-1 hover:ring-primary/40 z-10 overflow-hidden'}`}
                            style={{
                              left: `${img.customX !== undefined ? img.customX : 5}%`,
                              top: `${img.customY !== undefined ? img.customY : 5}%`,
                              width: `${img.customWidth !== undefined ? img.customWidth : 40}%`,
                              height: `${img.customHeight !== undefined ? img.customHeight : 30}%`,
                            }}
                          >
                            {/* Inner wrapper to contain rotation overflows */}
                            <div className="w-full h-full overflow-hidden flex items-center justify-center relative">
                              <img
                                src={img.croppedUrl || img.url}
                                alt={img.name}
                                className="w-full h-full object-fill pointer-events-none select-none"
                                style={{
                                  transform: `rotate(${img.croppedUrl ? 0 : img.rotation}deg)`,
                                  filter: `brightness(${pdfBrightness}%) contrast(${pdfContrast}%)`
                                }}
                              />
                            </div>

                            {/* Resizing Handles */}
                            {isSelected && (
                              <>
                                {/* Corner Handles */}
                                <div 
                                  onMouseDown={(e) => handleResizeStart(img.id, 'tl', e)}
                                  onTouchStart={(e) => handleResizeStart(img.id, 'tl', e)}
                                  className="absolute w-3 h-3 bg-white border-2 border-primary rounded-full -top-1.5 -left-1.5 cursor-nwse-resize z-30 hover:scale-125 transition-transform"
                                />
                                <div 
                                  onMouseDown={(e) => handleResizeStart(img.id, 'tr', e)}
                                  onTouchStart={(e) => handleResizeStart(img.id, 'tr', e)}
                                  className="absolute w-3 h-3 bg-white border-2 border-primary rounded-full -top-1.5 -right-1.5 cursor-nesw-resize z-30 hover:scale-125 transition-transform"
                                />
                                <div 
                                  onMouseDown={(e) => handleResizeStart(img.id, 'bl', e)}
                                  onTouchStart={(e) => handleResizeStart(img.id, 'bl', e)}
                                  className="absolute w-3 h-3 bg-white border-2 border-primary rounded-full -bottom-1.5 -left-1.5 cursor-nesw-resize z-30 hover:scale-125 transition-transform"
                                />
                                <div 
                                  onMouseDown={(e) => handleResizeStart(img.id, 'br', e)}
                                  onTouchStart={(e) => handleResizeStart(img.id, 'br', e)}
                                  className="absolute w-3 h-3 bg-white border-2 border-primary rounded-full -bottom-1.5 -right-1.5 cursor-nwse-resize z-30 hover:scale-125 transition-transform"
                                />

                                {/* Side/Edge Handles */}
                                <div 
                                  onMouseDown={(e) => handleResizeStart(img.id, 't', e)}
                                  onTouchStart={(e) => handleResizeStart(img.id, 't', e)}
                                  className="absolute w-6 h-2 bg-white border border-primary rounded-full -top-1 left-1/2 -translate-x-1/2 cursor-ns-resize z-30 hover:scale-110 transition-transform"
                                />
                                <div 
                                  onMouseDown={(e) => handleResizeStart(img.id, 'b', e)}
                                  onTouchStart={(e) => handleResizeStart(img.id, 'b', e)}
                                  className="absolute w-6 h-2 bg-white border border-primary rounded-full -bottom-1 left-1/2 -translate-x-1/2 cursor-ns-resize z-30 hover:scale-110 transition-transform"
                                />
                                <div 
                                  onMouseDown={(e) => handleResizeStart(img.id, 'l', e)}
                                  onTouchStart={(e) => handleResizeStart(img.id, 'l', e)}
                                  className="absolute w-2 h-6 bg-white border border-primary rounded-full top-1/2 -translate-y-1/2 -left-1 cursor-ew-resize z-30 hover:scale-110 transition-transform"
                                />
                                <div 
                                  onMouseDown={(e) => handleResizeStart(img.id, 'r', e)}
                                  onTouchStart={(e) => handleResizeStart(img.id, 'r', e)}
                                  className="absolute w-2 h-6 bg-white border border-primary rounded-full top-1/2 -translate-y-1/2 -right-1 cursor-ew-resize z-30 hover:scale-110 transition-transform"
                                />
                              </>
                            )}
                          </div>
                        );
                      })}
                  </div>

                  {/* Crop & Straighten Button (Below A4 Preview Sheet) */}
                  {selectedLayerId && (() => {
                    const activeLayer = pdfImages.find(i => i.id === selectedLayerId);
                    if (!activeLayer) return null;
                    return (
                      <div className="mt-4 w-full max-w-[350px] animate-fade-in">
                        <button
                          onClick={() => handleOpenCropper(activeLayer.id)}
                          className="w-full py-2.5 px-4 rounded-xl bg-primary/20 border border-primary/40 hover:bg-primary/30 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg shadow-primary/10"
                        >
                          <Crop className="w-4 h-4 text-primary" />
                          Crop & Straighten: {activeLayer.name}
                        </button>
                      </div>
                    );
                  })()}

                  {/* Page Selector Control */}
                  {(() => {
                    const totalPages = layoutMode === 'single'
                      ? pdfImages.length
                      : layoutMode === 'grid-2' 
                      ? Math.ceil(pdfImages.length / 2) 
                      : layoutMode === 'grid-4' 
                      ? Math.ceil(pdfImages.length / 4) 
                      : 1;
                    
                    if (totalPages <= 1) return null;
                    return (
                      <div className="flex items-center justify-center gap-4 mt-6">
                        <button
                          disabled={activePreviewPage === 0}
                          onClick={() => setActivePreviewPage(prev => Math.max(0, prev - 1))}
                          className="p-1.5 rounded-lg bg-white/5 border border-white/5 text-gray-400 hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-gray-300 font-semibold">
                          Page {activePreviewPage + 1} of {totalPages}
                        </span>
                        <button
                          disabled={activePreviewPage === totalPages - 1}
                          onClick={() => setActivePreviewPage(prev => Math.min(totalPages - 1, prev + 1))}
                          className="p-1.5 rounded-lg bg-white/5 border border-white/5 text-gray-400 hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              /* Standard Pages Grid */
              <div className="grid sm:grid-cols-2 gap-6">
                {pdfImages.map((img, index) => (
                  <div key={img.id} className="glass-panel rounded-2xl border border-white/5 overflow-hidden flex flex-col relative group">
                    {/* Top bar indicators */}
                    <div className="absolute top-3 left-3 z-10 bg-black/60 backdrop-blur-md border border-white/10 text-xs font-semibold px-2.5 py-1 rounded-full text-white">
                      Page {index + 1}
                    </div>

                    {/* Move & Action controllers */}
                    <div className="absolute top-3 right-3 z-10 flex gap-1 bg-black/60 backdrop-blur-md border border-white/10 p-1 rounded-lg opacity-90 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleMove(index, -1)}
                        disabled={index === 0}
                        className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 cursor-pointer"
                        title="Move Left"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleMove(index, 1)}
                        disabled={index === pdfImages.length - 1}
                        className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 cursor-pointer"
                        title="Move Right"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Thumbnail Preview */}
                    <div className="aspect-[4/5] w-full bg-black/20 flex items-center justify-center p-4 relative overflow-hidden">
                      <img 
                        src={img.croppedUrl || img.url} 
                        alt={img.name} 
                        className="max-w-full max-h-full object-contain rounded-lg shadow-md transition-transform"
                        style={{ 
                          transform: `rotate(${img.croppedUrl ? 0 : img.rotation}deg)`,
                          filter: `brightness(${pdfBrightness}%) contrast(${pdfContrast}%)`
                        }}
                      />
                    </div>

                    {/* Item Actions */}
                    <div className="p-4 border-t border-white/5 flex items-center justify-between bg-white/1 gap-2">
                      <span className="text-xs text-gray-400 truncate max-w-[120px]" title={img.name}>
                        {img.name}
                      </span>

                      <div className="flex gap-2 items-center">
                        <button 
                          onClick={() => handleRotateQuick(img.id)}
                          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors cursor-pointer"
                          title="Rotate 90°"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                        
                        <button 
                          onClick={() => handleAdjustImage(img.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                          title="Crop and Position Page"
                        >
                          <Crop className="w-3.5 h-3.5" />
                          Adjust
                        </button>

                        <button 
                          onClick={() => removePdfImage(img.id)}
                          className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                          title="Delete Page"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add More card */}
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="glass-panel border-2 border-dashed border-white/10 rounded-2xl hover:border-primary/40 flex flex-col items-center justify-center cursor-pointer p-8 text-center min-h-[300px] hover:bg-white/1 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-4 group-hover:scale-105 group-hover:bg-primary/15 transition-all">
                    <Plus className="w-6 h-6 text-gray-400 group-hover:text-primary" />
                  </div>
                  <p className="text-sm font-semibold text-gray-300">Add More Pages</p>
                  <p className="text-xs text-gray-500 mt-1">Select more images to import</p>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar controls */}
          <div className="space-y-6">
            <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Layout className="w-5 h-5 text-primary" />
                Export Settings
              </h2>

              {/* Document Name */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">File Name</label>
                <input 
                  type="text" 
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary text-sm"
                  placeholder="e.g. passport-scans"
                />
              </div>

              {/* Document Brightness & Contrast (Global) */}
              <div className="space-y-4 pt-2 border-t border-white/5">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-gray-400">
                    <span>Document Brightness</span>
                    <span>{pdfBrightness}%</span>
                  </div>
                  <input 
                    type="range"
                    min={50}
                    max={180}
                    value={pdfBrightness}
                    onChange={(e) => setPdfBrightness(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-gray-400">
                    <span>Document Contrast</span>
                    <span>{pdfContrast}%</span>
                  </div>
                  <input 
                    type="range"
                    min={50}
                    max={180}
                    value={pdfContrast}
                    onChange={(e) => setPdfContrast(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
              </div>

              {/* Layout Presets */}
              <div className="space-y-2.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Grid Layout Mode</label>
                <div className="grid grid-cols-1 gap-2.5">
                  <button 
                    onClick={() => {
                      setLayoutMode('single');
                      setViewTab('manage');
                    }}
                    className={`flex items-center justify-between p-3.5 rounded-xl border text-left cursor-pointer transition-all
                      ${layoutMode === 'single' 
                        ? 'border-primary bg-primary/10 text-white' 
                        : 'border-white/5 bg-white/2 text-gray-400 hover:border-white/20 hover:text-white'}`}
                  >
                    <div>
                      <h4 className="text-sm font-semibold">1 Image per Page</h4>
                      <p className="text-xs text-gray-500">Each page hosts a single full image</p>
                    </div>
                    {layoutMode === 'single' && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </button>

                  <button 
                    onClick={() => {
                      setLayoutMode('grid-2');
                      setViewTab('preview');
                      setActivePreviewPage(0);
                    }}
                    className={`flex items-center justify-between p-3.5 rounded-xl border text-left cursor-pointer transition-all
                      ${layoutMode === 'grid-2' 
                        ? 'border-primary bg-primary/10 text-white' 
                        : 'border-white/5 bg-white/2 text-gray-400 hover:border-white/20'}`}
                  >
                    <div>
                      <h4 className="text-sm font-semibold">2 Images per A4</h4>
                      <p className="text-xs text-gray-500">Stacked vertically/horizontally on A4</p>
                    </div>
                    {layoutMode === 'grid-2' && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </button>

                  <button 
                    onClick={() => {
                      setLayoutMode('grid-4');
                      setViewTab('preview');
                      setActivePreviewPage(0);
                    }}
                    className={`flex items-center justify-between p-3.5 rounded-xl border text-left cursor-pointer transition-all
                      ${layoutMode === 'grid-4' 
                        ? 'border-primary bg-primary/10 text-white' 
                        : 'border-white/5 bg-white/2 text-gray-400 hover:border-white/20'}`}
                  >
                    <div>
                      <h4 className="text-sm font-semibold">4 Images per A4 (Grid)</h4>
                      <p className="text-xs text-gray-500">2x2 arrangement per page</p>
                    </div>
                    {layoutMode === 'grid-4' && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </button>

                  <button 
                    onClick={handleSelectCustomLayout}
                    className={`flex items-center justify-between p-3.5 rounded-xl border text-left cursor-pointer transition-all
                      ${layoutMode === 'custom' 
                        ? 'border-primary bg-primary/10 text-white' 
                        : 'border-white/5 bg-white/2 text-gray-400 hover:border-white/20'}`}
                  >
                    <div>
                      <h4 className="text-sm font-semibold">Custom Drag Layout</h4>
                      <p className="text-xs text-gray-500">Manually drag and scale documents on A4</p>
                    </div>
                    {layoutMode === 'custom' && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </button>
                </div>
              </div>

              {/* Stack direction option (only visible when grid-2 layout is active) */}
              {layoutMode === 'grid-2' && (
                <div className="space-y-2 pt-2 border-t border-white/5 animate-fade-in">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Stack Orientation</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => setGridDirection('vertical')}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold cursor-pointer transition-all text-center
                        ${gridDirection === 'vertical' 
                          ? 'border-primary bg-primary/10 text-white' 
                          : 'border-white/5 bg-white/2 text-gray-400 hover:text-white'}`}
                    >
                      Top / Bottom
                    </button>
                    <button 
                      onClick={() => setGridDirection('horizontal')}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold cursor-pointer transition-all text-center
                        ${gridDirection === 'horizontal' 
                          ? 'border-primary bg-primary/10 text-white' 
                          : 'border-white/5 bg-white/2 text-gray-400 hover:text-white'}`}
                    >
                      Side by Side
                    </button>
                  </div>
                </div>
              )}

              {/* Custom dragging scale slider */}
              {selectedLayerId && (
                <div className="space-y-4 pt-4 border-t border-white/5 animate-fade-in">
                  <h3 className="text-sm font-bold text-white">Adjust Selected Layer</h3>
                  {(() => {
                    const activeLayer = pdfImages.find(i => i.id === selectedLayerId);
                    if (!activeLayer) return null;
                    return (
                      <div className="space-y-3">
                        <span className="text-xs text-gray-400 font-semibold truncate block">Layer: {activeLayer.name}</span>
                        
                        {/* Width */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs font-semibold text-gray-400">
                            <span>Scale Width</span>
                            <span>{Math.round(activeLayer.customWidth || 40)}% of page</span>
                          </div>
                          <input
                            type="range"
                            min={10}
                            max={100}
                            value={activeLayer.customWidth || 40}
                            onChange={(e) => handleWidthChange(activeLayer.id, parseInt(e.target.value))}
                            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                          />
                        </div>

                        <p className="text-[10px] text-gray-500 leading-normal">
                          Drag the document directly on the A4 preview map to position it. Height scales automatically to prevent stretching.
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Reset layout positions button */}
              {viewTab === 'preview' && (
                <div className="pt-2 border-t border-white/5">
                  <button
                    onClick={handleResetPositions}
                    className="w-full py-2.5 px-4 rounded-xl border border-white/5 bg-white/2 hover:bg-white/5 text-xs text-gray-300 hover:text-white font-semibold cursor-pointer transition-all flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reset to Default Positions
                  </button>
                </div>
              )}

              {/* PDF Generator Buttons */}
              <div className="flex gap-3">
                <button 
                  onClick={() => handleGeneratePdf(false)}
                  disabled={isGenerating || pdfImages.length === 0}
                  className="btn-primary flex-1 py-3.5 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileDown className="w-4.5 h-4.5" />
                      Download PDF
                    </>
                  )}
                </button>

                <button 
                  onClick={() => handleGeneratePdf(true)}
                  disabled={isGenerating || pdfImages.length === 0}
                  className="flex-1 py-3.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Printer className="w-4.5 h-4.5 text-gray-400" />
                      Print PDF
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cropper Modal Overlay */}
      <Modal 
        isOpen={cropModalOpen} 
        onClose={() => {
          setCropModalOpen(false);
          setActiveImgId(null);
          setRenderedSize({ width: 0, height: 0 });
        }} 
        title="Crop & Align Image"
      >
        {activeImage && (
          <div className="flex flex-col h-full gap-4">
            {/* Crop Mode Switcher */}
            <div className="flex gap-2 border-b border-white/5 pb-2">
              <button
                onClick={() => setCropMode('perspective')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors border cursor-pointer
                  ${cropMode === 'perspective' 
                    ? 'bg-primary/10 border-primary text-white shadow-md shadow-primary/5' 
                    : 'bg-white/2 border-white/5 text-gray-400 hover:text-white'}`}
              >
                Perspective Crop (4-Point Warp)
              </button>
              <button
                onClick={() => setCropMode('regular')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors border cursor-pointer
                  ${cropMode === 'regular' 
                    ? 'bg-primary/10 border-primary text-white shadow-md shadow-primary/5' 
                    : 'bg-white/2 border-white/5 text-gray-400 hover:text-white'}`}
              >
                Standard Crop (Rectangle)
              </button>
            </div>

            {/* Cropper box */}
            <div className="relative w-full min-h-[340px] max-h-[380px] bg-black/40 rounded-xl border border-white/5 p-4 flex items-center justify-center overflow-auto">
              {cropMode === 'perspective' ? (
                <div 
                  className="relative select-none" 
                  style={{ 
                    width: renderedSize.width ? `${renderedSize.width}px` : 'auto', 
                    height: renderedSize.height ? `${renderedSize.height}px` : 'auto',
                    transform: `rotate(${rotation}deg)`,
                    transformOrigin: 'center center'
                  }}
                >
                  <img
                    ref={imageRef}
                    src={activeImage.url}
                    alt="Crop source"
                    className="pointer-events-none select-none"
                    style={{ maxHeight: '300px', display: 'block' }}
                    onLoad={onImageLoad}
                  />
                  {/* SVG polygon overlay connecting the 4 points */}
                  {renderedSize.width > 0 && renderedSize.height > 0 && (
                    <svg className="absolute inset-0 pointer-events-none w-full h-full z-10">
                      <polygon
                        points={`${perspectivePoints[0].x},${perspectivePoints[0].y} ${perspectivePoints[1].x},${perspectivePoints[1].y} ${perspectivePoints[2].x},${perspectivePoints[2].y} ${perspectivePoints[3].x},${perspectivePoints[3].y}`}
                        fill="rgba(168, 85, 247, 0.2)"
                        stroke="#a855f7"
                        strokeWidth="2.5"
                      />
                    </svg>
                  )}
                  {/* Absolute-positioned draggable handles */}
                  {renderedSize.width > 0 && renderedSize.height > 0 && perspectivePoints.map((pt, idx) => (
                    <div
                      key={idx}
                      onMouseDown={(e) => handlePerspectiveMouseDown(idx, e)}
                      onTouchStart={(e) => handlePerspectiveMouseDown(idx, e)}
                      className="absolute w-6 h-6 bg-purple-600 border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 hover:scale-110 active:scale-95 transition-all shadow-lg flex items-center justify-center border-solid select-none"
                      style={{
                        left: `${pt.x}px`,
                        top: `${pt.y}px`,
                        cursor: idx === 0 || idx === 2 ? 'nwse-resize' : 'nesw-resize'
                      }}
                      title={idx === 0 ? 'Top Left (TL)' : idx === 1 ? 'Top Right (TR)' : idx === 2 ? 'Bottom Right (BR)' : 'Bottom Left (BL)'}
                    >
                      <span className="text-[8px] font-extrabold text-white">
                        {idx === 0 ? 'TL' : idx === 1 ? 'TR' : idx === 2 ? 'BR' : 'BL'}
                      </span>
                    </div>
                  ))}

                  {/* Midpoint Edge Handles */}
                  {renderedSize.width > 0 && renderedSize.height > 0 && [
                    { id: 't', x: (perspectivePoints[0].x + perspectivePoints[1].x) / 2, y: (perspectivePoints[0].y + perspectivePoints[1].y) / 2, cursor: 'ns-resize', title: 'Top Edge (T)', label: 'T' },
                    { id: 'r', x: (perspectivePoints[1].x + perspectivePoints[2].x) / 2, y: (perspectivePoints[1].y + perspectivePoints[2].y) / 2, cursor: 'ew-resize', title: 'Right Edge (R)', label: 'R' },
                    { id: 'b', x: (perspectivePoints[3].x + perspectivePoints[2].x) / 2, y: (perspectivePoints[3].y + perspectivePoints[2].y) / 2, cursor: 'ns-resize', title: 'Bottom Edge (B)', label: 'B' },
                    { id: 'l', x: (perspectivePoints[0].x + perspectivePoints[3].x) / 2, y: (perspectivePoints[0].y + perspectivePoints[3].y) / 2, cursor: 'ew-resize', title: 'Left Edge (L)', label: 'L' }
                  ].map((pt) => (
                    <div
                      key={pt.id}
                      onMouseDown={(e) => handlePerspectiveMouseDown(pt.id, e)}
                      onTouchStart={(e) => handlePerspectiveMouseDown(pt.id, e)}
                      className="absolute w-5 h-5 bg-white border-2 border-purple-600 rounded-md -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 hover:scale-110 active:scale-95 transition-all shadow-lg flex items-center justify-center border-solid select-none"
                      style={{
                        left: `${pt.x}px`,
                        top: `${pt.y}px`,
                        cursor: pt.cursor
                      }}
                      title={pt.title}
                    >
                      <span className="text-[9px] font-extrabold text-purple-600">
                        {pt.label}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={aspect}
                  className="max-h-full"
                >
                  <img
                    ref={imageRef}
                    src={activeImage.url}
                    alt="Crop source"
                    style={{ transform: `rotate(${rotation}deg)`, maxHeight: '300px' }}
                    onLoad={onImageLoad}
                  />
                </ReactCrop>
              )}
            </div>

            {/* Cropper controls */}
            <div className="space-y-4">
              {/* Rotate slider */}
              <div className="space-y-3 pt-2">
                <div className="flex justify-between text-xs font-semibold text-gray-400">
                  <span>Straighten Photo (Fine Tilt)</span>
                  <span className="text-primary font-bold">{rotation}°</span>
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
                    className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
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
                    className="text-primary hover:underline cursor-pointer"
                  >
                    Reset Straight
                  </button>
                  <span>+180° Right</span>
                </div>
              </div>

              {/* Aspect Ratio Selector */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Aspect Ratio</span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Free-form', value: undefined },
                    { label: '1:1 Square', value: 1 },
                    { label: '4:3 Standard', value: 4/3 },
                    { label: '16:9 Wide', value: 16/9 },
                    { label: 'A4 Document', value: 1 / 1.414 }
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setAspect(preset.value);
                        // Re-trigger load to adjust crop box aspect
                        if (imageRef.current) {
                          let cropWidth = imageRef.current.width * 0.9;
                          let cropHeight = imageRef.current.height * 0.9;
                          if (preset.value) {
                            if (cropWidth / preset.value > imageRef.current.height) {
                              cropHeight = imageRef.current.height * 0.9;
                              cropWidth = cropHeight * preset.value;
                            } else {
                              cropWidth = imageRef.current.width * 0.9;
                              cropHeight = cropWidth / preset.value;
                            }
                          }
                          const newCrop = {
                            unit: 'px',
                            width: cropWidth,
                            height: cropHeight,
                            x: (imageRef.current.width - cropWidth) / 2,
                            y: (imageRef.current.height - cropHeight) / 2
                          };
                          setCrop(newCrop);
                          setCompletedCrop(newCrop);
                        }
                      }}
                      className={`text-xs px-3.5 py-2 rounded-lg border cursor-pointer transition-colors
                        ${aspect === preset.value 
                          ? 'bg-primary/10 border-primary text-primary font-medium' 
                          : 'bg-white/5 border-white/5 text-gray-400 hover:text-white hover:bg-white/10'}`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Save trigger */}
            <div className="flex justify-end gap-3 mt-6 border-t border-white/5 pt-4">
              <button
                onClick={() => {
                  setCropModalOpen(false);
                  setActiveImgId(null);
                }}
                className="px-5 py-2.5 rounded-xl bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCrop}
                disabled={cropMode === 'regular' && !completedCrop}
                className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50"
              >
                Apply Crop
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
