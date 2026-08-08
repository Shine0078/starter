import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../api/client.dart';
import '../models/models.dart';
import 'bank_connections_screen.dart';
import 'notifications_screen.dart';
import 'subscriptions_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({
    required this.api,
    required this.onVerifyEmail,
    required this.onSignOut,
    required this.onDeleteAccount,
    required this.onSignedOutEverywhere,
    super.key,
  });

  final ApiClient api;
  final Future<void> Function() onVerifyEmail;
  final Future<void> Function() onSignOut;
  final Future<void> Function() onDeleteAccount;
  final Future<void> Function() onSignedOutEverywhere;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  PublicUser? _user;
  List<AppSession> _sessions = const [];
  String? _error;
  var _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results =
          await Future.wait([widget.api.me(), widget.api.sessions()]);
      if (!mounted) return;
      setState(() {
        _user = results[0] as PublicUser;
        _sessions = results[1] as List<AppSession>;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString();
        _loading = false;
      });
    }
  }

  Future<void> _revoke(AppSession session) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out this device?'),
        content: Text(_deviceLabel(session)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sign out device'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await widget.api.revokeSession(session.id);
      await _load();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  Future<void> _signOutAll() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out every device?'),
        content: const Text(
          'This immediately ends every FINVERSE session, including this phone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sign out all'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await widget.api.signOutEverywhere();
    await widget.onSignedOutEverywhere();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Settings & privacy')),
        body: _buildBody(),
      );

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Could not load account settings'),
              const SizedBox(height: 8),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: _load, child: const Text('Try again')),
            ],
          ),
        ),
      );
    }

    final user = _user!;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        _heading('ACCOUNT'),
        Card(
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.person_outline),
                title: Text(user.email),
                subtitle: Text(user.emailVerified
                    ? 'Email verified'
                    : 'Email verification pending'),
                trailing: user.emailVerified
                    ? const Icon(Icons.verified, color: Colors.green)
                    : TextButton(
                        onPressed: widget.onVerifyEmail,
                        child: const Text('Verify'),
                      ),
              ),
              ListTile(
                leading: const Icon(Icons.notifications_outlined),
                title: const Text('Notification preferences'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => NotificationsScreen(api: widget.api),
                )),
              ),
              ListTile(
                leading: const Icon(Icons.account_balance_outlined),
                title: const Text('Bank connections'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => BankConnectionsScreen(api: widget.api),
                )),
              ),
              ListTile(
                leading: const Icon(Icons.subscriptions_outlined),
                title: const Text('Subscriptions'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => SubscriptionsScreen(api: widget.api),
                )),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        _heading('ACTIVE SESSIONS'),
        ..._sessions.map(
          (session) => Card(
            child: ListTile(
              leading: Icon(session.current
                  ? Icons.phone_android
                  : Icons.devices_outlined),
              title:
                  Text(session.current ? 'This device' : _deviceLabel(session)),
              subtitle: Text(
                '${session.ipAddress ?? 'IP unavailable'}\nLast used ${_date(session.lastUsedAt ?? session.issuedAt)}',
              ),
              isThreeLine: true,
              trailing: session.current
                  ? const Chip(label: Text('Current'))
                  : IconButton(
                      tooltip: 'Sign out device',
                      onPressed: () => _revoke(session),
                      icon: const Icon(Icons.logout),
                    ),
            ),
          ),
        ),
        OutlinedButton.icon(
          onPressed: _signOutAll,
          icon: const Icon(Icons.phonelink_erase),
          label: const Text('Sign out every device'),
        ),
        const SizedBox(height: 20),
        _heading('PRIVACY & ACCESS'),
        const Card(
          child: ListTile(
            leading: Icon(Icons.security_outlined),
            title: Text('Your protections'),
            subtitle: Text(
              'Bank credentials stay with Plaid. FINVERSE encrypts provider access tokens and isolates each user at the database layer.',
            ),
            isThreeLine: true,
          ),
        ),
        ListTile(
          leading: const Icon(Icons.logout),
          title: const Text('Sign out'),
          onTap: widget.onSignOut,
        ),
        ListTile(
          leading: Icon(Icons.delete_forever,
              color: Theme.of(context).colorScheme.error),
          title: Text('Delete account',
              style: TextStyle(color: Theme.of(context).colorScheme.error)),
          subtitle: const Text('Includes a 30-day recovery window'),
          onTap: widget.onDeleteAccount,
        ),
      ],
    );
  }

  Widget _heading(String text) => Padding(
        padding: const EdgeInsets.only(left: 4, bottom: 6),
        child: Text(text, style: Theme.of(context).textTheme.labelSmall),
      );

  String _deviceLabel(AppSession session) {
    final agent = session.userAgent?.trim();
    if (agent == null || agent.isEmpty) return 'Unknown device';
    return agent.length <= 46 ? agent : '${agent.substring(0, 43)}...';
  }

  String _date(String value) =>
      DateFormat.yMMMd().add_jm().format(DateTime.parse(value).toLocal());
}
