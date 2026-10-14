import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader, StatusBarScrim } from '@/components/ui';
import { radius, space, type as typeScale, useTheme } from '@/theme/use-theme';

// Taslak: sorular ve cevaplar henüz kesinleşmedi.
const SORULAR: { q: string; a: string }[] = [
  {
    q: 'Ciro, cebe kalan ve gerçek kâr arasındaki fark ne?',
    a: 'Ciro brüt kazancın. Cebe kalan; ciro − komisyon − yakıt − gider. Gerçek kâr ise cebe kalandan aracının km başına yıpranma payı da düşülünce çıkan sayı.',
  },
  {
    q: 'Yıpranma payı nedir, nasıl hesaplanıyor?',
    a: 'Aracının her kilometrede ne kadar eridiği: bakım, lastik ve değer kaybı. Kurulumda verdiğin cevaplardan hesaplanıyor. Bakım ve lastik için maliyet, kaç km\'de bir yapıldığına bölünüyor; değer kaybı aracının güncel değerinin her 10.000 km\'de %0,9\'u sayılıyor. Bu üç kalemin toplamının %40\'ı yıpranma payı olarak düşülüyor. Bilmediğin kalem için ortalama bir tahmin kullanılıyor ve "tahmini" diye işaretleniyor. Yakıt bu paya dahil değil, ayrıca hesaplanıyor.',
  },
  {
    q: 'Bakım, lastik ya da araç değerini sonradan nasıl değiştiririm?',
    a: 'Profil → Araçlarım\'dan aracını açıp "Yıpranma hesabı" bölümünü düzenle. Yeni pay bundan sonraki vardiyalara uygulanır; geçmiş vardiyaların kârı değişmez.',
  },
  {
    q: 'Neden kilometre vardiya bitince soruluyor?',
    a: 'Vardiya başlarken hiçbir şey sormuyoruz, tek tuşla açılıyor. Mesafe ve süre işin bittiği anda, akşam hesap kapatılırken alınıyor.',
  },
  {
    q: 'Çalışılan saat nasıl hesaplanıyor?',
    a: 'Vardiyayı bitirirken çalıştığın saati sorarız; boş bırakırsan vardiyanın açılış ve kapanış saatleri arasındaki fark kullanılır.',
  },
  {
    q: 'Yakıt gideri nasıl hesaplanıyor?',
    a: 'Vardiya sonunda kaç km yaptığını ve ortalama tüketimini soruyoruz; litre fiyatı son dolumundan biliniyor. Üçü çarpılıp o günün yakıt gideri bulunuyor. Tüketimi boş bırakırsan o vardiyada kaydettiğin dolum tutarı kullanılıyor.',
  },
  {
    q: 'Pusula nedir, bilgiler nereden geliyor?',
    a: 'Pusula, İstatistik sekmesinde şehrinin genel olarak ne kadar hareketli olduğunu gösteren bölüm. İstanbul, Ankara, İzmir ve Antalya için şu anki tahmini yoğunluk, günün sıcak saatleri, haftanın sıcak günleri ve yoğun bölgeleri (havalimanı, otogar, kampüs gibi) görebilirsin. Bu bilgiler senin kayıtlarından değil, şehirlerin genel çalışma, okul, gece hayatı, turizm ve ulaşım düzeni ile kamuya açık istatistiklerden derleniyor; bu yüzden hepsi "Tahmini" diye işaretli. Hava durumu, maç, konser ve tatiller gerçek yoğunluğu değiştirebilir. Profilinde seçtiğin şehir varsayılan olarak açılır, istersen diğer şehirlere de bakabilirsin.',
  },
  {
    q: 'Kayıtlarım nerede saklanıyor, yedekleniyor mu?',
    a: 'Kayıtların önce telefonunda tutuluyor, uygulama hiçbir zaman ağı beklemiyor. Oturum açıkken arka planda buluta da yedekleniyor; böylece telefon değiştirirsen kayıtların seninle geliyor.',
  },
  {
    q: 'İnternet yokken uygulama çalışır mı?',
    a: 'Evet. Giriş yaptıktan sonra her şey çevrimdışı çalışıyor, yolcu ve gider eklemek için internete ihtiyacın yok. Bağlantı gelince kayıtların kendiliğinden senkronlanıyor.',
  },
  {
    q: 'Vardiyayı bitirmeyi unutursam ne olur?',
    a: 'Açık kalan vardiyayı uygulama sana Anasayfa\'da hatırlatıyor. İstediğin an "Sürüş" sekmesinden dönüp vardiyayı bitirebilirsin.',
  },
  {
    q: 'Bir vardiyayı silersem ne olur?',
    a: 'O vardiyaya bağlı tüm yolcular, giderler ve yakıt dolumları da birlikte silinir. Böylece hiçbir kayıt sahipsiz kalıp toplamları etkilemeye devam etmez.',
  },
];

/**
 * Sık sorulan sorular — akordeon liste.
 *
 * İçerik henüz taslak (bkz. dizideki yorum); metinler docs/mimari.md'deki ürün
 * kararlarından türetildi. Tek seferde birden çok soru açık kalabiliyor,
 * kapatma zorunlu değil.
 */
export default function SSSScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<Set<number>>(new Set());

  function toggle(index: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.page, { paddingTop: insets.top + space.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader />

        <Text style={[typeScale.display, { color: colors.text }]}>Sık sorulan sorular</Text>

        <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          {SORULAR.map((item, index) => {
            const expanded = open.has(index);
            return (
              <Pressable
                key={item.q}
                onPress={() => toggle(index)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                style={[
                  styles.row,
                  index < SORULAR.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <View style={styles.rowHead}>
                  <Text style={[typeScale.bodyStrong, { color: colors.text, flex: 1 }]}>
                    {item.q}
                  </Text>
                  <Text style={[typeScale.bodyStrong, { color: colors.textFaint }]}>
                    {expanded ? '−' : '+'}
                  </Text>
                </View>
                {expanded ? (
                  <Text style={[typeScale.body, { color: colors.textSoft }]}>{item.a}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <StatusBarScrim />
    </>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.lg },
  list: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  row: { padding: space.lg, gap: space.sm },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
