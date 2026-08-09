/// Picks an offline cache the target can actually compile.
///
/// `sqflite` is a native plugin with no web implementation. On the web the app
/// falls back to no cache at all rather than a half-working one: a browser tab
/// is already online-first, and a PWA that silently served month-old balances
/// would be worse than one that plainly says it needs a connection.
library;

export 'offline_cache_stub.dart'
    if (dart.library.io) 'offline_cache_native.dart';
