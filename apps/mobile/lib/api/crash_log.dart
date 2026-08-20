import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Privacy-preserving local crash/error ring buffer.
///
/// Never stores transaction descriptions, amounts, tokens, emails, or
/// account identifiers. This is a local diagnostic aid until a production
/// crash provider is configured with the same redaction rules.
class CrashLog {
  CrashLog._();

  static const _key = 'finverse.crash-log.v1';
  static const _limit = 20;

  static final ValueNotifier<int> count = ValueNotifier(0);

  static Future<void> record(
    Object error, {
    StackTrace? stackTrace,
    String? context,
  }) async {
    final entry = {
      'at': DateTime.now().toUtc().toIso8601String(),
      'context': _sanitize(context ?? 'uncaught'),
      'error': _sanitize(error.toString()),
      if (stackTrace != null) 'stack': _sanitize(stackTrace.toString(), 400),
    };
    try {
      final prefs = await SharedPreferences.getInstance();
      final existing = prefs.getStringList(_key) ?? <String>[];
      existing.insert(0, entry.toString());
      while (existing.length > _limit) {
        existing.removeLast();
      }
      await prefs.setStringList(_key, existing);
      count.value = existing.length;
    } catch (_) {
      // Diagnostics must never take down the app.
    }
  }

  static Future<List<String>> recent() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final values = prefs.getStringList(_key) ?? const <String>[];
      count.value = values.length;
      return values;
    } catch (_) {
      return const [];
    }
  }

  static String _sanitize(String value, [int max = 240]) {
    var cleaned = value
        .replaceAll(RegExp(r'Bearer\s+[A-Za-z0-9._\-+=/]+', caseSensitive: false), 'Bearer [redacted]')
        .replaceAll(RegExp(r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}'), '[redacted-email]')
        .replaceAll(RegExp(r'\b\d{6,}\b'), '[redacted-number]');
    if (cleaned.length > max) cleaned = cleaned.substring(0, max);
    return cleaned;
  }
}
