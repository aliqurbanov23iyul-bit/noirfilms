export const genres = {
  All: "Hamısı",
  Romance: "Romantika",
  Comedy: "Komediya",
  "Sci-Fi": "Elmi fantastika",
  Thriller: "Triller",
  Drama: "Dram",
  Crime: "Kriminal",
  Animation: "Animasiya",
};
export const plots = {
  "in-the-mood":
    "1960-cı illərin Honq Konqunda iki qonşu həyat yoldaşlarının gizli münasibətini öyrənir. Ortaq tənhalıq onları yaxınlaşdırsa da, hisslərini dilə gətirmək asan olmur.",
  "grand-budapest":
    "Əfsanəvi konsyerj və gənc köməkçisi oğurlanmış rəsm, böyük miras və dəyişən Avropanın fonunda qeyri-adi macəraya atılır.",
  2001: "Sirli monolit bəşəriyyətin ilk addımlarını kosmosun dərinliklərinə uzanan səyahətlə birləşdirir. İnsan və süni intellekt arasındakı münasibət yeni suallar doğurur.",
  parasite:
    "İşsiz bir ailə varlı ailənin evində iş tapmaq üçün plan qurur. İki fərqli dünyanın qarşılaşması gözlənilməz və təhlükəli nəticələrə gətirir.",
  "perfect-days":
    "Tokioda təmizlik işçisi Hirayama musiqidə, kitablarda və ağacların arasından süzülən işıqda gündəlik həyatın gözəlliyini tapır.",
  interstellar:
    "Bir qrup tədqiqatçı bəşəriyyətə yeni ev axtarmaq üçün qalaktikamızın hüdudlarını aşır. Zaman və məsafə qarşısında ata ilə qızın bağlılığı sınağa çəkilir.",
  "pulp-fiction":
    "Los-Ancelesdə iki muzdlu qatilin, bir boksçunun və restoranı soymağa çalışan cütlüyün taleləri gözlənilməz şəkildə kəsişir.",
  chungking:
    "Honq Konqun neon işıqları altında iki tənha polis və iki fərqli qadının yolları kəsişir. İtirilmiş sevgi yerini yeni ehtimallara verir.",
  "blade-runner":
    "Gənc replikant ovçusu cəmiyyətin tarazlığını dəyişə biləcək bir sirr aşkar edir. Axtarışı onu illər əvvəl yoxa çıxmış keçmiş polisə aparır.",
  whiplash:
    "İstedadlı gənc təbilçi nüfuzlu musiqi məktəbində sərt müəllimin rəhbərliyi altında çalışır. Mükəmməllik arzusu ilə şəxsi sərhədləri arasında mübarizə başlayır.",
  "spirited-away":
    "Balaca Çihiro ruhların idarə etdiyi sehrli dünyaya düşür. Valideynlərini xilas etmək üçün cəsarətini tapmalı və bu dünyanın qaydalarını öyrənməlidir.",
  "the-batman":
    "Qotemdə silsilə cinayətlərin izinə düşən Betmen şəhərin dərinliklərinə kök salmış korrupsiyanı üzə çıxarır. İpucları onu öz keçmişi ilə də üzləşdirir.",
};
export function localize(f) {
  return {
    ...f,
    genre: genres[f.genre] || f.genre,
    plot: plots[f.id] || f.plot,
  };
}
