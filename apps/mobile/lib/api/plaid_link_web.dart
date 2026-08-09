import 'dart:async';
import 'dart:js_interop';
// Plaid's config object is a plain JS bag of callbacks with no Dart binding, so
// the dynamic property setters are the honest way to build it.
import 'dart:js_interop_unsafe';

import 'package:web/web.dart' as web;

import 'plaid_link.dart';

/// Plaid Link in the browser, via Plaid's official JavaScript SDK.
///
/// This is what makes connecting a bank work on an iPhone without a Mac: the
/// installable PWA runs the same Link flow a native app would, in a Safari
/// overlay, and hands back the same public token for exchange.
///
/// The script is loaded on demand rather than in index.html. It is only needed
/// by one screen, most sessions never open it, and a finance app should not
/// make a third-party request on launch that it may never use.
const _scriptUrl = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';

@JS('Plaid.create')
external _PlaidHandler _plaidCreate(JSObject config);

@JS('Plaid')
external JSAny? get _plaidGlobal;

extension type _PlaidHandler._(JSObject _) implements JSObject {
  external void open();
  external void destroy();
}

class WebPlaidLink extends PlaidLink {
  const WebPlaidLink();

  @override
  bool get isSupported => true;

  @override
  String get platform => 'web';

  /// Nothing to recover: the handler stays alive for the life of the page, and
  /// an OAuth return re-enters through the same document.
  @override
  Future<PlaidLinkResult?> consumePending() async => null;

  @override
  Future<PlaidLinkResult> open(String linkToken) async {
    await _ensureScriptLoaded();

    final completer = Completer<PlaidLinkResult>();
    _PlaidHandler? handler;

    // Plaid calls exactly one of these, but a defensive guard costs nothing and
    // a double-complete would crash the isolate rather than the flow.
    void finish(PlaidLinkResult result) {
      if (!completer.isCompleted) completer.complete(result);
    }

    final config = JSObject()
      ..setProperty('token'.toJS, linkToken.toJS)
      ..setProperty(
        'onSuccess'.toJS,
        ((JSString publicToken, JSObject metadata) {
          final institution = metadata.getProperty('institution'.toJS);
          finish(PlaidLinkResult(
            succeeded: true,
            publicToken: publicToken.toDart,
            institutionId: _stringField(institution, 'institution_id'),
            institutionName: _stringField(institution, 'name'),
          ));
        }).toJS,
      )
      ..setProperty(
        'onExit'.toJS,
        ((JSObject? error, JSObject? metadata) {
          // A null error means the user simply closed Link. That is a normal
          // outcome, not something to show them a red banner about.
          if (error == null) {
            finish(PlaidLinkResult.cancelled());
            return;
          }
          finish(PlaidLinkResult(
            succeeded: false,
            errorCode: _stringField(error, 'error_code'),
            errorMessage: _stringField(error, 'display_message') ??
                _stringField(error, 'error_message'),
          ));
        }).toJS,
      );

    try {
      handler = _plaidCreate(config);
      handler.open();
      return await completer.future;
    } finally {
      handler?.destroy();
    }
  }

  Future<void> _ensureScriptLoaded() async {
    if (_plaidGlobal != null) return;

    final existing = web.document.querySelector('script[src="$_scriptUrl"]');
    if (existing == null) {
      final script = web.document.createElement('script') as web.HTMLScriptElement
        ..src = _scriptUrl
        ..async = true;
      web.document.head!.appendChild(script);
    }

    // Poll rather than race the load event: the tag may already be in flight
    // from a previous attempt, in which case its listener has come and gone.
    const timeout = Duration(seconds: 15);
    final deadline = DateTime.now().add(timeout);
    while (_plaidGlobal == null) {
      if (DateTime.now().isAfter(deadline)) {
        throw const PlaidLinkUnavailable();
      }
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }
  }
}

String? _stringField(JSAny? object, String name) {
  if (object == null) return null;
  final value = (object as JSObject).getProperty(name.toJS);
  if (value == null) return null;
  return (value as JSString).toDart;
}

PlaidLink createPlaidLink() => const WebPlaidLink();
