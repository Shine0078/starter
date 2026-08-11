import 'dart:async';

import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models/models.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<FinanceNotification> _rows = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    widget.api.resetOfflineStatus();
    unawaited(widget.api.localNotifications.initialize());
    try {
      final rows = await widget.api.notifications();
      if (mounted) {
        setState(() {
          _rows = rows;
          _loading = false;
          _error = null;
        });
      }
      unawaited(widget.api.localNotifications.presentUnread(rows));
    } catch (error) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = friendlyErrorMessage(error);
        });
      }
    }
  }

  Future<void> _read(int index) async {
    final row = _rows[index];
    if (!row.unread) return;
    setState(() => _rows = [..._rows]..[index] = row.asRead());
    try {
      await widget.api.markNotificationRead(row.id);
    } catch (_) {
      if (mounted) setState(() => _rows = [..._rows]..[index] = row);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('Notifications'),
          actions: [
            if (_rows.any((row) => row.unread))
              TextButton(
                onPressed: _markAllRead,
                child: const Text('Mark all read'),
              ),
            IconButton(
              icon: const Icon(Icons.tune),
              tooltip: 'Notification preferences',
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => NotificationPreferencesScreen(api: widget.api),
              )),
            ),
          ],
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.all(12),
                  children: [
                    if (_error != null)
                      Card(
                        color: Theme.of(context).colorScheme.errorContainer,
                        child: ListTile(title: Text(_error!), onTap: _load),
                      ),
                    if (_rows.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 72),
                        child: Column(children: [
                          Icon(Icons.notifications_none, size: 56),
                          SizedBox(height: 12),
                          Text('You are all caught up',
                              style: TextStyle(
                                  fontSize: 20, fontWeight: FontWeight.w600)),
                          SizedBox(height: 6),
                          Text(
                              'Budget, bill, subscription, unusual spending, balance, credit, and security alerts will appear here.'),
                        ]),
                      ),
                    for (var index = 0; index < _rows.length; index++)
                      _tile(index, _rows[index]),
                  ],
                ),
              ),
      );

  Future<void> _markAllRead() async {
    final unread = _rows.where((row) => row.unread).length;
    if (unread == 0) return;
    final previous = _rows;
    setState(() => _rows = _rows.map((row) => row.asRead()).toList());
    try {
      await widget.api.markAllNotificationsRead();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content:
                Text('$unread alert${unread == 1 ? '' : 's'} marked as read.')),
      );
    } catch (_) {
      if (mounted) setState(() => _rows = previous);
    }
  }

  Widget _tile(int index, FinanceNotification row) => Card(
        elevation: row.unread ? 2 : 0,
        child: ListTile(
          onTap: () => _read(index),
          leading: CircleAvatar(
            backgroundColor: _color(row.severity),
            child: Icon(_icon(row.kind), color: Colors.white),
          ),
          title: Text(row.title,
              style: TextStyle(
                  fontWeight: row.unread ? FontWeight.w700 : FontWeight.w400)),
          subtitle: Text('${row.message}\n${row.createdAt.substring(0, 10)}'),
          isThreeLine: true,
          trailing: row.unread ? const Icon(Icons.circle, size: 10) : null,
        ),
      );

  Color _color(String severity) => switch (severity) {
        'critical' => Colors.red.shade700,
        'warning' => Colors.orange.shade700,
        _ => Colors.blue.shade700,
      };

  IconData _icon(String kind) => switch (kind) {
        'budget' => Icons.pie_chart_outline,
        'bill' => Icons.event_available_outlined,
        'credit_utilization' => Icons.credit_card,
        'subscription' => Icons.autorenew,
        'low_balance' => Icons.account_balance_wallet_outlined,
        'unusual_transaction' => Icons.manage_search,
        'bank_sync' => Icons.sync_problem,
        'security' => Icons.security,
        _ => Icons.notifications_outlined,
      };
}

class NotificationPreferencesScreen extends StatefulWidget {
  const NotificationPreferencesScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<NotificationPreferencesScreen> createState() =>
      _NotificationPreferencesScreenState();
}

class _NotificationPreferencesScreenState
    extends State<NotificationPreferencesScreen> {
  NotificationPreferences? _preferences;
  bool _saving = false;
  bool _deviceBusy = false;

  @override
  void initState() {
    super.initState();
    unawaited(widget.api.localNotifications.initialize());
    widget.api.notificationPreferences().then((value) {
      if (mounted) setState(() => _preferences = value);
    });
  }

  Future<void> _enableDeviceAlerts() async {
    if (_deviceBusy) return;
    setState(() => _deviceBusy = true);
    final granted = await widget.api.localNotifications.requestPermission();
    if (!mounted) return;
    setState(() => _deviceBusy = false);
    if (!granted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text(
            'Notifications are disabled. Enable them in your device settings.'),
      ));
    }
  }

  Future<void> _disableDeviceAlerts() async {
    if (_deviceBusy) return;
    setState(() => _deviceBusy = true);
    await widget.api.localNotifications.disable();
    if (mounted) setState(() => _deviceBusy = false);
  }

  Future<void> _set(String key, bool value) async {
    final current = _preferences;
    if (current == null || _saving) return;
    final values = current.toJson()..[key] = value;
    final next = NotificationPreferences.fromJson(values);
    setState(() {
      _preferences = next;
      _saving = true;
    });
    try {
      final saved = await widget.api.updateNotificationPreferences(next);
      if (mounted) setState(() => _preferences = saved);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final preferences = _preferences;
    return Scaffold(
      appBar: AppBar(title: const Text('Alert preferences')),
      body: preferences == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(children: [
              _deviceAlerts(),
              _switch('Budget progress', 'budget', preferences.budget),
              _switch('Bills and due dates', 'bills', preferences.bills),
              _switch('Credit utilization', 'creditUtilization',
                  preferences.creditUtilization),
              _switch('Subscription changes', 'subscriptions',
                  preferences.subscriptions),
              _switch('Low balance', 'lowBalance', preferences.lowBalance),
              _switch('Unusual transactions', 'unusualTransactions',
                  preferences.unusualTransactions),
              _switch('Bank synchronization', 'bankSync', preferences.bankSync),
              _switch('Security events', 'security', preferences.security),
            ]),
    );
  }

  Widget _deviceAlerts() => ValueListenableBuilder<bool?>(
        valueListenable: widget.api.localNotifications.permissionGranted,
        builder: (context, granted, _) {
          final local = widget.api.localNotifications;
          if (!local.supported) {
            return const ListTile(
              leading: Icon(Icons.notifications_none_outlined),
              title: Text('Device alerts unavailable here'),
              subtitle: Text(
                  'Native alerts are available in the Android and iPhone apps.'),
            );
          }
          final enabled = granted == true;
          return Card(
            margin: const EdgeInsets.fromLTRB(12, 12, 12, 8),
            child: ListTile(
              leading: Icon(enabled
                  ? Icons.notifications_active_outlined
                  : Icons.notifications_off_outlined),
              title: const Text('Device alerts'),
              subtitle: Text(enabled
                  ? 'Unread FINVERSE alerts can appear in your notification tray.'
                  : 'Allow local alerts for unread budgets, bills, banks, and security events.'),
              trailing: _deviceBusy
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : TextButton(
                      onPressed:
                          enabled ? _disableDeviceAlerts : _enableDeviceAlerts,
                      child: Text(enabled ? 'Turn off' : 'Enable'),
                    ),
            ),
          );
        },
      );

  Widget _switch(String title, String key, bool value) => SwitchListTile(
        title: Text(title),
        value: value,
        onChanged: _saving ? null : (next) => _set(key, next),
      );
}
