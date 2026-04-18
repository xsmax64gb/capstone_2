import multer from "multer";

const MAX_IMAGE_SIZE_MB = Number(process.env.MAX_IMAGE_SIZE_MB || 5);
const MAX_PDF_SIZE_MB = Number(process.env.MAX_PDF_SIZE_MB || 10);

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

const pdfFileFilter = (_req, file, callback) => {
  const ok =
    file?.mimetype === "application/pdf" ||
    String(file?.originalname || "").toLowerCase().endsWith(".pdf");
  if (!ok) {
    callback(new Error("Only PDF files are allowed"), false);
    return;
  }
  callback(null, true);
};

const uploadPdfMulter = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PDF_SIZE_MB * 1024 * 1024,
  },
  fileFilter: pdfFileFilter,
});

const uploadExerciseAiPdf = uploadPdfMulter.single("file_pdf");

export {
  uploadAvatarImage,
  uploadExerciseAiPdf,
  uploadExerciseCoverImage,
  uploadVocabularyCoverImage,
  uploadMulter,
  uploadSingleImage,
};
