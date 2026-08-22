import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useAppStore } from '../../store/useAppStore';
import { warpPerspective } from '../../utils/perspectiveWarp';
import Modal from '../ui/Modal';
import {
  ArrowLeft,
  UploadCloud,
  Trash2,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Layout,
  RefreshCw,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Image as ImageIcon,
  Columns2,
  Rows2,
  Grid2X2,
  Square,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
  Crop,
  Move,
  Layers,
  ArrowUp,
  ArrowDown,
  AlignCenter
} from 'lucide-react';

// Dynamically load PDFJS engine
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

export default function PdfToPhoto() {
  const setMode = useAppStore((state) => state.setMode);

  // Core items list: array of { id, type, title, url, croppedUrl, originalWidth, originalHeight, rotation, customX, customY, customWidth, customHeight, file }
  const [items, setItems] = useState([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState('');
  const [processProgress, setProcessProgress] = useState(0);

  // Active selection & Interactive Canvas Drag/Resize states
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dragStartPos, setDragStartPos] = useState({ mouseX: 0, mouseY: 0, imgX: 0, imgY: 0 });
  const [resizingId, setResizingId] = useState(null);
  const [resizeHandle, setResizeHandle] = useState(null); // 'tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r'
  const [resizeStart, setResizeStart] = useState({ mouseX: 0, mouseY: 0, width: 0, height: 0, customX: 0, customY: 0 });

  // Output settings
  const [layoutMode, setLayoutMode] = useState('side-by-side'); // 'side-by-side', 'stacked', '2x2-grid', '1-up', 'free-canvas', 'custom-grid'
  const [sheetPaperSize, setSheetPaperSize] = useState('a4-portrait'); // 'a4-portrait' | 'a4-landscape' | '16:9-hd' | '1:1-square' | 'auto'
  const [customCols, setCustomCols] = useState(2);
  const [exportFormat, setExportFormat] = useState('jpg'); // 'jpg' | 'jpeg'
  const [hdScale, setHdScale] = useState(2); // 1 = Standard, 2 = HD (2x), 3 = Ultra HD (3x)
  const [jpgQuality, setJpgQuality] = useState(0.92);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [spacing, setSpacing] = useState(20);
  const [padding, setPadding] = useState(20);
  const [fitMode, setFitMode] = useState('contain');

  // Advanced Cropper Modal State (ReactCrop & Perspective 4-Point Warp)
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [activeImgId, setActiveImgId] = useState(null);
  const [cropMode, setCropMode] = useState('perspective'); // 'perspective' | 'regular'
  const [crop, setCrop] = useState(null);
  const [completedCrop, setCompletedCrop] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState(undefined);
  const [perspectivePoints, setPerspectivePoints] = useState([
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 }
  ]);
  const [draggingPointIndex, setDraggingPointIndex] = useState(null);
  const [renderedSize, setRenderedSize] = useState({ width: 0, height: 0 });
  const cropperImageRef = useRef(null);

  // Navigation & preview state
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [activeTab, setActiveTab] = useState('manage'); // 'manage' | 'preview'
  const [isExporting, setIsExporting] = useState(false);

  const fileInputRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const previewMapRef = useRef(null);

  // Active cropping image reference
  const activeCropImage = items.find((img) => img.id === activeImgId);

  // Calculate items per sheet
  const getItemsPerSheet = useCallback(() => {
    switch (layoutMode) {
      case '1-up':
        return 1;
      case 'side-by-side':
      case 'stacked':
        return 2;
      case '2x2-grid':
        return 4;
      case 'custom-grid':
        return customCols * 2;
      case 'free-canvas':
        return items.length || 1;
      default:
        return 2;
    }
  }, [layoutMode, customCols, items.length]);

  const itemsPerSheet = getItemsPerSheet();
  const totalSheets = layoutMode === 'free-canvas' ? 1 : (Math.ceil(items.length / itemsPerSheet) || 1);

  // Process files (PDF & Images)
  const processFiles = async (filesList) => {
    const files = Array.from(filesList);
    if (!files.length) return;

    setIsProcessing(true);
    setProcessStatus('Preparing files...');
    setProcessProgress(5);

    const newItems = [];
    const baseCount = items.length;

    for (let fIdx = 0; fIdx < files.length; fIdx++) {
      const file = files[fIdx];
      const progressBase = ((fIdx) / files.length) * 100;
      setProcessProgress(Math.round(progressBase));

      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        try {
          setProcessStatus(`Parsing PDF: ${file.name}...`);
          const pdfjsLib = await loadPdfJs();
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const numPages = pdf.numPages;

          for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            setProcessStatus(`Rendering ${file.name} - Page ${pageNum}/${numPages}...`);
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2.0 });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({ canvasContext: context, viewport }).promise;
            const dataUrl = canvas.toDataURL('image/png');

            const itemIdx = baseCount + newItems.length;
            const defaultX = (itemIdx % 2 === 0 ? 5 : 52);
            const defaultY = (Math.floor(itemIdx / 2) * 45 + 5) % 80;

            newItems.push({
              id: crypto.randomUUID(),
              type: 'pdf-page',
              title: `${file.name.replace(/\.[^/.]+$/, '')} (Pg ${pageNum})`,
              url: dataUrl,
              croppedUrl: null,
              originalWidth: viewport.width,
              originalHeight: viewport.height,
              rotation: 0,
              customX: defaultX,
              customY: defaultY,
              customWidth: 44,
              customHeight: 40,
              file
            });

            const pageProgress = progressBase + ((pageNum / numPages) * (100 / files.length));
            setProcessProgress(Math.min(95, Math.round(pageProgress)));
          }
        } catch (err) {
          console.error('Failed to load PDF file', err);
          alert(`Error reading PDF file "${file.name}". Please ensure it is a valid PDF.`);
        }
      } else if (file.type.startsWith('image/')) {
        setProcessStatus(`Loading image: ${file.name}...`);
        await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataUrl = e.target.result;
            const img = new Image();
            img.onload = () => {
              const itemIdx = baseCount + newItems.length;
              const defaultX = (itemIdx % 2 === 0 ? 5 : 52);
              const defaultY = (Math.floor(itemIdx / 2) * 45 + 5) % 80;

              newItems.push({
                id: crypto.randomUUID(),
                type: 'photo',
                title: file.name,
                url: dataUrl,
                croppedUrl: null,
                originalWidth: img.width,
                originalHeight: img.height,
                rotation: 0,
                customX: defaultX,
                customY: defaultY,
                customWidth: 44,
                customHeight: 40,
                file
              });
              resolve();
            };
            img.onerror = () => resolve();
            img.src = dataUrl;
          };
          reader.onerror = () => resolve();
          reader.readAsDataURL(file);
        });
      }
    }

    if (newItems.length > 0) {
      setItems((prev) => [...prev, ...newItems]);
      if (!selectedLayerId) {
        setSelectedLayerId(newItems[0].id);
      }
    }

    setProcessProgress(100);
    setProcessStatus('Done!');
    setTimeout(() => {
      setIsProcessing(false);
      setProcessStatus('');
    }, 400);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  // Reordering & Item Manipulation
  const moveItemOrder = (index, direction) => {
    const newItems = [...items];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;
    setItems(newItems);
  };

  const rotateItem = (id) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, rotation: (item.rotation + 90) % 360 } : item
      )
    );
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (selectedLayerId === id) {
      setSelectedLayerId(null);
    }
  };

  const updateItem = (id, updates) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  // Quick Preset Alignments for selected item
  const applyPresetPos = (id, preset) => {
    switch (preset) {
      case 'side-left':
        updateItem(id, { customX: 4, customY: 5, customWidth: 44, customHeight: 90 });
        break;
      case 'side-right':
        updateItem(id, { customX: 52, customY: 5, customWidth: 44, customHeight: 90 });
        break;
      case 'stacked-top':
        updateItem(id, { customX: 5, customY: 4, customWidth: 90, customHeight: 44 });
        break;
      case 'stacked-bottom':
        updateItem(id, { customX: 5, customY: 52, customWidth: 90, customHeight: 44 });
        break;
      case 'center':
        updateItem(id, { customX: 25, customY: 25, customWidth: 50, customHeight: 50 });
        break;
      case 'full':
        updateItem(id, { customX: 2, customY: 2, customWidth: 96, customHeight: 96 });
        break;
      default:
        break;
    }
  };

  // Direct Mouse / Touch Dragging and Resizing Handlers on Canvas Map Overlay
  const handlePointerDown = (id, e) => {
    setSelectedLayerId(id);
    setDraggingId(id);
    const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
    const img = items.find((i) => i.id === id);
    if (img) {
      setDragStartPos({
        mouseX: clientX,
        mouseY: clientY,
        imgX: img.customX !== undefined ? img.customX : 5,
        imgY: img.customY !== undefined ? img.customY : 5
      });
    }
    if (e.cancelable && !e.target.tagName.match(/INPUT|BUTTON|SELECT/i)) {
      e.preventDefault();
    }
  };

  const handleResizeStart = (id, handle, e) => {
    e.stopPropagation();
    setResizingId(id);
    setResizeHandle(handle);
    setSelectedLayerId(id);

    const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
    const img = items.find((i) => i.id === id);
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

  const handlePointerMove = (e) => {
    if (!previewMapRef.current) return;
    const rect = previewMapRef.current.getBoundingClientRect();
    const previewWidth = rect.width || 480;
    const previewHeight = rect.height || 320;

    const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;

    if (resizingId && resizeHandle) {
      const deltaX = clientX - resizeStart.mouseX;
      const deltaY = clientY - resizeStart.mouseY;

      const deltaPercentX = (deltaX / previewWidth) * 100;
      const deltaPercentY = (deltaY / previewHeight) * 100;

      const startX = resizeStart.customX;
      const startY = resizeStart.customY;
      const startW = resizeStart.width;
      const startH = resizeStart.height;

      let nextX = startX;
      let nextY = startY;
      let nextW = startW;
      let nextH = startH;

      const minW = 5;
      const minH = 5;

      if (resizeHandle.includes('r')) {
        nextW = Math.max(minW, Math.min(100 - startX, startW + deltaPercentX));
      }
      if (resizeHandle.includes('l')) {
        nextX = Math.max(0, Math.min(startX + startW - minW, startX + deltaPercentX));
        nextW = startX + startW - nextX;
      }
      if (resizeHandle.includes('b')) {
        nextH = Math.max(minH, Math.min(100 - startY, startH + deltaPercentY));
      }
      if (resizeHandle.includes('t')) {
        nextY = Math.max(0, Math.min(startY + startH - minH, startY + deltaPercentY));
        nextH = startY + startH - nextY;
      }

      updateItem(resizingId, {
        customX: Math.round(nextX * 10) / 10,
        customY: Math.round(nextY * 10) / 10,
        customWidth: Math.round(nextW * 10) / 10,
        customHeight: Math.round(nextH * 10) / 10
      });
      return;
    }

    if (draggingId) {
      const deltaX = clientX - dragStartPos.mouseX;
      const deltaY = clientY - dragStartPos.mouseY;

      const deltaPercentX = (deltaX / previewWidth) * 100;
      const deltaPercentY = (deltaY / previewHeight) * 100;

      const nextX = Math.max(0, Math.min(95, dragStartPos.imgX + deltaPercentX));
      const nextY = Math.max(0, Math.min(95, dragStartPos.imgY + deltaPercentY));

      updateItem(draggingId, {
        customX: Math.round(nextX * 10) / 10,
        customY: Math.round(nextY * 10) / 10
      });
    }
  };

  const handlePointerUp = () => {
    setDraggingId(null);
    setResizingId(null);
    setResizeHandle(null);
  };

  // Add global mouse up listener for drag end
  useEffect(() => {
    const onUp = () => handlePointerUp();
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  // ADVANCED CROPPER LOGIC (Perspective Warp & ReactCrop)
  const openCropModal = (id) => {
    const img = items.find((i) => i.id === id);
    if (!img) return;

    setActiveImgId(id);
    setRotation(img.rotation || 0);
    setCropMode('perspective');
    setCrop({ unit: '%', width: 90, height: 90, x: 5, y: 5 });
    setCropModalOpen(true);
  };

  const onImageLoad = (e) => {
    const { width, height } = e.currentTarget;
    setRenderedSize({ width, height });

    // Initialize 4 perspective corner points to image dimensions
    setPerspectivePoints([
      { x: 10, y: 10 },
      { x: width - 10, y: 10 },
      { x: width - 10, y: height - 10 },
      { x: 10, y: height - 10 }
    ]);
  };

  const handlePerspectiveMouseDown = (idxOrId, e) => {
    e.stopPropagation();
    setDraggingPointIndex(idxOrId);
    if (e.cancelable) e.preventDefault();
  };

  const handlePerspectiveMouseMove = (e) => {
    if (draggingPointIndex === null || !cropperImageRef.current) return;
    const rect = cropperImageRef.current.getBoundingClientRect();
    const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;

    let x = clientX - rect.left;
    let y = clientY - rect.top;

    x = Math.max(0, Math.min(rect.width, x));
    y = Math.max(0, Math.min(rect.height, y));

    if (typeof draggingPointIndex === 'number') {
      const newPts = [...perspectivePoints];
      newPts[draggingPointIndex] = { x, y };
      setPerspectivePoints(newPts);
    } else {
      // Edge handles dragging
      const newPts = [...perspectivePoints];
      if (draggingPointIndex === 't') {
        newPts[0].y = y;
        newPts[1].y = y;
      } else if (draggingPointIndex === 'r') {
        newPts[1].x = x;
        newPts[2].x = x;
      } else if (draggingPointIndex === 'b') {
        newPts[2].y = y;
        newPts[3].y = y;
      } else if (draggingPointIndex === 'l') {
        newPts[0].x = x;
        newPts[3].x = x;
      }
      setPerspectivePoints(newPts);
    }
  };

  const handlePerspectiveMouseUp = () => {
    setDraggingPointIndex(null);
  };

  const applyCrop = async () => {
    if (!activeCropImage || !cropperImageRef.current) return;

    try {
      const imgEl = cropperImageRef.current;
      const naturalW = imgEl.naturalWidth;
      const naturalH = imgEl.naturalHeight;
      const dispW = renderedSize.width || imgEl.clientWidth;
      const dispH = renderedSize.height || imgEl.clientHeight;

      const scaleX = naturalW / dispW;
      const scaleY = naturalH / dispH;

      let croppedUrl = null;

      if (cropMode === 'perspective') {
        const naturalPoints = perspectivePoints.map((pt) => ({
          x: pt.x * scaleX,
          y: pt.y * scaleY
        }));

        const dist = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

        const wTop = dist(naturalPoints[0], naturalPoints[1]);
        const wBot = dist(naturalPoints[3], naturalPoints[2]);
        const destW = Math.round(Math.max(10, Math.max(wTop, wBot)));

        const hLeft = dist(naturalPoints[0], naturalPoints[3]);
        const hRight = dist(naturalPoints[1], naturalPoints[2]);
        const destH = Math.round(Math.max(10, Math.max(hLeft, hRight)));

        croppedUrl = warpPerspective(imgEl, naturalPoints, destW, destH, rotation);
      } else {
        if (!completedCrop || !completedCrop.width || !completedCrop.height) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        let cropX = completedCrop.x;
        let cropY = completedCrop.y;
        let cropW = completedCrop.width;
        let cropH = completedCrop.height;

        if (completedCrop.unit === '%') {
          cropX = (completedCrop.x / 100) * dispW;
          cropY = (completedCrop.y / 100) * dispH;
          cropW = (completedCrop.width / 100) * dispW;
          cropH = (completedCrop.height / 100) * dispH;
        }

        const pixelX = cropX * scaleX;
        const pixelY = cropY * scaleY;
        const pixelW = cropW * scaleX;
        const pixelH = cropH * scaleY;

        canvas.width = Math.max(10, Math.round(pixelW));
        canvas.height = Math.max(10, Math.round(pixelH));

        ctx.drawImage(
          imgEl,
          pixelX,
          pixelY,
          pixelW,
          pixelH,
          0,
          0,
          canvas.width,
          canvas.height
        );

        croppedUrl = canvas.toDataURL('image/jpeg', 0.95);
      }

      if (croppedUrl) {
        updateItem(activeCropImage.id, {
          croppedUrl,
          rotation
        });
      }

      setCropModalOpen(false);
      setActiveImgId(null);
    } catch (err) {
      console.error('Failed to crop image', err);
      alert('Error applying crop.');
    }
  };

  // Canvas Sheet Renderer (Draws sheet to canvas at exact coordinates)
  const drawSheetToCanvas = useCallback(
    async (sheetIdx, canvas, scaleFactor = 1) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let baseWidth = 2400;
      let baseHeight = 1600;

      if (sheetPaperSize === 'a4-portrait') {
        baseWidth = 2480;
        baseHeight = 3508;
      } else if (sheetPaperSize === 'a4-landscape') {
        baseWidth = 3508;
        baseHeight = 2480;
      } else if (sheetPaperSize === '16:9-hd') {
        baseWidth = 2400;
        baseHeight = 1350;
      } else if (sheetPaperSize === '1:1-square') {
        baseWidth = 2400;
        baseHeight = 2400;
      } else {
        if (layoutMode === 'stacked') {
          baseWidth = 1920;
          baseHeight = 2400;
        } else if (layoutMode === '2x2-grid') {
          baseWidth = 2400;
          baseHeight = 2400;
        } else if (layoutMode === 'free-canvas') {
          baseWidth = 2400;
          baseHeight = 1600;
        }
      }

      const canvasWidth = baseWidth * scaleFactor;
      const canvasHeight = baseHeight * scaleFactor;

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      if (bgColor === 'transparent') {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      } else {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      }

      if (items.length === 0) {
        ctx.fillStyle = '#6b7280';
        ctx.font = `${28 * scaleFactor}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No images on canvas', canvasWidth / 2, canvasHeight / 2);
        return;
      }

      const startIndex = sheetIdx * itemsPerSheet;
      const sheetItems = layoutMode === 'free-canvas' ? items : items.slice(startIndex, startIndex + itemsPerSheet);

      const currentPadding = padding * scaleFactor;
      const currentSpacing = spacing * scaleFactor;

      let cols = 1;
      let rows = 1;

      if (layoutMode === '1-up') {
        cols = 1; rows = 1;
      } else if (layoutMode === 'side-by-side') {
        cols = 2; rows = 1;
      } else if (layoutMode === 'stacked') {
        cols = 1; rows = 2;
      } else if (layoutMode === '2x2-grid') {
        cols = 2; rows = 2;
      } else if (layoutMode === 'custom-grid') {
        cols = customCols;
        rows = Math.ceil(itemsPerSheet / customCols);
      }

      const availableWidth = canvasWidth - currentPadding * 2 - (cols - 1) * currentSpacing;
      const availableHeight = canvasHeight - currentPadding * 2 - (rows - 1) * currentSpacing;

      const cellWidth = availableWidth / cols;
      const cellHeight = availableHeight / rows;

      const loadedImgs = await Promise.all(
        sheetItems.map(
          (item) =>
            new Promise((resolve) => {
              const img = new Image();
              img.onload = () => resolve({ item, img });
              img.onerror = () => resolve({ item, img: null });
              img.src = item.croppedUrl || item.url;
            })
        )
      );

      for (let idx = 0; idx < loadedImgs.length; idx++) {
        const { item, img } = loadedImgs[idx];
        if (!img) continue;

        if (layoutMode === 'free-canvas' || item.customX !== undefined) {
          // Custom positioned layer
          const itemX = (item.customX / 100) * canvasWidth;
          const itemY = (item.customY / 100) * canvasHeight;
          const itemW = ((item.customWidth || 44) / 100) * canvasWidth;
          const itemH = ((item.customHeight || 40) / 100) * canvasHeight;

          ctx.save();
          const centerX = itemX + itemW / 2;
          const centerY = itemY + itemH / 2;

          ctx.translate(centerX, centerY);
          ctx.rotate(((item.rotation || 0) * Math.PI) / 180);

          if (item.rotation % 180 !== 0) {
            ctx.drawImage(img, -itemH / 2, -itemW / 2, itemH, itemW);
          } else {
            ctx.drawImage(img, -itemW / 2, -itemH / 2, itemW, itemH);
          }
          ctx.restore();
        } else {
          // Grid modes
          const c = idx % cols;
          const r = Math.floor(idx / cols);

          const cellX = currentPadding + c * (cellWidth + currentSpacing);
          const cellY = currentPadding + r * (cellHeight + currentSpacing);

          ctx.save();
          ctx.beginPath();
          ctx.rect(cellX, cellY, cellWidth, cellHeight);
          ctx.clip();

          let imgW = img.width;
          let imgH = img.height;

          if (item.rotation % 180 !== 0) {
            imgW = img.height;
            imgH = img.width;
          }

          const cellAspect = cellWidth / cellHeight;
          const imgAspect = imgW / imgH;

          let drawW = cellWidth;
          let drawH = cellHeight;
          let drawX = cellX;
          let drawY = cellY;

          if (fitMode === 'contain') {
            if (imgAspect > cellAspect) {
              drawW = cellWidth;
              drawH = cellWidth / imgAspect;
              drawX = cellX;
              drawY = cellY + (cellHeight - drawH) / 2;
            } else {
              drawH = cellHeight;
              drawW = cellHeight * imgAspect;
              drawX = cellX + (cellWidth - drawW) / 2;
              drawY = cellY;
            }
          } else {
            if (imgAspect > cellAspect) {
              drawH = cellHeight;
              drawW = cellHeight * imgAspect;
              drawX = cellX + (cellWidth - drawW) / 2;
              drawY = cellY;
            } else {
              drawW = cellWidth;
              drawH = cellWidth / imgAspect;
              drawX = cellX;
              drawY = cellY + (cellHeight - drawH) / 2;
            }
          }

          const centerX = drawX + drawW / 2;
          const centerY = drawY + drawH / 2;

          ctx.translate(centerX, centerY);
          ctx.rotate((item.rotation * Math.PI) / 180);

          if (item.rotation % 180 !== 0) {
            ctx.drawImage(img, -drawH / 2, -drawW / 2, drawH, drawW);
          } else {
            ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
          }

          ctx.restore();
        }
      }
    },
    [items, layoutMode, customCols, itemsPerSheet, bgColor, spacing, padding, fitMode, sheetPaperSize]
  );

  useEffect(() => {
    if (previewCanvasRef.current) {
      drawSheetToCanvas(activeSheetIndex, previewCanvasRef.current, 1);
    }
  }, [drawSheetToCanvas, activeSheetIndex]);

  // Export Sheet to HD JPG
  const downloadSheet = async (sheetIdx) => {
    setIsExporting(true);
    try {
      const offscreenCanvas = document.createElement('canvas');
      await drawSheetToCanvas(sheetIdx, offscreenCanvas, hdScale);

      const mimeType = 'image/jpeg';
      const ext = exportFormat === 'jpeg' ? 'jpeg' : 'jpg';

      const dataUrl = offscreenCanvas.toDataURL(mimeType, jpgQuality);
      const link = document.createElement('a');
      link.download = `converted_photo_page_${sheetIdx + 1}.${ext}`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to download image', err);
      alert('Error exporting image.');
    } finally {
      setIsExporting(false);
    }
  };

  const downloadAllSheets = async () => {
    setIsExporting(true);
    try {
      for (let sIdx = 0; sIdx < totalSheets; sIdx++) {
        await downloadSheet(sIdx);
        await new Promise((r) => setTimeout(r, 250));
      }
    } finally {
      setIsExporting(false);
    }
  };

  const selectedItem = items.find((i) => i.id === selectedLayerId);

  const getPreviewMapDimensions = () => {
    let w = 2400;
    let h = 1600;

    if (sheetPaperSize === 'a4-portrait') {
      w = 2480; h = 3508;
    } else if (sheetPaperSize === 'a4-landscape') {
      w = 3508; h = 2480;
    } else if (sheetPaperSize === '16:9-hd') {
      w = 2400; h = 1350;
    } else if (sheetPaperSize === '1:1-square') {
      w = 2400; h = 2400;
    } else {
      if (layoutMode === 'stacked') { w = 1920; h = 2400; }
      else if (layoutMode === '2x2-grid') { w = 2400; h = 2400; }
      else if (layoutMode === 'free-canvas') { w = 2400; h = 1600; }
    }

    const isPortrait = h > w;
    if (isPortrait) {
      const dispW = 320;
      const dispH = Math.round(320 * (h / w));
      return { width: `${dispW}px`, height: `${dispH}px` };
    } else {
      const dispW = 480;
      const dispH = Math.round(480 * (h / w));
      return { width: `${dispW}px`, height: `${dispH}px` };
    }
  };

  return (
    <div className="flex flex-col flex-1 w-full max-w-7xl mx-auto px-4 py-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMode('dashboard')}
            className="p-2 rounded-xl glass-panel text-gray-400 hover:text-white hover:border-primary/40 transition-all cursor-pointer"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
              PDF to Photo & Collage
              <span className="text-xs font-normal text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                HD .JPG
              </span>
            </h1>
            <p className="text-xs text-gray-400">
              Interactive 4-Point Warp cropping & direct on-canvas drag & resize positioning
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <>
              <button
                onClick={() => setItems([])}
                className="px-3 py-1.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear All
              </button>
              <button
                onClick={downloadAllSheets}
                disabled={isExporting}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <FileDown className="w-4 h-4" />
                {isExporting ? 'Generating HD JPG...' : `Export All (${totalSheets} Sheet${totalSheets > 1 ? 's' : ''})`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Processing Loader Modal */}
      {isProcessing && (
        <Modal isOpen={true} onClose={() => {}}>
          <div className="flex flex-col items-center py-6 text-center">
            <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin mb-4" />
            <h3 className="text-lg font-bold text-white mb-1">Processing Files</h3>
            <p className="text-xs text-gray-400 mb-4">{processStatus}</p>

            <div className="w-full max-w-xs bg-gray-800 rounded-full h-2 overflow-hidden mb-2">
              <div
                className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                style={{ width: `${processProgress}%` }}
              ></div>
            </div>
            <span className="text-xs text-emerald-400 font-medium">{processProgress}%</span>
          </div>
        </Modal>
      )}

      {/* ADVANCED CROP MODAL (ReactCrop & 4-Point Perspective Warp) */}
      <Modal
        isOpen={cropModalOpen}
        onClose={() => {
          setCropModalOpen(false);
          setActiveImgId(null);
        }}
        title="Crop & Align Image"
      >
        {activeCropImage && (
          <div className="flex flex-col h-full gap-4">
            {/* Mode Switcher */}
            <div className="flex gap-2 border-b border-white/10 pb-2">
              <button
                onClick={() => setCropMode('perspective')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all border cursor-pointer ${
                  cropMode === 'perspective'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-md shadow-emerald-500/10'
                    : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'
                }`}
              >
                Perspective Crop (4-Point Warp)
              </button>
              <button
                onClick={() => setCropMode('regular')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all border cursor-pointer ${
                  cropMode === 'regular'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-md shadow-emerald-500/10'
                    : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'
                }`}
              >
                Standard Crop (Rectangle)
              </button>
            </div>

            {/* Cropper Box */}
            <div
              onMouseMove={handlePerspectiveMouseMove}
              onTouchMove={handlePerspectiveMouseMove}
              onMouseUp={handlePerspectiveMouseUp}
              onTouchEnd={handlePerspectiveMouseUp}
              className="relative w-full min-h-[340px] max-h-[380px] bg-black/40 rounded-xl border border-white/10 p-4 flex items-center justify-center overflow-auto select-none"
            >
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
                    ref={cropperImageRef}
                    src={activeCropImage.url}
                    alt="Crop source"
                    className="pointer-events-none select-none max-h-[300px] block"
                    onLoad={onImageLoad}
                  />

                  {/* Polygon Overlay */}
                  {renderedSize.width > 0 && renderedSize.height > 0 && (
                    <svg className="absolute inset-0 pointer-events-none w-full h-full z-10">
                      <polygon
                        points={`${perspectivePoints[0].x},${perspectivePoints[0].y} ${perspectivePoints[1].x},${perspectivePoints[1].y} ${perspectivePoints[2].x},${perspectivePoints[2].y} ${perspectivePoints[3].x},${perspectivePoints[3].y}`}
                        fill="rgba(16, 185, 129, 0.2)"
                        stroke="#10b981"
                        strokeWidth="2.5"
                      />
                    </svg>
                  )}

                  {/* Corner Handles */}
                  {renderedSize.width > 0 &&
                    renderedSize.height > 0 &&
                    perspectivePoints.map((pt, idx) => (
                      <div
                        key={idx}
                        onMouseDown={(e) => handlePerspectiveMouseDown(idx, e)}
                        onTouchStart={(e) => handlePerspectiveMouseDown(idx, e)}
                        className="absolute w-6 h-6 bg-emerald-500 border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 hover:scale-110 active:scale-95 transition-all shadow-lg flex items-center justify-center border-solid select-none"
                        style={{
                          left: `${pt.x}px`,
                          top: `${pt.y}px`
                        }}
                      >
                        <span className="text-[8px] font-extrabold text-black">
                          {idx === 0 ? 'TL' : idx === 1 ? 'TR' : idx === 2 ? 'BR' : 'BL'}
                        </span>
                      </div>
                    ))}

                  {/* Edge Handles */}
                  {renderedSize.width > 0 &&
                    renderedSize.height > 0 &&
                    [
                      { id: 't', x: (perspectivePoints[0].x + perspectivePoints[1].x) / 2, y: (perspectivePoints[0].y + perspectivePoints[1].y) / 2, label: 'T' },
                      { id: 'r', x: (perspectivePoints[1].x + perspectivePoints[2].x) / 2, y: (perspectivePoints[1].y + perspectivePoints[2].y) / 2, label: 'R' },
                      { id: 'b', x: (perspectivePoints[3].x + perspectivePoints[2].x) / 2, y: (perspectivePoints[3].y + perspectivePoints[2].y) / 2, label: 'B' },
                      { id: 'l', x: (perspectivePoints[0].x + perspectivePoints[3].x) / 2, y: (perspectivePoints[0].y + perspectivePoints[3].y) / 2, label: 'L' }
                    ].map((pt) => (
                      <div
                        key={pt.id}
                        onMouseDown={(e) => handlePerspectiveMouseDown(pt.id, e)}
                        onTouchStart={(e) => handlePerspectiveMouseDown(pt.id, e)}
                        className="absolute w-5 h-5 bg-white border-2 border-emerald-500 rounded-md -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 hover:scale-110 active:scale-95 transition-all shadow-lg flex items-center justify-center border-solid select-none"
                        style={{
                          left: `${pt.x}px`,
                          top: `${pt.y}px`
                        }}
                      >
                        <span className="text-[9px] font-extrabold text-emerald-600">
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
                    ref={cropperImageRef}
                    src={activeCropImage.url}
                    alt="Crop source"
                    style={{ transform: `rotate(${rotation}deg)`, maxHeight: '300px' }}
                    onLoad={onImageLoad}
                  />
                </ReactCrop>
              )}
            </div>

            {/* Cropper Presets & Controls */}
            <div className="flex items-center justify-between gap-3 pt-2">
              {cropMode === 'regular' && (
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {[
                    { label: 'Free', val: undefined },
                    { label: '1:1', val: 1 },
                    { label: '4:3', val: 4 / 3 },
                    { label: '16:9', val: 16 / 9 },
                    { label: '3:4', val: 3 / 4 }
                  ].map((r) => (
                    <button
                      key={r.label}
                      onClick={() => setAspect(r.val)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold whitespace-nowrap ${
                        aspect === r.val
                          ? 'bg-emerald-500 text-black font-bold'
                          : 'bg-white/5 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  Rotate ({rotation}°)
                </button>
                <button
                  onClick={() => setCropModalOpen(false)}
                  className="px-4 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={applyCrop}
                  className="px-5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  Apply Crop
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Uploader Zone if empty */}
      {items.length === 0 ? (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center p-12 my-8 rounded-3xl border-2 border-dashed transition-all cursor-pointer text-center relative overflow-hidden min-h-[380px]
            ${
              isDragActive
                ? 'border-emerald-500 bg-emerald-500/10 scale-[1.01]'
                : 'border-white/10 hover:border-emerald-500/50 bg-black/30 hover:bg-black/40'
            }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInput}
            multiple
            accept="application/pdf,image/*"
            className="hidden"
          />

          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center mb-6 shadow-xl shadow-emerald-500/10 group-hover:scale-110 transition-transform">
            <UploadCloud className="w-10 h-10 text-emerald-400" />
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
            Drop your PDF or Photo files here
          </h2>
          <p className="text-gray-400 text-sm max-w-md mb-6 leading-relaxed">
            Upload PDFs or photos, crop with 4-Point Perspective Warp, and drag & resize photos directly on the HD canvas screen.
          </p>

          <button className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm shadow-lg shadow-emerald-500/25 transition-all">
            Select PDF or Image Files
          </button>
        </div>
      ) : (
        /* Workspace when items exist */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column / Control Sidebar (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            {/* View Switcher Tabs */}
            <div className="flex p-1 bg-black/40 rounded-xl border border-white/5">
              <button
                onClick={() => setActiveTab('manage')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'manage'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                1. Uploaded Items ({items.length})
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'preview'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                2. Layout & HD Settings
              </button>
            </div>

            {/* TAB 1: Items List */}
            {activeTab === 'manage' && (
              <div className="glass-panel rounded-2xl p-5 border border-white/5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-emerald-400" />
                    Pages & Photos List
                  </h3>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add More
                  </button>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileInput}
                  multiple
                  accept="application/pdf,image/*"
                  className="hidden"
                />

                {/* Items List */}
                <div className="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto pr-1">
                  {items.map((item, idx) => (
                    <div
                      key={item.id}
                      onClick={() => setSelectedLayerId(item.id)}
                      className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer group ${
                        selectedLayerId === item.id
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-white/5 bg-black/30 hover:border-white/20'
                      }`}
                    >
                      <span className="text-xs font-bold text-gray-500 w-5 text-center">
                        #{idx + 1}
                      </span>
                      <div className="w-12 h-12 rounded-lg bg-gray-900 overflow-hidden border border-white/10 flex-shrink-0 relative">
                        <img
                          src={item.croppedUrl || item.url}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          style={{ transform: `rotate(${item.rotation}deg)` }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{item.title}</p>
                        <p className="text-[10px] text-gray-400">
                          {item.type === 'pdf-page' ? 'PDF Page' : 'Photo'} • Pos: ({item.customX}%, {item.customY}%)
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openCropModal(item.id);
                          }}
                          className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-black text-xs font-bold flex items-center gap-1 transition-all"
                          title="Advanced Crop"
                        >
                          <Crop className="w-3.5 h-3.5" />
                          Crop
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            rotateItem(item.id);
                          }}
                          className="p-1 rounded-md hover:bg-white/10 text-gray-400 hover:text-emerald-400 cursor-pointer"
                          title="Rotate 90°"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeItem(item.id);
                          }}
                          className="p-1 rounded-md hover:bg-red-500/20 text-gray-400 hover:text-red-400 cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 2 / Layout & Canvas Controls */}
            <div className="glass-panel rounded-2xl p-5 border border-white/5 flex flex-col gap-5">
              {/* Layout Presets */}
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-2.5 flex items-center gap-1.5">
                  <Layout className="w-3.5 h-3.5 text-emerald-400" />
                  Arrangement Layout Mode
                </label>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => setLayoutMode('side-by-side')}
                    className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 text-xs font-medium transition-all cursor-pointer ${
                      layoutMode === 'side-by-side'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-white/10 bg-black/20 text-gray-400 hover:text-white'
                    }`}
                  >
                    <Columns2 className="w-5 h-5 text-emerald-400" />
                    Side-by-Side (2)
                  </button>

                  <button
                    onClick={() => setLayoutMode('stacked')}
                    className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 text-xs font-medium transition-all cursor-pointer ${
                      layoutMode === 'stacked'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-white/10 bg-black/20 text-gray-400 hover:text-white'
                    }`}
                  >
                    <Rows2 className="w-5 h-5 text-emerald-400" />
                    Top & Bottom (2)
                  </button>

                  <button
                    onClick={() => setLayoutMode('free-canvas')}
                    className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 text-xs font-medium transition-all cursor-pointer ${
                      layoutMode === 'free-canvas'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white shadow-lg shadow-emerald-500/20'
                        : 'border-white/10 bg-black/20 text-gray-400 hover:text-white'
                    }`}
                  >
                    <Move className="w-5 h-5 text-emerald-400" />
                    Free Drag & Resize
                  </button>

                  <button
                    onClick={() => setLayoutMode('2x2-grid')}
                    className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 text-xs font-medium transition-all cursor-pointer ${
                      layoutMode === '2x2-grid'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-white/10 bg-black/20 text-gray-400 hover:text-white'
                    }`}
                  >
                    <Grid2X2 className="w-5 h-5 text-emerald-400" />
                    2x2 Grid (4)
                  </button>

                  <button
                    onClick={() => setLayoutMode('1-up')}
                    className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 text-xs font-medium transition-all cursor-pointer ${
                      layoutMode === '1-up'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-white/10 bg-black/20 text-gray-400 hover:text-white'
                    }`}
                  >
                    <Square className="w-5 h-5 text-emerald-400" />
                    1 Image per File
                  </button>

                  <button
                    onClick={() => setLayoutMode('custom-grid')}
                    className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 text-xs font-medium transition-all cursor-pointer ${
                      layoutMode === 'custom-grid'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-white/10 bg-black/20 text-gray-400 hover:text-white'
                    }`}
                  >
                    <SlidersHorizontal className="w-5 h-5 text-emerald-400" />
                    Custom Grid
                  </button>
                </div>
              </div>

              {/* Selected Photo Adjustment Panel */}
              {selectedItem && (
                <div className="p-4 rounded-xl bg-black/40 border border-emerald-500/30 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <Move className="w-3.5 h-3.5" />
                      Adjust Selected ({selectedItem.title})
                    </span>
                    <button
                      onClick={() => openCropModal(selectedItem.id)}
                      className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-black text-[10px] font-bold flex items-center gap-1"
                    >
                      <Crop className="w-3 h-3" /> Crop
                    </button>
                  </div>

                  {/* Size & Position sliders */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between text-[10px] font-semibold text-gray-400 mb-1">
                        <span>Width:</span>
                        <span>{selectedItem.customWidth}%</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="100"
                        value={selectedItem.customWidth}
                        onChange={(e) =>
                          updateItem(selectedItem.id, { customWidth: parseInt(e.target.value) })
                        }
                        className="w-full accent-emerald-500 cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] font-semibold text-gray-400 mb-1">
                        <span>Height:</span>
                        <span>{selectedItem.customHeight}%</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="100"
                        value={selectedItem.customHeight}
                        onChange={(e) =>
                          updateItem(selectedItem.id, { customHeight: parseInt(e.target.value) })
                        }
                        className="w-full accent-emerald-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Alignment buttons */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 block mb-1">
                      Quick Align:
                    </label>
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => applyPresetPos(selectedItem.id, 'side-left')}
                        className="px-2 py-1 rounded bg-white/5 hover:bg-emerald-500/20 text-gray-300 hover:text-emerald-400 text-[10px] font-semibold"
                      >
                        Left Half
                      </button>
                      <button
                        onClick={() => applyPresetPos(selectedItem.id, 'side-right')}
                        className="px-2 py-1 rounded bg-white/5 hover:bg-emerald-500/20 text-gray-300 hover:text-emerald-400 text-[10px] font-semibold"
                      >
                        Right Half
                      </button>
                      <button
                        onClick={() => applyPresetPos(selectedItem.id, 'stacked-top')}
                        className="px-2 py-1 rounded bg-white/5 hover:bg-emerald-500/20 text-gray-300 hover:text-emerald-400 text-[10px] font-semibold"
                      >
                        Top Half
                      </button>
                      <button
                        onClick={() => applyPresetPos(selectedItem.id, 'stacked-bottom')}
                        className="px-2 py-1 rounded bg-white/5 hover:bg-emerald-500/20 text-gray-300 hover:text-emerald-400 text-[10px] font-semibold"
                      >
                        Bottom Half
                      </button>
                      <button
                        onClick={() => applyPresetPos(selectedItem.id, 'center')}
                        className="px-2 py-1 rounded bg-white/5 hover:bg-emerald-500/20 text-gray-300 hover:text-emerald-400 text-[10px] font-semibold"
                      >
                        Center
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Sheet Paper Size / Aspect Ratio Selector */}
              <div>
                <label className="text-[11px] font-bold text-gray-300 block mb-2 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-emerald-400" />
                  Sheet Paper Size / Aspect Ratio
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {[
                    { id: 'a4-portrait', name: 'A4 Portrait', desc: 'Print 300DPI' },
                    { id: 'a4-landscape', name: 'A4 Landscape', desc: 'Print 300DPI' },
                    { id: '16:9-hd', name: '16:9 HD', desc: 'Widescreen' },
                    { id: '1:1-square', name: '1:1 Square', desc: 'Square' },
                    { id: 'auto', name: 'Auto Standard', desc: 'Default' }
                  ].map((ps) => (
                    <button
                      key={ps.id}
                      onClick={() => setSheetPaperSize(ps.id)}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                        sheetPaperSize === ps.id
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold'
                          : 'border-white/10 bg-black/20 text-gray-400 hover:text-white'
                      }`}
                    >
                      <p className="text-xs font-semibold">{ps.name}</p>
                      <p className="text-[9px] text-gray-500">{ps.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Background & HD options */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 block mb-1.5">
                    Background Color
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[
                      { label: 'White', value: '#ffffff' },
                      { label: 'Black', value: '#000000' },
                      { label: 'Gray', value: '#1f2937' },
                      { label: 'None', value: 'transparent' }
                    ].map((bg) => (
                      <button
                        key={bg.value}
                        onClick={() => setBgColor(bg.value)}
                        className={`w-7 h-7 rounded-lg border text-[10px] font-bold flex items-center justify-center cursor-pointer transition-all ${
                          bgColor === bg.value
                            ? 'border-emerald-400 scale-110 ring-2 ring-emerald-400/30'
                            : 'border-white/20 hover:border-white/40'
                        }`}
                        style={{
                          backgroundColor: bg.value === 'transparent' ? '#111827' : bg.value,
                          color: bg.value === '#ffffff' ? '#000' : '#fff'
                        }}
                      >
                        {bg.value === 'transparent' ? '✕' : ''}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-gray-400 block mb-1.5">
                    HD Output Scale
                  </label>
                  <div className="flex gap-1 bg-black/30 p-1 rounded-xl border border-white/5">
                    {[
                      { scale: 1, name: '1x' },
                      { scale: 2, name: '2x HD' },
                      { scale: 3, name: '3x 4K' }
                    ].map((q) => (
                      <button
                        key={q.scale}
                        onClick={() => setHdScale(q.scale)}
                        className={`flex-1 py-1 rounded-lg text-[11px] font-bold ${
                          hdScale === q.scale
                            ? 'bg-emerald-500 text-black'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {q.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column / Live Interactive Canvas Preview & Direct Drag/Resize Overlay (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="glass-panel rounded-2xl p-5 border border-white/5 flex flex-col items-center">
              {/* Header */}
              <div className="w-full flex items-center justify-between mb-4 pb-3 border-b border-white/5">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  Live Interactive HD Preview Map ({activeSheetIndex + 1} / {totalSheets})
                </span>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded-xl border border-white/5">
                    <button
                      onClick={() => setActiveSheetIndex((prev) => Math.max(0, prev - 1))}
                      disabled={activeSheetIndex === 0}
                      className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-20 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-semibold text-gray-300 px-1">
                      Sheet {activeSheetIndex + 1}
                    </span>
                    <button
                      onClick={() =>
                        setActiveSheetIndex((prev) => Math.min(totalSheets - 1, prev + 1))
                      }
                      disabled={activeSheetIndex === totalSheets - 1}
                      className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-20 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1 bg-black/40 px-1.5 py-1 rounded-xl border border-white/5">
                    <button
                      onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.15))}
                      className="p-1 text-gray-400 hover:text-white cursor-pointer"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] font-bold text-gray-400 w-8 text-center">
                      {Math.round(zoomLevel * 100)}%
                    </span>
                    <button
                      onClick={() => setZoomLevel((z) => Math.min(2, z + 0.15))}
                      className="p-1 text-gray-400 hover:text-white cursor-pointer"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Direct Interactive Layer Overlay on Canvas Map */}
              <div
                onMouseMove={handlePointerMove}
                onTouchMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onTouchEnd={handlePointerUp}
                className="w-full flex items-center justify-center p-4 bg-black/50 rounded-xl border border-white/5 overflow-auto min-h-[440px] max-h-[620px] relative select-none"
              >
                <div
                  ref={previewMapRef}
                  className="transition-transform origin-center shadow-2xl rounded relative overflow-hidden select-none"
                  style={{
                    transform: `scale(${zoomLevel})`,
                    ...getPreviewMapDimensions(),
                    backgroundColor: bgColor === 'transparent' ? '#1f2937' : bgColor
                  }}
                >
                  <canvas
                    ref={previewCanvasRef}
                    className="w-full h-full block pointer-events-none"
                  />

                  {/* Interactive Overlays for Direct Mouse Dragging & Resizing */}
                  {items.map((item) => {
                    const isSelected = selectedLayerId === item.id;
                    const itemX = item.customX !== undefined ? item.customX : 5;
                    const itemY = item.customY !== undefined ? item.customY : 5;
                    const itemW = item.customWidth !== undefined ? item.customWidth : 44;
                    const itemH = item.customHeight !== undefined ? item.customHeight : 40;

                    return (
                      <div
                        key={item.id}
                        onMouseDown={(e) => handlePointerDown(item.id, e)}
                        onTouchStart={(e) => handlePointerDown(item.id, e)}
                        className={`absolute cursor-move select-none border-2 transition-all ${
                          isSelected
                            ? 'border-emerald-400 bg-emerald-500/10 z-20 shadow-xl'
                            : 'border-transparent hover:border-white/40 z-10'
                        }`}
                        style={{
                          left: `${itemX}%`,
                          top: `${itemY}%`,
                          width: `${itemW}%`,
                          height: `${itemH}%`
                        }}
                      >
                        {isSelected && (
                          <>
                            {/* Resize Handles (8 handles) */}
                            {[
                              { h: 'tl', pos: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize' },
                              { h: 'tr', pos: 'top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize' },
                              { h: 'bl', pos: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize' },
                              { h: 'br', pos: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize' },
                              { h: 't', pos: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize' },
                              { h: 'b', pos: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize' },
                              { h: 'l', pos: 'top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize' },
                              { h: 'r', pos: 'top-1/2 right-0 translate-x-1/2 -translate-y-1/2 cursor-ew-resize' }
                            ].map((handle) => (
                              <div
                                key={handle.h}
                                onMouseDown={(e) => handleResizeStart(item.id, handle.h, e)}
                                onTouchStart={(e) => handleResizeStart(item.id, handle.h, e)}
                                className={`absolute w-3.5 h-3.5 bg-emerald-400 border border-white rounded-full ${handle.pos} hover:scale-125 z-30 shadow-md`}
                              />
                            ))}
                            <div className="absolute top-1 left-1 bg-black/80 text-[8px] font-bold text-emerald-400 px-1 rounded">
                              {item.title}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Export Current Sheet Button */}
              <div className="w-full mt-4 flex justify-end">
                <button
                  onClick={() => downloadSheet(activeSheetIndex)}
                  disabled={isExporting}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <FileDown className="w-4 h-4" />
                  Download Sheet {activeSheetIndex + 1} (.{exportFormat.toUpperCase()} HD)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
