import { useState } from "react";
import { Pressable, ScrollView, Text, View, useColorScheme } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { palettes, resolveAppearance, themeNames, appearances, defaultPreferences, type Preferences } from "@dota-notes/design-tokens";

export default function App() {
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const mode = resolveAppearance(preferences.appearance, useColorScheme() === "dark");
  const colors = palettes[preferences.theme][mode];
  const fa = preferences.language === "fa";
  const text = { color: colors.text, textAlign: fa ? "right" as const : "left" as const };
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
    <ScrollView contentContainerStyle={{ padding: 24, gap: 24 }}>
      <Text style={{ ...text, fontSize: 28, fontWeight: "700" }}>Dota Notes</Text>
      <Text style={{ ...text, fontSize: 20 }}>{fa ? "مچ‌هایت را بهتر بشناس" : "Understand your matches"}</Text>
      <View style={{ backgroundColor: colors.panel, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.line, gap: 12 }}>
        <Text style={text}>{fa ? "پایهٔ اپ موبایل آماده است. اتصال حساب و تحلیل مچ‌ها در مرحلهٔ بعد اضافه می‌شوند." : "Mobile foundation. Account connection and match analysis are planned for the next stage."}</Text>
        <Text style={{ color: colors.muted, textAlign: text.textAlign }}>{fa ? "فعلاً دادهٔ زنده‌ای نمایش داده نمی‌شود." : "No live match data is displayed yet."}</Text>
      </View>
      <Text style={text}>{fa ? "زبان" : "Language"}</Text>
      <View style={{ flexDirection: fa ? "row-reverse" : "row", gap: 12 }}>
        {(["en", "fa"] as const).map(language => <Pressable key={language} accessibilityRole="button" accessibilityState={{ selected: preferences.language === language }} onPress={() => setPreferences(p => ({ ...p, language }))} style={{ backgroundColor: colors.panel2, padding: 14, borderRadius: 8 }}><Text style={{ color: preferences.language === language ? colors.accent : colors.text }}>{language === "fa" ? "فارسی" : "English"}</Text></Pressable>)}
      </View>
      <Text style={text}>{fa ? "تم" : "Theme"}</Text>
      <View style={{ flexDirection: fa ? "row-reverse" : "row", gap: 8, flexWrap: "wrap" }}>
        {themeNames.map(theme => <Pressable key={theme} accessibilityRole="button" accessibilityState={{ selected: preferences.theme === theme }} onPress={() => setPreferences(p => ({ ...p, theme }))} style={{ backgroundColor: colors.panel2, padding: 14, borderRadius: 8 }}><Text style={{ color: preferences.theme === theme ? colors.accent : colors.text }}>{theme}</Text></Pressable>)}
      </View>
      <Text style={text}>{fa ? "حالت نمایش" : "Appearance"}</Text>
      <View style={{ flexDirection: fa ? "row-reverse" : "row", gap: 8 }}>
        {appearances.map(appearance => <Pressable key={appearance} accessibilityRole="button" accessibilityState={{ selected: preferences.appearance === appearance }} onPress={() => setPreferences(p => ({ ...p, appearance }))} style={{ backgroundColor: colors.panel2, padding: 14, borderRadius: 8 }}><Text style={{ color: preferences.appearance === appearance ? colors.accent : colors.text }}>{fa ? ({ light: "روشن", dark: "تاریک", system: "سیستم" })[appearance] : appearance}</Text></Pressable>)}
      </View>
    </ScrollView>
  </SafeAreaView></SafeAreaProvider>;
}
