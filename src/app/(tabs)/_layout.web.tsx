import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import { Pressable, useColorScheme, View, StyleSheet } from 'react-native';
import { Home, PlusCircle, ClipboardList } from 'lucide-react-native';

import { ExternalLink } from '../../components/external-link';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';

import { Colors, MaxContentWidth, Spacing, colors as themeColors } from '../../constants/theme';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/home" asChild>
            <TabButton icon={Home}>Home</TabButton>
          </TabTrigger>
          <TabTrigger name="entry" href={"/entry" as any} asChild>
            <TabButton icon={PlusCircle}>New Sale</TabButton>
          </TabTrigger>
          <TabTrigger name="report" href={"/report" as any} asChild>
            <TabButton icon={ClipboardList}>Reports</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

interface TabButtonProps extends TabTriggerSlotProps {
  icon: React.ComponentType<{ color: string; size: number }>;
}

export function TabButton({ children, isFocused, icon: IconComponent, ...props }: TabButtonProps) {
  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <View
        style={[
          styles.tabButtonView,
          isFocused && { borderBottomWidth: 3, borderBottomColor: themeColors.primary }
        ]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <IconComponent color={isFocused ? themeColors.primary : '#64748B'} size={16} />
          <ThemedText 
            type="smallBold" 
            style={{ 
              color: isFocused ? themeColors.primary : '#64748B',
              paddingBottom: 4,
            }}
          >
            {children}
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView type="backgroundElement" style={styles.innerContainer}>
        <ThemedText type="smallBold" style={[styles.brandText, { color: themeColors.primary }]}>
          Baki Rx Ledger
        </ThemedText>

        {props.children}

        <ExternalLink href="https://docs.expo.dev" asChild>
          <Pressable style={styles.externalPressable}>
            <ThemedText type="link">Docs</ThemedText>
            <SymbolView
              tintColor={colors.text}
              name={{ ios: 'arrow.up.right.square', web: 'link' }}
              size={12}
            />
          </Pressable>
        </ExternalLink>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  brandText: {
    marginRight: 'auto',
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  externalPressable: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.one,
    marginLeft: Spacing.three,
  },
});
