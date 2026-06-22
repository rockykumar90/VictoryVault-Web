/**
 * Solves perspective transformation coefficients mapping a unit square to a quadrilateral.
 * @param {Object} p0 - TL {u, v}
 * @param {Object} p1 - TR {u, v}
 * @param {Object} p2 - BR {u, v}
 * @param {Object} p3 - BL {u, v}
 * @returns {Array} 8 coefficients [a0, a1, a2, a3, a4, a5, a6, a7]
 */
function getSquareToQuadCoefficients(p0, p1, p2, p3) {
  const dx1 = p1.u - p2.u;
  const dx2 = p3.u - p2.u;
  const sx = p0.u - p1.u + p2.u - p3.u;
  const dy1 = p1.v - p2.v;
  const dy2 = p3.v - p2.v;
  const sy = p0.v - p1.v + p2.v - p3.v;

  // If sx and sy are zero, it is an affine transformation
  if (Math.abs(sx) < 1e-10 && Math.abs(sy) < 1e-10) {
    return [
      p1.u - p0.u, p3.u - p0.u, p0.u,
      p1.v - p0.v, p3.v - p0.v, p0.v,
      0, 0
    ];
  }

  const denominator = dx1 * dy2 - dy1 * dx2;
  // Prevent division by zero
  if (Math.abs(denominator) < 1e-10) {
    return [
      p1.u - p0.u, p3.u - p0.u, p0.u,
      p1.v - p0.v, p3.v - p0.v, p0.v,
      0, 0
    ];
  }

  const g = (sx * dy2 - sy * dx2) / denominator;
  const h = (dx1 * sy - dy1 * sx) / denominator;

  return [
    p1.u - p0.u + g * p1.u, p3.u - p0.u + h * p3.u, p0.u,
    p1.v - p0.v + g * p1.v, p3.v - p0.v + h * p3.v, p0.v,
    g, h
  ];
}

/**
 * Warps a source image from a skewed quadrilateral to a flat rectangular canvas.
 * @param {HTMLImageElement} img - source image
 * @param {Array} points - Array of 4 points {x, y} on the source natural image
 * @param {number} destWidth - desired output width
 * @param {number} destHeight - desired output height
 * @returns {string} cropped transparent/opaque jpeg/png DataURL
 */
export function warpPerspective(img, points, destWidth, destHeight, rotation = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = destWidth;
  canvas.height = destHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Calculate rotated bounding box size
  const rotRad = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rotRad));
  const sin = Math.abs(Math.sin(rotRad));
  const bBoxWidth = Math.round(cos * img.naturalWidth + sin * img.naturalHeight);
  const bBoxHeight = Math.round(sin * img.naturalWidth + cos * img.naturalHeight);

  // Map input points (from unrotated natural image space) to rotated bounding box space
  const mappedPoints = points.map(pt => {
    if (rotation === 0) return pt;
    const cx = img.naturalWidth / 2;
    const cy = img.naturalHeight / 2;
    const rx = pt.x - cx;
    const ry = pt.y - cy;
    
    const rotX = rx * Math.cos(rotRad) - ry * Math.sin(rotRad);
    const rotY = rx * Math.sin(rotRad) + ry * Math.cos(rotRad);
    
    return {
      x: rotX + bBoxWidth / 2,
      y: rotY + bBoxHeight / 2
    };
  });

  // Get coefficients for square to quad (mapping normalized coordinates [0, 1] to source natural image points)
  // points order: 0: TL, 1: TR, 2: BR, 3: BL
  const p0 = { u: mappedPoints[0].x, v: mappedPoints[0].y };
  const p1 = { u: mappedPoints[1].x, v: mappedPoints[1].y };
  const p2 = { u: mappedPoints[2].x, v: mappedPoints[2].y };
  const p3 = { u: mappedPoints[3].x, v: mappedPoints[3].y };

  const coeffs = getSquareToQuadCoefficients(p0, p1, p2, p3);
  const [a0, a1, a2, a3, a4, a5, a6, a7] = coeffs;

  // To draw the warped image, we create a temporary canvas with the original or rotated image dimensions
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = bBoxWidth;
  tempCanvas.height = bBoxHeight;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return '';

  if (rotation !== 0) {
    tempCtx.translate(bBoxWidth / 2, bBoxHeight / 2);
    tempCtx.rotate(rotRad);
    tempCtx.translate(-img.naturalWidth / 2, -img.naturalHeight / 2);
  }
  tempCtx.drawImage(img, 0, 0);

  const srcData = tempCtx.getImageData(0, 0, bBoxWidth, bBoxHeight);
  const destData = ctx.createImageData(destWidth, destHeight);

  const srcW = srcData.width;
  const srcH = srcData.height;
  const srcPixels = srcData.data;
  const destPixels = destData.data;

  // Warp pixel by pixel (backward mapping to avoid holes)
  for (let y = 0; y < destHeight; y++) {
    const yNorm = y / destHeight;
    for (let x = 0; x < destWidth; x++) {
      const xNorm = x / destWidth;
      const den = a6 * xNorm + a7 * yNorm + 1;
      
      // Calculate corresponding source coordinate
      const u = Math.round((a0 * xNorm + a1 * yNorm + a2) / den);
      const v = Math.round((a3 * xNorm + a4 * yNorm + a5) / den);

      const destIdx = (y * destWidth + x) * 4;

      // Copy pixel if inside source boundaries
      if (u >= 0 && u < srcW && v >= 0 && v < srcH) {
        const srcIdx = (v * srcW + u) * 4;
        destPixels[destIdx] = srcPixels[srcIdx];         // R
        destPixels[destIdx + 1] = srcPixels[srcIdx + 1]; // G
        destPixels[destIdx + 2] = srcPixels[srcIdx + 2]; // B
        destPixels[destIdx + 3] = srcPixels[srcIdx + 3]; // A
      } else {
        // Transparent/White background fallback outside bounds
        destPixels[destIdx] = 255;
        destPixels[destIdx + 1] = 255;
        destPixels[destIdx + 2] = 255;
        destPixels[destIdx + 3] = 0;
      }
    }
  }

  ctx.putImageData(destData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.95);
}
