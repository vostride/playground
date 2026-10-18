import React, { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  Image,
  Linking,
  Modal,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
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
const apps = [
  {
    id: 'shop' as const,
    logo: require('./assets/brands/shop.png'),
    name: 'Komazon',
    symbol: 'f',
    color: '#516347',
    tint: '#e4eadc',
  },
  {
    id: 'flights' as const,
    logo: require('./assets/brands/flights.png'),
    name: 'Looking',
    symbol: '↗',
    color: '#1b5149',
    tint: '#dce8e0',
  },
  {
    id: 'tasks' as const,
    logo: require('./assets/brands/tasks.png'),
    name: 'Brello',
    symbol: '▥',
    color: '#85583d',
    tint: '#f0e5d6',
  },
  {
    id: 'observability' as const,
    logo: require('./assets/brands/observability.png'),
    name: 'PepaPog',
    symbol: 'v',
    color: '#5a568d',
    tint: '#e7e5f2',
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
const helpHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><style>body{font:15px -apple-system,BlinkMacSystemFont,sans-serif;color:#233a35;background:#f7f8f4;padding:16px;line-height:1.6}h1{font-size:24px;line-height:1.25}h2{font-size:18px;margin-top:20px;padding-top:16px;border-top:1px solid #dfe5dc}code{font-size:12px}</style></head><body><h1>Navigation</h1><p>Choose an app from Home or use the bottom tabs. Use the back button to return to the previous screen.</p><h2>Session controls</h2><p>Open Test controls to reset changes or enable a deliberate bug. Bugs are off by default.</p><h2>Direct links</h2><p><code>playground://shop</code><br><code>playground://flights</code><br><code>playground://tasks</code><br><code>playground://observability</code></p></body></html>`;
export default function App() {
  const [stack, setStack] = useState<Location[]>([{ app: 'home', route: '' }]),
    [bugs, setBugs] = useState<Record<string, string>>({}),
    [controls, setControls] = useState(false),
    [guide, setGuide] = useState(false),
    [session, setSession] = useState(0);
  const current = stack[stack.length - 1];
  const product = apps.find((a) => a.id === current.app);
  const navigate = useCallback(
    (app: AppId, route = '') => setStack((previous) => [...previous, { app, route }]),
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
  }, [stack.length, guide, controls]);
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

        <View style={styles.header}>
          <TouchableOpacity
            testID="navigation-back"
            accessibilityRole="button"
            accessibilityLabel={
              current.app === 'home' ? 'Playground home' : 'Back to previous screen'
            }
            onPress={() =>
              current.app !== 'home' &&
              setStack((previous) =>
                previous.length > 1 ? previous.slice(0, -1) : [{ app: 'home', route: '' }],
              )
            }
          >
            <Text style={styles.headerTitle}>
              {current.app !== 'home' ? '‹  ' : ''}
              {product?.name || 'Playground'}
              <Text style={{ color: colors.accent }}>.</Text>
            </Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => setControls(true)}>
            <Text style={styles.controlsLabel}>Test controls</Text>
          </TouchableOpacity>
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
            <Screen>
              {apps.map((app) => (
                <TouchableOpacity
                  key={app.id}
                  testID={`home-open-${app.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${app.name}`}
                  onPress={() => navigate(app.id)}
                  style={styles.appCard}
                >
                  <View style={[styles.appIcon, { backgroundColor: app.tint }]}>
                    <Image source={app.logo} style={{ width: 32, height: 32 }} accessible={false} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.appName}>{app.name}</Text>
                  </View>
                  <Text style={styles.arrow}>›</Text>
                </TouchableOpacity>
              ))}
              <Button
                title="Help"
                testID="button-a-quick-guide-to-the-playground"
                variant="secondary"
                onPress={() => setGuide(true)}
              />
            </Screen>
          ) : current.app === 'shop' ? (
            <ShopScreen route={current.route} bug={bugs.shop || ''} navigate={navigate} />
          ) : current.app === 'flights' ? (
            <FlightsScreen route={current.route} bug={bugs.flights || ''} navigate={navigate} />
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
        <View style={styles.tabs}>
          {[{ id: 'home' as const, name: 'Home', symbol: '⌂' }, ...apps].map((app) => (
            <TouchableOpacity
              testID={`tab-${app.id}`}
              accessibilityRole="tab"
              accessibilityLabel={app.name}
              accessibilityState={{ selected: current.app === app.id }}
              key={app.id}
              onPress={() =>
                setStack(
                  app.id === 'home'
                    ? [{ app: 'home', route: '' }]
                    : [
                        { app: 'home', route: '' },
                        { app: app.id, route: '' },
                      ],
                )
              }
              style={styles.tab}
            >
              {'logo' in app ? (
                <Image
                  source={app.logo}
                  style={{
                    width: 21,
                    height: 21,
                    marginBottom: 3,
                    opacity: current.app === app.id ? 1 : 0.65,
                  }}
                  accessible={false}
                />
              ) : (
                <Text style={[styles.tabSymbol, current.app === app.id && styles.tabSelected]}>
                  {app.symbol}
                </Text>
              )}
              <Text style={[styles.tabLabel, current.app === app.id && styles.tabSelected]}>
                {app.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
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
                          trackColor={{ false: '#d7dfd2', true: '#5e8574' }}
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
    height: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#fff',
  },
  headerTitle: { fontSize: 24, fontWeight: '700', letterSpacing: -0.8, color: colors.ink },
  controlsLabel: { fontSize: 10, color: colors.muted },
  bugBanner: { backgroundColor: '#fff0db', paddingVertical: 7, paddingHorizontal: 15 },
  bugText: { fontSize: 10, color: '#866022' },
  appCard: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  appIcon: {
    height: 40,
    width: 40,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 21,
    fontWeight: '600',
    letterSpacing: -0.5,
    color: colors.ink,
    marginVertical: 5,
  },
  arrow: { fontSize: 28, color: '#96a18f' },
  localNote: {
    fontSize: 11,
    color: colors.muted,
    lineHeight: 19,
    textAlign: 'center',
    marginVertical: 9,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 10,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  tabSymbol: { fontSize: 23, color: '#99a491', height: 28 },
  tabLabel: { fontSize: 9, color: '#82907b' },
  tabSelected: { color: colors.primary, fontWeight: '700' },
});
