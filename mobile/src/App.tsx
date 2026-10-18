import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  Appearance,
  Image,
  Linking,
  Modal,
  StatusBar,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import ShopScreen from './screens/ShopScreen';
import FlightsScreen from './screens/FlightsScreen';
import TasksScreen from './screens/TasksScreen';
import ObservabilityScreen from './screens/ObservabilityScreen';
import {
  Button,
  Text,
  Icon,
  IconButton,
  Card,
  colors,
  Heading,
  KeyboardDismissButton,
  resetSession,
  Row,
  SafeModalArea,
  Screen,
  type AppId,
} from './ui';
function openVostride() {
  void Linking.openURL('https://vostride.com/').catch(() =>
    Alert.alert('Unable to open browser', 'Visit vostride.com in your browser.'),
  );
}
const apps = [
  {
    id: 'shop' as const,
    logo: require('./assets/brands/shop.png'),
    name: 'Komazon',
  },
  {
    id: 'flights' as const,
    logo: require('./assets/brands/flights.png'),
    name: 'Looking',
  },
  {
    id: 'tasks' as const,
    logo: require('./assets/brands/tasks.png'),
    name: 'Brello',
  },
  {
    id: 'observability' as const,
    logo: require('./assets/brands/observability.png'),
    name: 'PepaPog',
  },
];
const bugDefinitions: Record<string, { id: string; label: string }[]> = {
  shop: [
    { id: 'cart-total', label: 'Quantity ignored in totals' },
    { id: 'checkout-validation', label: 'Incomplete address accepted' },
  ],
  flights: [
    { id: 'fare-total', label: 'Incorrect fare total' },
    { id: 'seat-conflict', label: 'Occupied seat selectable' },
  ],
  tasks: [
    { id: 'move-drops-label', label: 'Moving removes labels' },
    { id: 'filter-ignores-assignee', label: 'Assignee filter is ignored' },
  ],
  observability: [
    { id: 'log-filter', label: 'Broken log status filter' },
    { id: 'alert-threshold', label: 'Inverted monitor threshold' },
  ],
};
type Location = { app: AppId; route: string };
const helpHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><style>body{font:15px -apple-system,BlinkMacSystemFont,sans-serif;color:#fafafa;background:#09090b;padding:16px;line-height:1.6}h1{font-size:24px;line-height:1.25}h2{font-size:18px;margin-top:20px;padding-top:16px;border-top:1px solid #27272a}code{font-size:12px}</style></head><body><h1>Navigation</h1><p>Choose an app from Home. Use the grid button to switch apps and the bottom tabs to navigate within each app. The back button returns to the previous screen.</p><h2>Session controls</h2><p>Open Test controls to reset changes or enable a deliberate bug. Bugs are off by default.</p><h2>Direct links</h2><p><code>playground://shop</code><br><code>playground://flights</code><br><code>playground://tasks</code><br><code>playground://observability</code></p></body></html>`;
export default function App() {
  const [stack, setStack] = useState<Location[]>([{ app: 'home', route: '' }]),
    [bugs, setBugs] = useState<Record<string, string>>({}),
    [controls, setControls] = useState(false),
    [guide, setGuide] = useState(false),
    [switcher, setSwitcher] = useState(false),
    [navigationKey, setNavigationKey] = useState(0),
    [session, setSession] = useState(0);
  useEffect(() => {
    Appearance.setColorScheme('dark');
  }, []);
  const current = stack[stack.length - 1];
  const product = apps.find((a) => a.id === current.app);
  const navigate = useCallback(
    (app: AppId, route = '') =>
      setStack((previous) => {
        const active = previous[previous.length - 1];
        const nextRoute = app === 'shop' ? route || 'catalog' : route;
        const activeRoute = active.app === 'shop' ? active.route || 'catalog' : active.route;
        if (active.app === app && activeRoute === nextRoute) return previous;
        return [...previous, { app, route: nextRoute }];
      }),
    [],
  );
  useEffect(() => {
    const handle = (url: string) => {
      if (!url.startsWith('playground://')) return;
      const [path, query = ''] = url.replace('playground://', '').split('?'),
        [app, ...parts] = path.split('/');
      if (!apps.some((a) => a.id === app) && app !== 'home') return;
      const bug = decodeURIComponent(
        query
          .split('&')
          .find((pair) => pair.startsWith('bug='))
          ?.slice(4) || '',
      );
      if (bugDefinitions[app]?.some((b) => b.id === bug))
        setBugs((previous) => ({ ...previous, [app]: bug }));
      setNavigationKey((value) => value + 1);
      setStack([
        { app: 'home', route: '' },
        { app: app as AppId, route: parts.join('/') },
      ]);
    };
    Linking.getInitialURL().then((url) => url && handle(url));
    const listener = Linking.addEventListener('url', (event) => handle(event.url));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (switcher) {
        setSwitcher(false);
        return true;
      }
      if (guide) {
        setGuide(false);
        return true;
      }
      if (controls) {
        setControls(false);
        return true;
      }
      if (stack.length > 1) {
        setStack((previous) => previous.slice(0, -1));
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [stack.length, guide, controls, switcher]);
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />

        <View style={styles.header}>
          <View style={styles.headerBrand}>
            {current.app !== 'home' && (
              <IconButton
                icon="arrowLeft"
                label="Back to previous screen"
                testID="navigation-back"
                onPress={() =>
                  setStack((previous) =>
                    previous.length > 1 ? previous.slice(0, -1) : [{ app: 'home', route: '' }],
                  )
                }
              />
            )}
            <Image
              source={product?.logo || require('./assets/brands/playground.png')}
              style={styles.brandLogo}
              resizeMode="contain"
              accessible={false}
            />
            <Text accessibilityRole="header" style={styles.headerTitle}>
              {product?.name || 'Playground'}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {current.app !== 'home' && (
              <IconButton
                icon="grid"
                label="Switch app"
                testID="app-switcher"
                onPress={() => setSwitcher(true)}
              />
            )}
            <IconButton
              icon="sliders"
              label="Test controls"
              testID="open-test-controls"
              onPress={() => setControls(true)}
            />
          </View>
        </View>
        {bugs[current.app] && (
          <View style={styles.bugBanner}>
            <Text style={styles.bugText}>
              Deliberate bug:{' '}
              {bugDefinitions[current.app]?.find((b) => b.id === bugs[current.app])?.label}
            </Text>
          </View>
        )}
        <KeyboardDismissButton />
        <View style={{ flex: 1 }} key={session}>
          {current.app === 'home' ? (
            <Screen contentContainerStyle={styles.homeContent}>
              {apps.map((app) => (
                <TouchableOpacity
                  key={app.id}
                  testID={`home-open-${app.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${app.name}`}
                  onPress={() => navigate(app.id)}
                  style={styles.appCard}
                >
                  <View style={styles.appIcon}>
                    <Image source={app.logo} style={{ width: 32, height: 32 }} accessible={false} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.appName}>{app.name}</Text>
                  </View>
                  <Icon name="chevronRight" size={18} color={colors.muted} />
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                testID="home-agent-qa"
                accessibilityRole="link"
                accessibilityLabel="agent-qa. Your AI QA engineer. Opens in your browser."
                onPress={openVostride}
                style={styles.agentBanner}
              >
                <View style={styles.agentBannerContent}>
                  <Image
                    source={require('./assets/brands/agent-qa.png')}
                    style={styles.agentWordmark}
                    resizeMode="contain"
                    accessible={false}
                  />
                  <Text style={styles.agentDescription}>Your AI QA engineer</Text>
                </View>
                <Icon name="arrowUpRight" color={colors.muted} />
              </TouchableOpacity>
              <Button
                title="Help"
                testID="button-a-quick-guide-to-the-playground"
                variant="secondary"
                onPress={() => setGuide(true)}
              />
              <TouchableOpacity
                testID="home-by-vostride"
                accessibilityRole="link"
                accessibilityLabel="by vostride. Opens in your browser."
                onPress={openVostride}
                style={styles.attribution}
              >
                <Text style={styles.attributionText}>
                  by <Text style={styles.attributionBrand}>vostride</Text>
                </Text>
              </TouchableOpacity>
            </Screen>
          ) : current.app === 'shop' ? (
            <ShopScreen route={current.route} bug={bugs.shop || ''} navigate={navigate} />
          ) : current.app === 'flights' ? (
            <FlightsScreen
              route={current.route}
              bug={bugs.flights || ''}
              navigate={navigate}
              navigationKey={navigationKey}
            />
          ) : current.app === 'tasks' ? (
            <TasksScreen route={current.route} bug={bugs.tasks || ''} navigate={navigate} />
          ) : (
            <ObservabilityScreen
              route={current.route}
              bug={bugs.observability || ''}
              navigate={navigate}
            />
          )}
        </View>
        <Modal
          visible={switcher}
          transparent
          animationType="fade"
          onRequestClose={() => setSwitcher(false)}
        >
          <SafeModalArea style={styles.scrim}>
            <View style={styles.switcherSheet}>
              <View style={styles.switcherHeading}>
                <Text style={styles.sheetTitle}>Apps</Text>
                <IconButton
                  icon="x"
                  label="Close app switcher"
                  onPress={() => setSwitcher(false)}
                />
              </View>
              {[{ id: 'home' as const, name: 'All apps' }, ...apps].map((app) => (
                <TouchableOpacity
                  key={app.id}
                  testID={`switch-to-${app.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={app.name}
                  accessibilityState={{ selected: current.app === app.id }}
                  style={styles.switcherRow}
                  onPress={() => {
                    setNavigationKey((value) => value + 1);
                    setStack(
                      app.id === 'home'
                        ? [{ app: 'home', route: '' }]
                        : [
                            { app: 'home', route: '' },
                            { app: app.id, route: '' },
                          ],
                    );
                    setSwitcher(false);
                  }}
                >
                  {'logo' in app ? (
                    <Image source={app.logo} style={styles.brandLogo} accessible={false} />
                  ) : (
                    <Icon name="grid" />
                  )}
                  <Text style={styles.switcherName}>{app.name}</Text>
                  {app.id === current.app && <Icon name="check" size={18} />}
                </TouchableOpacity>
              ))}
            </View>
          </SafeModalArea>
        </Modal>
        <Modal
          visible={controls}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setControls(false)}
        >
          <SafeModalArea style={styles.safe}>
            <Screen>
              <Heading
                title="Test controls"
                subtitle="Deliberate bugs are disabled by default. Each switch enables one labelled failure."
              />
              {(current.app === 'home' ? apps : apps.filter((a) => a.id === current.app)).map(
                (app) => (
                  <Card key={app.id}>
                    <Text style={styles.appName}>{app.name}</Text>
                    {bugDefinitions[app.id].map((b) => (
                      <Row key={b.id}>
                        <Text style={{ flex: 1, fontSize: 12, color: colors.ink }}>{b.label}</Text>
                        <Switch
                          testID={`bug-${app.id}-${b.id}`}
                          accessibilityLabel={`${app.name}: ${b.label}`}
                          value={bugs[app.id] === b.id}
                          onValueChange={(enabled) =>
                            setBugs((previous) => ({ ...previous, [app.id]: enabled ? b.id : '' }))
                          }
                          trackColor={{ false: colors.input, true: colors.muted }}
                        />
                      </Row>
                    ))}
                  </Card>
                ),
              )}
              <Button
                title="Reset playground session"
                variant="danger"
                onPress={() => {
                  resetSession();
                  setSession((value) => value + 1);
                  setBugs({});
                  setStack([{ app: 'home', route: '' }]);
                  setControls(false);
                }}
              />
              <Text style={styles.localNote}>Reset clears changes in every app.</Text>
              <Button
                title="Close controls"
                variant="secondary"
                onPress={() => setControls(false)}
              />
            </Screen>
          </SafeModalArea>
        </Modal>
        <Modal visible={guide} animationType="slide" onRequestClose={() => setGuide(false)}>
          <SafeModalArea style={styles.safe}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Help</Text>
              <Button title="Close" variant="secondary" onPress={() => setGuide(false)} />
            </View>
            <WebView
              source={{ html: helpHtml, baseUrl: 'about:blank' }}
              originWhitelist={['about:blank']}
              onShouldStartLoadWithRequest={(request) =>
                request.url === 'about:blank' || request.url.startsWith('data:')
              }
              javaScriptEnabled={false}
              domStorageEnabled={false}
              allowsLinkPreview={false}
              style={{ flex: 1, backgroundColor: colors.background }}
            />
          </SafeModalArea>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 56,
    paddingLeft: 12,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  headerBrand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  brandLogo: { width: 24, height: 24 },
  headerTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.4,
    color: colors.ink,
  },
  bugBanner: {
    backgroundColor: '#30230c',
    borderBottomWidth: 1,
    borderBottomColor: '#594018',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  bugText: { fontSize: 12, lineHeight: 18, color: '#fcd68a' },
  appCard: {
    minHeight: 76,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  appIcon: { height: 40, width: 40, alignItems: 'center', justifyContent: 'center' },
  homeContent: { flexGrow: 1 },
  agentBanner: {
    minHeight: 88,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  agentBannerContent: { flex: 1, gap: 8 },
  agentWordmark: { width: 148, height: 25 },
  agentDescription: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  attribution: {
    marginTop: 'auto',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attributionText: { color: colors.muted, fontSize: 12 },
  attributionBrand: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  appName: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: colors.ink,
  },
  localNote: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
    textAlign: 'center',
    marginVertical: 8,
  },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000099' },
  switcherSheet: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.input,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  switcherHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: { fontSize: 16, fontWeight: '600' },
  switcherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  switcherName: { flex: 1, fontSize: 15, fontWeight: '500' },
});
