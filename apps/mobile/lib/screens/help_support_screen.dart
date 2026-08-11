import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/client.dart';
import '../l10n/localization_fallback.dart';

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
    final l10n = localizedOrEnglish(context);
    final check = _check;
    return [
      l10n.helpDiagnosticsTitle,
      l10n.helpDiagnosticsApiOrigin(widget.api.baseUrl),
      l10n.helpDiagnosticsResult(
          check?.detail ?? l10n.helpDiagnosticsNotChecked),
      if (check?.statusCode != null)
        l10n.helpDiagnosticsHttpStatus(check!.statusCode!),
      if (check != null)
        l10n.helpDiagnosticsChecked(
          DateFormat.yMMMd(l10n.localeName)
              .add_jm()
              .format(check.checkedAt.toLocal()),
        ),
    ].join('\n');
  }

  Future<void> _copyDiagnostics() async {
    await Clipboard.setData(ClipboardData(text: _diagnostics()));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
          content: Text(localizedOrEnglish(context).helpDiagnosticsCopied)),
    );
  }

  Future<void> _contactSupport() async {
    if (supportEmail.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(localizedOrEnglish(context).helpSupportNotConfigured),
      ));
      return;
    }
    final uri = Uri(
      scheme: 'mailto',
      path: supportEmail,
      queryParameters: {
        'subject': localizedOrEnglish(context).helpEmailSubject,
        'body': '\n\n$_diagnostics()',
      },
    );
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) &&
        mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(localizedOrEnglish(context).helpNoEmailApp),
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = localizedOrEnglish(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.helpTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          Text(
            l10n.helpHeading,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 6),
          Text(l10n.helpPrivacyDetail),
          const SizedBox(height: 16),
          _connectionCard(),
          const SizedBox(height: 16),
          Text(l10n.helpQuestionsSection),
          const SizedBox(height: 6),
          _faq(
            l10n.helpIphoneQuestion,
            l10n.helpIphoneAnswer,
          ),
          _faq(
            l10n.helpBankQuestion,
            l10n.helpBankAnswer,
          ),
          _faq(
            l10n.helpSessionQuestion,
            l10n.helpSessionAnswer,
          ),
          _faq(
            l10n.helpOfflineQuestion,
            l10n.helpOfflineAnswer,
          ),
          _faq(
            l10n.helpDeleteQuestion,
            l10n.helpDeleteAnswer,
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: _copyDiagnostics,
            icon: const Icon(Icons.copy_all_outlined),
            label: Text(l10n.helpCopyDiagnostics),
          ),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: _contactSupport,
            icon: const Icon(Icons.mail_outline),
            label: Text(l10n.helpContactSupport),
          ),
        ],
      ),
    );
  }

  Widget _connectionCard() {
    final l10n = localizedOrEnglish(context);
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
                    check?.detail ?? l10n.helpConnectionNotChecked,
                    style: TextStyle(color: color),
                  ),
                ),
                _checking
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : IconButton(
                        tooltip: l10n.helpCheckConnection,
                        onPressed: _checkConnection,
                        icon: const Icon(Icons.refresh),
                      ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              l10n.helpDiagnosticsApiOrigin(widget.api.baseUrl),
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
