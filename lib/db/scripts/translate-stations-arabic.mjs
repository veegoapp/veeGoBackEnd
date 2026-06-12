/**
 * One-time script: populate name_ar for all stations in Neon
 * with accurate Egyptian Arabic translations — single bulk UPDATE.
 * Run: node lib/db/scripts/translate-stations-arabic.mjs
 */
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("No database connection string found.");

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
});

const stationAr = {
  "26th of July Axis":                                          "محور السادس والعشرين من يوليو",
  "50th Street":                                                "الشارع الخمسون",
  "Abbas El Akkad Street":                                      "شارع عباس العقاد",
  "Abd El Hameed Badawi Street":                                "شارع عبد الحميد بدوي",
  "Abdel Moneim Riad":                                          "عبد المنعم رياض",
  "Abou Bakr El Sedeek Street":                                 "شارع أبو بكر الصديق",
  "Africa Emtedad Moustafa El Nahas Street":                    "شارع أفريقيا امتداد مصطفى النحاس",
  "Ahmed El Zomor Street":                                      "شارع أحمد الزمر",
  "Ahmed Enci Street":                                          "شارع أحمد إنسي",
  "Ahmed Fouad Negm Street":                                    "شارع أحمد فؤاد نجم",
  "Ahmed Oraby Street":                                         "شارع أحمد عرابي",
  "Al Batal Al Romani Company for Car Tires":                   "شركة البطل الروماني لإطارات السيارات",
  "Al Fayoum Desert Road":                                      "طريق الفيوم الصحراوي",
  "Al Gamal Mall":                                              "مول الجمال",
  "Al Haram Street":                                            "شارع الأهرام",
  "Al Kasabgi":                                                 "القصبجي",
  "Al Maadi Grand Mall Square":                                 "ميدان المعادي جراند مول",
  "Al Maryotia Street":                                         "شارع المريوطية",
  "Arab Bank":                                                  "البنك العربي",
  "Autostorad El Nasr Street":                                  "شارع أوتوستراد النصر",
  "Autostorad Street":                                          "شارع الأوتوستراد",
  "Axis 79":                                                    "محور 79",
  "Before Jasmine Sq":                                          "قبل ميدان الياسمين",
  "Borhan Street":                                              "شارع برهان",
  "Cairo Alexandria Desert Road":                               "طريق القاهرة الإسكندرية الصحراوي",
  "Cairo Alexandria Road (Side Road)":                          "طريق القاهرة الإسكندرية (الطريق الجانبي)",
  "Cairo Sweis Road":                                           "طريق القاهرة السويس",
  "Cairo University Road":                                      "طريق جامعة القاهرة",
  "Carrefour Street":                                           "شارع كارفور",
  "Charles de Gaulle Street":                                   "شارع شارل ديغول",
  "Concentrix":                                                 "كونسنتريكس",
  "Concordia":                                                  "كونكورديا",
  "Dar Al-Handasah":                                            "دار الهندسة",
  "Dr Abd Allah El Araby Street":                               "شارع د. عبد الله العربي",
  "Dubai Phone":                                                "دبي فون",
  "ECG - Engineering Consultants Group":                        "مجموعة المستشارين الهندسيين - ECG",
  "EFG Hermes":                                                 "EFG هيرميس",
  "EGX - The Egyptian Exchange":                                "البورصة المصرية - EGX",
  "EL Farouk Sq":                                               "ميدان الفاروق",
  "Egypt Post - Smart Village Post Office":                     "البريد المصري - مكتب بريد القرية الذكية",
  "Egyptian Accreditation Council EGAC":                        "هيئة الاعتماد المصرية EGAC",
  "Ein El Hayah Street":                                        "شارع عين الحياة",
  "El Abaseya Street":                                          "شارع العباسية",
  "El Bahr El Aazam Street":                                    "شارع البحر الأعظم",
  "El Galaa St":                                                "شارع الجلاء",
  "El Gamea El Haditha St":                                     "شارع الجامعة الحديثة",
  "El Hegaz Street":                                            "شارع الحجاز",
  "El Horeya Square":                                           "ميدان الحرية",
  "El Horeya Street":                                           "شارع الحرية",
  "El Kablat Street":                                           "شارع الكبلات",
  "El Kasabgi Street":                                          "شارع القصبجي",
  "El Khalifa El Mamoun Street":                                "شارع الخليفة المأمون",
  "El Lasilki Street":                                          "شارع اللاسلكي",
  "El Mansoureya Road":                                         "طريق المنصورية",
  "El Maryotia Street":                                         "شارع المريوطية",
  "El Methak Street":                                           "شارع الميثاق",
  "El Moustakbal Street":                                       "شارع المستقبل",
  "El Nadi El Gadid Street":                                    "شارع النادي الجديد",
  "El Nahda Sq":                                                "ميدان النهضة",
  "El Nasr Company Street":                                     "شارع شركة النصر",
  "El Nasr Road":                                               "طريق النصر",
  "El Nasr Street":                                             "شارع النصر",
  "El Nozha Street":                                            "شارع النزهة",
  "El Orouba Street":                                           "شارع العروبة",
  "El Sadat Road":                                              "طريق السادات",
  "El Shabab Street":                                           "شارع الشباب",
  "El Shorouk City Road":                                       "طريق مدينة الشروق",
  "El Sudan Street":                                            "شارع السودان",
  "El Tahrir Axis":                                             "محور التحرير",
  "El Tahrir Street":                                           "شارع التحرير",
  "El Tawhed & El Noor":                                        "التوحيد والنور",
  "El Teraa El Bolakia Street":                                 "شارع الترعة البلاقية",
  "El Thawra Street":                                           "شارع الثورة",
  "El Wahat Road":                                              "طريق الواحات",
  "El Wehda Square":                                            "ميدان الوحدة",
  "Elgiesh Road":                                               "طريق الجيش",
  "Emtedad Korneesh El Nile":                                   "امتداد كورنيش النيل",
  "Ericsson Egypt Limited":                                     "إريكسون مصر",
  "Etisalat":                                                   "اتصالات",
  "Etisalat Misr Telecommunications Service Provider":          "اتصالات مصر لخدمات الاتصالات",
  "Future Homes Square":                                        "ميدان فيوتشر هومز",
  "Gamal Abdel Nasser Street":                                  "شارع جمال عبد الناصر",
  "Gamal Al Din Al Bana Street":                                "شارع جمال الدين البنا",
  "Gamal El Deen El Banna Street":                              "شارع جمال الدين البنا",
  "Gameat El Dewal El Arabeya Street":                          "شارع جامعة الدول العربية",
  "Gesr El Suez Street":                                        "شارع جسر السويس",
  "HSBC Bank":                                                  "بنك HSBC",
  "HSBC New Maadi Branch":                                      "فرع HSBC المعادي الجديدة",
  "HSBC Smart Village Branch":                                  "فرع HSBC القرية الذكية",
  "Hassan Mamoun Street":                                       "شارع حسن مأمون",
  "Helwan El Kurimat Road":                                     "طريق حلوان الكريمات",
  "Huawei Smart Village":                                       "هواوي القرية الذكية",
  "Iconic Square":                                              "ميدان أيقونيك",
  "Information Technology Industry Development Agency (ITIDA)": "جهاز تنمية صناعة تكنولوجيا المعلومات (إيتيدا)",
  "Ismail El Kabbani Street":                                   "شارع إسماعيل القباني",
  "Khatem El Morsaleen Street":                                 "شارع خاتم المرسلين",
  "King Faisal Street":                                         "شارع الملك فيصل",
  "Lotfy El Sayed Street":                                      "شارع لطفي السيد",
  "Maadi Technology Village":                                   "قرية المعادي التكنولوجية",
  "Madinaty Entrance No. 1":                                    "مدخل مدينتي رقم 1",
  "Mahdi Arafa Street":                                         "شارع مهدي عرفة",
  "Mahdy Arafa Street":                                         "شارع مهدي عرفة",
  "Mahmoud Khater Street":                                      "شارع محمود خاطر",
  "Mamdouh Salem Street":                                       "شارع ممدوح سالم",
  "Mansour Street":                                             "شارع منصور",
  "Martyrs' Square":                                            "ميدان الشهداء",
  "Mazlaqan Ain Shams":                                         "مزلقان عين شمس",
  "Mega Mart":                                                  "ميجا مارت",
  "Meret Basha Street":                                         "شارع ميريت باشا",
  "Metro Market":                                               "ميترو ماركت",
  "Microsoft Egypt":                                            "مايكروسوفت مصر",
  "Misr Helwan Agriculture Rd":                                 "طريق مصر حلوان الزراعي",
  "Misr Helwan Agriculture Road":                               "طريق مصر حلوان الزراعي",
  "Mobil Gas Station (Near Dandy Mall)":                        "محطة موبيل (بالقرب من داندي مول)",
  "Mohamed Farid Aixs":                                         "محور محمد فريد",
  "Mohammed Farid Axis":                                        "محور محمد فريد",
  "Mohammed Nagib Axis":                                        "محور محمد نجيب",
  "Mohi El Din Abou El Ezz Street":                             "شارع محيي الدين أبو العز",
  "Mokattam Middle Entrance Street":                            "شارع المدخل الأوسط للمقطم",
  "Mr. Avocado Juices":                                         "عصائر السيد أفوكادو",
  "N Teseen Street":                                            "شارع التسعين الشمالي",
  "National Telecom Regulatory Authority":                      "الجهاز القومي لتنظيم الاتصالات",
  "National Telecommunication Institute":                       "المعهد القومي للاتصالات",
  "Near Arab Academy for Science Technology and Maritime Transport University": "بالقرب من الأكاديمية العربية للعلوم والتكنولوجيا والنقل البحري",
  "Near Bank of Alexandria":                                    "بالقرب من بنك الإسكندرية",
  "Near EGX - The Egyptian Exchange":                           "بالقرب من البورصة المصرية - EGX",
  "New Al Easr Mall":                                           "مول النسر الجديد",
  "New Fifth Settlement Bus Station":                           "محطة أتوبيس التجمع الخامس الجديد",
  "Nile Corniche":                                              "كورنيش النيل",
  "Nile Street":                                                "شارع النيل",
  "Omar Ibn Abd El Aziz Street":                                "شارع عمر بن عبد العزيز",
  "Opposite Concordia":                                         "مقابل كونكورديا",
  "Opposite ECG - Engineering Consultants Group":               "مقابل مجموعة المستشارين الهندسيين - ECG",
  "Opposite HSBC Bank":                                         "مقابل بنك HSBC",
  "Opposite Huawei Smart Village":                              "مقابل هواوي القرية الذكية",
  "Opposite Information Technology Institute":                  "مقابل معهد تكنولوجيا المعلومات",
  "Opposite National Telecommunication Institute":              "مقابل المعهد القومي للاتصالات",
  "Opposite Vodafone V-Hub 1 Building":                         "مقابل مبنى فودافون V-Hub 1",
  "Orange Egypt":                                               "أورنج مصر",
  "Osa Residence":                                              "أوسا ريزيدانس",
  "Othman Ibn Affan Street":                                    "شارع عثمان بن عفان",
  "Port Saeed Square":                                          "ميدان بورسعيد",
  "Port Saeed Street":                                          "شارع بورسعيد",
  "Port Said Street":                                           "شارع بورسعيد",
  "Rael Street":                                                "شارع رائيل",
  "Ramses":                                                     "رمسيس",
  "Ramses Street":                                              "شارع رمسيس",
  "Ring Road":                                                  "الطريق الدائري",
  "S Teseen Street":                                            "شارع التسعين الجنوبي",
  "Sakr Qorysh Entrance":                                       "مدخل صقر قريش",
  "Sekat El Walili Street":                                     "شارع سكة الوالي",
  "Shobra Street":                                              "شارع شبرا",
  "Smart Village Conference Center":                            "مركز مؤتمرات القرية الذكية",
  "Smart Village School":                                       "مدرسة القرية الذكية",
  "Soares Square":                                              "ميدان سواريس",
  "Street 153":                                                 "الشارع 153",
  "Street 216":                                                 "الشارع 216",
  "Street 33":                                                  "الشارع 33",
  "Street 9":                                                   "الشارع التاسع",
  "Suez Canal Bank":                                            "بنك قناة السويس",
  "Talaat Harb Axis":                                           "محور طلعت حرب",
  "Tereat Elzomor Street":                                      "شارع ترعة الزمر",
  "Tersa Street":                                               "شارع ترسا",
  "The Information Technology Institute":                       "معهد تكنولوجيا المعلومات",
  "The Ring Road":                                              "الطريق الدائري",
  "Xceed BPO":                                                  "إكسيد BPO",
  "Ylolabs":                                                    "يلولابز",
  "Youssef Abbas Street":                                       "شارع يوسف عباس",
  "Youssef El Sebai Street":                                    "شارع يوسف السباعي",
  "Zahraa El Maadi Street":                                     "شارع زهراء المعادي",
  "Zaker Husein Street":                                        "شارع ذاكر حسين",
  "Zhraa Nasr City Msaken El Dobaet":                           "زهراء مدينة نصر مساكن الضباط",
};

