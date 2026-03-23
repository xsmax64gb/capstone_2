import multer from "multer";

const MAX_IMAGE_SIZE_MB = Number(process.env.MAX_IMAGE_SIZE_MB || 5);

const imageFileFilter = (_req, file, callback) => {
  if (!file?.mimetype?.startsWith("image/")) {
    callback(new Error("Only image files are allowed"), false);
    return;
  }

  callback(null, true);
};

const uploadMulter = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE_MB * 1024 * 1024,
  },
  fileFilter: imageFileFilter,
});

const uploadSingleImage = uploadMulter.single("image");
const uploadExerciseCoverImage = uploadMulter.single("coverImageFile");
const uploadVocabularyCoverImage = uploadMulter.single("coverImageFile");
const uploadAvatarImage = uploadMulter.single("avatarFile");

export {
  uploadAvatarImage,
  uploadExerciseCoverImage,
  uploadVocabularyCoverImage,
  uploadMulter,
  uploadSingleImage,
};
