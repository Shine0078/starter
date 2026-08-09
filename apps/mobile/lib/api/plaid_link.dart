/// Plaid Link, across the surfaces this app runs on.
///
/// Plaid ships a native SDK for Android and a JavaScript SDK for the browser.
/// They are different products with the same job, so this file holds the shared
/// types and the platform-agnostic interface, and the implementation is chosen
/// by conditional export.
///
/// iOS has neither yet: the native SDK has no platform channel here, and an
/// iPhone runs the web implementation through the installable PWA instead.
library;

export 'plaid_link_web.dart' if (dart.library.io) 'plaid_link_native.dart';

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

  /// The user closed Link without finishing. Not an error to report.
  factory PlaidLinkResult.cancelled() => const PlaidLinkResult(succeeded: false);

  final bool succeeded;
  final String? publicToken;
  final String? institutionId;
  final String? institutionName;
  final String? errorCode;
  final String? errorMessage;
}

/// What every platform implementation provides.
abstract class PlaidLink {
  const PlaidLink();

  /// Whether Link can open here at all. False leaves the UI to explain itself
  /// rather than offering a button that could only ever fail.
  bool get isSupported;

  /// Which Link surface this is, so the server mints a matching token. A token
  /// carrying `android_package_name` is refused in a browser, and vice versa.
  String get platform;

  Future<PlaidLinkResult> open(String linkToken);

  /// Recovers a result delivered after the host recreated the view. Android
  /// needs this after an OAuth redirect rebuilds the Activity; the web
  /// implementation keeps its handler alive and has nothing to recover.
  Future<PlaidLinkResult?> consumePending();
}

class PlaidLinkUnavailable implements Exception {
  const PlaidLinkUnavailable();

  @override
  String toString() => 'Bank connection is not available on this device.';
}
