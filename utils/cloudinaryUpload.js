const { v2: cloudinary } = require('cloudinary');
const { Readable } = require('stream');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

function getUploadOptions(folder = 'ecom') {
  return {
    folder,
    resource_type: 'image',
    use_filename: true,
    unique_filename: true,
    overwrite: false,
  };
}

function uploadBuffer(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { ...getUploadOptions(options.folder), ...options },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
          });
        }
      },
    );
    const readable = Readable.from(buffer);
    readable.pipe(uploadStream);
  });
}

function uploadFileStream(fileStream, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { ...getUploadOptions(options.folder), ...options },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
          });
        }
      },
    );
    fileStream.pipe(uploadStream);
  });
}

async function uploadMultipleBuffers(buffers, options = {}) {
  const results = [];
  for (const buffer of buffers) {
    const result = await uploadBuffer(buffer, options);
    results.push(result);
  }
  return results;
}

function deleteByPublicId(publicId) {
  return cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
}

function getCloudinaryUrl(publicId, transformations = {}) {
  return cloudinary.url(publicId, { secure: true, ...transformations });
}

module.exports = {
  cloudinary,
  uploadBuffer,
  uploadFileStream,
  uploadMultipleBuffers,
  deleteByPublicId,
  getCloudinaryUrl,
  getUploadOptions,
};