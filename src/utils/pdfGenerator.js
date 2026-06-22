import { jsPDF } from 'jspdf';

/**
 * Loads an image and processes it with brightness and contrast on a temporary canvas.
 * @param {string} src - source image url
 * @param {number} brightness - brightness percentage (default 100)
 * @param {number} contrast - contrast percentage (default 100)
 * @returns {Promise<string>} resolved processed dataURL or original source
 */
const getProcessedImage = (src, brightness = 100, contrast = 100) => {
  return new Promise((resolve) => {
    if ((brightness === 100 || brightness === undefined) && (contrast === 100 || contrast === undefined)) {
      resolve(src);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(src);
        return;
      }
      ctx.filter = `brightness(${brightness !== undefined ? brightness : 100}%) contrast(${contrast !== undefined ? contrast : 100}%)`;
      ctx.drawImage(img, 0, 0);
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      } catch (err) {
        console.warn("Canvas toDataURL failed", err);
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
};

/**
 * Generates an A4 PDF from a list of images.
 * @param {Array} images - Array of image objects with croppedUrl (or url)
 * @param {string} fileName - Destination filename
 * @param {string} layoutMode - 'single' | 'grid-2' | 'grid-4'
 * @param {string} gridDirection - 'vertical' (top/bottom) or 'horizontal' (side-by-side)
 */
export async function generateA4Pdf(images, fileName = 'document.pdf', layoutMode = 'single', gridDirection = 'vertical', globalBrightness = 100, globalContrast = 100, printOnly = false) {
  if (!images || images.length === 0) return;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const a4Width = 210; // mm
  const a4Height = 297; // mm
  const margin = 10; // mm

  const cleanFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;

  // Group images by pageIndex
  const pagesMap = {};
  images.forEach((img) => {
    const pIdx = img.pageIndex !== undefined ? img.pageIndex : 0;
    if (!pagesMap[pIdx]) {
      pagesMap[pIdx] = [];
    }
    pagesMap[pIdx].push(img);
  });

  const sortedPageKeys = Object.keys(pagesMap).sort((a, b) => Number(a) - Number(b));

  for (let p = 0; p < sortedPageKeys.length; p++) {
    if (p > 0) {
      pdf.addPage();
    }
    const pageImages = pagesMap[sortedPageKeys[p]];
    for (let i = 0; i < pageImages.length; i++) {
      const img = pageImages[i];
      const imgSrc = img.croppedUrl || img.url;

      // Process image to apply brightness & contrast globally
      const processedSrc = await getProcessedImage(imgSrc, globalBrightness, globalContrast);

      // Use custom coordinates (percentages) relative to the entire A4 page (matching the HTML preview exactly!)
      const x = ((img.customX !== undefined ? img.customX : 5) / 100) * a4Width;
      const y = ((img.customY !== undefined ? img.customY : 5) / 100) * a4Height;
      const w = ((img.customWidth !== undefined ? img.customWidth : 40) / 100) * a4Width;
      const h = ((img.customHeight !== undefined ? img.customHeight : 30) / 100) * a4Height;

      pdf.addImage(processedSrc, 'JPEG', x, y, w, h, undefined, 'FAST');
    }
  }

  // Save or print the generated document
  if (printOnly) {
    pdf.autoPrint();
    const blobUrl = pdf.output('bloburl');
    window.open(blobUrl, '_blank');
  } else {
    pdf.save(cleanFileName);
  }
}
