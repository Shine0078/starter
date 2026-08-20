import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'app_locale.dart';
import 'app_theme.dart';
import 'api/client.dart';
import 'api/app_lock.dart';
import 'api/onboarding_store.dart';
import 'api/session_store.dart';
import 'api/platform/device_auth.dart';
import 'api/platform/background_sync.dart';
import 'api/platform/offline_cache_factory.dart';
import 'design/design.dart';
import 'l10n/app_localizations.dart';
import 'l10n/app_localizations_en.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'screens/onboarding_screen.dart';
import 'api/crash_log.dart';

/// Isolated embedders (including app-lock and session-recovery tests) may not
/// install the app's localization delegates. Keep these recovery paths usable
/// in English rather than failing before a user can regain access.
AppLocalizations _localizations(BuildContext context) {
  return Localizations.of<AppLocalizations>(context, AppLocalizations) ??
      AppLocalizationsEn();
}

// Both factories resolve per target: the encrypted SQLite cache and the system
// biometric prompt on Android and iOS, no-op equivalents in a browser. Neither
// native package compiles for the web, so the choice has to happen at import
// time rather than behind a runtime `if (kIsWeb)`.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    unawaited(CrashLog.record(details.exception, stackTrace: details.stack, context: 'flutter'));
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    unawaited(CrashLog.record(error, stackTrace: stack, context: 'platform'));
    return true;
  };
  await configureBackgroundSync();
  final localeController = LocaleController();
  final themeColorController = ThemeColorController();
  final themeModeController = ThemeModeController();
  runApp(FinverseApp(
    api: ApiClient(offlineCache: createOfflineCache()),
    localeController: localeController,
    themeColorController: themeColorController,
    themeModeController: themeModeController,
    onboardingStore: SecureOnboardingStore(),
    appLockController: AppLockController(
      store: SecureAppLockStore(),
      authenticator: createDeviceAuthenticator(),
    ),
  ));
  // Locale restoration is a convenience preference, not startup-critical
  // state. Showing the system language first protects the first Flutter frame
  // from a temporarily unavailable platform preference store.
  unawaited(localeController.restore());
  unawaited(themeColorController.restore());
  unawaited(themeModeController.restore());
}

class FinverseApp extends StatelessWidget {
  FinverseApp({
    required this.api,
    OnboardingStore? onboardingStore,
    AppLockController? appLockController,
    LocaleController? localeController,
    ThemeColorController? themeColorController,
    ThemeModeController? themeModeController,
    super.key,
  })  : onboardingStore = onboardingStore ?? CompletedOnboardingStore(),
        localeController = localeController ?? LocaleController.inMemory(),
        themeColorController =
            themeColorController ?? ThemeColorController.inMemory(),
        themeModeController =
            themeModeController ?? ThemeModeController.inMemory(),
        appLockController = appLockController ??
            AppLockController(
              store: InMemoryAppLockStore(),
              authenticator: UnavailableDeviceAuthenticator(),
            );

  final ApiClient api;
  final OnboardingStore onboardingStore;
  final AppLockController appLockController;
  final LocaleController localeController;
  final ThemeColorController themeColorController;
  final ThemeModeController themeModeController;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: localeController,
      builder: (context, _) => ListenableBuilder(
        listenable: themeColorController,
        builder: (context, _) => ListenableBuilder(
          listenable: themeModeController,
          builder: (context, _) => MaterialApp(
            title: 'FINVERSE',
            debugShowCheckedModeBanner: false,
            theme: FinTheme.light(themeColorController.color),
            darkTheme: FinTheme.dark(themeColorController.color),
            // Follow the OS. A finance app opened at night should not flashbang you.
            themeMode: themeModeController.mode,
            locale: localeController.locale,
            // Localisation plumbing for the date pickers, tooltips, and text-selection
            // menus. English and French ship today; adding a locale file under l10n/
            // and extending [LocaleController.supportedLanguageCodes] is all a
            // future translation needs from here.
            localizationsDelegates: [
              ...GlobalMaterialLocalizations.delegates,
              AppLocalizations.delegate,
            ],
            supportedLocales: AppLocalizations.supportedLocales,
            builder: (context, child) => LocaleControllerScope(
              controller: localeController,
              child: ThemeColorControllerScope(
                controller: themeColorController,
                child: ThemeModeControllerScope(
                  controller: themeModeController,
                  child: child ?? const SizedBox.shrink(),
                ),
              ),
            ),
            home: OnboardingGate(
              api: api,
              store: onboardingStore,
              appLockController: appLockController,
            ),
          ),
        ),
      ),
    );
  }
}

class OnboardingGate extends StatefulWidget {
  const OnboardingGate({
    required this.api,
    required this.store,
    required this.appLockController,
    super.key,
  });

  final ApiClient api;
  final OnboardingStore store;
  final AppLockController appLockController;

  @override
  State<OnboardingGate> createState() => _OnboardingGateState();
}

