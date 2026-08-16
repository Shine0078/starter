import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../app_locale.dart';
import '../app_theme.dart';
import '../api/client.dart';
import '../api/app_lock.dart';
import '../api/platform/file_share.dart';
import '../l10n/app_localizations.dart';
import '../models/models.dart';
import 'bank_connections_screen.dart';
import 'help_support_screen.dart';
import 'notifications_screen.dart';
import 'plan_screen.dart';
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
  PlanSummary? _plan;
  String? _error;
  var _loading = true;
  var _exporting = false;
  var _reporting = false;
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

  /// Loaded on its own and allowed to fail quietly.
  ///
  /// It is a subtitle on one row. Folding it into `_load`'s `Future.wait` would
  /// mean a deployment with billing misconfigured shows "Could not load account
  /// settings" and hides sessions, MFA, and account deletion behind it.
  Future<void> _loadPlan() async {
    try {
      final plan = await widget.api.planSummary();
      if (mounted) setState(() => _plan = plan);
    } catch (_) {
      if (mounted) setState(() => _plan = null);
    }
  }

  Future<void> _load() async {
    widget.api.resetOfflineStatus();
    setState(() {
      _loading = true;
      _error = null;
    });
    unawaited(_loadPlan());
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
            .showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
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
            .showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
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
          .showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
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
    final serverConfirmed = await widget.api.signOutEverywhere();
    if (!serverConfirmed && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text(
          'This device was signed out. Other devices will be revoked when the server is reachable.',
        ),
      ));
    }
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
              // Native-only for the same iOS Safari keyboard reason as the
              // sign-in password field.
              autofillHints: kIsWeb ? null : const [AutofillHints.password],
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
      final stamp = DateFormat('yyyyMMdd-HHmmss').format(DateTime.now());
      await shareGeneratedFile(
        bytes: Uint8List.fromList(utf8.encode(json)),
        fileName: 'finverse-data-$stamp.json',
        mimeType: 'application/json',
        title: 'FINVERSE data export',
        subject: 'My FINVERSE data export',
      );
    } catch (error) {
      if (!mounted) return;
      final message = friendlyErrorMessage(error);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  Future<void> _shareMonthlyReport() async {
    setState(() => _reporting = true);
    try {
      final accounts = await widget.api.accounts();
      final currencies = accounts
          .map((account) => account.currency)
          .where((currency) => currency.isNotEmpty)
          .toSet()
          .toList()
        ..sort();
      final currency = currencies.isEmpty ? 'USD' : currencies.first;
      final bytes = await widget.api.monthlyReportPdf(currency: currency);
      final month = DateFormat('yyyy-MM').format(DateTime.now());
      await shareGeneratedFile(
        bytes: Uint8List.fromList(bytes),
        fileName: 'finverse-monthly-report-$month.pdf',
        mimeType: 'application/pdf',
        title: 'FINVERSE monthly report',
        subject: 'My FINVERSE monthly financial report',
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    } finally {
      if (mounted) setState(() => _reporting = false);
    }
  }

  Future<void> _updateConsent(String kind, bool granted) async {
    try {
      final privacy = await widget.api.updateConsent(kind, granted);
      if (mounted) setState(() => _privacy = privacy);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
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

  Future<void> _showCustomThemeColor(ThemeColorController controller) async {
    final l10n = AppLocalizations.of(context);
    var hsv = HSVColor.fromColor(controller.customColor);
    final hex = TextEditingController(text: _hexColor(controller.customColor));
    final selected = await showDialog<Color>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) {
          final color = hsv.toColor();
          final parsed = _parseHexColor(hex.text);
          return AlertDialog(
            title: Text(l10n.settingsThemeColorPickerTitle),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    height: 72,
                    decoration: BoxDecoration(
                      color: color,
                      borderRadius: const BorderRadius.all(Radius.circular(18)),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: hex,
                    autocorrect: false,
                    textCapitalization: TextCapitalization.characters,
                    maxLength: 7,
                    decoration: InputDecoration(
                      labelText: l10n.settingsThemeColorHexLabel,
                      hintText: '#0E7C66',
                      border: const OutlineInputBorder(),
                      errorText: hex.text.isEmpty || parsed != null
                          ? null
                          : 'Use a six-digit color such as #0E7C66.',
                    ),
                    onChanged: (value) {
                      final parsed = _parseHexColor(value);
                      setDialogState(() {
                        if (parsed != null) hsv = HSVColor.fromColor(parsed);
                      });
                    },
                  ),
                  _colorSlider(
                    label: l10n.settingsThemeColorHue,
                    value: hsv.hue,
                    max: 360,
                    onChanged: (value) => setDialogState(() {
                      hsv = hsv.withHue(value);
                      hex.text = _hexColor(hsv.toColor());
                    }),
                  ),
                  _colorSlider(
                    label: l10n.settingsThemeColorSaturation,
                    value: hsv.saturation,
                    max: 1,
                    onChanged: (value) => setDialogState(() {
                      hsv = hsv.withSaturation(value);
                      hex.text = _hexColor(hsv.toColor());
                    }),
                  ),
                  _colorSlider(
                    label: l10n.settingsThemeColorBrightness,
                    value: hsv.value,
                    max: 1,
                    onChanged: (value) => setDialogState(() {
                      hsv = hsv.withValue(value);
                      hex.text = _hexColor(hsv.toColor());
                    }),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: Text(l10n.commonCancel),
              ),
              FilledButton(
                onPressed: parsed == null
                    ? null
                    : () => Navigator.of(dialogContext).pop(color),
                child: Text(l10n.settingsThemeColorApply),
              ),
            ],
          );
        },
      ),
    );
    hex.dispose();
    if (selected != null) await controller.selectCustom(selected);
  }

  Widget _colorSlider({
    required String label,
    required double value,
    required double max,
    required ValueChanged<double> onChanged,
  }) =>
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label),
              Text(value.round().toString()),
            ],
          ),
          Slider(value: value, max: max, onChanged: onChanged),
        ],
      );

  String _themeColorLabel(AppLocalizations l10n, String id) => switch (id) {
        FinThemeColors.indigo => l10n.settingsThemeColorIndigo,
        FinThemeColors.ocean => l10n.settingsThemeColorOcean,
        FinThemeColors.plum => l10n.settingsThemeColorPlum,
        FinThemeColors.amber => l10n.settingsThemeColorAmber,
        FinThemeColors.custom => l10n.settingsThemeColorCustom,
        _ => l10n.settingsThemeColorEmerald,
      };

  Widget _themeColorSection(
      ThemeColorController controller, AppLocalizations l10n) {
    final ids = [...FinThemeColors.presets, FinThemeColors.custom];
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 560 ? 3 : 2;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.settingsThemeColorTitle,
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(l10n.settingsThemeColorDetail),
            const SizedBox(height: 12),
            GridView.builder(
              itemCount: ids.length,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: columns,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 2.5,
              ),
              itemBuilder: (context, index) {
                final id = ids[index];
                final color = id == FinThemeColors.custom
                    ? controller.customColor
                    : FinThemeColors.preset(id);
                final selected = controller.selected == id;
                return Semantics(
                  button: true,
                  selected: selected,
                  label: _themeColorLabel(l10n, id),
                  child: InkWell(
                    borderRadius: const BorderRadius.all(Radius.circular(16)),
                    onTap: () {
                      if (id == FinThemeColors.custom) {
                        unawaited(_showCustomThemeColor(controller));
                      } else {
                        unawaited(controller.selectPreset(id));
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        color:
                            Theme.of(context).colorScheme.surfaceContainerLow,
                        borderRadius:
                            const BorderRadius.all(Radius.circular(16)),
                        border: Border.all(
                          color: selected
                              ? Theme.of(context).colorScheme.primary
                              : Theme.of(context)
                                  .colorScheme
                                  .outlineVariant
                                  .withValues(alpha: 0.6),
                          width: selected ? 2 : 1,
                        ),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 26,
                            height: 26,
                            decoration: BoxDecoration(
                              color: color,
                              shape: BoxShape.circle,
                              border: Border.all(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .outlineVariant),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _themeColorLabel(l10n, id),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style:
                                  const TextStyle(fontWeight: FontWeight.w600),
                            ),
                          ),
                          if (selected)
                            Icon(Icons.check_circle,
                                size: 18,
                                color: Theme.of(context).colorScheme.primary),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ],
        );
      },
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
    final l10n = AppLocalizations.of(context);
    final localeController = LocaleControllerScope.maybeOf(context);
    final themeColorController = ThemeColorControllerScope.maybeOf(context);
    final themeModeController = ThemeModeControllerScope.maybeOf(context);
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
              if (localeController != null)
                ListTile(
                  leading: const Icon(Icons.language_outlined),
                  title: Text(l10n.languageTitle),
                  subtitle: Text(
                    '${localeController.locale == null ? l10n.languageSystemDefault : localeController.locale!.languageCode == 'fr' ? l10n.languageFrench : l10n.languageEnglish}\n${l10n.languageBetaDetail}',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  isThreeLine: true,
                  trailing: DropdownButton<Locale?>(
                    value: localeController.locale,
                    onChanged: (locale) =>
                        unawaited(localeController.select(locale)),
                    items: [
                      DropdownMenuItem<Locale?>(
                        value: null,
                        child: Text(l10n.languageSystemDefault),
                      ),
                      DropdownMenuItem<Locale?>(
                        value: const Locale('en'),
                        child: Text(l10n.languageEnglish),
                      ),
                      DropdownMenuItem<Locale?>(
                        value: const Locale('fr'),
                        child: Text(l10n.languageFrench),
                      ),
                    ],
                  ),
                ),
              if (themeModeController != null) ...[
                SwitchListTile.adaptive(
                  secondary: Icon(themeModeController.mode == ThemeMode.dark
                      ? Icons.dark_mode_outlined
                      : Icons.light_mode_outlined),
                  title: Text(l10n.settingsDarkModeTitle),
                  subtitle: Text(switch (themeModeController.mode) {
                    ThemeMode.dark => l10n.settingsDarkModeOn,
                    ThemeMode.light => l10n.settingsDarkModeOff,
                    ThemeMode.system => l10n.settingsDarkModeSystem,
                  }),
                  value: themeModeController.mode == ThemeMode.dark ||
                      (themeModeController.mode == ThemeMode.system &&
                          Theme.of(context).brightness == Brightness.dark),
                  onChanged: (enabled) => unawaited(themeModeController
                      .select(enabled ? ThemeMode.dark : ThemeMode.light)),
                ),
                if (themeModeController.mode != ThemeMode.system)
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: TextButton.icon(
                      onPressed: () => unawaited(
                          themeModeController.select(ThemeMode.system)),
                      icon: const Icon(Icons.settings_suggest_outlined),
                      label: Text(l10n.settingsDarkModeUseDevice),
                    ),
                  ),
              ],
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
              ListTile(
                leading: const Icon(Icons.workspace_premium_outlined),
                title: const Text('Your plan'),
                subtitle: Text(_plan?.planName ?? 'Loading…'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () async {
                  await Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => PlanScreen(api: widget.api),
                  ));
                  // The plan may have changed while they were away.
                  if (mounted) _loadPlan();
                },
              ),
              ListTile(
                leading: const Icon(Icons.help_outline),
                title: const Text('Help & support'),
                subtitle: const Text('Connection checks and common questions'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => HelpSupportScreen(api: widget.api),
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
        if (themeColorController != null) ...[
          const SizedBox(height: 20),
          Card(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
              child: _themeColorSection(themeColorController, l10n),
            ),
          ),
        ],
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
        Card(
          child: ListTile(
            leading: const Icon(Icons.picture_as_pdf_outlined),
            title: const Text('Monthly financial report'),
            subtitle: const Text(
              'Charts, budget performance, subscriptions, forecast, and action plan',
            ),
            trailing: _reporting
                ? const SizedBox.square(
                    dimension: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.ios_share_outlined),
            onTap: _reporting ? null : _shareMonthlyReport,
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

Color? _parseHexColor(String value) {
  final normalized = value.trim().replaceFirst('#', '');
  if (!RegExp(r'^[0-9a-fA-F]{6}$').hasMatch(normalized)) return null;
  return Color(int.parse('FF$normalized', radix: 16));
}

String _hexColor(Color color) =>
    '#${color.toARGB32().toRadixString(16).substring(2).toUpperCase()}';
