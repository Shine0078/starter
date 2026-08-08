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
    try {
      final rows = await widget.api.notifications();
      if (mounted) {
        setState(() {
          _rows = rows;
          _loading = false;
          _error = null;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = error.toString();
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
                              'Budget, balance, credit, and security alerts will appear here.'),
                        ]),
                      ),
                    for (var index = 0; index < _rows.length; index++)
                      _tile(index, _rows[index]),
                  ],
                ),
              ),
      );

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
        'credit_utilization' => Icons.credit_card,
        'low_balance' => Icons.account_balance_wallet_outlined,
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

  @override
  void initState() {
    super.initState();
    widget.api.notificationPreferences().then((value) {
      if (mounted) setState(() => _preferences = value);
    });
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

  Widget _switch(String title, String key, bool value) => SwitchListTile(
        title: Text(title),
        value: value,
        onChanged: _saving ? null : (next) => _set(key, next),
      );
}