class _OnboardingGateState extends State<OnboardingGate> {
  bool? _complete;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    bool complete;
    try {
      complete = await widget.store.isComplete();
    } catch (_) {
      // A keystore failure should not lock the user out of the app.
      complete = false;
    }
    if (mounted) setState(() => _complete = complete);
  }

  Future<void> _finish() async {
    try {
      await widget.store.complete();
    } finally {
      if (mounted) setState(() => _complete = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_complete == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (!_complete!) return OnboardingScreen(onComplete: _finish);
    return AuthGate(
      api: widget.api,
      appLockController: widget.appLockController,
    );
  }
}

/// Decides between the sign-in screen and the app.
///
/// Restoring a stored session is asynchronous — it reads the platform keystore —
/// so there is a real third state here beyond "in" and "out". Rendering the
/// login screen while that read is in flight would flash it at every returning
/// user, which reads as being logged out.
class AuthGate extends StatefulWidget {
  const AuthGate({
    required this.api,
    required this.appLockController,
    super.key,
  });

  final ApiClient api;
  final AppLockController appLockController;

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool _checking = true;
  bool _signedIn = false;
  String? _restoreError;

  @override
  void initState() {
    super.initState();

    // The client calls this when a refresh fails, so an expired session drops
    // straight back to sign-in from wherever the user happened to be.
    widget.api.onSessionExpired = () {
      if (mounted) setState(() => _signedIn = false);
    };

    _restore();
  }

  Future<void> _restore() async {
    var restored = false;
    String? restoreError;
    if (mounted) setState(() => _restoreError = null);
    try {
      restored = await widget.api.restoreSession();
      await widget.appLockController.initialize();
    } on SessionStoreUnavailableException catch (error) {
      // A locked or temporarily unavailable Keychain/Keystore is not a
      // revoked session. Keep the user out of the financial UI until the
      // platform storage can be read again, with an explicit retry instead of
      // silently presenting sign-in and encouraging a duplicate account.
      restoreError = error.toString();
    } catch (error) {
      debugPrint('Could not restore session: $error');
    }
    if (!mounted) return;
    setState(() {
      _signedIn = restored;
      _checking = false;
      _restoreError = restoreError;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (_restoreError != null) {
      final l10n = _localizations(context);
      return Scaffold(
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.lock_clock_outlined, size: 56),
                  const SizedBox(height: 16),
                  Text(
                    l10n.secureStorageWaitTitle,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    l10n.secureStorageWaitDetail,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    onPressed: _checking ? null : _restore,
                    icon: const Icon(Icons.refresh),
                    label: Text(l10n.secureStorageTryAgain),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    if (!_signedIn) {
      return LoginScreen(
        api: widget.api,
        onSignedIn: () {
          widget.appLockController.markSessionAuthenticated();
          setState(() => _signedIn = true);
        },
      );
    }

    return AppLockGate(
      controller: widget.appLockController,
      onSignOut: _signOut,
      child: HomeScreen(
        api: widget.api,
        appLockController: widget.appLockController,
        onSignOut: _signOut,
        onAccountDeleted: () async {
          if (mounted) setState(() => _signedIn = false);
        },
      ),
    );
  }

  Future<void> _signOut() async {
    await widget.api.signOut();
    if (mounted) setState(() => _signedIn = false);
  }
}

class AppLockGate extends StatefulWidget {
  const AppLockGate({
    required this.controller,
    required this.onSignOut,
    required this.child,
    super.key,
  });

  final AppLockController controller;
  final Future<void> Function() onSignOut;
  final Widget child;

  @override
  State<AppLockGate> createState() => _AppLockGateState();
}

class _AppLockGateState extends State<AppLockGate> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.controller.addListener(_changed);
    WidgetsBinding.instance.addPostFrameCallback((_) => _unlock());
  }

  @override
  void didUpdateWidget(covariant AppLockGate oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_changed);
      widget.controller.addListener(_changed);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.controller.removeListener(_changed);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden ||
        (state == AppLifecycleState.inactive &&
            !widget.controller.authenticating)) {
      widget.controller.lock();
    } else if (state == AppLifecycleState.resumed) {
      _unlock();
    }
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  Future<void> _unlock() async {
    if (!mounted || !widget.controller.locked) return;
    await widget.controller.unlock();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.controller.locked) return widget.child;
    final l10n = _localizations(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.lock_outline, size: 64),
                  const SizedBox(height: 20),
                  Text(
                    l10n.appLockLockedTitle,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    l10n.appLockLockedDetail,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  FilledButton.icon(
                    onPressed:
                        widget.controller.authenticating ? null : _unlock,
                    icon: const Icon(Icons.fingerprint),
                    label: Text(widget.controller.authenticating
                        ? l10n.appLockWaitingForDevice
                        : l10n.appLockUnlockAction),
                  ),
                  TextButton(
                    onPressed: widget.onSignOut,
                    child: Text(l10n.appLockSignOutInstead),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
