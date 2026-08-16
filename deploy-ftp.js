import { Client } from "basic-ftp";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function deploy() {
  const client = new Client();
  client.ftp.verbose = true;

  const host = process.env.FTP_HOST;
  const user = process.env.FTP_USER;
  const password = process.env.FTP_PASSWORD;
  const remotePath = process.env.FTP_PATH || "/public_html";

  if (!host || !user || !password) {
    console.error("❌ خطأ: لم يتم العثور على بيانات اتصال الـ FTP في ملف .env");
    console.error("يرجى تعبئة FTP_HOST و FTP_USER و FTP_PASSWORD في ملف .env");
    process.exit(1);
  }

  if (user.includes("ضع_اسم_المستخدم_هنا") || password.includes("ضع_كلمة_المرور_هنا")) {
    console.error("⚠️ تنبيه: بيانات الاتصال في .env ما زالت تحتوي على نص افتراضي.");
    console.error("يرجى استبدالها ببيانات الاتصال الحقيقية الخاصة باستضافة Namecheap لتمكين الرفع.");
    process.exit(1);
  }

  console.log(`🚀 جاري الاتصال بخادم الـ FTP: ${host}...`);

  try {
    await client.access({
      host,
      user,
      password,
      secure: false // Set to true if server supports/requires FTPS (secure FTP)
    });

    console.log("✅ تم الاتصال بنجاح. جاري الانتقال إلى المسار المستهدف:", remotePath);
    await client.ensureDir(remotePath);

    console.log("🧹 جاري تنظيف الملفات القديمة في المجلد المستهدف...");
    await client.clearWorkingDir();

    const localDistPath = path.join(__dirname, "dist");
    console.log("📤 جاري رفع ملفات البناء من المجلد المحلي dist...");
    await client.uploadFromDir(localDistPath);

    console.log("🎉 تم رفع كافة ملفات الموقع بنجاح إلى استضافة Namecheap!");
  } catch (err) {
    console.error("❌ فشلت عملية الرفع:");
    console.error(err);
    process.exit(1);
  } finally {
    client.close();
  }
}

deploy();
