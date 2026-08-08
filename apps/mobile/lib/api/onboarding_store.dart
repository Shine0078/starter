import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract class OnboardingStore {
  Future<bool> isComplete();
  Future<void> complete();
}

class SecureOnboardingStore implements OnboardingStore {
  SecureOnboardingStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(migrateWithBackup: true),
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock_this_device,
              ),
            );

  static const _key = 'finverse.onboarding.complete';
  final FlutterSecureStorage _storage;

  @override
  Future<bool> isComplete() async => await _storage.read(key: _key) == 'true';

  @override
  Future<void> complete() => _storage.write(key: _key, value: 'true');
}

/// The injected app constructor stays platform-channel-free for widget tests and
/// embedders. Production passes [SecureOnboardingStore] explicitly in main().
class CompletedOnboardingStore implements OnboardingStore {
  @override
  Future<bool> isComplete() async => true;

  @override
  Future<void> complete() async {}
}

class InMemoryOnboardingStore implements OnboardingStore {
  InMemoryOnboardingStore({bool complete = false}) : _complete = complete;

  bool _complete;

  @override
  Future<bool> isComplete() async => _complete;

  @override
  Future<void> complete() async => _complete = true;
}
