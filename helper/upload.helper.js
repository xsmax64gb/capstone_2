import { cloudinary, ensureCloudinaryConfigured } from "../config/cloudinary.js";

const DEFAULT_CLOUDINARY_FOLDER =
  process.env.CLOUDINARY_FOLDER || process.env.CLOUDINARY_UPLOAD_FOLDER || "elapp";

const normalizeFolder = (folder) => {
  const normalized = String(folder || DEFAULT_CLOUDINARY_FOLDER)
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");

  return normalized || "elapp";
};

const uploadBufferToCloudinary = (buffer, options = {}) =>
  new Promise((resolve, reject) => {
    ensureCloudinaryConfigured();

    if (!buffer) {
      reject(new Error("File buffer is required for upload"));
      return;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: normalizeFolder(options.folder),
        public_id: options.publicId,
        resource_type: options.resourceType || "image",
        overwrite: options.overwrite ?? true,
        tags: Array.isArray(options.tags) ? options.tags : undefined,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      }
    );

    uploadStream.end(buffer);
  });

const uploadImageFile = async (file, options = {}) => {
  if (!file) {
    throw new Error("Image file is required");
  }

  if (!file.mimetype?.startsWith("image/")) {
    throw new Error("Uploaded file must be an image");
  }

  const result = await uploadBufferToCloudinary(file.buffer, {
    ...options,
    resourceType: "image",
  });

  return {
    url: result.url,
    secureUrl: result.secure_url,
    publicId: result.public_id,
    assetId: result.asset_id,
    format: result.format,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    folder: result.folder,
    originalName: file.originalname,
  };
};

export { uploadBufferToCloudinary, uploadImageFile };
