import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../api/client.dart';
import '../api/app_lock.dart';
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
    this.appLockController,
    super.key,
  });

  final ApiClient api;
  final Future<void> Function() onVerifyEmail;
  final Future<void> Function() onSignOut;
  final Future<void> Function() onDeleteAccount;
  final Future<void> Function() onSignedOutEverywhere;
  final AppLockController? appLockController;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  PublicUser? _user;
  List<AppSession> _sessions = const [];
  PrivacyDashboard? _privacy;
  MfaStatus? _mfa;
  String? _error;
  var _loading = true;
  var _exporting = false;
  var _appLockBusy = false;
  var _mfaBusy = false;

  @override
  void initState() {
    super.initState();
    widget.appLockController?.addListener(_appLockChanged);
    _load();
  }

  @override
  void dispose() {
    widget.appLockController?.removeListener(_appLockChanged);
    super.dispose();
  }

  void _appLockChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _setAppLock(bool enabled) async {
    final controller = widget.appLockController;
    if (controller == null || _appLockBusy) return;
    setState(() => _appLockBusy = true);
    final result = await controller.setEnabled(enabled);
    if (!mounted) return;
    setState(() => _appLockBusy = false);
    final message = switch (result) {
      AppLockChangeResult.changed =>
        enabled ? 'Device lock enabled.' : 'Device lock disabled.',
      AppLockChangeResult.unavailable =>
        'Set a device PIN, fingerprint, or face lock first.',
      AppLockChangeResult.notAuthenticated =>
        'Device authentication was not completed.',
      AppLockChangeResult.failed => 'Could not update the device lock setting.',
    };
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _load() async {
    widget.api.resetOfflineStatus();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        widget.api.me(),
        widget.api.sessions(),
        widget.api.privacyDashboard(),
        widget.api.mfaStatus(),
      ]);
      if (!mounted) return;
      setState(() {
        _user = results[0] as PublicUser;
        _sessions = results[1] as List<AppSession>;
        _privacy = results[2] as PrivacyDashboard;
        _mfa = results[3] as MfaStatus;
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

  Future<void> _configureMfa() async {
    if (_mfaBusy) return;
    var password = '';
    final submitted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add authenticator security'),
        content: TextField(
          onChanged: (value) => password = value,
          obscureText: true,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Current password',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Continue')),
        ],
      ),
    );
    final currentPassword = password;
    if (submitted != true || currentPassword.isEmpty || !mounted) return;

    setState(() => _mfaBusy = true);
    try {
      final enrollment = await widget.api.enrollMfa(currentPassword);
      if (!mounted) return;
      var code = '';
      final confirmation = await showDialog<String>(
        context: context,
        barrierDismissible: false,
        builder: (context) => AlertDialog(
          title: const Text('Set up your authenticator'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                    'In Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP app, add an account using this setup key:'),
                const SizedBox(height: 12),
                SelectableText(enrollment.secret,
                    style: const TextStyle(
                        fontFamily: 'monospace', fontWeight: FontWeight.bold)),
                TextButton.icon(
                  onPressed: () =>
                      Clipboard.setData(ClipboardData(text: enrollment.secret)),
                  icon: const Icon(Icons.copy),
                  label: const Text('Copy setup key'),
                ),
                const SizedBox(height: 12),
                TextField(
                  onChanged: (value) => code = value,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  decoration: const InputDecoration(
                      labelText: '6-digit code', border: OutlineInputBorder()),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel')),
            FilledButton(
                onPressed: () => Navigator.pop(context, code.trim()),
                child: const Text('Enable')),
          ],
        ),
      );
      if (confirmation == null || confirmation.isEmpty || !mounted) return;
      final recoveryCodes = await widget.api.enableMfa(confirmation);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (context) => AlertDialog(
          title: const Text('Save your recovery codes'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                    'Each code works once if you lose your authenticator. Store them in a password manager. They will not be shown again.'),
                const SizedBox(height: 12),
                SelectableText(recoveryCodes.join('\n'),
                    style: const TextStyle(fontFamily: 'monospace')),
                TextButton.icon(
                  onPressed: () => Clipboard.setData(
                      ClipboardData(text: recoveryCodes.join('\n'))),
                  icon: const Icon(Icons.copy_all),
                  label: const Text('Copy all codes'),
                ),
              ],
            ),
          ),
          actions: [
            FilledButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('I saved them'))
          ],
        ),
      );
      await _load();
    } on AuthException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.displayMessage)));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _mfaBusy = false);
    }
  }

  Future<void> _disableMfa() async {
    var password = '';
    var code = '';
    final values = await showDialog<List<String>>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove authenticator security?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Future sign-ins will require only your password.'),
            const SizedBox(height: 12),
            TextField(
                onChanged: (value) => password = value,
                obscureText: true,
                decoration: const InputDecoration(
                    labelText: 'Current password',
                    border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(
                onChanged: (value) => code = value,
                decoration: const InputDecoration(
                    labelText: 'Authenticator or recovery code',
                    border: OutlineInputBorder())),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, [password, code.trim()]),
              child: const Text('Remove')),
        ],
      ),
    );
    if (values == null || !mounted) return;
    setState(() => _mfaBusy = true);
    try {
      await widget.api.disableMfa(values[0], values[1]);
      await _load();
    } on AuthException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.displayMessage)));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _mfaBusy = false);
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

  Future<void> _exportData() async {
    final password = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Export your data'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'FINVERSE will create a portable JSON file containing your profile, finance records, settings, and security activity. Confirm your current password.',
            ),
            const SizedBox(height: 14),
            TextField(
              controller: password,
              obscureText: true,
              autofillHints: const [AutofillHints.password],
              decoration: const InputDecoration(
                labelText: 'Current password',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Create export'),
          ),
        ],
      ),
    );
    final currentPassword = password.text;
    password.dispose();
    if (submitted != true) return;

    setState(() => _exporting = true);
    try {
      final json = await widget.api.exportData(currentPassword);
      final directory = await getTemporaryDirectory();
      final stamp = DateFormat('yyyyMMdd-HHmmss').format(DateTime.now());
      final file = File(
          '${directory.path}${Platform.pathSeparator}finverse-data-$stamp.json');
      await file.writeAsString(json, flush: true);
      await SharePlus.instance.share(ShareParams(
        files: [XFile(file.path, mimeType: 'application/json')],
        title: 'FINVERSE data export',
        subject: 'My FINVERSE data export',
      ));
    } catch (error) {
      if (!mounted) return;
      final message =
          error is AuthException ? error.displayMessage : error.toString();
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  Future<void> _updateConsent(String kind, bool granted) async {
    try {
      final privacy = await widget.api.updateConsent(kind, granted);
      if (mounted) setState(() => _privacy = privacy);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  void _showConsentHistory() {
    final history = _privacy!.consentHistory;
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Consent history'),
        content: SizedBox(
          width: double.maxFinite,
          child: history.isEmpty
              ? const Text('No optional consent choices recorded yet.')
              : ListView(
                  shrinkWrap: true,
                  children: history
                      .map((entry) => ListTile(
                            leading: Icon(entry.granted
                                ? Icons.check_circle_outline
                                : Icons.cancel_outlined),
                            title: Text(entry.kind.replaceAll('_', ' ')),
                            subtitle: Text(
                              '${entry.granted ? 'Granted' : 'Withdrawn'} • ${_date(entry.createdAt)}\n${entry.policyVersion}',
                            ),
                          ))
                      .toList(),
                ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
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
        if (_mfa != null)
          Card(
            child: ListTile(
              leading: const Icon(Icons.phonelink_lock_outlined),
              title: const Text('Authenticator security'),
              subtitle: Text(
                !_mfa!.available
                    ? 'Not configured on this server'
                    : _mfa!.enabled
                        ? 'Enabled • ${_mfa!.recoveryCodesRemaining} recovery codes remaining'
                        : 'Require a one-time code when signing in',
              ),
              trailing: _mfaBusy
                  ? const SizedBox.square(
                      dimension: 22,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : TextButton(
                      onPressed: !_mfa!.available
                          ? null
                          : (_mfa!.enabled ? _disableMfa : _configureMfa),
                      child: Text(_mfa!.enabled ? 'Remove' : 'Set up'),
                    ),
            ),
          ),
        if (widget.appLockController != null)
          Card(
            child: SwitchListTile(
              secondary: const Icon(Icons.fingerprint),
              title: const Text('Device app lock'),
              subtitle: const Text(
                'Require your device PIN, fingerprint, or face after FINVERSE leaves the foreground.',
              ),
              value: widget.appLockController!.enabled,
              onChanged: _appLockBusy ? null : _setAppLock,
            ),
          ),
        if (_privacy != null)
          Card(
            child: Column(
              children: [
                SwitchListTile(
                  secondary: const Icon(Icons.analytics_outlined),
                  title: const Text('Usage analytics'),
                  subtitle: const Text(
                    'Allow future privacy-preserving product analytics. No analytics SDK is currently installed.',
                  ),
                  value: _privacy!.analytics.granted,
                  onChanged: (value) => _updateConsent('analytics', value),
                ),
                SwitchListTile(
                  secondary: const Icon(Icons.mark_email_unread_outlined),
                  title: const Text('Product updates'),
                  subtitle: const Text(
                    'Allow occasional FINVERSE product news. Marketing delivery is not currently enabled.',
                  ),
                  value: _privacy!.productUpdates.granted,
                  onChanged: (value) =>
                      _updateConsent('product_updates', value),
                ),
                ListTile(
                  leading: const Icon(Icons.history),
                  title: const Text('Consent history'),
                  subtitle: Text(
                    '${_privacy!.consentHistory.length} recorded choice${_privacy!.consentHistory.length == 1 ? '' : 's'}',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: _showConsentHistory,
                ),
              ],
            ),
          ),
        Card(
          child: ListTile(
            leading: const Icon(Icons.download_outlined),
            title: const Text('Export my data'),
            subtitle: const Text(
              'Password-confirmed portable JSON without passwords or bank tokens',
            ),
            trailing: _exporting
                ? const SizedBox.square(
                    dimension: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.chevron_right),
            onTap: _exporting ? null : _exportData,
          ),
        ),
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
        if (_privacy != null && _privacy!.securityActivity.isNotEmpty) ...[
          const SizedBox(height: 12),
          _heading('RECENT SECURITY ACTIVITY'),
          Card(
            child: Column(
              children: _privacy!.securityActivity
                  .take(5)
                  .map((event) => ListTile(
                        leading: Icon(
                          event.succeeded
                              ? Icons.verified_user_outlined
                              : Icons.warning_amber_outlined,
                        ),
                        title: Text(event.kind.replaceAll('_', ' ')),
                        subtitle: Text(
                          '${_date(event.createdAt)}\n${event.ipAddress ?? 'IP unavailable'}',
                        ),
                        isThreeLine: true,
                      ))
                  .toList(),
            ),
          ),
        ],
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
