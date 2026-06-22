export const createImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous'); // Avoid CORS issues on canvas
    image.src = url;
  });

export function getRadianAngle(degreeValue) {
  return (degreeValue * Math.PI) / 180;
}

/**
 * Returns the cropped image URL (dataURL or blob)
 * @param {string} imageSrc - source image URL
 * @param {Object} pixelCrop - croppedAreaPixels from react-easy-crop
 * @param {number} rotation - rotation in degrees
 */
export async function getCroppedImg(imageSrc, pixelCrop, rotation = 0) {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  const rotRad = getRadianAngle(rotation);

  // calculate bounding box of the rotated image
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
    image.width,
    image.height,
    rotation
  );

  // set canvas size to match the bounding box
  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  // translate canvas context to a center point on canvas to draw and rotate the image
  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.translate(-image.width / 2, -image.height / 2);

  // draw rotated image
  ctx.drawImage(image, 0, 0);

  // croppedAreaPixels values are bounding box relative
  // extract the cropped image from the rotated canvas
  const data = ctx.getImageData(
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height
  );

  // set canvas width to final desired crop size
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // paste pixel data of the cropped area
  ctx.putImageData(data, 0, 0);

  // As Base64 string
  // return canvas.toDataURL('image/jpeg');

  // As Blob (better for memory)
  return new Promise((resolve, reject) => {
    canvas.toBlob((file) => {
      if (!file) {
        reject(new Error('Canvas is empty'));
        return;
      }
      resolve({
        blob: file,
        url: URL.createObjectURL(file)
      });
    }, 'image/jpeg', 0.95);
  });
}

function rotateSize(width, height, rotation) {
  const rotRad = getRadianAngle(rotation);

  return {
    width:
      Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height:
      Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

export async function getCroppedImgFromReactImageCrop(imageSrc, crop, elementWidth, elementHeight, rotation = 0) {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx || !crop.width || !crop.height) {
    return null;
  }

  const rotRad = getRadianAngle(rotation);
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, rotation);

  // Create temporary rotated canvas
  const rotatedCanvas = document.createElement('canvas');
  rotatedCanvas.width = bBoxWidth;
  rotatedCanvas.height = bBoxHeight;
  const rotCtx = rotatedCanvas.getContext('2d');

  rotCtx.translate(bBoxWidth / 2, bBoxHeight / 2);
  rotCtx.rotate(rotRad);
  rotCtx.translate(-image.width / 2, -image.height / 2);
  rotCtx.drawImage(image, 0, 0);

  // Handle percentage crop units
  let cropX = crop.x;
  let cropY = crop.y;
  let cropW = crop.width;
  let cropH = crop.height;

  if (crop.unit === '%') {
    cropX = (crop.x / 100) * elementWidth;
    cropY = (crop.y / 100) * elementHeight;
    cropW = (crop.width / 100) * elementWidth;
    cropH = (crop.height / 100) * elementHeight;
  }

  // Scale crop to the natural image resolution (unrotated)
  const scaleX = image.width / elementWidth;
  const scaleY = image.height / elementHeight;

  const x = cropX * scaleX;
  const y = cropY * scaleY;
  const pixelWidth = cropW * scaleX;
  const pixelHeight = cropH * scaleY;

  // Center offset on the rotated bounding box canvas
  const dx = (bBoxWidth - image.width) / 2;
  const dy = (bBoxHeight - image.height) / 2;

  const pixelX = x + dx;
  const pixelY = y + dy;

  // Set crop canvas dimensions
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;

  ctx.drawImage(
    rotatedCanvas,
    pixelX,
    pixelY,
    pixelWidth,
    pixelHeight,
    0,
    0,
    pixelWidth,
    pixelHeight
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((file) => {
      if (!file) {
        reject(new Error('Canvas is empty'));
        return;
      }
      resolve({
        blob: file,
        url: URL.createObjectURL(file)
      });
    }, 'image/jpeg', 0.95);
  });
}

