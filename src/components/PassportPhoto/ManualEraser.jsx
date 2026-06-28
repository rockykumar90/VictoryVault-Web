import React, { useRef, useState, useEffect } from 'react';
import { 
  Eraser, 
  Paintbrush, 
  Undo2, 
  Redo2, 
  ZoomIn, 
  ZoomOut, 
  Save, 
  Move,
  RotateCcw,
  Wand2,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export default function ManualEraser({ originalSrc, bgRemovedSrc, onSave, onCancel }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const originalImageRef = useRef(null);
  const lastCoordsRef = useRef(null);
  
  const [brushSize, setBrushSize] = useState(15);
  const [tolerance, setTolerance] = useState(25); // For magic wand
  const [tool, setTool] = useState('magic-wand'); // 'erase' | 'restore' | 'magic-wand' | 'pan'
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [isInitialized, setIsInitialized] = useState(false);

  // Undo/Redo stacks
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Load images & initialize mask canvas
  useEffect(() => {
    const originalImg = new Image();
    const bgRemovedImg = new Image();
    let loadedCount = 0;
    let hasFailed = false;

    const onImageLoaded = () => {
      if (hasFailed) return;
      loadedCount++;
      if (loadedCount === 2) {
        initialize(originalImg, bgRemovedImg);
      }
    };

    const handleBgRemovedError = () => {
      console.warn("ManualEraser: Failed to load background-removed image (CORS or network error). Retrying with original image.");
      if (hasFailed) return;
      
      // Fallback: Initialize with originalImg as both background removed and original
      // to let user start manually erasing.
      bgRemovedImg.onload = null;
      bgRemovedImg.onerror = null;
      
      loadedCount++;
      if (loadedCount === 2) {
        initialize(originalImg, originalImg);
      }
    };

    const handleOriginalError = () => {
      console.error("ManualEraser: Failed to load original image.");
    };

    originalImg.crossOrigin = 'anonymous';
    bgRemovedImg.crossOrigin = 'anonymous';
    
    originalImg.onload = onImageLoaded;
    originalImg.onerror = handleOriginalError;

    bgRemovedImg.onload = onImageLoaded;
    bgRemovedImg.onerror = handleBgRemovedError;

    originalImg.src = originalSrc;
    // If bgRemovedSrc is not provided, use originalSrc directly as base
    bgRemovedImg.src = bgRemovedSrc || originalSrc;

    originalImageRef.current = originalImg;

    return () => {
      originalImg.onload = null;
      originalImg.onerror = null;
      bgRemovedImg.onload = null;
      bgRemovedImg.onerror = null;
    };
  }, [originalSrc, bgRemovedSrc]);

  const initialize = (origImg, bgRemImg) => {
    const maxDimension = 250;
    let width = origImg.naturalWidth;
    let height = origImg.naturalHeight;

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = (maxDimension / width) * height;
        width = maxDimension;
      } else {
        width = (maxDimension / height) * width;
        height = maxDimension;
      }
    }

    width = Math.round(width);
    height = Math.round(height);

    setCanvasSize({ width, height });

    // Setup main canvas
    const canvas = canvasRef.current;
    canvas.width = width;
    canvas.height = height;

    // Setup mask canvas (offscreen)
    const maskCanvas = maskCanvasRef.current;
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');

    // Draw background removed image to mask canvas to initialize the mask
    maskCtx.drawImage(bgRemImg, 0, 0, width, height);
    const imgData = maskCtx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Convert pixels to mask: white if not transparent, transparent if transparent
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha > 5) {
        data[i] = 255;     // R
        data[i + 1] = 255; // G
        data[i + 2] = 255; // B
        data[i + 3] = 255; // Alpha
      } else {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0;
      }
    }
    maskCtx.putImageData(imgData, 0, 0);

    // Save initial state to undo stack
    const initialMaskData = maskCtx.getImageData(0, 0, width, height);
    setUndoStack([initialMaskData]);

    setIsInitialized(true);
  };

  // Re-draw main canvas when state changes
  useEffect(() => {
    if (!isInitialized) return;
    draw();
  }, [isInitialized, zoom, panOffset, tool, canvasSize, brushSize]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const maskCanvas = maskCanvasRef.current;

    // Clear display
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Checkerboard pattern to represent transparency
    const checkerSize = 8;
    for (let y = 0; y < canvas.height; y += checkerSize) {
      for (let x = 0; x < canvas.width; x += checkerSize) {
        ctx.fillStyle = ((x / checkerSize + y / checkerSize) % 2 === 0) ? '#1a1c23' : '#11131c';
        ctx.fillRect(x, y, checkerSize, checkerSize);
      }
    }

    // 2. Render original image with mask applied
    const bufferCanvas = document.createElement('canvas');
    bufferCanvas.width = canvas.width;
    bufferCanvas.height = canvas.height;
    const bufCtx = bufferCanvas.getContext('2d');

    // Draw original image
    bufCtx.drawImage(originalImageRef.current, 0, 0, canvas.width, canvas.height);
    
    // Mask it using mask canvas
    bufCtx.globalCompositeOperation = 'destination-in';
    bufCtx.drawImage(maskCanvas, 0, 0);

    // Draw result onto main canvas
    ctx.drawImage(bufferCanvas, 0, 0);
  };

  // Push new state to undo stack
  const saveState = () => {
    const maskCtx = maskCanvasRef.current.getContext('2d');
    const state = maskCtx.getImageData(0, 0, canvasSize.width, canvasSize.height);
    
    const newUndoStack = [...undoStack, state];
    if (newUndoStack.length > 15) newUndoStack.shift(); // limit to 15 states
    setUndoStack(newUndoStack);
    setRedoStack([]); // Clear redo
  };

  const handleUndo = () => {
    if (undoStack.length <= 1) return;

    const newUndoStack = [...undoStack];
    const currentState = newUndoStack.pop();
    setRedoStack([...redoStack, currentState]);

    const prevState = newUndoStack[newUndoStack.length - 1];
    const maskCtx = maskCanvasRef.current.getContext('2d');
    maskCtx.putImageData(prevState, 0, 0);

    setUndoStack(newUndoStack);
    draw();
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;

    const newRedoStack = [...redoStack];
    const nextState = newRedoStack.pop();
    
    const maskCtx = maskCanvasRef.current.getContext('2d');
    maskCtx.putImageData(nextState, 0, 0);

    setUndoStack([...undoStack, nextState]);
    setRedoStack(newRedoStack);
    draw();
  };

  // Get coords relative to canvas scaling and panning
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    
    return { x, y };
  };

  // Magic Wand Tool implementation (Contiguous flood fill)
  const runMagicWand = (startX, startY) => {
    const canvas = canvasRef.current;
    const width = canvas.width;
    const height = canvas.height;
    
    const x = Math.round(startX);
    const y = Math.round(startY);
    
    if (x < 0 || x >= width || y < 0 || y >= height) return;

    // Draw original image on offscreen canvas to sample original colors
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(originalImageRef.current, 0, 0, width, height);
    
    const imgData = tempCtx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Load mask canvas details to modify them
    const maskCanvas = maskCanvasRef.current;
    const maskCtx = maskCanvas.getContext('2d');
    const maskImgData = maskCtx.getImageData(0, 0, width, height);
    const maskData = maskImgData.data;

    // Target clicked color values
    const targetIdx = (y * width + x) * 4;
    const targetR = data[targetIdx];
    const targetG = data[targetIdx + 1];
    const targetB = data[targetIdx + 2];

    // Mapped tolerance threshold (Euclidean distance threshold)
    const normalizedTolerance = tolerance * 1.8;

    // Stack based flood fill queues
    const visited = new Uint8Array(width * height);
    const queue = [x, y];
    visited[y * width + x] = 1;

    const checkColorMatch = (pxIdx) => {
      const r = data[pxIdx];
      const g = data[pxIdx + 1];
      const b = data[pxIdx + 2];
      const distance = Math.sqrt((r - targetR) ** 2 + (g - targetG) ** 2 + (b - targetB) ** 2);
      return distance <= normalizedTolerance;
    };

    while (queue.length > 0) {
      const currY = queue.pop();
      const currX = queue.pop();

      const idx = (currY * width + currX) * 4;
      // Erase in mask
      maskData[idx] = 0;
      maskData[idx + 1] = 0;
      maskData[idx + 2] = 0;
      maskData[idx + 3] = 0; // Alpha set to transparent

      // Look at 4 neighbors
      const neighbors = [
        [currX, currY + 1],
        [currX, currY - 1],
        [currX + 1, currY],
        [currX - 1, currY]
      ];

      for (let i = 0; i < neighbors.length; i++) {
        const nx = neighbors[i][0];
        const ny = neighbors[i][1];

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const vIdx = ny * width + nx;
          if (!visited[vIdx]) {
            visited[vIdx] = 1;
            const pxIdx = vIdx * 4;
            if (checkColorMatch(pxIdx)) {
              queue.push(nx, ny);
            }
          }
        }
      }
    }

    // Save changes
    maskCtx.putImageData(maskImgData, 0, 0);
    saveState();
    draw();
  };

  const handleStart = (e) => {
    const coords = getCanvasCoords(e);
    if (tool === 'pan') {
      setIsPanning(true);
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      setDragStart({ x: clientX - panOffset.x, y: clientY - panOffset.y });
    } else if (tool === 'magic-wand') {
      runMagicWand(coords.x, coords.y);
    } else {
      setIsDrawing(true);
      lastCoordsRef.current = coords;
      drawBrushDot(coords.x, coords.y);
    }
  };

  const handleMoveCoords = (e) => {
    if (isPanning && tool === 'pan') {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      setPanOffset({
        x: clientX - dragStart.x,
        y: clientY - dragStart.y
      });
    } else if (isDrawing && lastCoordsRef.current) {
      const coords = getCanvasCoords(e);
      drawBrushLine(lastCoordsRef.current.x, lastCoordsRef.current.y, coords.x, coords.y);
      lastCoordsRef.current = coords;
    }
  };

  const handleEnd = () => {
    if (isDrawing) {
      setIsDrawing(false);
      lastCoordsRef.current = null;
      saveState();
      draw();
    }
    setIsPanning(false);
  };

  const drawBrushDot = (x, y) => {
    const maskCanvas = maskCanvasRef.current;
    const maskCtx = maskCanvas.getContext('2d');

    maskCtx.save();
    maskCtx.beginPath();
    
    if (tool === 'erase') {
      maskCtx.globalCompositeOperation = 'destination-out';
      maskCtx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      maskCtx.globalCompositeOperation = 'source-over';
      maskCtx.fillStyle = 'rgba(255,255,255,1)';
    }

    maskCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    maskCtx.fill();
    maskCtx.restore();
    draw();
  };

  const drawBrushLine = (x1, y1, x2, y2) => {
    const maskCanvas = maskCanvasRef.current;
    const maskCtx = maskCanvas.getContext('2d');

    maskCtx.save();
    maskCtx.beginPath();
    
    if (tool === 'erase') {
      maskCtx.globalCompositeOperation = 'destination-out';
      maskCtx.strokeStyle = 'rgba(0,0,0,1)';
      maskCtx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      maskCtx.globalCompositeOperation = 'source-over';
      maskCtx.strokeStyle = 'rgba(255,255,255,1)';
      maskCtx.fillStyle = 'rgba(255,255,255,1)';
    }

    maskCtx.lineWidth = brushSize;
    maskCtx.lineCap = 'round';
    maskCtx.lineJoin = 'round';

    maskCtx.moveTo(x1, y1);
    maskCtx.lineTo(x2, y2);
    maskCtx.stroke();

    maskCtx.restore();
    draw();
  };

  const handleSaveResult = () => {
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = canvasSize.width;
    finalCanvas.height = canvasSize.height;
    const finalCtx = finalCanvas.getContext('2d');

    finalCtx.drawImage(originalImageRef.current, 0, 0, canvasSize.width, canvasSize.height);
    finalCtx.globalCompositeOperation = 'destination-in';
    finalCtx.drawImage(maskCanvasRef.current, 0, 0);

    const finalDataUrl = finalCanvas.toDataURL('image/png');
    onSave(finalDataUrl);
  };

  const [isAiRunning, setIsAiRunning] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [aiMessage, setAiMessage] = useState('Initializing AI Background Removal...');
  const [aiError, setAiError] = useState(null);

  const applyBgRemovedImage = (bgRemImg) => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const maskCtx = maskCanvas.getContext('2d');
    const width = canvasSize.width;
    const height = canvasSize.height;

    // Clear and draw new bg removed image
    maskCtx.clearRect(0, 0, width, height);
    maskCtx.drawImage(bgRemImg, 0, 0, width, height);
    
    const imgData = maskCtx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Convert pixels to mask: white if not transparent, transparent if transparent
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha > 5) {
        data[i] = 255;     // R
        data[i + 1] = 255; // G
        data[i + 2] = 255; // B
        data[i + 3] = 255; // Alpha
      } else {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0;
      }
    }
    maskCtx.putImageData(imgData, 0, 0);

    // Save to undo stack
    const newMaskData = maskCtx.getImageData(0, 0, width, height);
    setUndoStack([...undoStack, newMaskData]);
    setRedoStack([]);
    
    draw();
  };

  const handleRunAiBgRemoval = async () => {
    let isSubscribed = true;
    let progressInterval = null;

    try {
      setIsAiRunning(true);
      setAiProgress(15);
      setAiMessage('Uploading photo to secure AI server...');
      setAiError(null);

      // Simulated progress interval
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

      // Convert originalSrc (which is cropped image) to blob
      const response = await fetch(originalSrc);
      const blob = await response.blob();
      const file = new File([blob], 'passport-crop.jpg', { type: 'image/jpeg' });

      const formData = new FormData();
      formData.append('file', file);

      // Get API keys from Zustand store
      const state = useAppStore.getState();
      const removeBgApiKey = state.removeBgApiKey;
      const hfToken = state.hfToken;

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
          // Load image and apply
          const bgRemImg = new Image();
          bgRemImg.crossOrigin = 'anonymous';
          bgRemImg.onload = () => {
            applyBgRemovedImage(bgRemImg);
            setIsAiRunning(false);
          };
          bgRemImg.onerror = () => {
            setIsAiRunning(false);
            setAiError('Failed to load returned transparent image');
          };
          bgRemImg.src = resultData.url;
        }
        return;
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

        const resultBlob = await removeBackground(originalSrc, {
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
        const bgRemImg = new Image();
        bgRemImg.onload = () => {
          applyBgRemovedImage(bgRemImg);
          setIsAiRunning(false);
        };
        bgRemImg.src = resultUrl;
      } catch (fallbackErr) {
        console.error('Local background removal also failed:', fallbackErr);
        if (isSubscribed) {
          setAiError('Both cloud AI and local browser AI engines failed to remove background.');
          setIsAiRunning(false);
        }
      }
    }
  };

  const handleReset = () => {
    if (undoStack.length > 0) {
      const maskCtx = maskCanvasRef.current.getContext('2d');
      maskCtx.putImageData(undoStack[0], 0, 0);
      setUndoStack([undoStack[0]]);
      setRedoStack([]);
      draw();
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Top Workspace Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 bg-white/3 p-2 sm:p-4 rounded-xl sm:rounded-2xl border border-white/5 w-full">
        {/* Tool selectors */}
        <div className="flex flex-wrap gap-1 sm:gap-1.5 bg-black/40 p-1 sm:p-1.5 rounded-xl border border-white/5 w-full md:w-auto">
          <button 
            type="button"
            onClick={handleRunAiBgRemoval}
            disabled={isAiRunning}
            className={`flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg text-[10px] sm:text-xs font-semibold cursor-pointer transition-all disabled:opacity-50
              bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300`}
            title="Automatically remove background using AI"
          >
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
            Automatic BG Remove
          </button>
          
          <button 
            onClick={() => setTool('erase')}
            className={`flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 sm:px-3.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-semibold cursor-pointer transition-all
              ${tool === 'erase' ? 'bg-red-500/15 border border-red-500/30 text-red-400' : 'text-gray-400 hover:text-white'}`}
          >
            <Eraser className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Erase Brush
          </button>
          
          <button 
            onClick={() => setTool('restore')}
            className={`flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 sm:px-3.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-semibold cursor-pointer transition-all
              ${tool === 'restore' ? 'bg-green-500/15 border border-green-500/30 text-green-400' : 'text-gray-400 hover:text-white'}`}
          >
            <Paintbrush className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Restore Brush
          </button>

          <button 
            onClick={() => setTool('magic-wand')}
            className={`flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 sm:px-3.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-semibold cursor-pointer transition-all
              ${tool === 'magic-wand' ? 'bg-purple-500/15 border border-purple-500/30 text-purple-400' : 'text-gray-400 hover:text-white'}`}
          >
            <Wand2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Magic Wand
          </button>

          <button 
            onClick={() => setTool('pan')}
            className={`flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 sm:px-3.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-semibold cursor-pointer transition-all
              ${tool === 'pan' ? 'bg-blue-500/15 border border-blue-500/30 text-blue-400' : 'text-gray-400 hover:text-white'}`}
          >
            <Move className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Pan / Zoom Drag
          </button>
        </div>

        {/* Undo Redo resets */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button 
            onClick={handleUndo} 
            disabled={undoStack.length <= 1}
            className="p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-white/5 border border-white/5 text-gray-300 hover:text-white disabled:opacity-35 cursor-pointer"
            title="Undo"
          >
            <Undo2 className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" />
          </button>
          
          <button 
            onClick={handleRedo} 
            disabled={redoStack.length === 0}
            className="p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-white/5 border border-white/5 text-gray-300 hover:text-white disabled:opacity-35 cursor-pointer"
            title="Redo"
          >
            <Redo2 className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" />
          </button>

          <button 
            onClick={handleReset} 
            className="p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:text-red-300 cursor-pointer"
            title="Reset changes"
          >
            <RotateCcw className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 sm:gap-2 bg-black/40 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl border border-white/5">
          <button 
            onClick={() => setZoom(Math.max(1, zoom - 0.25))}
            className="p-1 rounded bg-white/5 text-gray-400 hover:text-white cursor-pointer"
          >
            <ZoomOut className="w-3 h-3 sm:w-4 sm:h-4" />
          </button>
          <span className="text-[10px] sm:text-xs font-bold text-white min-w-[30px] sm:min-w-[35px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button 
            onClick={() => setZoom(Math.min(4, zoom + 0.25))}
            className="p-1 rounded bg-white/5 text-gray-400 hover:text-white cursor-pointer"
          >
            <ZoomIn className="w-3 h-3 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>

      {/* Editor Canvas Box */}
      <div className="flex-1 flex items-center justify-center min-h-[350px] relative overflow-hidden bg-black/50 border border-white/5 rounded-2xl p-4">
        {isAiRunning && (
          <div className="absolute inset-0 z-20 bg-black/85 flex flex-col items-center justify-center p-8 text-center backdrop-blur-sm">
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center mb-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <RotateCcw className="w-6 h-6 text-blue-400 animate-spin" />
              </div>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Removing Background</h3>
            <p className="text-xs text-gray-400 mb-4">{aiMessage}</p>
            <div className="space-y-1.5 w-full max-w-[280px]">
              <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${aiProgress}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-500 font-bold tracking-widest">{aiProgress}% COMPLETED</span>
            </div>
          </div>
        )}

        {aiError && (
          <div className="absolute bottom-4 right-4 z-20 bg-red-950/95 border border-red-500/30 text-white rounded-xl p-4 max-w-sm shadow-2xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <h4 className="text-xs font-bold text-red-300">AI Removal Failed</h4>
              <p className="text-[11px] text-gray-300 leading-normal">{aiError}</p>
              <button 
                type="button"
                onClick={() => setAiError(null)}
                className="text-[10px] text-red-400 hover:text-red-300 font-bold underline cursor-pointer mt-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Tool Adjustments Panel */}
        <div className="absolute bottom-4 left-4 z-10 bg-black/75 px-4 py-3 rounded-xl border border-white/10 text-xs text-gray-400 w-48 space-y-2">
          {tool === 'magic-wand' ? (
            <div className="space-y-1.5">
              <div className="flex justify-between font-semibold">
                <span>Color Tolerance</span>
                <span>{tolerance}</span>
              </div>
              <input 
                type="range"
                min={1}
                max={100}
                value={tolerance}
                onChange={(e) => setTolerance(parseInt(e.target.value))}
                className="w-full accent-purple-500 h-1 bg-white/15 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-[9px] text-gray-500 leading-none block">
                Click color on canvas to auto-delete matches.
              </span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex justify-between font-semibold">
                <span>Brush Size</span>
                <span>{brushSize}px</span>
              </div>
              <input 
                type="range"
                min={4}
                max={60}
                value={brushSize}
                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                className="w-full accent-primary h-1 bg-white/15 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* Outer draggable workspace container */}
        <div 
          ref={containerRef}
          className={`overflow-hidden w-full h-full flex items-center justify-center p-10
            ${tool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
          onMouseDown={handleStart}
          onMouseMove={handleMoveCoords}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMoveCoords}
          onTouchEnd={handleEnd}
        >
          {/* Canvas wrap with zoom/pan transforms */}
          <div 
            style={{ 
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: isPanning ? 'none' : 'transform 0.1s ease-out',
              maxWidth: '100%',
              maxHeight: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            className="relative shadow-2xl"
          >
            <canvas 
              ref={canvasRef} 
              style={{ maxHeight: '100%', maxWidth: '100%', width: 'auto', height: 'auto', objectFit: 'contain' }}
              className="block rounded-lg touch-none shadow-lg border border-white/5"
            />
            {/* Hidden offscreen mask canvas */}
            <canvas ref={maskCanvasRef} className="hidden" />
          </div>
        </div>
      </div>

      {/* Footer Save & Cancel Bar */}
      <div className="flex justify-end gap-3 border-t border-white/5 pt-4">
        <button
          onClick={onCancel}
          className="px-5 py-2.5 rounded-xl bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors text-sm font-semibold cursor-pointer"
        >
          Back to Crop
        </button>
        <button
          onClick={handleSaveResult}
          className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold cursor-pointer flex items-center gap-2"
        >
          <Save className="w-4.5 h-4.5" />
          Apply Fine-Tuning
        </button>
      </div>
    </div>
  );
}
