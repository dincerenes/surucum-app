import { type ReactNode, useMemo, useState } from 'react';
import {
  FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HIT_SIZE, radius, space, type as typeScale, useTheme } from '@/theme/use-theme';
import { upperTr } from '@/lib/text';
import { useSheetTopInset } from './sheet';

interface Props {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  /** Liste kapalıyken devre dışı — önceki seçim yapılmadan açılmasın. */
  disabled?: boolean;
  /** Uzun listelerde arama kutusu. Kısa listelerde gereksiz gürültü. */
  searchable?: boolean;
  /** Listede olmayan için serbest giriş — kimse listeye takılıp kalmasın. */
  allowCustom?: boolean;
  /** Seçeneğin solunda görsel — ör. marka logosu. Seçili değerde de çizilir. */
  renderIcon?: (option: string) => ReactNode;
}

/**
 * Listeden seçim alanı.
 *
 * Marka ve model ELLE YAZILMIYOR: aynı aracı "renault", "Renault",
 * "RENAULT" diye üç farklı şekilde yazmak veriyi kirletiyor ve ileride
 * araç bazlı karşılaştırmayı imkânsız kılıyor. Bir de sürücü telefonla
 * uğraşmıyor, iki dokunuşla geçiyor.
 *
 * Listede olmayan araç için "Diğer" var — hiçbir sürücü listeye takılıp
 * kurulumu bırakamamalı.
 */
export function SelectField({
  label, value, onChange, options, placeholder = 'Seç',
  disabled = false, searchable = false, allowCustom = false, renderIcon,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const sheetTop = useSheetTopInset();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    if (!q) return options;
    return options.filter((o) => o.toLocaleLowerCase('tr').includes(q));
  }, [options, query]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    setQuery('');
    setCustom('');
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.textSoft }]}>{upperTr(label)}</Text>

      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
        style={({ pressed }) => [
          styles.control,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
          },
        ]}
      >
        {value && renderIcon ? renderIcon(value) : null}
        <Text
          style={[
            typeScale.body,
            { color: value ? colors.text : colors.textFaint, flex: 1 },
          ]}
          numberOfLines={1}
        >
          {value ?? placeholder}
        </Text>
        <Chevron color={colors.textFaint} />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View style={[styles.sheet, {
          backgroundColor: colors.background, paddingTop: styles.sheet.paddingTop + sheetTop,
        }]}>
          <View style={styles.sheetHead}>
            <Text style={[typeScale.title, { color: colors.text }]}>{label}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={space.md}>
              <Text style={[typeScale.bodyStrong, { color: colors.accent }]}>Kapat</Text>
            </Pressable>
          </View>

          {searchable ? (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Ara"
              placeholderTextColor={colors.textFaint}
              autoCorrect={false}
              style={[
                styles.search,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />
          ) : null}

          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => pick(item)}
                style={({ pressed }) => [
                  styles.option,
                  {
                    borderBottomColor: colors.border,
                    backgroundColor: pressed ? colors.surfaceSunken : 'transparent',
                  },
                ]}
              >
                {renderIcon ? renderIcon(item) : null}
                <Text style={[typeScale.body, { color: colors.text, flex: 1 }]}>
                  {item}
                </Text>
                {value === item ? (
                  <Text style={[typeScale.bodyStrong, { color: colors.accent }]}>✓</Text>
                ) : null}
              </Pressable>
            )}
            ListFooterComponent={
              allowCustom ? (
                <View style={styles.customBox}>
                  <Text style={[typeScale.caption, { color: colors.textFaint }]}>
                    Listede yoksa kendin yaz
                  </Text>
                  <View style={styles.customRow}>
                    <TextInput
                      value={custom}
                      onChangeText={setCustom}
                      placeholder="Diğer"
                      placeholderTextColor={colors.textFaint}
                      autoCapitalize="words"
                      style={[
                        styles.search,
                        {
                          flex: 1,
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          color: colors.text,
                        },
                      ]}
                    />
                    <Pressable
                      onPress={() => custom.trim() && pick(custom.trim())}
                      disabled={!custom.trim()}
                      style={({ pressed }) => [
                        styles.customAdd,
                        {
                          backgroundColor: colors.accent,
                          opacity: custom.trim() ? (pressed ? 0.85 : 1) : 0.4,
                        },
                      ]}
                    >
                      <Text style={[typeScale.bodyStrong, { color: colors.accentText }]}>
                        Ekle
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null
            }
          />
        </View>
      </Modal>
    </View>
  );
}

/** Aşağı bakan ok — ikon kütüphanesi yerine iki çizgi. */
function Chevron({ color }: { color: string }) {
  return (
    <View style={styles.chevron}>
      <View style={[styles.chevronLeg, { borderColor: color, transform: [{ rotate: '45deg' }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  /** Büyük harf `upperTr` ile — `textTransform` Türkçe İ'yi bilmiyor. */
  label: { ...typeScale.label },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: HIT_SIZE,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
  },
  chevron: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  chevronLeg: {
    width: 8, height: 8,
    borderRightWidth: 2, borderBottomWidth: 2,
    marginTop: -3,
  },
  sheet: { flex: 1, paddingHorizontal: space.xl, paddingTop: space.lg },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: space.md,
  },
  search: {
    minHeight: HIT_SIZE,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    fontSize: 16,
    marginBottom: space.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: HIT_SIZE,
    paddingVertical: space.md,
    borderBottomWidth: 1,
  },
  customBox: { paddingTop: space.lg, gap: space.xs },
  customRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  customAdd: {
    minHeight: HIT_SIZE,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