async function run() {
  const client = await pool.connect();
  try {
    // Build a single bulk UPDATE … FROM (VALUES …) query
    const entries = Object.entries(stationAr);

    // Escape single quotes in values for safe SQL embedding
    const escape = (s) => s.replace(/'/g, "''");

    const valueRows = entries
      .map(([en, ar]) => `('${escape(en)}', '${escape(ar)}')`)
      .join(",\n  ");

    const sql = `
      UPDATE stations AS s
         SET name_ar = t.name_ar
        FROM (VALUES
          ${valueRows}
        ) AS t(name_en, name_ar)
       WHERE s.name = t.name_en
         AND (s.name_ar IS DISTINCT FROM t.name_ar)
    `;

    console.log(`Executing bulk UPDATE for ${entries.length} translation entries...`);
    const result = await client.query(sql);
    console.log(`\n✅ Done — ${result.rowCount} station rows updated.\n`);

    // Report any stations still missing Arabic
    const missing = await client.query(
      "SELECT DISTINCT name FROM stations WHERE name_ar IS NULL ORDER BY name"
    );
    if (missing.rows.length > 0) {
      console.warn(`⚠  ${missing.rows.length} station name(s) still have no Arabic translation:`);
      missing.rows.forEach((r) => console.warn(`   • ${r.name}`));
    } else {
      console.log("✓ All stations now have Arabic names.");
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
