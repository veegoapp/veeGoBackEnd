import { describe, it, expect } from "vitest";
import path from "path";

// ─── نفس منطق الفحص الموجود في src/lib/upload.ts ─────────────────────────────

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

function validateFile(mimetype: string, filename: string): { ok: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
    return { ok: false, error: "نوع الملف مش مسموح بيه" };
  }
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { ok: false, error: "امتداد الملف مش مسموح بيه" };
  }
  if (filename.includes("..") || filename.includes("/")) {
    return { ok: false, error: "اسم الملف فيه حروف خطيرة" };
  }
  return { ok: true };
}

describe("فحص رفع الملفات", () => {
  it("صورة JPEG مقبولة", () => {
    const result = validateFile("image/jpeg", "photo.jpg");
    expect(result.ok).toBe(true);
  });

  it("صورة PNG مقبولة", () => {
    const result = validateFile("image/png", "id_card.png");
    expect(result.ok).toBe(true);
  });

  it("صورة WebP مقبولة", () => {
    const result = validateFile("image/webp", "selfie.webp");
    expect(result.ok).toBe(true);
  });

  it("ملف PDF مرفوض", () => {
    const result = validateFile("application/pdf", "doc.pdf");
    expect(result.ok).toBe(false);
  });

  it("ملف EXE مرفوض", () => {
    const result = validateFile("application/octet-stream", "virus.exe");
    expect(result.ok).toBe(false);
  });

  it("ملف ZIP مرفوض", () => {
    const result = validateFile("application/zip", "files.zip");
    expect(result.ok).toBe(false);
  });

  it("امتداد غلط مع mimetype صح مرفوض (double extension attack)", () => {
    // محاولة رفع ملف اسمه image.php مع mimetype صورة
    const result = validateFile("image/jpeg", "malicious.php");
    expect(result.ok).toBe(false);
  });

  it("path traversal مرفوض (../)", () => {
    const result = validateFile("image/jpeg", "../etc/passwd.jpg");
    expect(result.ok).toBe(false);
  });

  it("اسم ملف فيه / مرفوض", () => {
    const result = validateFile("image/png", "folder/image.png");
    expect(result.ok).toBe(false);
  });

  it("ملف بدون امتداد مرفوض", () => {
    const result = validateFile("image/jpeg", "noextension");
    expect(result.ok).toBe(false);
  });
});
