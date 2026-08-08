import 'package:flutter/material.dart';

import 'api/client.dart';
import 'api/onboarding_store.dart';
import 'api/offline_cache.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'screens/onboarding_screen.dart';

void main() => runApp(FinverseApp(
      api: ApiClient(offlineCache: EncryptedSqliteOfflineCache()),
      onboardingStore: SecureOnboardingStore(),
    ));

class FinverseApp extends StatelessWidget {
  FinverseApp({
    required this.api,
    OnboardingStore? onboardingStore,
    super.key,
  }) : onboardingStore = onboardingStore ?? CompletedOnboardingStore();

  final ApiClient api;
  final OnboardingStore onboardingStore;

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
      home: OnboardingGate(api: api, store: onboardingStore),
    );
  }
}

class OnboardingGate extends StatefulWidget {
  const OnboardingGate({required this.api, required this.store, super.key});

  final ApiClient api;
  final OnboardingStore store;

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
    return AuthGate(api: widget.api);
  }
}

/// Decides between the sign-in screen and the app.
///
/// Restoring a stored session is asynchronous — it reads the platform keystore —
/// so there is a real third state here beyond "in" and "out". Rendering the
/// login screen while that read is in flight would flash it at every returning
/// user, which reads as being logged out.
class AuthGate extends StatefulWidget {
  const AuthGate({required this.api, super.key});

  final ApiClient api;

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
        onSignedIn: () => setState(() => _signedIn = true),
      );
    }

    return HomeScreen(
      api: widget.api,
      onSignOut: () async {
        await widget.api.signOut();
        if (mounted) setState(() => _signedIn = false);
      },
      onAccountDeleted: () async {
        if (mounted) setState(() => _signedIn = false);
      },
    );
  }
}
