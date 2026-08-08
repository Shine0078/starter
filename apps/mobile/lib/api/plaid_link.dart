import 'package:flutter/services.dart';

class PlaidLinkResult {
  const PlaidLinkResult({
    required this.succeeded,
    this.publicToken,
    this.institutionId,
    this.institutionName,
    this.errorCode,
    this.errorMessage,
  });

  factory PlaidLinkResult.fromMap(Map<Object?, Object?> map) => PlaidLinkResult(
        succeeded: map['status'] == 'success',
        publicToken: map['publicToken'] as String?,
        institutionId: map['institutionId'] as String?,
        institutionName: map['institutionName'] as String?,
        errorCode: map['errorCode'] as String?,
        errorMessage: map['errorMessage'] as String?,
      );

  final bool succeeded;
  final String? publicToken;
  final String? institutionId;
  final String? institutionName;
  final String? errorCode;
  final String? errorMessage;
}

/// Small Flutter bridge over Plaid's officially supported native Android SDK.
class PlaidLink {
  const PlaidLink();

  static const _channel = MethodChannel('com.finverse.finance/plaid_link');

  Future<PlaidLinkResult> open(String linkToken) async {
    final result = await _channel.invokeMapMethod<Object?, Object?>(
      'open',
      {'token': linkToken},
    );
    if (result == null) throw const PlaidLinkUnavailable();
    return PlaidLinkResult.fromMap(result);
  }

  /// Recovers an OAuth result delivered after Android recreated the Activity.
  Future<PlaidLinkResult?> consumePending() async {
    final result =
        await _channel.invokeMapMethod<Object?, Object?>('consumePending');
    return result == null ? null : PlaidLinkResult.fromMap(result);
  }
}

class PlaidLinkUnavailable implements Exception {
  const PlaidLinkUnavailable();

  @override
  String toString() => 'Bank connection is currently available on Android.';
}
