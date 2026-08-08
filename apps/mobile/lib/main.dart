import 'package:flutter/material.dart';

import 'api/client.dart';
import 'api/app_lock.dart';
import 'api/onboarding_store.dart';
import 'api/offline_cache.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'screens/onboarding_screen.dart';

void main() => runApp(FinverseApp(
      api: ApiClient(offlineCache: EncryptedSqliteOfflineCache()),
      onboardingStore: SecureOnboardingStore(),
      appLockController: AppLockController(
        store: SecureAppLockStore(),
        authenticator: LocalDeviceAuthenticator(),
      ),
    ));

class FinverseApp extends StatelessWidget {
  FinverseApp({
    required this.api,
    OnboardingStore? onboardingStore,
    AppLockController? appLockController,
    super.key,
  })  : onboardingStore = onboardingStore ?? CompletedOnboardingStore(),
        appLockController = appLockController ??
            AppLockController(
              store: InMemoryAppLockStore(),
              authenticator: UnavailableDeviceAuthenticator(),
            );

  final ApiClient api;
  final OnboardingStore onboardingStore;
  final AppLockController appLockController;

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFF2F6DF6);

    return MaterialApp(
      title: 'FINVERSE',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: seed),
        useMaterial3: true,
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: seed,
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      // Follow the OS. A finance app opened at night should not flashbang you.
      themeMode: ThemeMode.system,
      home: OnboardingGate(
        api: api,
        store: onboardingStore,
        appLockController: appLockController,
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
    try {
      restored = await widget.api.restoreSession();
      await widget.appLockController.initialize();
    } catch (error) {
      debugPrint('Could not restore session: $error');
    }
    if (!mounted) return;
    setState(() {
      _signedIn = restored;
      _checking = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
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
                    'FINVERSE is locked',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Use your device PIN, fingerprint, or face to view financial information.',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  FilledButton.icon(
                    onPressed:
                        widget.controller.authenticating ? null : _unlock,
                    icon: const Icon(Icons.fingerprint),
                    label: Text(widget.controller.authenticating
                        ? 'Waiting for device…'
                        : 'Unlock FINVERSE'),
                  ),
                  TextButton(
                    onPressed: widget.onSignOut,
                    child: const Text('Sign out instead'),
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
