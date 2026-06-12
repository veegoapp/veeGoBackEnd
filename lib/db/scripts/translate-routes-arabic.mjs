/**
 * One-time script: populate name_ar, from_location_ar, to_location_ar
 * for all 50 shuttle routes in Neon with accurate Egyptian Arabic translations.
 * Run: node lib/db/scripts/translate-routes-arabic.mjs
 */
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("No database connection string found.");

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
});

// Arabic translations for every unique location/place name
const locationAr = {
  "Mazlaqan Ain Shams":                         "مزلقان عين شمس",
  "Misr Helwan Agriculture Rd":                 "طريق مصر حلوان الزراعي",
  "El Abaseya Street":                          "شارع العباسية",
  "Cairo Alexandria Desert Road":               "طريق القاهرة الإسكندرية الصحراوي",
  "Cairo Alexandria Road (Side Road)":          "طريق القاهرة الإسكندرية (الطريق الجانبي)",
  "El Sadat Road":                              "طريق السادات",
  "Tersa Street":                               "شارع ترسا",
  "King Faisal Street":                         "شارع الملك فيصل",
  "El Bahr El Aazam Street":                    "شارع البحر الأعظم",
  "EGX - The Egyptian Exchange":                "البورصة المصرية - EGX",
  "Nile Street":                                "شارع النيل",
  "Egypt Post - Smart Village Post Office":     "البريد المصري - مكتب بريد القرية الذكية",
  "El Orouba Street":                           "شارع العروبة",
  "Abd El Hameed Badawi Street":                "شارع عبد الحميد بدوي",
  "Gesr El Suez Street":                        "شارع جسر السويس",
  "Autostorad Street":                          "شارع الأوتوستراد",
  "Borhan Street":                              "شارع برهان",
  "Egyptian Accreditation Council EGAC":        "هيئة الاعتماد المصرية EGAC",
  "Ring Road":                                  "الطريق الدائري",
  "Carrefour Street":                           "شارع كارفور",
  "Future Homes Square":                        "ميدان فيوتشر هومز",
  "Mamdouh Salem Street":                       "شارع ممدوح سالم",
  "El Tahrir Street":                           "شارع التحرير",
  "Street 9":                                   "الشارع التاسع",
  "El Methak Street":                           "شارع الميثاق",
  "New Fifth Settlement Bus Station":           "محطة أتوبيس التجمع الخامس الجديد",
  "Iconic Square":                              "ميدان أيقونيك",
  "Youssef El Sebai Street":                    "شارع يوسف السباعي",
  "Etisalat":                                   "اتصالات",
  "Ramses":                                     "رمسيس",
  "Charles de Gaulle Street":                   "شارع شارل ديغول",
  "Al Kasabgi":                                 "القصبجي",
  "El Kasabgi Street":                          "شارع القصبجي",
  "Elgiesh Road":                               "طريق الجيش",
  "Abbas El Akkad Street":                      "شارع عباس العقاد",
  "El Thawra Street":                           "شارع الثورة",
  "Ahmed Enci Street":                          "شارع أحمد إنسي",
  "Shobra Street":                              "شارع شبرا",
  "Zhraa Nasr City Msaken El Dobaet":           "زهراء مدينة نصر مساكن الضباط",
};

// Arabic translations for neighbourhood names used inside route names
const neighbourhoodAr = {
  "Ain Shams":       "عين شمس",
  "El Maadi":        "المعادي",
  "Maadi":           "المعادي",
  "Downtown":        "وسط البلد",
  "Smart Village":   "القرية الذكية",
  "El Sherouk":      "الشروق",
  "Haram":           "الهرم",
  "Heliopolis":      "مصر الجديدة",
  "Helwan":          "حلوان",
  "Mohandessin":     "المهندسين",
  "Mokattam":        "المقطم",
  "Nasr City":       "مدينة نصر",
  "New Cairo":       "القاهرة الجديدة",
  "Shoubra Al Khaima": "شبرا الخيمة",
};

/**
 * Translate a route name of the form "A → B #N" into Arabic.
 * E.g. "Haram → Smart Village #3" → "الهرم → القرية الذكية #3"
 */
function translateRouteName(name) {
  // Pattern: "<from> → <to> #<n>"  or "<from> → <to>"
  const match = name.match(/^(.+?)\s*→\s*(.+?)(\s*#\d+)?$/);
  if (!match) return null;

  const [, fromEn, toEn, suffix] = match;
  const fromAr = neighbourhoodAr[fromEn.trim()] ?? fromEn.trim();
  const toAr   = neighbourhoodAr[toEn.trim()]   ?? toEn.trim();
  return `${fromAr} → ${toAr}${suffix ?? ""}`;
}

async function run() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      "SELECT id, name, from_location, to_location FROM routes ORDER BY id"
    );

    console.log(`Found ${rows.length} routes. Translating...\n`);

    await client.query("BEGIN");

    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const nameAr        = translateRouteName(row.name);
      const fromLocationAr = locationAr[row.from_location] ?? null;
      const toLocationAr   = locationAr[row.to_location]   ?? null;

      if (!nameAr && !fromLocationAr && !toLocationAr) {
        console.warn(`  ⚠  [${row.id}] No translation found for: "${row.name}"`);
        skipped++;
        continue;
      }

      await client.query(
        `UPDATE routes
            SET name_ar           = $1,
                from_location_ar  = $2,
                to_location_ar    = $3,
                updated_at        = NOW()
          WHERE id = $4`,
        [nameAr, fromLocationAr, toLocationAr, row.id]
      );

      console.log(
        `  ✓ [${String(row.id).padStart(2, "0")}] ${row.name.padEnd(48)} → ${nameAr}`
      );
      updated++;
    }

    await client.query("COMMIT");
    console.log(`\n✅ Done — ${updated} routes updated, ${skipped} skipped.\n`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Transaction rolled back:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
