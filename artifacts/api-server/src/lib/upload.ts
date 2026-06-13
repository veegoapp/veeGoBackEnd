import multer from "multer";
import type { Request } from "express";

// ─── الأنواع المسموح بيها ─────────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

// ─── الامتدادات المسموح بيها (فحص تاني منفصل عن الـ mimetype) ────────────────
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

// ─── فحص الملف ────────────────────────────────────────────────────────────────
function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  // فحص الـ mimetype
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(new Error("نوع الملف مش مسموح بيه. صور فقط (jpeg, png, webp)"));
    return;
  }

  // فحص الامتداد
  const ext = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    cb(new Error("امتداد الملف مش مسموح بيه"));
    return;
  }

  // منع أسماء الملفات الخطيرة (path traversal)
  if (file.originalname.includes("..") || file.originalname.includes("/")) {
    cb(new Error("اسم الملف فيه حروف مش مسموح بيها"));
    return;
  }

  cb(null, true);
}

// ─── إعداد multer للمستندات (10 MB) ─────────────────────────────────────────
export const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1,                    // ملف واحد بس في كل طلب
  },
  fileFilter,
});

// ─── إعداد multer للسيلفي (8 MB) ────────────────────────────────────────────
export const selfieUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024, // 8 MB
    files: 1,
  },
  fileFilter,
});
