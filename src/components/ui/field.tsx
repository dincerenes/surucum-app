import { useState } from 'react';
import {
  Pressable, StyleSheet, Text, TextInput, View,
  type KeyboardTypeOptions, type TextInputProps,
} from 'react-native';
import { HIT_SIZE, radius, space, useTheme } from '@/theme/use-theme';

interface Props {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string | null;
  hint?: string;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  editable?: boolean;
  maxLength?: number;
}

export function Field({
  label, value, onChangeText, placeholder, error, hint,
  secure = false, keyboardType, autoComplete, textContentType,
  autoCapitalize = 'none', returnKeyType, onSubmitEditing, editable = true, maxLength,
}: Props) {
  const { colors } = useTheme();
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? colors.negative
    : focused
      ? colors.accent
      : colors.border;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.textSoft }]}>{label}</Text>

      <View
        style={[
          styles.inputWrap,
          { backgroundColor: colors.surface, borderColor, borderWidth: focused ? 2 : 1 },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          secureTextEntry={secure && !revealed}
          keyboardType={keyboardType}
          autoComplete={autoComplete}
          textContentType={textContentType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          maxLength={maxLength}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, { color: colors.text }]}
        />

        {secure && (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Şifreyi gizle' : 'Şifreyi göster'}
          >
            <Text style={[styles.reveal, { color: colors.accent }]}>
              {revealed ? 'Gizle' : 'Göster'}
            </Text>
          </Pressable>
        )}
      </View>

      {error ? (
        <Text style={[styles.message, { color: colors.negative }]}>{error}</Text>
      ) : hint ? (
        <Text style={[styles.message, { color: colors.textFaint }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  label: { fontSize: 13, fontWeight: '600' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: HIT_SIZE,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: space.md },
  reveal: { fontSize: 14, fontWeight: '600' },
  message: { fontSize: 13, marginTop: 2 },
});
