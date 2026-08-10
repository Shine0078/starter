import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'plaid_link.dart';

/// Small Flutter bridge over Plaid's officially supported native Android SDK.
///
/// Android and iOS use Plaid's native Link SDKs through the same method
/// channel. The web implementation remains separate because it uses Plaid's
/// JavaScript SDK and redirect-based OAuth.
class NativePlaidLink extends PlaidLink {
  const NativePlaidLink();

  static const _channel = MethodChannel('com.finverse.finance/plaid_link');

  @override
  bool get isSupported =>
      defaultTargetPlatform == TargetPlatform.android ||
      defaultTargetPlatform == TargetPlatform.iOS;

  @override
  String get platform =>
      defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';

  @override
  Future<PlaidLinkResult> open(String linkToken) async {
    if (!isSupported) throw const PlaidLinkUnavailable();
    final result = await _channel.invokeMapMethod<Object?, Object?>(
      'open',
      {'token': linkToken},
    );
    if (result == null) throw const PlaidLinkUnavailable();
    return PlaidLinkResult.fromMap(result);
  }

  @override
  Future<PlaidLinkResult?> consumePending() async {
    if (!isSupported) return null;
    final result =
        await _channel.invokeMapMethod<Object?, Object?>('consumePending');
    return result == null ? null : PlaidLinkResult.fromMap(result);
  }
}

PlaidLink createPlaidLink() => const NativePlaidLink();
