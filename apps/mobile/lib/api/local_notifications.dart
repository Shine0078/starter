import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../models/models.dart';

/// Device-local delivery for server-derived financial alerts.
///
/// Remote push still needs an owner-configured provider (FCM/APNs). This
/// service is intentionally independent of that infrastructure: when a user
/// opens or refreshes the notification centre, unread alerts can be surfaced
/// by the operating system without a VPN, a push credential, or a second API.
/// Permission remains user-controlled and the browser/desktop targets are
/// explicit no-ops rather than pretending a native notification was delivered.
class LocalNotificationService {
  LocalNotificationService({FlutterLocalNotificationsPlugin? plugin})
      : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;
  final ValueNotifier<bool?> permissionGranted = ValueNotifier(null);
  final Set<String> _presented = <String>{};
  bool _initialized = false;

  bool get supported =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  Future<bool> initialize() async {
    if (_initialized) return permissionGranted.value == true;
    if (!supported) {
      _initialized = true;
      permissionGranted.value = false;
      return false;
    }

    try {
      final initialized = await _plugin.initialize(
            settings: const InitializationSettings(
              android: AndroidInitializationSettings(
                '@mipmap/ic_launcher_finverse',
              ),
              iOS: DarwinInitializationSettings(
                requestAlertPermission: false,
                requestBadgePermission: false,
                requestSoundPermission: false,
              ),
            ),
          ) ??
          false;
      _initialized = initialized;
      if (!initialized) {
        permissionGranted.value = false;
        return false;
      }
      await _refreshPermission();
      return permissionGranted.value == true;
    } catch (_) {
      _initialized = true;
      permissionGranted.value = false;
      return false;
    }
  }

  Future<void> _refreshPermission() async {
    if (defaultTargetPlatform == TargetPlatform.android) {
      final android = _plugin.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      permissionGranted.value =
          await android?.areNotificationsEnabled() ?? false;
      return;
    }
    final ios = _plugin.resolvePlatformSpecificImplementation<
        IOSFlutterLocalNotificationsPlugin>();
    permissionGranted.value =
        (await ios?.checkPermissions())?.isEnabled ?? false;
  }

  Future<bool> requestPermission() async {
    if (!supported) return false;
    await initialize();
    if (!_initialized) return false;

    if (defaultTargetPlatform == TargetPlatform.android) {
      final android = _plugin.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      await android?.requestNotificationsPermission();
    } else {
      final ios = _plugin.resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin>();
      await ios?.requestPermissions(alert: true, badge: true, sound: true);
    }
    await _refreshPermission();
    return permissionGranted.value == true;
  }

  Future<void> disable() async {
    if (_initialized) await _plugin.cancelAll();
    _presented.clear();
    permissionGranted.value = false;
  }

  Future<void> presentUnread(Iterable<FinanceNotification> rows) async {
    if (!await initialize() || permissionGranted.value != true) return;

    // A refresh can return the same unread rows repeatedly. Keep the device
    // quiet by presenting each alert once per app session and cap a burst of
    // old alerts after a long offline period.
    for (final row in rows.where((row) => row.unread).take(3)) {
      if (!_presented.add(row.id)) continue;
      await _plugin.show(
        id: _stableId(row.id),
        title: row.title,
        body: row.message,
        notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails(
            'finverse-financial-alerts',
            'Financial alerts',
            channelDescription:
                'Important budget, bank, bill, and security alerts.',
            importance: Importance.high,
            priority: Priority.high,
            icon: '@mipmap/ic_launcher_finverse',
          ),
          iOS: DarwinNotificationDetails(
            threadIdentifier: 'finverse-financial-alerts',
          ),
        ),
        payload: row.id,
      );
    }
  }

  int _stableId(String value) {
    var hash = 0x811c9dc5;
    for (final byte in utf8.encode(value)) {
      hash = ((hash ^ byte) * 0x01000193) & 0x7fffffff;
    }
    return hash == 0 ? 1 : hash;
  }
}
