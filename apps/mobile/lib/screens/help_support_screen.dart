import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/client.dart';

/// A small, offline-friendly help centre for the moments when a user is most
/// likely to need it: a new phone, a bank that needs reconnecting, or a host
/// that is temporarily unavailable.
class HelpSupportScreen extends StatefulWidget {
  const HelpSupportScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<HelpSupportScreen> createState() => _HelpSupportScreenState();
}

class _HelpSupportScreenState extends State<HelpSupportScreen> {
  static const supportEmail = String.fromEnvironment('SUPPORT_EMAIL');
  ApiConnectionCheck? _check;
  bool _checking = false;

  Future<void> _checkConnection() async {
    if (_checking) return;
    setState(() => _checking = true);
    final result = await widget.api.checkConnection();
    if (!mounted) return;
    setState(() {
      _check = result;
      _checking = false;
    });
  }

  String _diagnostics() {
    final check = _check;
    return [
      'FINVERSE support diagnostics',
      'API origin: ${widget.api.baseUrl}',
      'Result: ${check?.detail ?? 'Not checked'}',
      if (check?.statusCode != null) 'HTTP status: ${check!.statusCode}',
      if (check != null)
        'Checked: ${DateFormat.yMMMd().add_jm().format(check.checkedAt.toLocal())}',
    ].join('\n');
  }

  Future<void> _copyDiagnostics() async {
    await Clipboard.setData(ClipboardData(text: _diagnostics()));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Diagnostics copied to the clipboard.')),
    );
  }

  Future<void> _contactSupport() async {
    if (supportEmail.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Support contact is not configured for this build.'),
      ));
      return;
    }
    final uri = Uri(
      scheme: 'mailto',
      path: supportEmail,
      queryParameters: {
        'subject': 'FINVERSE support request',
        'body': '\n\n$_diagnostics()',
      },
    );
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) &&
        mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('No email app is available on this device.'),
      ));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Help & support')),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            Text(
              'Get unstuck quickly',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 6),
            const Text(
              'FINVERSE keeps your bank credentials with the provider. These checks never include your password, access token, or transaction data.',
            ),
            const SizedBox(height: 16),
            _connectionCard(),
            const SizedBox(height: 16),
            const Text('COMMON QUESTIONS'),
            const SizedBox(height: 6),
            _faq(
              'My iPhone cannot connect',
              'A release build must point to the public HTTPS API origin. If it was built with a local address, rebuild it with the API_BASE_URL value supplied by the deployment. Tailscale is not required for a public deployment.',
            ),
            _faq(
              'My bank needs attention',
              'Open Settings → Bank connections and choose Reconnect. You will confirm your FINVERSE password first, then Plaid will ask you to sign in with the institution again. Existing transactions stay in your history.',
            ),
            _faq(
              'I left the app and it asked me to sign in',
              'FINVERSE stores the rotating session credentials in the phone keystore. Unlock the phone once after a restart, then use Try again. A revoked or expired session requires a fresh sign-in for your protection.',
            ),
            _faq(
              'What works offline?',
              'Recent authenticated reads can be shown from encrypted device cache. Transaction preference edits are queued and replayed later. Balances, bank sync, and other server-authoritative changes wait for a connection.',
            ),
            _faq(
              'How do I remove my account?',
              'Open Settings → Delete account. FINVERSE revokes sessions immediately and schedules permanent erasure after the recovery window described in the privacy notice.',
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: _copyDiagnostics,
              icon: const Icon(Icons.copy_all_outlined),
              label: const Text('Copy diagnostics'),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              onPressed: _contactSupport,
              icon: const Icon(Icons.mail_outline),
              label: const Text('Contact support'),
            ),
          ],
        ),
      );

  Widget _connectionCard() {
    final check = _check;
    final color = check == null
        ? Theme.of(context).colorScheme.primary
        : check.healthy
            ? Colors.green
            : Theme.of(context).colorScheme.error;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(check?.healthy == true
                    ? Icons.cloud_done_outlined
                    : Icons.cloud_outlined),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    check?.detail ?? 'Connection not checked yet',
                    style: TextStyle(color: color),
                  ),
                ),
                _checking
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : IconButton(
                        tooltip: 'Check connection',
                        onPressed: _checkConnection,
                        icon: const Icon(Icons.refresh),
                      ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'API origin: ${widget.api.baseUrl}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }

  Widget _faq(String title, String body) => Card(
        child: ExpansionTile(
          title: Text(title),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          expandedCrossAxisAlignment: CrossAxisAlignment.start,
          children: [Text(body)],
        ),
      );
}
