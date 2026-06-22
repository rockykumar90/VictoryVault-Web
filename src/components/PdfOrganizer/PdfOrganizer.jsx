import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { PDFDocument } from 'pdf-lib';
import { 
  ArrowLeft, 
  UploadCloud, 
  Trash2, 
  FileDown, 
  Printer, 
  RefreshCw,
  Plus,
  ArrowUp,
  ArrowDown,
  FileText,
  Split,
  Combine,
  CheckCircle,
  HelpCircle
} from 'lucide-react';

const formatSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default function PdfOrganizer() {
  const setMode = useAppStore((state) => state.setMode);

  // Active Tab: 'merge' | 'split'
  const [activeTab, setActiveTab] = useState('merge');
  
  // Processing States
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultBytes, setResultBytes] = useState(null);
  const [resultFileName, setResultFileName] = useState('');
  const [resultPagesCount, setResultPagesCount] = useState(0);

  // ----------------------------------------------------
  // MERGE PDF STATES & FUNCTIONS
  // ----------------------------------------------------
  const [mergeFiles, setMergeFiles] = useState([]); // Array of { id, file, name, size, pagesCount }
  const [isDragActiveMerge, setIsDragActiveMerge] = useState(false);
  const mergeFileInputRef = useRef(null);

  const processMergeFiles = async (files) => {
    const newFiles = [];
    for (const file of Array.from(files)) {
      if (file.type === 'application/pdf') {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await PDFDocument.load(arrayBuffer);
          const count = pdf.getPageCount();
          newFiles.push({
            id: crypto.randomUUID(),
            file,
            name: file.name,
            size: file.size,
            pagesCount: count
          });
        } catch (err) {
          console.error('Failed to load PDF file details', err);
        }
      }
    }
    if (newFiles.length > 0) {
      setMergeFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handleMergeFileSelect = (e) => {
    if (e.target.files) {
      processMergeFiles(e.target.files);
    }
  };

  const handleMergeDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActiveMerge(true);
    } else if (e.type === "dragleave") {
      setIsDragActiveMerge(false);
    }
  };

  const handleMergeDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActiveMerge(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processMergeFiles(e.dataTransfer.files);
    }
  };

  const moveFileOrder = (index, direction) => {
    const updated = [...mergeFiles];
    const targetIndex = index + direction;
    if (targetIndex >= 0 && targetIndex < updated.length) {
      const temp = updated[index];
      updated[index] = updated[targetIndex];
      updated[targetIndex] = temp;
      setMergeFiles(updated);
    }
  };

  const removeMergeFile = (id) => {
    setMergeFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleExecuteMerge = async () => {
    if (mergeFiles.length < 2) return;
    setIsProcessing(true);
    setResultBytes(null);
    try {
      const mergedPdf = await PDFDocument.create();
      let totalPages = 0;
      for (const fileItem of mergeFiles) {
        const arrayBuffer = await fileItem.file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
        totalPages += fileItem.pagesCount;
      }
      const bytes = await mergedPdf.save();
      setResultBytes(bytes);
      setResultFileName('merged-document.pdf');
      setResultPagesCount(totalPages);
    } catch (err) {
      console.error('Failed to merge PDFs', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // ----------------------------------------------------
  // SPLIT PDF STATES & FUNCTIONS
  // ----------------------------------------------------
  const [splitFile, setSplitFile] = useState(null); // { file, name, size, pagesCount }
  const [selectedPages, setSelectedPages] = useState([]); // Array of booleans representing page selections
  const [isDragActiveSplit, setIsDragActiveSplit] = useState(false);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const splitFileInputRef = useRef(null);

  const processSplitFile = async (file) => {
    if (file && file.type === 'application/pdf') {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const count = pdf.getPageCount();
        setSplitFile({
          file,
          name: file.name,
          size: file.size,
          pagesCount: count
        });
        setSelectedPages(new Array(count).fill(false));
        setRangeStart('1');
        setRangeEnd(count.toString());
        setResultBytes(null);
      } catch (err) {
        console.error('Failed to load PDF file details', err);
      }
    }
  };

  const handleSplitFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      processSplitFile(e.target.files[0]);
    }
  };

  const handleSplitDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActiveSplit(true);
    } else if (e.type === "dragleave") {
      setIsDragActiveSplit(false);
    }
  };

  const handleSplitDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActiveSplit(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSplitFile(e.dataTransfer.files[0]);
    }
  };

  const togglePageSelection = (idx) => {
    setSelectedPages((prev) => {
      const next = [...prev];
      next[idx] = !next[idx];
      return next;
    });
  };

  const applyRangeSelection = () => {
    if (!splitFile) return;
    const start = Math.max(1, parseInt(rangeStart) || 1);
    const end = Math.min(splitFile.pagesCount, parseInt(rangeEnd) || splitFile.pagesCount);
    
    setSelectedPages((prev) => {
      const next = new Array(prev.length).fill(false);
      for (let i = start - 1; i < end; i++) {
        next[i] = true;
      }
      return next;
    });
  };

  const selectAllPages = () => {
    if (!splitFile) return;
    setSelectedPages(new Array(splitFile.pagesCount).fill(true));
  };

  const clearPageSelection = () => {
    if (!splitFile) return;
    setSelectedPages(new Array(splitFile.pagesCount).fill(false));
  };

  const handleExecuteSplit = async () => {
    if (!splitFile) return;
    const selectedIndices = selectedPages
      .map((selected, idx) => (selected ? idx : null))
      .filter((idx) => idx !== null);

    if (selectedIndices.length === 0) return;

    setIsProcessing(true);
    setResultBytes(null);
    try {
      const arrayBuffer = await splitFile.file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      const splitDoc = await PDFDocument.create();
      
      const copiedPages = await splitDoc.copyPages(pdf, selectedIndices);
      copiedPages.forEach((page) => splitDoc.addPage(page));
      
      const bytes = await splitDoc.save();
      setResultBytes(bytes);
      
      const baseName = splitFile.name.substring(0, splitFile.name.lastIndexOf('.')) || splitFile.name;
      setResultFileName(`${baseName}-split.pdf`);
      setResultPagesCount(selectedIndices.length);
    } catch (err) {
      console.error('Failed to split PDF', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // ----------------------------------------------------
  // GENERAL FUNCTIONS (DOWNLOAD, PRINT & RESET)
  // ----------------------------------------------------
  const handleDownloadResult = () => {
    if (!resultBytes) return;
    const blob = new Blob([resultBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = resultFileName || 'extracted-document.pdf';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintResult = () => {
    if (!resultBytes) return;
    const blob = new Blob([resultBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  const handleResetWorkspace = () => {
    setResultBytes(null);
    setResultFileName('');
    setResultPagesCount(0);
    if (activeTab === 'split') {
      setSplitFile(null);
      setSelectedPages([]);
      setRangeStart('');
      setRangeEnd('');
    } else {
      setMergeFiles([]);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8 border-b border-white/5 pb-6">
        <button 
          onClick={() => setMode('dashboard')}
          className="p-2 rounded-xl bg-white/5 border border-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white flex items-center gap-2">
            <Combine className="w-6 h-6 text-primary" />
            PDF Merger & Splitter
          </h1>
          <p className="text-sm text-gray-400 font-medium">Re-order and merge multiple PDFs together, or extract custom page groups client-side</p>
        </div>
      </div>

      {/* Tabs */}
      {!resultBytes && (
        <div className="flex gap-2 mb-8 bg-black/35 p-1 rounded-xl border border-white/5 w-fit">
          <button
            onClick={() => {
              setActiveTab('merge');
              handleResetWorkspace();
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all
              ${activeTab === 'merge' 
                ? 'bg-primary/15 border border-primary/20 text-white shadow-md shadow-primary/10' 
                : 'text-gray-400 hover:text-white border border-transparent'}`}
          >
            <Combine className="w-4 h-4" />
            Merge PDFs
          </button>
          <button
            onClick={() => {
              setActiveTab('split');
              handleResetWorkspace();
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all
              ${activeTab === 'split' 
                ? 'bg-primary/15 border border-primary/20 text-white shadow-md shadow-primary/10' 
                : 'text-gray-400 hover:text-white border border-transparent'}`}
          >
            <Split className="w-4 h-4" />
            Split PDF
          </button>
        </div>
      )}

      {/* SUCCESS SCREEN: RESULT DISPLAY */}
      {resultBytes && (
        <div className="max-w-2xl mx-auto glass-panel rounded-2xl border border-white/5 p-8 space-y-6 animate-fade-in">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
              <CheckCircle className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">PDF Compiled Successfully</h3>
              <p className="text-xs text-gray-400">All processing completed entirely in-browser.</p>
            </div>
          </div>

          {/* Details Card */}
          <div className="grid sm:grid-cols-2 gap-4 py-4 border-t border-b border-white/5">
            <div className="p-4 bg-white/2 border border-white/5 rounded-xl">
              <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold block mb-1">Generated File</span>
              <strong className="text-sm text-gray-200 truncate block">{resultFileName}</strong>
            </div>
            <div className="p-4 bg-white/2 border border-white/5 rounded-xl">
              <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold block mb-1">Details</span>
              <strong className="text-sm text-white font-extrabold block">
                {resultPagesCount} {resultPagesCount === 1 ? 'Page' : 'Pages'} • {formatSize(resultBytes.length)}
              </strong>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button 
              onClick={handleDownloadResult}
              className="btn-primary flex-1 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer text-sm shadow-md bg-gradient-to-r from-primary to-purple-600 shadow-primary/20"
            >
              <FileDown className="w-5 h-5" />
              Download PDF
            </button>

            <button 
              onClick={handlePrintResult}
              className="flex-1 py-3.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-white font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors text-sm"
            >
              <Printer className="w-5 h-5 text-gray-400" />
              Print Result
            </button>
          </div>

          <div className="pt-2 text-center">
            <button
              onClick={handleResetWorkspace}
              className="text-xs text-gray-400 hover:text-white underline cursor-pointer"
            >
              Organize another PDF
            </button>
          </div>
        </div>
      )}

      {/* MERGE TAB VIEW */}
      {activeTab === 'merge' && !resultBytes && (
        <div className="space-y-6">
          {mergeFiles.length === 0 ? (
            /* Upload Dropzone */
            <div 
              onDragEnter={handleMergeDrag}
              onDragOver={handleMergeDrag}
              onDragLeave={handleMergeDrag}
              onDrop={handleMergeDrop}
              onClick={() => mergeFileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center min-h-[40vh] rounded-2xl border-2 border-dashed transition-all cursor-pointer p-8 text-center relative group
                ${isDragActiveMerge 
                  ? 'border-primary bg-primary/10 shadow-[0_0_30px_rgba(170,59,255,0.2)]' 
                  : 'border-white/10 bg-white/2 hover:border-primary/50 hover:bg-white/3'}`}
            >
              <input 
                type="file" 
                ref={mergeFileInputRef}
                onChange={handleMergeFileSelect}
                className="hidden" 
                multiple
                accept="application/pdf"
              />
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center mb-6 shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform duration-300">
                <UploadCloud className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Upload PDFs to Merge</h3>
              <p className="text-sm text-gray-400 max-w-sm leading-relaxed mb-6">
                Drag and drop your PDF files here, or click to browse. You can re-arrange them in order before merging.
              </p>
              <button className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold cursor-pointer">
                Select PDF Files
              </button>
            </div>
          ) : (
            /* Selected Files Workspace */
            <div className="grid lg:grid-cols-3 gap-8 items-start">
              {/* Files list */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex justify-between items-center px-2">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Upload List ({mergeFiles.length} files)</h3>
                  <button
                    onClick={() => mergeFileInputRef.current?.click()}
                    className="text-xs text-primary hover:text-purple-400 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Add More
                  </button>
                  <input 
                    type="file" 
                    ref={mergeFileInputRef}
                    onChange={handleMergeFileSelect}
                    className="hidden" 
                    multiple
                    accept="application/pdf"
                  />
                </div>

                <div className="space-y-3">
                  {mergeFiles.map((fileItem, idx) => (
                    <div key={fileItem.id} className="glass-panel rounded-xl border border-white/5 p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5 text-red-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate max-w-[250px] sm:max-w-[320px]">{fileItem.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {fileItem.pagesCount} {fileItem.pagesCount === 1 ? 'page' : 'pages'} • {formatSize(fileItem.size)}
                          </p>
                        </div>
                      </div>

                      {/* File actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => moveFileOrder(idx, -1)}
                          disabled={idx === 0}
                          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white disabled:opacity-20 cursor-pointer transition-colors"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveFileOrder(idx, 1)}
                          disabled={idx === mergeFiles.length - 1}
                          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white disabled:opacity-20 cursor-pointer transition-colors"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => removeMergeFile(fileItem.id)}
                          className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer transition-colors"
                          title="Remove File"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sidebar Action Block */}
              <div className="lg:col-span-1 glass-panel rounded-2xl border border-white/5 p-6 space-y-6">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <Combine className="w-5 h-5 text-primary" />
                  Merge Summary
                </h3>

                <div className="space-y-3 text-xs text-gray-400">
                  <div className="flex justify-between">
                    <span>Total Files</span>
                    <span className="text-white font-bold">{mergeFiles.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Combined Pages</span>
                    <span className="text-white font-bold">
                      {mergeFiles.reduce((acc, f) => acc + f.pagesCount, 0)} pages
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Combined Size</span>
                    <span className="text-white font-bold">
                      {formatSize(mergeFiles.reduce((acc, f) => acc + f.size, 0))}
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 space-y-3">
                  <button
                    onClick={handleExecuteMerge}
                    disabled={isProcessing || mergeFiles.length < 2}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-purple-600 text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20 disabled:opacity-40"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Merging...
                      </>
                    ) : (
                      <>
                        <Combine className="w-4 h-4" />
                        Merge Files
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleResetWorkspace}
                    className="w-full py-2.5 rounded-xl border border-white/5 bg-white/2 hover:bg-white/5 text-xs text-gray-400 hover:text-white font-semibold cursor-pointer transition-colors"
                  >
                    Reset List
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SPLIT TAB VIEW */}
      {activeTab === 'split' && !resultBytes && (
        <div className="space-y-6">
          {!splitFile ? (
            /* Upload Dropzone (One file only) */
            <div 
              onDragEnter={handleSplitDrag}
              onDragOver={handleSplitDrag}
              onDragLeave={handleSplitDrag}
              onDrop={handleSplitDrop}
              onClick={() => splitFileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center min-h-[40vh] rounded-2xl border-2 border-dashed transition-all cursor-pointer p-8 text-center relative group
                ${isDragActiveSplit 
                  ? 'border-primary bg-primary/10 shadow-[0_0_30px_rgba(170,59,255,0.2)]' 
                  : 'border-white/10 bg-white/2 hover:border-primary/50 hover:bg-white/3'}`}
            >
              <input 
                type="file" 
                ref={splitFileInputRef}
                onChange={handleSplitFileSelect}
                className="hidden" 
                accept="application/pdf"
              />
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center mb-6 shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform duration-300">
                <Split className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Upload PDF to Split</h3>
              <p className="text-sm text-gray-400 max-w-sm leading-relaxed mb-6">
                Select a single PDF document. You will be able to select specific pages or page ranges to extract into a new PDF.
              </p>
              <button className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold cursor-pointer">
                Select PDF File
              </button>
            </div>
          ) : (
            /* Split Workspace */
            <div className="grid lg:grid-cols-3 gap-8 items-start">
              {/* Interactive Page Selector Grid */}
              <div className="lg:col-span-2 space-y-4">
                <div className="glass-panel rounded-2xl border border-white/5 p-6 flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-white/5 pb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white">Select Pages to Extract</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Click individual pages to include them in the split PDF.</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={selectAllPages}
                        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 text-xs text-gray-300 hover:text-white cursor-pointer transition-colors"
                      >
                        Select All
                      </button>
                      <button
                        onClick={clearPageSelection}
                        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 text-xs text-gray-300 hover:text-white cursor-pointer transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Grid layout of page items */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-[350px] overflow-auto pr-2">
                    {selectedPages.map((selected, idx) => (
                      <div
                        key={idx}
                        onClick={() => togglePageSelection(idx)}
                        className={`aspect-[3/4] rounded-xl border flex flex-col items-center justify-center cursor-pointer select-none transition-all relative
                          ${selected 
                            ? 'bg-primary/10 border-primary shadow-lg shadow-primary/5 text-white ring-2 ring-primary/40' 
                            : 'bg-white/2 border-white/5 text-gray-400 hover:border-white/20 hover:text-white'}`}
                      >
                        <div className={`absolute top-2 right-2 w-4 h-4 rounded-full border flex items-center justify-center transition-colors
                          ${selected ? 'bg-primary border-primary text-white' : 'border-white/20 text-transparent'}`}
                        >
                          <span className="text-[9px] font-black">✓</span>
                        </div>
                        <span className="text-sm font-extrabold">{idx + 1}</span>
                        <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mt-1">Page</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sidebar controls for Range / Extraction */}
              <div className="lg:col-span-1 space-y-6">
                {/* Active File Summary */}
                <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                      <FileText className="w-4.5 h-4.5 text-red-400" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-white truncate" title={splitFile.name}>{splitFile.name}</h4>
                      <p className="text-xs text-gray-400">{formatSize(splitFile.size)} • {splitFile.pagesCount} total pages</p>
                    </div>
                  </div>
                </div>

                {/* Range Selector Form */}
                <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-4">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Range Quick-Select</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-500 font-bold uppercase block">Start page</label>
                      <input 
                        type="number" 
                        min={1}
                        max={splitFile.pagesCount}
                        value={rangeStart}
                        onChange={(e) => setRangeStart(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-primary"
                        placeholder="1"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-500 font-bold uppercase block">End page</label>
                      <input 
                        type="number" 
                        min={1}
                        max={splitFile.pagesCount}
                        value={rangeEnd}
                        onChange={(e) => setRangeEnd(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-primary"
                        placeholder={splitFile.pagesCount.toString()}
                      />
                    </div>
                  </div>
                  <button
                    onClick={applyRangeSelection}
                    className="w-full py-2.5 rounded-xl border border-white/5 bg-white/2 hover:bg-white/5 text-xs text-white font-semibold cursor-pointer transition-colors"
                  >
                    Select Range
                  </button>
                </div>

                {/* Split execute triggers */}
                <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-4">
                  <div className="space-y-2 text-xs text-gray-400">
                    <div className="flex justify-between">
                      <span>Selected Pages</span>
                      <span className="text-white font-extrabold">
                        {selectedPages.filter(Boolean).length} of {splitFile.pagesCount}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/5 space-y-3">
                    <button
                      onClick={handleExecuteSplit}
                      disabled={isProcessing || selectedPages.filter(Boolean).length === 0}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-purple-600 text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20 disabled:opacity-40"
                    >
                      {isProcessing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Splitting...
                        </>
                      ) : (
                        <>
                          <Split className="w-4 h-4" />
                          Split PDF
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleResetWorkspace}
                      className="w-full py-2.5 rounded-xl border border-white/5 bg-white/2 hover:bg-white/5 text-xs text-gray-400 hover:text-white font-semibold cursor-pointer transition-colors"
                    >
                      Change PDF
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
